const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { loadApp } = require("./lib/load-app-sandbox");
const { signSessionCookie, SESSION_COOKIE_NAME } = require("./lib/access-gate");
const {
  validateIntakeSubmission,
  buildIntakeFlowPayload,
  codedQuestions
} = require("./lib/intake-contract");

// The research-intake submission (2026-11-18): what the intake page sends, what
// the server accepts, and what the intake flow receives. The flow is a new one,
// separate from the two that mail reports; the server reaches it only through
// INTAKE_POWER_AUTOMATE_WEBHOOK_URL.

const FREE_TEXT = "最近兩週胃脹，0912-345-678";
const STAFF_DIAGNOSIS = "大腸直腸癌";
const plain = (value) => JSON.parse(JSON.stringify(value));

function completedIntakeSubmission() {
  const app = loadApp({ questionnaireMode: "intake" });
  for (const question of app.questions) {
    if (!question.field || question.intakeOnly || question.type === "longtext") continue;
    let value;
    if (question.type === "multi") value = [question.options?.[0]];
    else if (question.options) value = question.options[0];
    else if (question.id.includes("birth_year")) value = "1980";
    else if (question.id.includes("height")) value = "165";
    else if (question.id.includes("weight")) value = "60";
    else value = "1";
    app.answers[question.field] = app.makeAnswerEntry(question, value, "contract_test");
  }
  const consent = app.questions.find((question) => question.id === "consent_acknowledgement");
  app.answers[consent.field] = app.makeAnswerEntry(consent, [...consent.options], "contract_test");
  const chronic = app.questions.find((question) => question.id === "chronic_conditions");
  app.answers[chronic.field] = app.makeAnswerEntry(chronic, ["高血壓", "糖尿病／高血糖"], "contract_test");
  const matrix = app.questions.find((question) => question.id === "chronic_followup_matrix");
  app.saveGroupedMatrixAnswers(matrix, ["是", "1 年以上", "不確定", "1–6 個月"], "matrix_choice");
  const freeText = app.questions.find((question) => question.id === "intake_recent_discomfort");
  app.answers[freeText.field] = app.makeAnswerEntry(freeText, FREE_TEXT, "longtext_input");
  const diagnosis = app.questions.find((question) => question.id === "staff_diagnosis");
  app.answers[diagnosis.field] = app.makeAnswerEntry(diagnosis, STAFF_DIAGNOSIS, "longtext_input");
  // The browser's JSON.stringify, then the server's JSON.parse.
  return plain(app.buildIntakeSubmission());
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

test("a completed intake questionnaire passes the intake contract", () => {
  const submission = completedIntakeSubmission();
  assert.deepEqual(validateIntakeSubmission(submission), []);
  assert.equal(submission.answer_code_rows.length, 122);
  assert.deepEqual(Object.keys(submission).sort(), [
    "answer_code_rows", "answer_code_schema_version", "consent_record", "consent_version",
    "contract_version", "free_text_answers", "language", "questionnaire_version", "submitted_at"
  ]);
});

test("identifiers, a browser record_id and stray fields are refused, not ignored", () => {
  for (const [field, value] of [["email", "a@example.com"], ["full_name", "王小明"], ["record_id", "x"], ["rows", []]]) {
    const submission = { ...completedIntakeSubmission(), [field]: value };
    const errors = validateIntakeSubmission(submission);
    assert(errors.some((error) => error.path === `$.${field}` && error.code === "unknown_field"), field);
  }
});

test("a sale-questionnaire payload is not accepted as an intake one", () => {
  const submission = completedIntakeSubmission();
  const errors = validateIntakeSubmission({ ...submission, questionnaire_version: "questionnaire/2026-11-16-v19.14-phase1" });
  assert(errors.some((error) => error.code === "version_mismatch"));
  const short = { ...submission, answer_code_rows: submission.answer_code_rows.slice(0, 91) };
  assert(validateIntakeSubmission(short).some((error) => error.path === "$.answer_code_rows"));
});

test("coded answers are checked against the intake code list", () => {
  const submission = completedIntakeSubmission();
  const index = submission.answer_code_rows.findIndex((row) => row.question_id === "chronic_last_episode_hypertension");
  submission.answer_code_rows[index] = { question_id: "chronic_last_episode_hypertension", status: "answered", value: "no_such_code" };
  assert(validateIntakeSubmission(submission).some((error) => error.code === "invalid_option_code"));
});

test("free text: length, control characters and blank-as-answered are refused", () => {
  const base = completedIntakeSubmission();
  // Replaces the respondent's row and keeps the staff diagnosis row as built.
  const withText = (row) => ({ ...base, free_text_answers: [row, base.free_text_answers[1]] });
  const id = "intake_recent_discomfort";
  assert(validateIntakeSubmission(withText({ question_id: id, status: "answered", value: "字".repeat(501) }))
    .some((error) => error.code === "too_long"));
  assert(validateIntakeSubmission(withText({ question_id: id, status: "answered", value: "a\u0007b" }))
    .some((error) => error.code === "invalid_characters"));
  assert(validateIntakeSubmission(withText({ question_id: id, status: "answered", value: "   " }))
    .some((error) => error.code === "invalid_type"));
  assert(validateIntakeSubmission(withText({ question_id: id, status: "unknown", value: "x" }))
    .some((error) => error.code === "invalid_missing_value"));
  assert.deepEqual(validateIntakeSubmission(withText({ question_id: id, status: "unknown", value: null })), []);
  assert.deepEqual(validateIntakeSubmission(withText({ question_id: id, status: "answered", value: "第一行\n第二行" })), []);
});

test("incomplete consent is refused", () => {
  const submission = completedIntakeSubmission();
  submission.consent_record.accepted_item_ids = ["data_use"];
  assert(validateIntakeSubmission(submission).some((error) => error.code === "incomplete_consent"));
});

// ---------------------------------------------------------------------------
// What the flow receives
// ---------------------------------------------------------------------------

test("research_row flattens every coded answer; skipped is never a 0 or a no", () => {
  const submission = completedIntakeSubmission();
  const payload = buildIntakeFlowPayload(submission, { study: "study2026", recordId: "rec-1", receivedAt: "2026-11-18T00:00:00.000Z" });
  const row = payload.research_row;
  assert.equal(Object.keys(row).length, 4 + codedQuestions.length);
  assert.equal(row.record_id, "rec-1");
  assert.equal(row.study, "study2026");
  assert.equal(row.chronic_care_hypertension, "yes");
  assert.equal(row.chronic_last_episode_hypertension, "chronic_last_episode_hypertension.option_04");
  assert.equal(row.chronic_care_diabetes, "unknown");
  assert.equal(row.chronic_care_kidney, "not_applicable");
  assert.equal(row.birth_year, 1980);
  // A multiple choice keeps all its codes.
  const multi = submission.answer_code_rows.find((answer) => Array.isArray(answer.value));
  assert.equal(row[multi.question_id], multi.value.join("|"));
});

test("the flow payload carries no name, no Email and no model features; free text only where named", () => {
  const payload = buildIntakeFlowPayload(completedIntakeSubmission(), { study: "study2026", recordId: "rec-1" });
  const serialized = JSON.stringify(payload);
  for (const word of ["email", "full_name", "ai_api_feature_row", "optimized_feature_row", "excel_row", "contact_row"]) {
    assert(!serialized.includes(`"${word}"`), `${word} reached the intake flow`);
  }
  assert(!JSON.stringify(payload.research_row).includes("0912"), "free text leaked into research_row");
  assert(!JSON.stringify(payload.answer_code_rows).includes("0912"), "free text leaked into answer_code_rows");
  assert.equal(payload.free_text_answers[0].value, FREE_TEXT);
});

test("the staff diagnosis travels as free text, its basis as a coded research column", () => {
  const payload = buildIntakeFlowPayload(completedIntakeSubmission(), { study: "study2026", recordId: "rec-1" });
  assert.deepEqual(payload.free_text_answers[1], { question_id: "staff_diagnosis", status: "answered", value: STAFF_DIAGNOSIS });
  assert.equal(payload.research_row.staff_diagnosis_basis, "staff_diagnosis_basis.option_01");
  assert(!("staff_diagnosis" in payload.research_row), "the free-text diagnosis must not be a research_row column");
  assert(!JSON.stringify(payload.answer_code_rows).includes(STAFF_DIAGNOSIS));
});

test("a staff diagnosis longer than 200 characters is refused", () => {
  const submission = completedIntakeSubmission();
  submission.free_text_answers[1] = { question_id: "staff_diagnosis", status: "answered", value: "癌".repeat(201) };
  assert(validateIntakeSubmission(submission).some((error) => error.path === "$.free_text_answers[1].value" && error.code === "too_long"));
});

// ---------------------------------------------------------------------------
// The trigger schema pasted into the flow
// ---------------------------------------------------------------------------

const schemaPath = path.join(__dirname, "contracts", "power-automate", "intake-flow-trigger.schema.json");

test("the intake flow schema file is synchronized with the generator", () => {
  const before = fs.readFileSync(schemaPath, "utf8");
  execFileSync(process.execPath, [path.join(__dirname, "scripts", "generate-intake-flow-trigger-schema.js")], { cwd: __dirname, stdio: "pipe" });
  assert.equal(fs.readFileSync(schemaPath, "utf8"), before, "Run npm run generate:intake-flow-trigger-schema and review the diff.");
});

// Power Automate refuses to save a trigger schema that uses `pattern` or
// `patternProperties` as keywords (a property NAMED like that is fine).
function keywordsUsed(node, found = new Set()) {
  if (Array.isArray(node)) { node.forEach((item) => keywordsUsed(item, found)); return found; }
  if (!node || typeof node !== "object") return found;
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties") { Object.values(value).forEach((child) => keywordsUsed(child, found)); continue; }
    found.add(key);
    keywordsUsed(value, found);
  }
  return found;
}

