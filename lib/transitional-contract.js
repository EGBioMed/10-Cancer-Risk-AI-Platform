const fieldManifest = require("../contracts/power-automate/transitional-field-manifest.json");
const answerCodeManifest = require("../contracts/v1/answer-code-manifest.json");

const EXPECTED_VERSIONS = Object.freeze({
  contract_version: "assessment-submission/1.1.0",
  questionnaire_version: "questionnaire/2026-08-05-v19.4-phase1",
  consent_version: "consent/2026-08-05",
  answer_code_schema_version: "question-answer-codes/1.0.0",
  feature_schema_version: "model-features/1.0.0",
  mapping_version: "answer-to-feature/1.0.0",
  vnext_feature_schema_version: "feature-gap-candidates/2026-08-05",
  vnext_mapping_version: "answer-mapping-vnext/0.1.0",
  rule_input_schema_version: "high-risk-rules/19.4",
  rule_input_mapping_version: "rule-input-mapping/19.4-phase1",
  report_template_version: "email-report/2026-08-05"
});

const ROOT_FIELDS = new Set([
  ...Object.keys(EXPECTED_VERSIONS),
  "submitted_at", "email", "language", "report_language", "consent_record",
  "answer_code_rows", "rows",
  "optimized_feature_columns", "optimized_feature_row", "ai_api_feature_row",
  "symptom_feature_columns", "symptom_feature_row", "symptom_answers",
  "vnext_feature_columns", "vnext_feature_row", "vnext_feature_metadata",
  "research_feature_columns", "research_feature_row", "rule_input_columns",
  "rule_input_row", "excel_row", "contact_row", "data_quality"
]);

