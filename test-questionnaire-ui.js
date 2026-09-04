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

test("local-only acceptance does not falsely claim that a report was emailed", () => {
  assert(source.includes('submitResult.report_status === "pending_model_migration"'));
  assert(source.includes("地端 AI 模型與寄信服務尚未完成移轉，因此本次暫不會寄出報告。"));
  assert(source.includes("The local AI model and email service have not finished migration"));
  assert(!source.includes("本次健康探索已完成，您的結果已寄送至"));
});
