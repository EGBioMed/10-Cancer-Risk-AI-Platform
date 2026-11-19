const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const { createChatSession } = require("./chat-session");
const {
  sanitizeLegacyDirectIdentifiers,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

// v19.16 (2026-11-19): ticking "其他慢性疾病" or "其他癌種" asks which disease it
// is, then whether the respondent has seen a doctor for it and when it last
// flared up. What these tests pin down:
//   1. the name is asked only when "other" was ticked, right after the list;
//   2. the name is text (rows only), the two follow-ups are codes;
//   3. none of it reaches a feature row or the model request;
//   4. the conversational version asks the same questions.

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const NEW_TEXT_IDS = ["chronic_other_name", "personal_cancer_other_name"];
const NEW_CODE_IDS = ["personal_cancer_other_care", "personal_cancer_other_last_episode"];

function setAnswer(app, id, value) {
  const question = app.questions.find((item) => item.id === id);
  app.answers[question.field] = app.makeAnswerEntry(question, value, "test");
}

function fillEverything(app, { chronic = ["以上皆無"], cancer = null } = {}) {
  for (const question of app.questions) {
    if (!question.field || question.matrixGroup || question.module === "staff" || question.type === "longtext") continue;
    if (NEW_CODE_IDS.includes(question.id)) continue;
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
  setAnswer(app, "chronic_conditions", chronic);
  if (cancer) {
    const yes = app.questions.find((item) => item.id === "personal_cancer").options.find((option) => option.startsWith("是"));
    setAnswer(app, "personal_cancer", yes);
    setAnswer(app, "personal_cancer_types", cancer);
  } else {
    const no = app.questions.find((item) => item.id === "personal_cancer").options.find((option) => option.startsWith("否"));
    setAnswer(app, "personal_cancer", no);
  }
}

const activeIds = (app) => app.getActiveQuestions().map((question) => question.id);

test("the other-disease name is asked only when 其他 was ticked, right after its list", () => {
  const app = loadApp();
  const order = app.questions.map((question) => question.id);
  assert.deepEqual(
    plain(order.slice(order.indexOf("personal_cancer_types") + 1, order.indexOf("personal_cancer_types") + 4)),
    ["personal_cancer_other_name", "personal_cancer_other_care", "personal_cancer_other_last_episode"]
  );

  fillEverything(app, { chronic: ["高血壓"], cancer: ["肺癌"] });
  for (const id of [...NEW_TEXT_IDS, ...NEW_CODE_IDS]) assert(!activeIds(app).includes(id), `${id} asked without 其他`);

  setAnswer(app, "chronic_conditions", ["高血壓", "其他慢性疾病"]);
  setAnswer(app, "personal_cancer_types", ["肺癌", "其他癌種"]);
  for (const id of [...NEW_TEXT_IDS, ...NEW_CODE_IDS]) assert(activeIds(app).includes(id), `${id} not asked after 其他`);

  // 其他癌種 left behind after answering 否 to the cancer question is not "other cancer".
  const no = app.questions.find((item) => item.id === "personal_cancer").options.find((option) => option.startsWith("否"));
  setAnswer(app, "personal_cancer", no);
  for (const id of ["personal_cancer_other_name", ...NEW_CODE_IDS]) assert(!activeIds(app).includes(id), `${id} asked after 否`);
});

test("the names are short required text; the follow-ups reuse the chronic options", () => {
  const app = loadApp();
  for (const id of NEW_TEXT_IDS) {
    const question = app.questions.find((item) => item.id === id);
    assert.equal(question.type, "longtext");
    assert.equal(question.required, true);
    assert.equal(app.getLongTextMaxLength(question), 50);
    assert.notEqual(app.getLongTextValidationMessage(question, "  "), "", `${id} accepts a blank name`);
    assert.notEqual(app.getLongTextValidationMessage(question, "癌".repeat(51)), "", `${id} accepts 51 characters`);
    assert(question.titleEn && question.noteEn && question.placeholderEn, `${id} has no English copy`);
  }
  const care = app.questions.find((item) => item.id === "personal_cancer_other_care");
  const last = app.questions.find((item) => item.id === "personal_cancer_other_last_episode");
  assert.deepEqual(plain(care.options), plain(app.questions.find((item) => item.id === "chronic_care_gout").options));
  assert.deepEqual(plain(last.options), plain(app.questions.find((item) => item.id === "chronic_last_episode_gout").options));
});

test("the names travel in rows as text, the follow-ups as codes, and the contract accepts it", () => {
  const app = loadApp();
  fillEverything(app, { chronic: ["其他慢性疾病"], cancer: ["其他癌種"] });
  setAnswer(app, "chronic_other_name", "骨質疏鬆");
  setAnswer(app, "personal_cancer_other_name", "甲狀腺癌");
  setAnswer(app, "personal_cancer_other_care", "是");
  setAnswer(app, "personal_cancer_other_last_episode", "1 年以上");
  setAnswer(app, "chronic_care_other_unclassified", "否");
  setAnswer(app, "chronic_last_episode_other_unclassified", "不確定");

  const submission = app.storeSubmissionForIntegration();
  app.validateSubmissionBeforeSend(submission);
  const posted = plain(submission);
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(plain(posted))), []);

  assert.equal(posted.rows.find((row) => row.question_id === "chronic_other_name").answer, "骨質疏鬆");
  assert.equal(posted.rows.find((row) => row.question_id === "personal_cancer_other_name").answer, "甲狀腺癌");
  for (const id of NEW_TEXT_IDS) assert(!posted.answer_code_rows.some((row) => row.question_id === id), `${id} has a code row`);
  for (const id of NEW_CODE_IDS) {
    const row = posted.answer_code_rows.find((item) => item.question_id === id);
    assert.equal(row.status, "answered", `${id} not answered`);
    assert.equal(typeof row.value, "string", `${id} has no code`);
  }
  for (const name of ["ai_api_feature_row", "optimized_feature_row", "excel_row", "symptom_feature_row", "vnext_feature_row", "rule_input_row"]) {
    const text = JSON.stringify(posted[name] || {});
    assert(!text.includes("骨質疏鬆") && !text.includes("甲狀腺癌"), `a disease name leaked into ${name}`);
  }
});

