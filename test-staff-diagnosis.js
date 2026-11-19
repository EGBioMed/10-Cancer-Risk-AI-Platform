const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const {
  parseReportRecipients,
  recipientForInstitution,
  staffAnswerProblems,
  STAFF_DIAGNOSIS_MAX_LENGTH
} = require("./lib/report-recipients");
const {
  sanitizeLegacyDirectIdentifiers,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

// The research-intake entrance (2026-11-19): not a separate questionnaire but
// a 雙和-style entrance -- reports go to one mailbox -- with "staffDiagnosis":
// true, which adds a last page the research staff fill in. What these tests
// pin down:
//   1. every other entrance never sees that page, and its contract still says
//      not_applicable for it;
//   2. at a research-intake entrance the page is asked, last before the
//      confirmation;
//   3. the entrance, not the page, is the authority (staffAnswerProblems).

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const STAFF_IDS = ["staff_diagnosis", "staff_diagnosis_basis"];

function fillEveryQuestion(app) {
  for (const question of app.questions) {
    if (!question.field || question.module === "staff") continue;
    let value;
    if (question.type === "multi") value = [question.options?.[0]];
    else if (question.options) value = question.options[0];
    else if (question.type === "email") value = "contract-test@example.com";
    else if (question.type === "name") value = "王小明";
    else if (question.id.includes("birth_year")) value = "1980";
    else if (question.id.includes("height")) value = "165";
    else if (question.id.includes("weight")) value = "60";
    else value = "1";
    app.answers[question.field] = app.makeAnswerEntry(question, value, "contract_test");
  }
  const consent = app.questions.find((question) => question.id === "consent_acknowledgement");
  app.answers[consent.field] = app.makeAnswerEntry(consent, [...consent.options], "contract_test");
}

function fillStaffPage(app, diagnosis = "大腸直腸癌", basis = "病理確診") {
  const diagnosisQuestion = app.questions.find((question) => question.id === "staff_diagnosis");
  const basisQuestion = app.questions.find((question) => question.id === "staff_diagnosis_basis");
  app.answers[diagnosisQuestion.field] = app.makeAnswerEntry(diagnosisQuestion, diagnosis, "longtext_input");
  app.answers[basisQuestion.field] = app.makeAnswerEntry(basisQuestion, basis, "quick_choice");
}

test("an ordinary entrance never sees the staff page", () => {
  const app = loadApp();
  fillEveryQuestion(app);
  const active = app.getActiveQuestions().map((question) => question.id);
  for (const id of STAFF_IDS) assert(!active.includes(id), `${id} is asked at an ordinary entrance`);
  assert(!app.getShownModules().some((module) => module.id === "staff"), "the staff section is listed");

  const submission = plain(app.storeSubmissionForIntegration());
  assert.deepEqual(submission.answer_code_rows.find((row) => row.question_id === "staff_diagnosis_basis"),
    { question_id: "staff_diagnosis_basis", status: "not_applicable", value: null });
  assert(!submission.rows.some((row) => STAFF_IDS.includes(row.question_id)));
  assert.deepEqual(staffAnswerProblems(submission, null), []);
});

test("a research-intake entrance asks the staff page last, before the confirmation", () => {
  const app = loadApp({ staffDiagnosisEntrance: true });
  fillEveryQuestion(app);
  const active = app.getActiveQuestions().map((question) => question.id);
  assert.deepEqual(plain(active.slice(-2)), STAFF_IDS);
  const modules = app.getShownModules().map((module) => module.id);
  assert.deepEqual(plain(modules.slice(-3)), ["staff", "confirm", "result"]);

  const [diagnosis, basis] = STAFF_IDS.map((id) => app.questions.find((question) => question.id === id));
  assert.equal(diagnosis.type, "longtext");
  assert.equal(diagnosis.required, true);
  assert.equal(app.getLongTextMaxLength(diagnosis), STAFF_DIAGNOSIS_MAX_LENGTH);
  assert.equal(basis.type, "single");
  assert.deepEqual(plain(basis.options), ["病理確診", "影像或臨床診斷", "僅依病人口述", "尚未確診"]);
});

test("the diagnosis travels in rows as text; its basis is a code; neither is a feature", () => {
  const app = loadApp({ staffDiagnosisEntrance: true });
  fillEveryQuestion(app);
  fillStaffPage(app, "大腸直腸癌（第二期）");
  const submission = app.storeSubmissionForIntegration();
  app.validateSubmissionBeforeSend(submission);
  const posted = plain(submission);
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(plain(posted))), []);

  const diagnosisRow = posted.rows.find((row) => row.question_id === "staff_diagnosis");
  assert.equal(diagnosisRow.answer, "大腸直腸癌（第二期）");
  assert(!posted.answer_code_rows.some((row) => row.question_id === "staff_diagnosis"));
  const basisRow = posted.answer_code_rows.find((row) => row.question_id === "staff_diagnosis_basis");
  assert.equal(basisRow.status, "answered");
  assert.match(basisRow.value, /^staff_diagnosis_basis\.option_\d\d$/);

  for (const name of ["ai_api_feature_row", "optimized_feature_row", "excel_row", "symptom_feature_row", "vnext_feature_row", "rule_input_row"]) {
    assert(!JSON.stringify(posted[name] || {}).includes("大腸直腸癌（第二期）"), `the diagnosis leaked into ${name}`);
  }
  assert.deepEqual(staffAnswerProblems(posted, { staffDiagnosis: true }), []);
});

