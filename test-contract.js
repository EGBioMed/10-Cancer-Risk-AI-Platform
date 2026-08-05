const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  EXPECTED_VERSIONS,
  fieldManifest,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

function rowFrom(columns, value = null) {
  return Object.fromEntries(columns.map((column) => [column, value]));
}

function buildValidSubmission() {
  const submittedAt = "2026-08-05T08:00:00.000Z";
  const optimized = rowFrom(fieldManifest.optimized_feature_columns, 0);
  Object.assign(optimized, {
    record_id: "WEB-CONTRACT-TEST",
    age: 46,
    height_cm: 165,
    weight_kg: 60,
    bmi: 22,
    diagnosis: "尚未診斷",
    score: "",
    data_source: "interactive_mvp"
  });
  const symptoms = rowFrom(fieldManifest.symptom_feature_columns, null);
  const vnext = rowFrom(fieldManifest.vnext_feature_columns, null);
  const research = rowFrom(fieldManifest.research_feature_columns, 0);
  const rules = rowFrom(fieldManifest.rule_input_columns, null);

  return {
    ...EXPECTED_VERSIONS,
    submitted_at: submittedAt,
    email: "contract-test@example.com",
    language: "zh",
    report_language: "zh-Hant",
    rows: [{
      submitted_at: submittedAt,
      question_id: "birth_year",
      question_text: "您的出生年（西元）",
      answer: "1980"
    }],
    optimized_feature_columns: [...fieldManifest.optimized_feature_columns],
    optimized_feature_row: optimized,
    ai_api_feature_row: { ...optimized },
    symptom_feature_columns: [...fieldManifest.symptom_feature_columns],
    symptom_feature_row: symptoms,
    symptom_answers: Array.from({ length: 13 }, (_, index) => ({
      category_id: `category_${index + 1}`,
      category_zh: `症狀類別 ${index + 1}`,
      category_en: `Symptom category ${index + 1}`,
      answer_status: "unknown",
      selected_symptoms: []
    })),
    vnext_feature_columns: [...fieldManifest.vnext_feature_columns],
    vnext_feature_row: vnext,
    vnext_feature_metadata: Object.fromEntries(
      fieldManifest.vnext_feature_metadata_columns.map((column) => [column, null])
    ),
    research_feature_columns: [...fieldManifest.research_feature_columns],
    research_feature_row: research,
    rule_input_columns: [...fieldManifest.rule_input_columns],
    rule_input_row: rules,
    excel_row: {
      ...optimized,
      ...symptoms,
      ...vnext,
      ...rules,
      research_processed_meat: 0,
      submitted_at: submittedAt,
      language: "zh",
      report_language: "zh-Hant"
    },
    contact_row: {
      record_id: optimized.record_id,
      email: "contract-test@example.com",
      submitted_at: submittedAt,
      language: "zh",
      report_language: "zh-Hant"
    },
    data_quality: {
      missing_columns: [],
      contradiction_warnings: []
    }
  };
}

function extractStringArray(source, variableName) {
  const start = source.indexOf(`const ${variableName} = [`);
  const end = source.indexOf("];", start);
  assert(start >= 0 && end > start, `Could not locate ${variableName} in app.js`);
  return [...source.slice(start, end).matchAll(/"([a-z][a-z0-9_]*)"/g)].map((match) => match[1]);
}

test("frontend vector definitions match the frozen field manifest", () => {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const symptomSegment = source.slice(
    source.indexOf("const symptomGroups = ["),
    source.indexOf("const symptomQuestions =")
  );
  const symptomColumns = [...symptomSegment.matchAll(/\["[^"]*", "[^"]*", "([^"]+)"\]/g)]
    .map((match) => match[1]);

  const historySegment = source.slice(
    source.indexOf("const vnextHistoryFeatureDefinitions = ["),
    source.indexOf("const liverEtiologyOptions =")
  );
  const historyColumns = [...historySegment.matchAll(/\["[^"]+", "[^"]+", "([^"]+)"\]/g)]
    .map((match) => match[1]);
  const vnextColumns = [
    ...extractStringArray(source, "vnextSymptomCandidateColumns"),
    ...historyColumns,
    "hx_liver_disease_etiology"
  ];

  const repeatSegment = source.slice(
    source.indexOf("const ruleRepeatDefinitions = ["),
    source.indexOf("const ruleRepeatQuestions =")
  );
  const repeatDefinitions = [...repeatSegment.matchAll(
    /\["([^"]+)", "[^"]+", "[^"]+", "([^"]+)"(?:, "([^"]+)")?\]/g
  )];
  const ruleColumns = [
    ...extractStringArray(source, "ruleDirectFeatureColumns"),
    ...repeatDefinitions.map((match) => match[2]),
    ...repeatDefinitions.flatMap((match) => match[3] ? [match[3]] : [])
  ];

  assert.deepEqual(extractStringArray(source, "optimizedFeatureColumns"), fieldManifest.optimized_feature_columns);
  assert.deepEqual(symptomColumns, fieldManifest.symptom_feature_columns);
  assert.deepEqual(vnextColumns, fieldManifest.vnext_feature_columns);
  assert.deepEqual(extractStringArray(source, "researchFeatureColumns"), fieldManifest.research_feature_columns);
  assert.deepEqual(ruleColumns, fieldManifest.rule_input_columns);
});

test("accepts the frozen v19.4 phase-1 submission", () => {
  assert.deepEqual(validateTransitionalSubmission(buildValidSubmission()), []);
});

test("rejects a changed ordered feature contract", () => {
  const submission = buildValidSubmission();
  submission.rule_input_columns.reverse();
  const errors = validateTransitionalSubmission(submission);
  assert(errors.some((error) => error.path === "$.rule_input_columns" && error.code === "column_order_mismatch"));
});

test("rejects a missing vector field", () => {
  const submission = buildValidSubmission();
  delete submission.rule_input_row.symptom_constipation;
  const errors = validateTransitionalSubmission(submission);
  assert(errors.some((error) => error.path === "$.rule_input_row" && error.code === "row_shape_mismatch"));
});

test("rejects email leakage into the research row", () => {
  const submission = buildValidSubmission();
  submission.excel_row.email = submission.email;
  const errors = validateTransitionalSubmission(submission);
  assert(errors.some((error) => error.path === "$.excel_row.email" && error.code === "identifier_leak"));
});

test("rejects an unversioned questionnaire change", () => {
  const submission = buildValidSubmission();
  submission.questionnaire_version = "questionnaire/changed-without-contract-update";
  const errors = validateTransitionalSubmission(submission);
  assert(errors.some((error) => error.path === "$.questionnaire_version" && error.code === "version_mismatch"));
});