test("without 其他 the follow-ups are not_applicable and nothing is in rows", () => {
  const app = loadApp();
  fillEverything(app, { chronic: ["高血壓"], cancer: ["肺癌"] });
  const posted = plain(app.storeSubmissionForIntegration());
  for (const id of NEW_CODE_IDS) {
    assert.deepEqual(posted.answer_code_rows.find((row) => row.question_id === id), { question_id: id, status: "not_applicable", value: null });
  }
  for (const id of [...NEW_TEXT_IDS, ...NEW_CODE_IDS]) assert(!posted.rows.some((row) => row.question_id === id), `${id} in rows`);
});

test("the model request is the same with or without the other-disease answers", () => {
  const build = (withAnswers) => {
    const app = loadApp();
    fillEverything(app, { chronic: ["其他慢性疾病"], cancer: ["其他癌種"] });
    if (withAnswers) {
      setAnswer(app, "chronic_other_name", "骨質疏鬆");
      setAnswer(app, "personal_cancer_other_name", "甲狀腺癌");
      setAnswer(app, "personal_cancer_other_care", "是");
      setAnswer(app, "personal_cancer_other_last_episode", "1 年以上");
    }
    const { record_id: recordId, ...row } = plain(app.storeSubmissionForIntegration().ai_api_feature_row);
    return row;
  };
  assert.deepEqual(build(true), build(false));
});

test("the conversational version asks the name as typed text, then the follow-ups", () => {
  const app = loadApp();
  fillEverything(app, { chronic: ["以上皆無"], cancer: ["其他癌種"] });
  const session = createChatSession({ app });
  assert.equal(session.next().question.id, "personal_cancer_other_name");
  session.receive("x".repeat(51));
  const retry = session.next();
  assert.equal(retry.question.id, "personal_cancer_other_name", "a 51-character name was accepted");
  assert.equal(retry.kind, "retry");
  assert.equal(retry.pending.reason, "too_long");
  session.receive("甲狀腺癌");
  assert.equal(app.answers["medical_history.personal_cancer_other_name"].value, "甲狀腺癌");
  assert.equal(session.next().question.id, "personal_cancer_other_care");
});