test("the intake flow schema uses nothing Power Automate refuses, and pins no counts", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const used = keywordsUsed(schema);
  for (const keyword of ["pattern", "patternProperties", "minItems", "maxItems", "const"]) {
    assert(!used.has(keyword), `schema uses ${keyword}`);
  }
});

// Just the subset of JSON Schema the generated file uses.
function schemaErrors(schema, value, at = "$") {
  const errors = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
    const matches = types.some((type) => type === actual || (type === "number" && actual === "integer"));
    if (!matches) return [`${at}: expected ${types.join("|")}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: not in enum`);
  if (schema.required) for (const key of schema.required) if (!(key in value)) errors.push(`${at}.${key}: required`);
  if (schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key in value) errors.push(...schemaErrors(child, value[key], `${at}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in schema.properties)) errors.push(`${at}.${key}: not allowed`);
    }
  }
  if (schema.items && Array.isArray(value)) value.forEach((item, index) => errors.push(...schemaErrors(schema.items, item, `${at}[${index}]`)));
  return errors;
}

test("what the server sends passes the schema the flow will check it against", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const payload = plain(buildIntakeFlowPayload(completedIntakeSubmission(), { study: "study2026" }));
  assert.deepEqual(schemaErrors(schema, payload), []);
  // And the schema is not vacuous: an Email at the root is refused.
  assert(schemaErrors(schema, { ...payload, email: "a@example.com" }).some((error) => error.includes("email")));
  // Every coded question is offered to the flow designer as a research_row column.
  assert.equal(Object.keys(schema.properties.research_row.properties).length, 4 + codedQuestions.length);
});

// ---------------------------------------------------------------------------
// The running server, forwarding to a fake intake flow
// ---------------------------------------------------------------------------

const SECRET = "intake-submission-test-secret";
const CONFIG = JSON.stringify({ study2026: { label: "2026 收案", codes: ["EGSTUDY2026"] } });

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

function startServer(port, extraEnv) {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ACCESS_GATE_MODE: "enforced",
      ACCESS_GATE_SESSION_SECRET: SECRET,
      ACCESS_GATE_COOKIE_SECURE: "false",
      INTAKE_ENTRANCES: CONFIG,
      SUBMISSION_MODE: "postgres",
      DATABASE_URL: "",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start within 20s")), 20000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("listening")) { clearTimeout(timer); resolve(child); } });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
  });
}

const received = [];
function startFakeFlow(port) {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function cookieFor(payload) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${SESSION_COOKIE_NAME}=${signSessionCookie({ sid: `sid-${Math.random()}`, mode: "standard", ...payload, exp }, SECRET)}`;
}

let server;
let misconfigured;
let flow;
let base;
let misconfiguredBase;
test.before(async () => {
  const flowPort = await freePort();
  flow = await startFakeFlow(flowPort);
  const flowUrl = `http://127.0.0.1:${flowPort}/intake`;
  const port = await freePort();
  server = await startServer(port, { INTAKE_POWER_AUTOMATE_WEBHOOK_URL: flowUrl });
  base = `http://127.0.0.1:${port}`;
  // The intake URL set to a report flow's URL: must be refused at boot.
  const port2 = await freePort();
  misconfigured = await startServer(port2, {
    INTAKE_POWER_AUTOMATE_WEBHOOK_URL: flowUrl,
    POWER_AUTOMATE_WEBHOOK_URL: flowUrl
  });
  misconfiguredBase = `http://127.0.0.1:${port2}`;
});
test.after(() => {
  if (server) server.kill();
  if (misconfigured) misconfigured.kill();
  if (flow) flow.close();
});

function post(url, cookie, body) {
  return fetch(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("server: a valid intake submission is forwarded to the intake flow, once, with a server record_id", async () => {
  received.length = 0;
  const cookie = cookieFor({ grantId: 900, stu: "study2026" });
  const response = await post(`${base}/api/submit`, cookie, completedIntakeSubmission());
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.report_status, "none");
  assert.equal(received.length, 1);
  const delivered = received[0];
  assert.equal(delivered.record_id, body.record_id);
  assert.equal(delivered.research_row.record_id, body.record_id);
  assert.equal(delivered.study, "study2026");
  assert.equal(delivered.free_text_answers[0].value, FREE_TEXT);
  assert(!JSON.stringify(delivered).includes('"email"'));

  // The session is spent, as a sale one is after a successful submission.
  const again = await post(`${base}/api/submit`, cookie, completedIntakeSubmission());
  assert.equal(again.status, 403);
  assert.equal(received.length, 1);
});

test("server: an invalid intake submission is refused and never forwarded", async () => {
  received.length = 0;
  const response = await post(`${base}/api/submit`, cookieFor({ grantId: 900, stu: "study2026" }), {
    ...completedIntakeSubmission(),
    email: "a@example.com"
  });
  assert.equal(response.status, 422);
  assert.equal(received.length, 0);
});

test("server: a sale submission never reaches the intake flow", async () => {
  received.length = 0;
  await post(`${base}/api/submit`, cookieFor({ grantId: 5 }), {});
  assert.equal(received.length, 0);
});

test("server: a report flow's URL is refused as the intake destination", async () => {
  received.length = 0;
  const health = await (await fetch(`${misconfiguredBase}/api/health`)).json();
  assert.equal(health.intake_destination_configured, false);
  const response = await post(`${misconfiguredBase}/api/submit`, cookieFor({ grantId: 900, stu: "study2026" }), completedIntakeSubmission());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "intake_submission_not_configured");
  assert.equal(received.length, 0);

  const ok = await (await fetch(`${base}/api/health`)).json();
  assert.equal(ok.intake_destination_configured, true);
});