test("the server refuses staff answers from an ordinary entrance", () => {
  const app = loadApp({ staffDiagnosisEntrance: true });
  fillEveryQuestion(app);
  fillStaffPage(app);
  const posted = plain(app.storeSubmissionForIntegration());
  // A clinic like 雙和 (no staffDiagnosis), and no institution at all.
  assert.deepEqual(staffAnswerProblems(posted, { label: "雙和醫院", email: "a@b.co" }), ["staff answers are not accepted from this entrance"]);
  assert.deepEqual(staffAnswerProblems(posted, null), ["staff answers are not accepted from this entrance"]);
});

test("the server refuses a research-intake submission without the staff page", () => {
  const app = loadApp();
  fillEveryQuestion(app);
  const posted = plain(app.storeSubmissionForIntegration());
  assert.deepEqual(staffAnswerProblems(posted, { staffDiagnosis: true }), [
    "the diagnosis basis is required at this entrance",
    "the diagnosis is required at this entrance"
  ]);
  const tooLong = plain(posted);
  tooLong.answer_code_rows.find((row) => row.question_id === "staff_diagnosis_basis").status = "answered";
  tooLong.rows.push({ submitted_at: "x", question_id: "staff_diagnosis", question_text: "x", answer: "癌".repeat(STAFF_DIAGNOSIS_MAX_LENGTH + 1) });
  assert.deepEqual(staffAnswerProblems(tooLong, { staffDiagnosis: true }), [`the diagnosis is longer than ${STAFF_DIAGNOSIS_MAX_LENGTH} characters`]);
});

test("staffDiagnosis in the whitelist: true switches it on, absent leaves the entry as it was, anything else is refused", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    research: { label: "收案", email: "egbiomedai@eg-bio.com", codes: ["egresearch01"], staffDiagnosis: true },
    shuangho: { label: "雙和醫院", email: "reports@example.org", codes: ["egshuangho2026"] },
    typo: { label: "X", email: "x@example.org", codes: ["egtypo01"], staffDiagnosis: "yes" }
  }));
  assert.deepEqual(plain(recipientForInstitution(whitelist, "research")),
    { slug: "research", label: "收案", email: "egbiomedai@eg-bio.com", staffDiagnosis: true });
  // 雙和's entry is exactly what it was before the flag existed.
  assert.deepEqual(plain(recipientForInstitution(whitelist, "shuangho")),
    { slug: "shuangho", label: "雙和醫院", email: "reports@example.org" });
  assert.equal(recipientForInstitution(whitelist, "typo"), null);
  assert(whitelist.problems.some((problem) => /typo has staffDiagnosis "yes"/.test(problem)));
});