const VECTOR_DEFINITIONS = [
  ["optimized_feature_columns", "optimized_feature_row"],
  ["optimized_feature_columns", "ai_api_feature_row"],
  ["symptom_feature_columns", "symptom_feature_row"],
  ["vnext_feature_columns", "vnext_feature_row"],
  ["research_feature_columns", "research_feature_row"],
  ["rule_input_columns", "rule_input_row"]
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameOrderedValues(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sameKeys(actual, expected) {
  if (!isPlainObject(actual)) return false;
  const keys = Object.keys(actual);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function validateTransitionalSubmission(submission) {
  const errors = [];
  const add = (path, code, message) => errors.push({ path, code, message });

  if (!isPlainObject(submission)) {
    return [{ path: "$", code: "invalid_type", message: "Submission must be an object." }];
  }

  for (const key of Object.keys(submission)) {
    if (!ROOT_FIELDS.has(key)) add(`$.${key}`, "unknown_property", "Property is not part of the frozen contract.");
  }
  for (const key of ROOT_FIELDS) {
    if (!(key in submission)) add(`$.${key}`, "required", "Required property is missing.");
  }
  for (const [key, expected] of Object.entries(EXPECTED_VERSIONS)) {
    if (submission[key] !== expected) add(`$.${key}`, "version_mismatch", `Expected ${expected}.`);
  }

  if (!Number.isFinite(Date.parse(submission.submitted_at))) {
    add("$.submitted_at", "invalid_datetime", "submitted_at must be an ISO date-time string.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(submission.email || ""))) {
    add("$.email", "invalid_email", "A valid report email is required.");
  }
  if (!["zh", "en"].includes(submission.language)) {
    add("$.language", "invalid_enum", "language must be zh or en.");
  }
  if (!["zh-Hant", "en"].includes(submission.report_language)) {
    add("$.report_language", "invalid_enum", "report_language must be zh-Hant or en.");
  }

  const consent = submission.consent_record;
  const requiredConsentItems = ["data_use", "model_limitations", "non_medical_use"];
  if (!isPlainObject(consent)
      || !sameKeys(consent, ["consent_version", "accepted_at", "accepted_item_ids"])) {
    add("$.consent_record", "invalid_type", "consent_record does not match the frozen contract.");
  } else {
    if (consent.consent_version !== EXPECTED_VERSIONS.consent_version) {
      add("$.consent_record.consent_version", "version_mismatch", "Consent version does not match the submission.");
    }
    if (!Number.isFinite(Date.parse(consent.accepted_at))) {
      add("$.consent_record.accepted_at", "invalid_datetime", "Consent acceptance time is invalid.");
    }
    if (!Array.isArray(consent.accepted_item_ids)
        || consent.accepted_item_ids.length !== requiredConsentItems.length
        || new Set(consent.accepted_item_ids).size !== requiredConsentItems.length
        || requiredConsentItems.some((item) => !consent.accepted_item_ids.includes(item))) {
      add("$.consent_record.accepted_item_ids", "incomplete_consent", "All three consent item IDs are required.");
    }
  }

  const canonicalQuestions = answerCodeManifest.questions.filter(
    (question) => !["consent_acknowledgement", "email"].includes(question.question_id)
  );
  if (!Array.isArray(submission.answer_code_rows)
      || submission.answer_code_rows.length !== canonicalQuestions.length) {
    add("$.answer_code_rows", "invalid_array", `Exactly ${canonicalQuestions.length} coded answer rows are required.`);
  } else {
    submission.answer_code_rows.forEach((row, index) => {
      const definition = canonicalQuestions[index];
      const path = `$.answer_code_rows[${index}]`;
      if (!isPlainObject(row) || !sameKeys(row, ["question_id", "status", "value"])) {
        add(path, "row_shape_mismatch", "Coded answer row must contain question_id, status, and value only.");
        return;
      }
      if (row.question_id !== definition.question_id) {
        add(`${path}.question_id`, "question_order_mismatch", `Expected ${definition.question_id}.`);
      }
      if (!["answered", "unknown", "not_applicable"].includes(row.status)) {
        add(`${path}.status`, "invalid_enum", "Unsupported answer status.");
        return;
      }
      if (row.status !== "answered") {
        if (row.value !== null) add(`${path}.value`, "invalid_missing_value", "Unknown and not-applicable answers must use null.");
        return;
      }

      if (definition.answer_type === "number") {
        if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
          add(`${path}.value`, "invalid_type", "Answered number value must be numeric.");
        } else if (definition.number_constraints) {
          const constraints = definition.number_constraints;
          if (row.value < constraints.minimum || row.value > constraints.maximum
              || (constraints.integer && !Number.isInteger(row.value))) {
            add(`${path}.value`, "out_of_range", "Number value violates the frozen constraints.");
          }
        }
        return;
      }
      if (definition.answer_type === "string") {
        if (typeof row.value !== "string" || row.value.length > 1000) {
          add(`${path}.value`, "invalid_type", "Answered string value must be a bounded string.");
        }
        return;
      }

      const allowedCodes = new Set((definition.options || []).map((option) => option.code));
      if (definition.answer_type === "code") {
        if (typeof row.value !== "string" || !allowedCodes.has(row.value) || row.value === "unknown") {
          add(`${path}.value`, "invalid_option_code", "Single-choice answer code is not allowed.");
        }
        return;
      }
      if (!Array.isArray(row.value) || row.value.length < 1 || new Set(row.value).size !== row.value.length
          || row.value.some((code) => !allowedCodes.has(code) || code === "unknown")) {
        add(`${path}.value`, "invalid_option_code", "Multi-choice answer codes are invalid.");
      } else if (row.value.includes("none") && row.value.length > 1) {
        add(`${path}.value`, "exclusive_none", "none cannot be combined with positive option codes.");
      }
    });
  }

  for (const [columnsName, rowName] of VECTOR_DEFINITIONS) {
    const expected = fieldManifest[columnsName];
    if (!sameOrderedValues(submission[columnsName], expected)) {
      add(`$.${columnsName}`, "column_order_mismatch", `Expected the frozen ${expected.length}-column order.`);
    }
    if (!sameKeys(submission[rowName], expected)) {
      add(`$.${rowName}`, "row_shape_mismatch", `Row keys must exactly match ${columnsName}.`);
    }
  }

  if (!Array.isArray(submission.rows) || submission.rows.length < 1 || submission.rows.length > 100) {
    add("$.rows", "invalid_array", "rows must contain between 1 and 100 answers.");
  } else {
    const ids = new Set();
    submission.rows.forEach((row, index) => {
      if (!isPlainObject(row)) {
        add(`$.rows[${index}]`, "invalid_type", "Answer row must be an object.");
        return;
      }
      for (const key of ["submitted_at", "question_id", "question_text", "answer"]) {
        if (!(key in row)) add(`$.rows[${index}].${key}`, "required", "Answer property is missing.");
      }
      if (row.email != null) add(`$.rows[${index}].email`, "identifier_leak", "Email is not allowed in answer rows.");
      if (ids.has(row.question_id)) add(`$.rows[${index}].question_id`, "duplicate", "question_id must be unique.");
      ids.add(row.question_id);
    });
  }

  if (!Array.isArray(submission.symptom_answers) || submission.symptom_answers.length !== 13) {
    add("$.symptom_answers", "invalid_array", "Exactly 13 symptom category summaries are required.");
  }
  if (!isPlainObject(submission.vnext_feature_metadata)
      || !sameKeys(submission.vnext_feature_metadata, fieldManifest.vnext_feature_metadata_columns)) {
    add("$.vnext_feature_metadata", "row_shape_mismatch", "vNext metadata keys do not match the frozen contract.");
  }
  if (!isPlainObject(submission.excel_row)) {
    add("$.excel_row", "invalid_type", "excel_row must be an object.");
  } else {
    if ("email" in submission.excel_row) add("$.excel_row.email", "identifier_leak", "Email is not allowed in the research row.");
    const requiredExcelColumns = [
      ...fieldManifest.optimized_feature_columns,
      ...fieldManifest.symptom_feature_columns,
      ...fieldManifest.vnext_feature_columns,
      ...fieldManifest.rule_input_columns
    ];
    for (const key of new Set(requiredExcelColumns)) {
      if (!(key in submission.excel_row)) add(`$.excel_row.${key}`, "required", "Frozen research column is missing.");
    }
  }

  if (!isPlainObject(submission.contact_row)) {
    add("$.contact_row", "invalid_type", "contact_row must be an object.");
  } else {
    const contactKeys = ["record_id", "email", "submitted_at", "language", "report_language"];
    if (!sameKeys(submission.contact_row, contactKeys)) add("$.contact_row", "row_shape_mismatch", "Contact row keys do not match the frozen contract.");
    if (submission.contact_row.email !== submission.email) add("$.contact_row.email", "value_mismatch", "Contact email must match the report email.");
    if (submission.contact_row.record_id !== submission.optimized_feature_row?.record_id) add("$.contact_row.record_id", "value_mismatch", "Contact and assessment record IDs must match.");
  }

  if (!isPlainObject(submission.data_quality)
      || !Array.isArray(submission.data_quality.missing_columns)
      || !Array.isArray(submission.data_quality.contradiction_warnings)) {
    add("$.data_quality", "invalid_type", "data_quality must contain both warning arrays.");
  }

  return errors;
}

module.exports = {
  EXPECTED_VERSIONS,
  answerCodeManifest,
  fieldManifest,
  validateTransitionalSubmission
};
