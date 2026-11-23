const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const { UNCLASSIFIABLE_TYPES } = require("./lib/chat-classify");

// The "longtext" question type (2026-11-18): a free-text answer. Since v19.17
// (2026-11-23) there are two: the names of an "other" chronic disease or cancer
// type (test-other-condition-followup.js covers where they travel). The
// research staff's diagnosis, a longtext question in v19.15-v19.16, is gone. What these tests pin down:
//   1. a longtext answer is never a coded answer;
//   2. its text is normalized the same way on every path;
//   3. its limits come from the question definition.

const otherChronicName = (app) => app.questions.find((item) => item.id === "chronic_other_name");

test("the longtext questions are the two other-disease names, kept out of answer_code_rows", () => {
  const app = loadApp();
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.questions.filter((question) => question.type === "longtext").map((question) => question.id))),
    ["personal_cancer_other_name", "chronic_other_name"]
  );
  assert(!app.canonicalAnswerQuestions.some((question) => question.type === "longtext"));
  const question = otherChronicName(app);
  app.answers[question.field] = app.makeAnswerEntry(question, "骨質疏鬆", "longtext_input");
  assert(!app.buildAnswerCodeRows().some((row) => row.question_id === "chronic_other_name"));
});

test("normalizeLongText folds line endings, drops control characters and trims", () => {
  const app = loadApp();
  assert.equal(app.normalizeLongText("  a\r\nb\rc\td\u0007  "), "a\nb\nc d");
  assert.equal(app.normalizeLongText("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(app.normalizeLongText(null), "");
  assert.equal(app.normalizeLongText("   \n\t "), "");
});

test("the length limit and required check come from the question definition", () => {
  const app = loadApp();
  const question = otherChronicName(app);
  assert.equal(app.getLongTextMaxLength(question), 50);
  assert.notEqual(app.getLongTextValidationMessage(question, "  "), "", "a blank name is accepted");
  assert.equal(app.getLongTextValidationMessage(question, "癌".repeat(50)), "");
  assert.match(app.getLongTextValidationMessage(question, "癌".repeat(51)), /50/);
  // An optional longtext with no maxLength gets the default.
  const optional = { type: "longtext", required: false };
  assert.equal(app.getLongTextMaxLength(optional), 500);
  assert.equal(app.getLongTextValidationMessage(optional, ""), "");
});

test("the chat classifier refuses longtext questions, so free text never reaches the model", () => {
  assert(UNCLASSIFIABLE_TYPES.has("longtext"));
});
