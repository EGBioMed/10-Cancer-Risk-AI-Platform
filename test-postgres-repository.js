const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const {
  buildContactRecord,
  buildResearchRecord,
  getRecordId,
  stableHash
} = require("./lib/postgres-repository");

function submission() {
  return {
    contract_version: "assessment-submission/1.1.0",
    submitted_at: "2026-08-06T08:00:00.000Z",
    email: "patient@example.test",
    language: "zh",
    report_language: "zh-Hant",
    optimized_feature_row: { record_id: "WEB-PG-001", age: 55 },
    contact_row: { record_id: "WEB-PG-001", email: "patient@example.test" },
    rows: [{ question_id: "recent_discomfort", answer: "腹部不適" }],
    excel_row: { record_id: "WEB-PG-001", age: 55 },
    ai_api_feature_row: { record_id: "WEB-PG-001", age: 55 },
    rule_input_row: {},
    data_quality: { missing_columns: [], contradiction_warnings: [] }
  };
}

test("PostgreSQL research record excludes direct contact data", () => {
  const value = submission();
  const research = buildResearchRecord(value);
  assert.equal(research.email, undefined);
  assert.equal(research.contact_row, undefined);
  assert.equal(research.excel_row.email, undefined);
  assert.equal(buildContactRecord(value, getRecordId(value)).email, value.email);
});

test("PostgreSQL duplicate hash is stable across object key order", () => {
  assert.equal(stableHash({ b: 2, a: { d: 4, c: 3 } }), stableHash({ a: { c: 3, d: 4 }, b: 2 }));
});

test("PostgreSQL migration defines separated schemas and record constraints", () => {
  const sql = fs.readFileSync(path.join(__dirname, "database", "migrations", "001_initial.sql"), "utf8");
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS research/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS contact/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS operations/);
  assert.match(sql, /record_id varchar\(128\) PRIMARY KEY/);
  assert.match(sql, /submission_payload jsonb NOT NULL/);
  assert.doesNotMatch(sql, /encrypted_payload/);
});
