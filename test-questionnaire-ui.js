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
globalThis.__uiDefinitions = { questions, symptomGroups, symptomOptionTranslations, i18n };`, sandbox);

const { questions, symptomGroups, symptomOptionTranslations, i18n } = sandbox.__uiDefinitions;
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
