const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const { UNCLASSIFIABLE_TYPES } = require("./lib/chat-classify");
const {
  sanitizeLegacyDirectIdentifiers,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

// The "longtext" question type (2026-11-18): a long free-text answer, built for
// the research-intake questionnaire's last question ("any recent discomfort?").
// No shipped question uses it yet, so these tests add one to a copy of app.js
// and run it through the real pipeline. What they pin down:
//   1. the questionnaire on sale today is untouched by the new type;
//   2. a free-text answer never lands in answer_code_rows, `rows`, or any
//      feature row -- only in buildFreeTextAnswers();
//   3. blank is recorded as unknown, never as an answer.

// The end of the `questions` literal: the sale/intake spread that holds the
// Email question (sale) or the free-text question (intake).
const QUESTIONS_END = "\n  ])\n];";
const INJECTED_TEXT = "最近兩週胃脹，聯絡我 0912-345-678 <b>x</b>";

function loadWithLongText({ required = false, maxLength = 40, appliesIf = "" } = {}) {
  return loadApp({
    transformSource(source) {
      assert.equal(source.split(QUESTIONS_END).length, 2, "anchor moved: the end of `questions` changed shape");
      const question = `{ id: "test_discomfort", module: "contact", type: "longtext", required: ${required}, `
        + `title: "最近是否有任何身體不適？", field: "test.discomfort", maxLength: ${maxLength}${appliesIf} }`;
      return source.replace(QUESTIONS_END, `\n  ]),\n  ${question}\n];`);
    }
  });
}

function fillEveryQuestion(app) {
  for (const question of app.questions) {
    if (!question.field || question.type === "longtext") continue;
    let value;
    if (question.type === "multi") value = [question.options?.[0]];
    else if (question.options) value = question.options[0];
    else if (question.type === "email") value = "contract-test@example.com";
    else if (question.type === "name") value = "王小明";
    else if (question.id.includes("birth_year")) value = "1980";
    else if (question.id.includes("height")) value = "165";
    else if (question.id.includes("weight")) value = "60";
    else value = "1";
    if (value === undefined) continue;
    app.answers[question.field] = app.makeAnswerEntry(question, value, "contract_test");
  }
  const consent = app.questions.find((question) => question.id === "consent_acknowledgement");
  app.answers[consent.field] = app.makeAnswerEntry(consent, [...consent.options], "contract_test");
}

test("the questionnaire on sale has no longtext question, so its contract is unchanged", () => {
  const app = loadApp();
  assert.equal(app.questions.filter((question) => question.type === "longtext").length, 0);
  assert.equal(app.canonicalAnswerQuestions.length, 91);
  assert.deepEqual(Array.from(app.buildFreeTextAnswers()), []);
});

test("a longtext question is kept out of answer_code_rows", () => {
  const app = loadWithLongText();
  assert.equal(app.questions.length, loadApp().questions.length + 1);
  assert.equal(app.canonicalAnswerQuestions.length, 91);
  assert(!app.canonicalAnswerQuestions.some((question) => question.type === "longtext"));
  assert(!app.buildAnswerCodeRows().some((row) => row.question_id === "test_discomfort"));
});

test("normalizeLongText folds line endings, drops control characters and trims", () => {
  const app = loadApp();
  assert.equal(app.normalizeLongText("  a\r\nb\rc\td\u0007  "), "a\nb\nc d");
  assert.equal(app.normalizeLongText("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(app.normalizeLongText(null), "");
  assert.equal(app.normalizeLongText("   \n\t "), "");
});

test("blank, skipped and unanswered are all unknown -- never an answer", () => {
  const app = loadWithLongText();
  const question = app.questions.find((item) => item.id === "test_discomfort");
  const freeText = () => JSON.parse(JSON.stringify(app.buildFreeTextAnswers()));
  const unknown = [{ question_id: "test_discomfort", status: "unknown", value: null }];

  assert.deepEqual(freeText(), unknown);
  app.answers[question.field] = app.makeAnswerEntry(question, "", "longtext_blank");
  assert.deepEqual(freeText(), unknown);
  app.answers[question.field] = app.makeAnswerEntry(question, "  \n ", "longtext_blank");
  assert.deepEqual(freeText(), unknown);
  app.answers[question.field] = app.makeAnswerEntry(question, "不確定", "uncertain");
  assert.deepEqual(freeText(), unknown);

  app.answers[question.field] = app.makeAnswerEntry(question, "  胃脹\r\n兩週 ", "longtext_input");
  assert.deepEqual(freeText(), [{ question_id: "test_discomfort", status: "answered", value: "胃脹\n兩週" }]);
});

test("an answer is capped at the question's maxLength even if the textarea limit was bypassed", () => {
  const app = loadWithLongText({ maxLength: 10 });
  const question = app.questions.find((item) => item.id === "test_discomfort");
  app.answers[question.field] = app.makeAnswerEntry(question, "一二三四五六七八九十十一", "longtext_input");
  assert.equal(app.buildFreeTextAnswers()[0].value, "一二三四五六七八九十");
});

test("the length limit and required check come from the question definition", () => {
  const optional = loadWithLongText({ maxLength: 5 });
  const optionalQuestion = optional.questions.find((item) => item.id === "test_discomfort");
  assert.equal(optional.getLongTextValidationMessage(optionalQuestion, ""), "");
  assert.equal(optional.getLongTextValidationMessage(optionalQuestion, "12345"), "");
  assert.match(optional.getLongTextValidationMessage(optionalQuestion, "123456"), /5/);

  const required = loadWithLongText({ required: true });
  const requiredQuestion = required.questions.find((item) => item.id === "test_discomfort");
  assert.notEqual(required.getLongTextValidationMessage(requiredQuestion, "  "), "");

  const defaulted = loadWithLongText({ maxLength: "undefined" });
  assert.equal(defaulted.getLongTextMaxLength(defaulted.questions.find((item) => item.id === "test_discomfort")), 500);
});

test("a question hidden by appliesIf is not_applicable, not unknown", () => {
  const app = loadWithLongText({ appliesIf: ", appliesIf: () => false" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.buildFreeTextAnswers())),
    [{ question_id: "test_discomfort", status: "not_applicable", value: null }]
  );
});

test("the free text appears nowhere in the submission, and the submission still passes both validators", () => {
  const app = loadWithLongText();
  fillEveryQuestion(app);
  const question = app.questions.find((item) => item.id === "test_discomfort");
  app.answers[question.field] = app.makeAnswerEntry(question, INJECTED_TEXT, "longtext_input");

  assert(!app.buildSubmissionRows().some((row) => row.question_id === "test_discomfort"));

  const submission = app.storeSubmissionForIntegration();
  app.validateSubmissionBeforeSend(submission);
  const posted = JSON.parse(JSON.stringify(submission));
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(posted)), []);

  const serialized = JSON.stringify(posted);
  assert(!serialized.includes("0912-345-678"), "the free text leaked into the submission body");
  assert(!serialized.includes("test_discomfort"), "the longtext question id leaked into the submission body");
});

test("the chat classifier refuses longtext questions, so free text never reaches the model", () => {
  assert(UNCLASSIFIABLE_TYPES.has("longtext"));
});
