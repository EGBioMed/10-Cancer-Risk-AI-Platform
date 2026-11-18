const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./lib/load-app-sandbox");

// The research-intake questionnaire as a whole (2026-11-18): no name, no Email,
// no report; the chronic follow-up table; and a free-text question last. The
// questionnaire on sale is the control in every test here -- it must be exactly
// what it was.

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const intake = () => loadApp({ questionnaireMode: "intake" });
const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

test("intake asks for no name and no Email; the questionnaire on sale still asks for both", () => {
  const sale = loadApp();
  assert(sale.questions.some((question) => question.id === "full_name"));
  assert(sale.questions.some((question) => question.id === "email"));

  const app = intake();
  for (const type of ["name", "email"]) {
    assert(!app.questions.some((question) => question.type === type), `intake still asks a ${type} question`);
  }
  assert(!app.questions.some((question) => String(question.field).startsWith("contact.")));
});

test("the last intake question is the optional free-text question, capped at 500 characters", () => {
  const app = intake();
  const last = app.questions[app.questions.length - 1];
  assert.equal(last.id, "intake_recent_discomfort");
  assert.equal(last.type, "longtext");
  assert.equal(last.required, false);
  assert.equal(app.getLongTextMaxLength(last), 500);
  assert.equal(last.title, "最近是否有任何身體不適？");
});

test("intake has its own questionnaire version; the version on sale is unchanged", () => {
  const saleManifest = require("./contracts/v1/answer-code-manifest.json");
  const intakeManifest = require("./contracts/intake/answer-code-manifest.json");
  assert.equal(saleManifest.questionnaire_version, "questionnaire/2026-11-16-v19.14-phase1");
  assert.equal(intakeManifest.questionnaire_version, "questionnaire/2026-11-18-v19.14-intake1");
  assert.equal(saleManifest.canonical_answer_question_count, 91);
  assert.equal(intakeManifest.canonical_answer_question_count, 121);

  const freeText = intakeManifest.questions.find((question) => question.question_id === "intake_recent_discomfort");
  assert.equal(freeText.answer_type, "free_text");
  assert.equal(freeText.max_length, 500);
  assert(!intakeManifest.questions.some((question) => ["email", "full_name"].includes(question.question_id)));
});

test("intake's last section is not called contact details", () => {
  const app = intake();
  const last = app.questions[app.questions.length - 1];
  assert.equal(last.module, "closing");
  // Both module lists are written in app.js; the intake one must not keep the
  // Email promise in its summary.
  assert.match(appSource, /\{ id: "closing", title: "其他補充"/);
});

test("intake wording promises no report; the page on sale keeps its wording", () => {
  // The intake result and confirmation texts, and the condition that selects them.
  // Checked on the page itself in the browser; here only that the texts exist.
  assert(appSource.includes("送出後，本頁資料將作為研究資料保存，不會產生或寄送個人報告。"));
  assert(appSource.includes("本研究問卷不會產生或寄送個人報告。"));
  // The sale wording is still there, unconditionally reachable in sale mode.
  assert.match(appSource, /報告處理完成後將寄送至 \$\{submission\.email\}/);
});

test("an intake respondent is never stopped for a missing Email", () => {
  // validateContactEmail is DOM-free; read its first lines rather than load the DOM half.
  const start = appSource.indexOf("function validateContactEmail() {");
  const head = appSource.slice(start, start + 200);
  assert.match(head, /if \(QUESTIONNAIRE_MODE === "intake"\) return "";/);
});

test("a completed intake questionnaire builds a submission with no name or Email in it", () => {
  const app = intake();
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
  const freeText = app.questions.find((question) => question.id === "intake_recent_discomfort");
  app.answers[freeText.field] = app.makeAnswerEntry(freeText, "最近兩週胃脹", "longtext_input");

  const submission = plain(app.storeSubmissionForIntegration());
  assert.equal(submission.questionnaire_version, "questionnaire/2026-11-18-v19.14-intake1");
  assert.equal(submission.email, "");
  assert.equal(submission.full_name, "");
  assert.equal(submission.answer_code_rows.length, 121);
  // The free text is still nowhere in the body: where it goes is decided with
  // the intake destination, not here.
  assert(!JSON.stringify(submission).includes("胃脹"));
  assert.deepEqual(plain(app.buildFreeTextAnswers()), [
    { question_id: "intake_recent_discomfort", status: "answered", value: "最近兩週胃脹" }
  ]);
});
