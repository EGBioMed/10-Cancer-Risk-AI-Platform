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

test("submission validation count follows the canonical questionnaire definitions", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "contracts", "v1", "answer-code-manifest.json"), "utf8"));
  assert.equal(canonicalAnswerQuestions.length, 77);
  assert.equal(manifest.canonical_answer_question_count, canonicalAnswerQuestions.length);
  assert.equal(byId("race").excludeFromCanonicalContract, true);
  assert(!canonicalAnswerQuestions.some((question) => question.id === "race"));
  assert(!manifest.questions.some((question) => question.question_id === "race"));
});

test("local-only acceptance does not falsely claim that a report was emailed", () => {
  assert(source.includes('submitResult.report_status === "pending_model_migration"'));
  assert(source.includes("地端 AI 模型與寄信服務尚未完成移轉，因此本次暫不會寄出報告。"));
  assert(source.includes("The local AI model and email service have not finished migration"));
  assert(!source.includes("本次健康探索已完成，您的結果已寄送至"));
});
