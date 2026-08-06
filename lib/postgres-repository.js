const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const MIGRATION_FILE = path.join(__dirname, "..", "database", "migrations", "001_initial.sql");

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

function sortForHash(value) {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortForHash(value[key])])
    );
  }
  return value;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(sortForHash(value))).digest("hex");
}

function json(value) {
  return JSON.stringify(value == null ? null : value);
}

function buildResearchRecord(submission) {
  const record = structuredClone(submission);
  delete record.email;
  delete record.contact_row;
  if (record.excel_row && typeof record.excel_row === "object") delete record.excel_row.email;
  if (Array.isArray(record.rows)) {
    record.rows = record.rows.map((row) => {
      const clean = { ...row };
      delete clean.email;
      return clean;
    });
  }
  return record;
}

function buildContactRecord(submission, recordId) {
  return {
    record_id: recordId,
    email: submission.email,
    submitted_at: submission.submitted_at,
    language: submission.language,
    report_language: submission.report_language
  };
}

function poolConfiguration(options = {}) {
  const config = {
    application_name: "eg-cancer-risk-platform",
    max: Number(process.env.PGPOOL_MAX || 20),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  };
  const connectionString = options.connectionString || process.env.DATABASE_URL;
  if (connectionString) config.connectionString = connectionString;
  return config;
}

function createPostgresRepository(options = {}) {
  const pool = options.pool || new Pool(poolConfiguration(options));

  async function initialize() {
    if (String(process.env.RUN_DATABASE_MIGRATIONS || "").toLowerCase() === "true") {
      const migration = fs.readFileSync(MIGRATION_FILE, "utf8");
      await pool.query(migration);
    }
    const result = await pool.query(`
      SELECT
        to_regclass('research.assessments') IS NOT NULL AS assessments_ready,
        to_regclass('contact.delivery_contacts') IS NOT NULL AS contacts_ready,
        to_regclass('operations.submission_events') IS NOT NULL AS events_ready
    `);
    if (!result.rows[0].assessments_ready || !result.rows[0].contacts_ready || !result.rows[0].events_ready) {
      throw new Error("PostgreSQL schema is not initialized. Run database/migrations/001_initial.sql as an administrator.");
    }
  }

  async function saveSubmission(submission) {
    const recordId = getRecordId(submission);
    const research = buildResearchRecord(submission);
    const contact = buildContactRecord(submission, recordId);
    const researchHash = stableHash(research);
    const contactHash = stableHash(contact);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [recordId]);
      const existingResearch = await client.query(
        "SELECT payload_hash FROM research.assessments WHERE record_id = $1",
        [recordId]
      );
      const existingContact = await client.query(
        "SELECT payload_hash FROM contact.delivery_contacts WHERE record_id = $1",
        [recordId]
      );
      if (existingResearch.rowCount && existingResearch.rows[0].payload_hash !== researchHash) {
        throw new Error(`A different assessment already uses record_id ${recordId}.`);
      }
      if (existingContact.rowCount && existingContact.rows[0].payload_hash !== contactHash) {
        throw new Error(`A different contact already uses record_id ${recordId}.`);
      }
      const duplicate = Boolean(existingResearch.rowCount && existingContact.rowCount);

      if (!existingResearch.rowCount) {
        await client.query(`
          INSERT INTO research.assessments (
            record_id, submitted_at, language, report_language, contract_version,
            payload_hash, consent_record, answer_code_rows, answer_rows, model_input,
            research_row, rule_input, data_quality, submission_payload
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )
        `, [
          recordId,
          submission.submitted_at,
          submission.language,
          submission.report_language,
          submission.contract_version,
          researchHash,
          json(research.consent_record),
          json(research.answer_code_rows),
          json(research.rows),
          json(research.ai_api_feature_row),
          json(research.excel_row),
          json(research.rule_input_row),
          json(research.data_quality),
          json(research)
        ]);
      }

      if (!existingContact.rowCount) {
        await client.query(`
          INSERT INTO contact.delivery_contacts (
            record_id, email, submitted_at, language, report_language, payload_hash
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          recordId,
          contact.email,
          contact.submitted_at,
          contact.language,
          contact.report_language,
          contactHash
        ]);
      }

      await client.query(`
        INSERT INTO operations.submission_events (record_id, event_type, event_status, detail)
        VALUES ($1, $2, 'success', $3)
      `, [
        recordId,
        duplicate ? "duplicate_submission_accepted" : "submission_received",
        json({ storage: "postgresql", duplicate })
      ]);
      await client.query("COMMIT");
      return { recordId, duplicate, storedAt: new Date().toISOString() };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function counts() {
    const result = await pool.query(`
      SELECT
        (SELECT count(*)::integer FROM research.assessments) AS assessments,
        (SELECT count(*)::integer FROM contact.delivery_contacts) AS contacts
    `);
    return result.rows[0];
  }

  async function health() {
    const result = await pool.query("SELECT current_database() AS database, now() AS checked_at");
    return result.rows[0];
  }

  async function listResearchRecords() {
    const result = await pool.query(`
      SELECT record_id, submission_payload AS payload
      FROM research.assessments ORDER BY submitted_at, record_id
    `);
    return result.rows;
  }

  async function listContactRecords() {
    const result = await pool.query(`
      SELECT record_id, email, submitted_at, language, report_language, delivery_status
      FROM contact.delivery_contacts ORDER BY submitted_at, record_id
    `);
    return result.rows;
  }

  async function close() {
    await pool.end();
  }

  return {
    initialize,
    saveSubmission,
    counts,
    health,
    listResearchRecords,
    listContactRecords,
    close
  };
}

module.exports = {
  createPostgresRepository,
  getRecordId,
  stableHash,
  buildResearchRecord,
  buildContactRecord
};
