const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const answerCodes = require("./answer-codes");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const cutoff = source.indexOf("const answers = {};");
const sandbox = { EGAnswerCodes: answerCodes };
vm.createContext(sandbox);
vm.runInContext(`${source.slice(0, cutoff)}
globalThis.__uiDefinitions = { questions, symptomGroups, symptomOptionTranslations, i18n, canonicalAnswerQuestions };`, sandbox);

const { questions, symptomGroups, symptomOptionTranslations, i18n, canonicalAnswerQuestions } = sandbox.__uiDefinitions;
const byId = (id) => questions.find((question) => question.id === id);

test("mental matrix preserves all three canonical answer fields", () => {
  const matrix = byId("mental_frequency_matrix");
  assert.deepEqual([...matrix.rowQuestionIds], ["stress", "sleep_problem", "low_mood"]);
  assert.deepEqual(Array.from(matrix.rowQuestionIds, (id) => byId(id).field), [
    "mental_health.weekly_stress_frequency",
    "mental_health.weekly_sleep_problem_frequency",
    "mental_health.weekly_low_mood_frequency"
  ]);
  assert(matrix.rowQuestionIds.every((id) => byId(id).displayInComposite));
});

test("diet matrix preserves all four canonical multi-select fields", () => {
  const matrix = byId("diet_frequency_matrix");
  assert.deepEqual([...matrix.rowQuestionIds], [
    "meat_processed_foods",
    "sugar_fat_foods",
    "plant_dairy_habits",
    "beverage_habits"
  ]);
  assert(matrix.rowQuestionIds.every((id) => byId(id).type === "multi" && byId(id).displayInComposite));
});

test("constipation is presented in the bowel group while retaining its rule field", () => {
  const bowelGroup = symptomGroups.find((group) => group.id === "symptoms_bowel_abdominal");
  const constipationLabel = "便秘（排便困難或排便次數減少）";
  assert(bowelGroup.extraOptions.some(([label]) => label === constipationLabel));
  assert.equal(symptomOptionTranslations[constipationLabel], "Constipation (difficulty passing stool or fewer bowel movements)");
  assert.equal(byId("constipation").field, "rule_inputs.symptom_constipation");
  assert.equal(byId("constipation").displayInComposite, true);
});

test("breast pain is presented in the breast group while retaining its rule field", () => {
  const breastGroup = symptomGroups.find((group) => group.id === "symptoms_breast");
  const mastalgiaLabel = "乳房疼痛或脹痛";
  assert(breastGroup.extraOptions.some(([label]) => label === mastalgiaLabel));
  assert.equal(symptomOptionTranslations[mastalgiaLabel], "Breast pain or tenderness");
  assert.equal(byId("mastalgia").field, "rule_inputs.symptom_mastalgia");
  assert.equal(byId("mastalgia").ruleField, "symptom_mastalgia");
  assert.equal(byId("mastalgia").displayInComposite, true);

  // The point of extraOptions rather than a fifth entry in options: an
  // ordinary group option becomes one of the 84 symptom feature columns,
  // which would move symptom_mastalgia out of the 30 rule input columns the
  // rule engine reads. symptomDefinitions must stay the four real options.
  assert.equal(breastGroup.options.length, 4);
  assert(!breastGroup.options.some(([label]) => label === mastalgiaLabel));
  const rendered = questions.find((question) => question.id === "symptoms_breast");
  assert.equal(rendered.symptomDefinitions.length, 4);
  assert(rendered.options.includes(mastalgiaLabel));

  const fieldManifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, "contracts", "power-automate", "transitional-field-manifest.json"),
    "utf8"
  ));
  assert(fieldManifest.rule_input_columns.includes("symptom_mastalgia"));
  assert(!fieldManifest.symptom_feature_columns.includes("symptom_mastalgia"));
});

