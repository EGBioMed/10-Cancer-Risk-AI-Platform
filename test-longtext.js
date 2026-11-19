const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const { UNCLASSIFIABLE_TYPES } = require("./lib/chat-classify");

// The "longtext" question type (2026-11-18): a long free-text answer. Since
// v19.15 (2026-11-19) the only one is staff_diagnosis, typed by the research
// staff at a research-intake entrance (test-staff-diagnosis.js covers where it
// travels). What these tests pin down:
//   1. a longtext answer is never a coded answer;
//   2. its text is normalized the same way on every path;
//   3. its limits come from the question definition.

const staffDiagnosis = (app) => app.questions.find((item) => item.id === "staff_diagnosis");

test("staff_diagnosis is the only longtext question, and it is kept out of answer_code_rows", () => {
  const app = loadApp({ staffDiagnosisEntrance: true });
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.questions.filter((question) => question.type === "longtext").map((question) => question.id))),
    ["staff_diagnosis"]
  );
  assert(!app.canonicalAnswerQuestions.some((question) => question.type === "longtext"));
  const question = staffDiagnosis(app);
  app.answers[question.field] = app.makeAnswerEntry(question, "肺癌", "longtext_input");
  assert(!app.buildAnswerCodeRows().some((row) => row.question_id === "staff_diagnosis"));
});

test("normalizeLongText folds line endings, drops control characters and trims", () => {
  const app = loadApp();
  assert.equal(app.normalizeLongText("  a\r\nb\rc\td\u0007  "), "a\nb\nc d");
  assert.equal(app.normalizeLongText("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(app.normalizeLongText(null), "");
  assert.equal(app.normalizeLongText("   \n\t "), "");
});

test("the length limit and required check come from the question definition", () => {
  const app = loadApp({ staffDiagnosisEntrance: true });
  const question = staffDiagnosis(app);
  assert.equal(app.getLongTextMaxLength(question), 200);
  assert.notEqual(app.getLongTextValidationMessage(question, "  "), "", "a blank diagnosis is accepted");
  assert.equal(app.getLongTextValidationMessage(question, "癌".repeat(200)), "");
  assert.match(app.getLongTextValidationMessage(question, "癌".repeat(201)), /200/);
  // An optional longtext with no maxLength gets the default.
  const optional = { type: "longtext", required: false };
  assert.equal(app.getLongTextMaxLength(optional), 500);
  assert.equal(app.getLongTextValidationMessage(optional, ""), "");
});

test("the chat classifier refuses longtext questions, so free text never reaches the model", () => {
  assert(UNCLASSIFIABLE_TYPES.has("longtext"));
});
