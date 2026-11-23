const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");

// Every entrance since v19.15 (2026-11-19; the research-intake questionnaire
// first, 2026-11-18): after chronic_conditions, one table asks, for each
// checked condition, whether the respondent has seen a doctor for it and how
// long ago it last flared up (ranges 1 個月內 / 1–6 個月 / 6–12 個月 /
// 1 年以上 / 不確定). What these tests pin down:
//   1. it is the same at every entrance -- no separate questionnaire;
//   2. a row is asked only for a condition that was checked;
//   3. every cell is a coded answer, with not_applicable / unknown kept apart;
//   4. nothing here reaches the model request.

const CHRONIC_FIELD = "medical_history.chronic_conditions";
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function intakeApp() {
  return loadApp();
}

function checkConditions(app, labels) {
  const question = app.questions.find((item) => item.id === "chronic_conditions");
  labels.forEach((label) => assert(question.options.includes(label), `not a chronic_conditions option: ${label}`));
  app.answers[CHRONIC_FIELD] = app.makeAnswerEntry(question, labels, "test");
}

function codeRow(app, questionId) {
  return plain(app.buildAnswerCodeRows().find((row) => row.question_id === questionId));
}

function activeIds(app) {
  return app.getActiveQuestions().map((question) => question.id);
}

test("the follow-up is the same at every entrance, research-intake included", () => {
  // One questionnaire for every entrance: nothing is switched by the entrance.
  const app = loadApp();
  assert(!app.questions.some((question) => "intakeOnly" in question), "nothing is intake-only any more");
  assert(!app.questions.some((question) => question.module === "staff"), "a research-staff question is back");
});

test("one table and two coded rows for each of the 15 conditions", () => {
  const app = intakeApp();
  assert.equal(app.questions.filter((question) => question.matrixGroup).length, 30);
  assert(app.questions.some((question) => question.id === "chronic_followup_matrix"));
  // 91 before v19.15, +30 cells; v19.16 +2 (the other cancer type's care and
  // last episode; the disease names are text). The staff diagnosis basis
  // (v19.15-v19.16) was removed in v19.17.
  assert.equal(app.canonicalAnswerQuestions.length, 91 + 30 + 2);

  // Every chronic_conditions option except 以上皆無 has its pair of rows.
  const chronic = app.questions.find((item) => item.id === "chronic_conditions");
  const diseases = chronic.options.filter((option) => option !== "以上皆無");
  assert.equal(diseases.length, 15);
  const matrix = app.questions.find((item) => item.id === "chronic_followup_matrix");
  const groupLabels = [...new Set(app.getCompositeRows(matrix).map((row) => row.matrixGroupLabel))];
  assert.deepEqual(plain(groupLabels), plain(diseases));
});

test("the table sits after the liver follow-up and the other disease's name, and shows only when a condition is checked", () => {
  const app = intakeApp();
  const order = app.questions.map((question) => question.id);
  assert.equal(order.indexOf("chronic_other_name"), order.indexOf("liver_disease_etiology") + 1);
  assert.equal(order.indexOf("chronic_followup_matrix"), order.indexOf("chronic_other_name") + 1);

  assert(!activeIds(app).includes("chronic_followup_matrix"), "shown before chronic_conditions was answered");
  checkConditions(app, ["以上皆無"]);
  assert(!activeIds(app).includes("chronic_followup_matrix"), "shown after 以上皆無");
  checkConditions(app, ["痛風／高尿酸"]);
  assert(activeIds(app).includes("chronic_followup_matrix"));
  // The cells themselves are never pages of their own.
  assert(!activeIds(app).some((id) => id.startsWith("chronic_care_") || id.startsWith("chronic_last_episode_")));
});

test("only the checked conditions' rows are asked", () => {
  const app = intakeApp();
  checkConditions(app, ["高血壓", "糖尿病／高血糖", "其他慢性疾病"]);
  const matrix = app.questions.find((item) => item.id === "chronic_followup_matrix");
  assert.deepEqual(plain(app.getApplicableCompositeRows(matrix).map((row) => row.id)), [
    "chronic_care_hypertension", "chronic_last_episode_hypertension",
    "chronic_care_diabetes", "chronic_last_episode_diabetes",
    "chronic_care_other_unclassified", "chronic_last_episode_other_unclassified"
  ]);
});