test("symptom groups write their extraOption answers back to the standalone questions", () => {
  // saveAnswer resolves these through symptomGroupExtraOptionQuestions; every
  // pairing must name a real group, a label that group actually offers, and a
  // question that exists, or the answer silently never reaches its rule field.
  const table = source.match(/const symptomGroupExtraOptionQuestions = \{[\s\S]*?\n\};/);
  assert(table, "symptomGroupExtraOptionQuestions not found");
  const pairs = vm.runInNewContext(`(${table[0].replace(/^const symptomGroupExtraOptionQuestions = /, "").replace(/;$/, "")})`);

  for (const [groupId, entries] of Object.entries(pairs)) {
    const group = symptomGroups.find((item) => item.id === groupId);
    assert(group, `unknown symptom group ${groupId}`);
    for (const [label, questionId] of entries) {
      assert(
        (group.extraOptions || []).some(([extraLabel]) => extraLabel === label),
        `${groupId} does not offer "${label}"`
      );
      assert(byId(questionId), `unknown question ${questionId}`);
      assert.equal(byId(questionId).displayInComposite, true);
    }
  }

  assert.deepEqual(Object.keys(pairs).sort(), ["symptoms_bowel_abdominal", "symptoms_breast"]);
});

test("race question provides the requested bilingual choices", () => {
  const race = byId("race");
  assert.deepEqual([...race.options], ["亞洲裔", "白人", "黑人或非洲裔", "其他族群", "選擇不回答"]);
  assert.deepEqual(Array.from(race.options, (option) => i18n.en.options[option]), [
    "Asian",
    "White",
    "Black or of African descent",
    "Another racial group",
    "Prefer not to answer"
  ]);
});

test("participant name is a required contact-only bilingual field", () => {
  const name = byId("full_name");
  const consentIndex = questions.findIndex((question) => question.id === "consent_acknowledgement");
  assert.equal(name.field, "contact.full_name");
  assert.equal(name.module, "basic");
  assert.equal(name.type, "name");
  assert.equal(name.required, true);
  assert.equal(name.excludeFromCanonicalContract, true);
  assert.equal(questions[consentIndex + 1].id, "full_name");
  assert.deepEqual([...i18n.en.questions.full_name], [
    "Please enter the participant's full name",
    "The name is used only by the clinic to identify the participant and prepare the report. It is stored with the email in a restricted contact record and is not used as a model feature or research data.",
    "Full name"
  ]);
  assert(!canonicalAnswerQuestions.some((question) => question.id === "full_name"));
  assert(source.includes("field: question.field"));
  assert(source.includes('!["contact.full_name", "contact.email"].includes(entry.field)'));
  assert(source.includes('!["full_name", "email"].includes(entry.question_id)'));
  assert(source.includes('errors.push("direct identifiers must not appear in answer rows")'));
});

test("interval-day number fields provide an English placeholder", () => {
  const intervalQuestions = questions.filter((question) => question.intervalDays);
  assert.deepEqual(Array.from(intervalQuestions, (question) => question.id).sort(), [
    "symptom_mass_interval_days",
    "symptom_mouth_symptoms_interval_days",
    "symptom_oral_ulcer_interval_days"
  ]);
  assert(intervalQuestions.every((question) => question.placeholder === "天數"));
  assert(intervalQuestions.every((question) => question.placeholderEn === "Number of days"));
  assert(source.includes("copy[2] || question.placeholderEn || question.placeholder"));
});

test("submission validation count follows the canonical questionnaire definitions", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "contracts", "v1", "answer-code-manifest.json"), "utf8"));
  assert.equal(canonicalAnswerQuestions.length, 78);
  assert.equal(manifest.canonical_answer_question_count, canonicalAnswerQuestions.length);
  assert.equal(byId("race").excludeFromCanonicalContract, true);
  assert.equal(byId("full_name").excludeFromCanonicalContract, true);
  assert(!canonicalAnswerQuestions.some((question) => question.id === "race"));
  assert(!manifest.questions.some((question) => question.question_id === "race"));
  assert(!manifest.questions.some((question) => question.question_id === "full_name"));
});

test("country question is a canonical dropdown with the requested bilingual choices", () => {
  const country = byId("country");
  assert.equal(country.renderAs, "dropdown");
  assert.equal(country.excludeFromCanonicalContract, undefined);
  assert(canonicalAnswerQuestions.some((question) => question.id === "country"));
  assert.deepEqual([...country.options], ["臺灣", "香港", "中國", "美國", "日本", "加拿大", "馬來西亞"]);
  assert.deepEqual(Array.from(country.options, (option) => i18n.en.options[option]), [
    "Taiwan",
    "Hong Kong",
    "China",
    "United States",
    "Japan",
    "Canada",
    "Malaysia"
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "contracts", "v1", "answer-code-manifest.json"), "utf8"));
  assert(manifest.questions.some((question) => question.question_id === "country"));
});

