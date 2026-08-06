const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const answerCodeApi = require("../answer-codes");
const { getOptionCode } = answerCodeApi;

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "app.js");
const outputPath = path.join(root, "contracts", "v1", "answer-code-manifest.json");
const source = fs.readFileSync(appPath, "utf8");
const cutoff = source.indexOf("const answers = {};");

if (cutoff < 0) throw new Error("Could not locate the questionnaire definition boundary in app.js.");

const sandbox = { EGAnswerCodes: answerCodeApi };
vm.createContext(sandbox);
vm.runInContext(`${source.slice(0, cutoff)}
globalThis.__manifestSource = {
  questions,
  symptomOptionTranslations,
  englishOptions: i18n.en.options || {},
  englishQuestions: i18n.en.questions || {}
};`, sandbox);

const {
  questions,
  symptomOptionTranslations,
  englishOptions,
  englishQuestions
} = sandbox.__manifestSource;

const numberConstraints = {
  birth_year: { minimum: 1906, maximum: 2026, integer: true, review: "Update the upper and lower year bounds at runtime from the receipt year." },
  height_cm: { minimum: 100, maximum: 250, unit: "cm" },
  weight_kg: { minimum: 20, maximum: 300, unit: "kg" }
};

function englishOption(option) {
  return symptomOptionTranslations[option] || englishOptions[option] || option;
}

const manifestQuestions = questions.map((question) => {
  const item = {
    question_id: question.id,
    field: question.field,
    module: question.module,
    answer_type: question.type === "number" ? "number"
      : question.type === "email" || question.type === "text" ? "string"
        : question.type === "multi" ? "code_array" : "code",
    required_when_applicable: question.required === true,
    title_zh: question.title,
    title_en: englishQuestions[question.id]?.[0] || question.titleEn || question.title
  };

  if (Array.isArray(question.options)) {
    item.options = question.options.map((option, index) => ({
      code: getOptionCode(question, option),
      label_zh: option,
      label_en: englishOption(option)
    }));
  }
  if (numberConstraints[question.id]) item.number_constraints = numberConstraints[question.id];
  if (question.repeatCount) item.number_constraints = { minimum: 1, maximum: 9, integer: true };
  if (question.intervalDays) item.number_constraints = { minimum: 1, maximum: 180, integer: true, unit: "days" };
  return item;
});

const duplicateQuestionIds = manifestQuestions
  .map((question) => question.question_id)
  .filter((id, index, all) => all.indexOf(id) !== index);
if (duplicateQuestionIds.length) throw new Error(`Duplicate question IDs: ${duplicateQuestionIds.join(", ")}`);

for (const question of manifestQuestions) {
  if (!question.options) continue;
  const codes = question.options.map((option) => option.code);
  if (new Set(codes).size !== codes.length) {
    throw new Error(`Duplicate option code in ${question.question_id}.`);
  }
}

const manifest = {
  schema_version: "question-answer-codes/1.0.0",
  questionnaire_version: "questionnaire/2026-08-05-v19.4-phase1",
  status_values: ["answered", "unknown", "not_applicable"],
  display_labels_are_data_values: false,
  question_count: manifestQuestions.length,
  canonical_answer_question_count: manifestQuestions.filter((question) => !["consent_acknowledgement", "email"].includes(question.question_id)).length,
  code_policy: {
    symptom_positive_options: "use the symptom feature column name",
    universal_codes: ["yes", "no", "none", "unknown"],
    other_options: "stable question-scoped option codes frozen in this manifest",
    number_answers: "JSON number",
    unknown_answers: "status=unknown and value=null",
    hidden_conditional_answers: "status=not_applicable and value=null"
  },
  questions: manifestQuestions
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(`Questions: ${manifest.question_count}; canonical answers: ${manifest.canonical_answer_question_count}`);
