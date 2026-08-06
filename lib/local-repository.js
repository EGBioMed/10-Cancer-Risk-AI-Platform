const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ENVELOPE_VERSION = 1;

function decodeKey(value) {
  const raw = String(value || "").trim();
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("LOCAL_DATA_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key.");
  }
  return key;
}

function encryptJson(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  return JSON.stringify({
    v: ENVELOPE_VERSION,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64")
  });
}

function decryptJson(envelopeText, key) {
  const envelope = JSON.parse(envelopeText);
  if (envelope.v !== ENVELOPE_VERSION || envelope.alg !== "A256GCM") {
    throw new Error("Unsupported encrypted record format.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final()
  ]).toString("utf8"));
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getRecordId(submission) {
  const recordId = String(
    submission.optimized_feature_row?.record_id
    || submission.contact_row?.record_id
    || submission.excel_row?.record_id
    || ""
  ).trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(recordId)) {
    throw new Error("Submission record_id is missing or invalid.");
  }
  return recordId;
}

function buildResearchRecord(submission) {
  const record = { ...submission };
  delete record.email;
  delete record.contact_row;
  if (record.excel_row && typeof record.excel_row === "object") {
    record.excel_row = { ...record.excel_row };
    delete record.excel_row.email;
  }
  record.rows = Array.isArray(record.rows)
    ? record.rows.map((row) => {
      const clean = { ...row };
      delete clean.email;
      return clean;
    })
    : [];
  return record;
}

function openDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  db.enableDefensive(true);
  return db;
}

function ensureSchemas(researchDb, contactDb) {
  researchDb.exec(`
    CREATE TABLE IF NOT EXISTS assessments (
      record_id TEXT PRIMARY KEY,
      submitted_at TEXT NOT NULL,
      language TEXT NOT NULL,
      report_language TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      stored_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_status TEXT NOT NULL,
      event_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_assessments_submitted_at ON assessments(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_audit_record_id ON audit_events(record_id);
  `);
  contactDb.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      record_id TEXT PRIMARY KEY,
      submitted_at TEXT NOT NULL,
      report_language TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      stored_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_contacts_submitted_at ON contacts(submitted_at);
  `);
}

function existingHash(db, table, recordId) {
  return db.prepare(`SELECT payload_hash FROM ${table} WHERE record_id = ?`).get(recordId)?.payload_hash || "";
}

function assertCompatibleExisting(db, table, recordId, hash) {
  const existing = existingHash(db, table, recordId);
  if (existing && existing !== hash) {
    throw new Error(`A different ${table} record already uses record_id ${recordId}.`);
  }
  return Boolean(existing);
}

function createLocalRepository(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(process.cwd(), "local-data"));
  const key = decodeKey(options.encryptionKey);
  fs.mkdirSync(dataDir, { recursive: true });
  const researchPath = path.join(dataDir, "research.sqlite");
  const contactsPath = path.join(dataDir, "contacts.sqlite");
  const researchDb = openDatabase(researchPath);
  const contactDb = openDatabase(contactsPath);
  ensureSchemas(researchDb, contactDb);

  function saveSubmission(submission) {
    const recordId = getRecordId(submission);
    const research = buildResearchRecord(submission);
    const contact = { ...submission.contact_row, email: submission.email };
    const researchHash = stableHash(research);
    const contactHash = stableHash(contact);
    const researchExists = assertCompatibleExisting(researchDb, "assessments", recordId, researchHash);
    const contactExists = assertCompatibleExisting(contactDb, "contacts", recordId, contactHash);
    const storedAt = new Date().toISOString();

    if (!researchExists) {
      researchDb.exec("BEGIN IMMEDIATE");
      try {
        researchDb.prepare(`
          INSERT INTO assessments (
            record_id, submitted_at, language, report_language, contract_version,
            processing_status, payload_hash, encrypted_payload, stored_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          recordId,
          submission.submitted_at,
          submission.language,
          submission.report_language,
          submission.contract_version,
          "stored_local",
          researchHash,
          encryptJson(research, key),
          storedAt
        );
        researchDb.prepare(`
          INSERT INTO audit_events (record_id, event_type, event_status, event_at)
          VALUES (?, 'submission_received', 'success', ?)
        `).run(recordId, storedAt);
        researchDb.exec("COMMIT");
      } catch (error) {
        researchDb.exec("ROLLBACK");
        throw error;
      }
    }

    if (!contactExists) {
      contactDb.prepare(`
        INSERT INTO contacts (
          record_id, submitted_at, report_language, payload_hash, encrypted_payload, stored_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        recordId,
        submission.submitted_at,
        submission.report_language,
        contactHash,
        encryptJson(contact, key),
        storedAt
      );
    }

    return {
      recordId,
      duplicate: researchExists && contactExists,
      storedAt
    };
  }

  function counts() {
    return {
      assessments: Number(researchDb.prepare("SELECT COUNT(*) AS count FROM assessments").get().count),
      contacts: Number(contactDb.prepare("SELECT COUNT(*) AS count FROM contacts").get().count)
    };
  }

  function readResearchRecord(recordId) {
    const row = researchDb.prepare("SELECT encrypted_payload FROM assessments WHERE record_id = ?").get(recordId);
    return row ? decryptJson(row.encrypted_payload, key) : null;
  }

  function readContactRecord(recordId) {
    const row = contactDb.prepare("SELECT encrypted_payload FROM contacts WHERE record_id = ?").get(recordId);
    return row ? decryptJson(row.encrypted_payload, key) : null;
  }

  function listResearchRecords() {
    return researchDb.prepare(`
      SELECT record_id, encrypted_payload FROM assessments ORDER BY submitted_at, record_id
    `).all().map((row) => ({
      record_id: row.record_id,
      payload: decryptJson(row.encrypted_payload, key)
    }));
  }

  function listContactRecords() {
    return contactDb.prepare(`
      SELECT record_id, encrypted_payload FROM contacts ORDER BY submitted_at, record_id
    `).all().map((row) => ({
      record_id: row.record_id,
      payload: decryptJson(row.encrypted_payload, key)
    }));
  }

  function close() {
    researchDb.close();
    contactDb.close();
  }

  return {
    dataDir,
    researchPath,
    contactsPath,
    saveSubmission,
    counts,
    readResearchRecord,
    readContactRecord,
    listResearchRecords,
    listContactRecords,
    close
  };
}

module.exports = {
  createLocalRepository,
  decodeKey,
  encryptJson,
  decryptJson,
  buildResearchRecord,
  getRecordId
};