test("answers are coded; unchecked conditions are not_applicable and 不確定 is unknown", () => {
  const app = intakeApp();
  checkConditions(app, ["高血壓", "糖尿病／高血糖"]);
  const matrix = app.questions.find((item) => item.id === "chronic_followup_matrix");
  app.saveGroupedMatrixAnswers(matrix, ["是", "1 年以上", "不確定", "1–6 個月"], "matrix_choice");

  assert.deepEqual(codeRow(app, "chronic_care_hypertension"), { question_id: "chronic_care_hypertension", status: "answered", value: "yes" });
  assert.deepEqual(codeRow(app, "chronic_last_episode_hypertension"), { question_id: "chronic_last_episode_hypertension", status: "answered", value: "chronic_last_episode_hypertension.option_04" });
  assert.deepEqual(codeRow(app, "chronic_care_diabetes"), { question_id: "chronic_care_diabetes", status: "unknown", value: null });
  assert.deepEqual(codeRow(app, "chronic_last_episode_diabetes"), { question_id: "chronic_last_episode_diabetes", status: "answered", value: "chronic_last_episode_diabetes.option_02" });
  assert.deepEqual(codeRow(app, "chronic_care_kidney"), { question_id: "chronic_care_kidney", status: "not_applicable", value: null });
  assert.deepEqual(codeRow(app, "chronic_followup_matrix"), undefined, "the table itself is not an answer");
});

test("the four time ranges get stable, distinct codes", () => {
  const app = intakeApp();
  checkConditions(app, ["中風病史"]);
  const matrix = app.questions.find((item) => item.id === "chronic_followup_matrix");
  const codes = ["1 個月內", "1–6 個月", "6–12 個月", "1 年以上"].map((range) => {
    app.saveGroupedMatrixAnswers(matrix, ["否", range], "matrix_choice");
    return codeRow(app, "chronic_last_episode_stroke").value;
  });
  assert.deepEqual(codes, [1, 2, 3, 4].map((n) => `chronic_last_episode_stroke.option_0${n}`));
});

test("skipping the table marks only the checked conditions unknown", () => {
  const app = intakeApp();
  checkConditions(app, ["氣喘／慢性肺阻塞（COPD）"]);
  const matrix = app.questions.find((item) => item.id === "chronic_followup_matrix");
  const rows = app.getApplicableCompositeRows(matrix);
  app.saveGroupedMatrixAnswers(matrix, rows.map(() => "不確定"), "uncertain");
  assert.equal(codeRow(app, "chronic_care_asthma_copd").status, "unknown");
  assert.equal(codeRow(app, "chronic_last_episode_asthma_copd").status, "unknown");
  assert.equal(app.answers["medical_history.chronic_followup.gout.care"], undefined, "an unchecked condition got an answer");
});

test("an answer left behind by unchecking a condition does not ride along", () => {
  const app = intakeApp();
  checkConditions(app, ["高血壓", "痛風／高尿酸"]);
  const matrix = app.questions.find((item) => item.id === "chronic_followup_matrix");
  app.saveGroupedMatrixAnswers(matrix, ["是", "1 個月內", "否", "1 年以上"], "matrix_choice");

  // Back to chronic_conditions, gout unchecked, table not revisited.
  checkConditions(app, ["高血壓"]);
  assert.equal(codeRow(app, "chronic_care_gout").status, "not_applicable");
  assert(!app.buildSubmissionRows().some((row) => row.question_id.endsWith("_gout")), "stale gout answer in rows");
  assert(app.buildSubmissionRows().some((row) => row.question_id === "chronic_care_hypertension"));

  // Table revisited and saved: the stale answer is removed outright.
  app.saveGroupedMatrixAnswers(matrix, ["是", "1 個月內"], "matrix_choice");
  assert.equal(app.answers["medical_history.chronic_followup.gout.care"], undefined);
});

test("the follow-up never reaches the model request, and chronic_* features are unchanged", () => {
  const fill = (app) => {
    for (const question of app.questions) {
      if (!question.field || question.matrixGroup) continue;
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
    checkConditions(app, ["高血壓", "糖尿病／高血糖"]);
  };
  // Same answers, once without the follow-up answered and once with it.
  const sale = loadApp();
  fill(sale);
  const intake = intakeApp();
  fill(intake);
  const matrix = intake.questions.find((item) => item.id === "chronic_followup_matrix");
  intake.saveGroupedMatrixAnswers(matrix, ["是", "1 個月內", "否", "6–12 個月"], "matrix_choice");

  const saleRequest = plain(sale.storeSubmissionForIntegration().ai_api_feature_row);
  const intakeRequest = plain(intake.storeSubmissionForIntegration().ai_api_feature_row);
  delete saleRequest.record_id;
  delete intakeRequest.record_id;
  assert.deepEqual(intakeRequest, saleRequest);
});

test("the conversational version asks the follow-up too, one cell at a time", () => {
  const { createChatSession } = require("./chat-session");
  const app = loadApp();
  for (const question of app.questions) {
    if (!question.field || question.matrixGroup || question.id === "chronic_conditions") continue;
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
  checkConditions(app, ["痛風／高尿酸"]);
  const session = createChatSession({ app });
  assert.equal(session.next().question.id, "chronic_care_gout");
});