test("basic-info identity questions (sex, country, race) are asked as a block before weight-change/exercise", () => {
  const basicOrder = questions
    .filter((question) => question.module === "basic")
    .map((question) => question.id);
  const idIndex = (id) => basicOrder.indexOf(id);
  assert(idIndex("sex") < idIndex("country"));
  assert(idIndex("country") < idIndex("race"));
  assert(idIndex("race") < idIndex("weight_change"));
  assert(idIndex("weight_change") < idIndex("exercise_time"));
});

// 這一支測的不是題目定義，而是「答案有沒有真的走到 API body」。之所以必須單獨釘住：
// 2026-09-04 的線上事故是受檢者選了美國、卻拿到以台灣人口校正的報告。後端早就會看
// country 了，問題出在 API body 就是 ai_api_feature_row，而那個物件只由固定的 71 個
// optimizedFeatureColumns 組成，新增的問卷答案只會落到 excel_row，永遠到不了後端。
// v19.6 加了國別題卻沒補這一段，所以題目問了、bug 還在——這就是本測試存在的理由。
test("country reaches the API body and the server fallback agrees with the client", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const grab = (text) => {
    const match = text.match(/const AI_API_COUNTRY_CODES = \{([\s\S]*?)\n\};/);
    assert(match, "AI_API_COUNTRY_CODES not found");
    // Round-tripped through JSON: runInNewContext hands back an object from
    // another realm, which deepEqual rejects even when the contents match.
    return JSON.parse(JSON.stringify(vm.runInNewContext(`({${match[1]}})`)));
  };
  // 後端 CALIB_TRUE_INCIDENCE_GLOBOCAN 只有 US 與 CA 兩組人口基準，其餘選項一律 TW
  // （報告走國健署基準，並在該行印出 "(Taiwan baseline)" 說明分母）。
  const expected = {
    "臺灣": "TW", "香港": "TW", "中國": "TW", "美國": "US",
    "日本": "TW", "加拿大": "CA", "馬來西亞": "TW"
  };
  assert.deepEqual(grab(source), expected);
  // server.js rebuilds this row when the client did not supply one; if it forgot
  // country, that path alone would silently fall back to the Taiwan baseline.
  assert.deepEqual(grab(serverSource), expected);
  // 對照表的鍵必須與題目選項逐字相同，否則會靜默落到 ?? "TW"。這一項專門擋
  // 「臺灣」寫成「台灣」之類的字形漂移，以及日後增刪選項忘記同步這張表。
  assert.equal(Object.keys(expected).join(","), [...byId("country").options].join(","));
  assert(source.includes('country: AI_API_COUNTRY_CODES[getAnswerValue(answers, "demographics.country")] ?? "TW"'));
  assert(serverSource.includes('row.country = AI_API_COUNTRY_CODES[findAnswer(submission.rows, "country")] ?? "TW"'));
  // The backend accepts exactly these three codes; anything else falls back to TW.
  assert.deepEqual([...new Set(Object.values(expected))].sort(), ["CA", "TW", "US"]);
  // The contract files must record that ai_api_feature_row is no longer a pure
  // model-features/1.0.0 vector, so a future reader does not "fix" this back out.
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "contracts", "vnext", "questionnaire-manifest.json"), "utf8"));
  assert.equal(manifest.report_country.sent_as, "ai_api_feature_row.country");
  assert.deepEqual(manifest.report_country.codes, expected);
  assert(!/unchanged_model-features/.test(manifest.compatibility.ai_api_feature_row));
  const trigger = JSON.parse(fs.readFileSync(path.join(__dirname, "contracts", "power-automate", "deployed-flow-trigger.schema.json"), "utf8"));
  assert.deepEqual(trigger.properties.ai_api_feature_row.properties.country.enum, ["TW", "US", "CA"]);
});

test("local-only acceptance does not falsely claim that a report was emailed", () => {
  assert(source.includes('submitResult.report_status === "pending_model_migration"'));
  assert(source.includes("地端 AI 模型與寄信服務尚未完成移轉，因此本次暫不會寄出報告。"));
  assert(source.includes("The local AI model and email service have not finished migration"));
  assert(!source.includes("本次健康探索已完成，您的結果已寄送至"));
});
