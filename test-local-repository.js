const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { createLocalRepository } = require("./lib/local-repository");

function sampleSubmission() {
  return {
    contract_version: "assessment-submission/1.1.0",
    submitted_at: "2026-08-06T08:00:00.000Z",
    email: "private.patient@example.test",
    language: "zh",
    report_language: "zh-Hant",
    optimized_feature_row: { record_id: "WEB-LOCAL-001" },
    contact_row: {
      record_id: "WEB-LOCAL-001",
      email: "private.patient@example.test",
      submitted_at: "2026-08-06T08:00:00.000Z",
      language: "zh",
      report_language: "zh-Hant"
    },
    rows: [{
      submitted_at: "2026-08-06T08:00:00.000Z",
      question_id: "recent_discomfort",
      question_text: "近期症狀",
      answer: "confidential-health-answer"
    }],
    excel_row: { record_id: "WEB-LOCAL-001", score: 0 },
    ai_api_feature_row: { record_id: "WEB-LOCAL-001" },
    data_quality: { missing_columns: [], contradiction_warnings: [] }
  };
}

test("local repository separates and encrypts research and contact records", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-local-repository-"));
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");
  const repository = createLocalRepository({ dataDir, encryptionKey });
  try {
    const submission = sampleSubmission();
    const saved = repository.saveSubmission(submission);
    assert.equal(saved.recordId, "WEB-LOCAL-001");
    assert.equal(saved.duplicate, false);
    assert.deepEqual(repository.counts(), { assessments: 1, contacts: 1 });
    assert.equal(repository.readResearchRecord(saved.recordId).email, undefined);
    assert.equal(repository.readResearchRecord(saved.recordId).contact_row, undefined);
    assert.equal(repository.readContactRecord(saved.recordId).email, submission.email);
    assert.equal(repository.saveSubmission(submission).duplicate, true);
  } finally {
    repository.close();
  }
  const databaseBytes = Buffer.concat([
    fs.readFileSync(path.join(dataDir, "research.sqlite")),
    fs.readFileSync(path.join(dataDir, "contacts.sqlite"))
  ]).toString("latin1");
  assert.equal(databaseBytes.includes("private.patient@example.test"), false);
  assert.equal(databaseBytes.includes("confidential-health-answer"), false);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("local repository rejects record-id collisions with different content", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "eg-local-collision-"));
  const repository = createLocalRepository({
    dataDir,
    encryptionKey: Buffer.alloc(32, 9).toString("base64")
  });
  try {
    const submission = sampleSubmission();
    repository.saveSubmission(submission);
    const changed = sampleSubmission();
    changed.rows[0].answer = "different-answer";
    assert.throws(() => repository.saveSubmission(changed), /different assessments record/);
  } finally {
    repository.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
