// The research-intake submission (2026-11-18): what the intake questionnaire's
// browser sends, how the server checks it, and what it forwards to the intake
// Power Automate flow.
//
// Deliberately much smaller than the sale submission. Intake produces no report
// and calls no model, so it carries none of the feature rows, no `rows`, no
// excel_row, and -- the point of it -- no name and no Email. What it does carry:
//
//   answer_code_rows   every coded answer, in the frozen order of
//                      contracts/intake/answer-code-manifest.json, with
//                      unknown and not_applicable kept apart from "no";
//   free_text_answers  the free-text question(s), kept out of the coded rows
//                      because they are not codes and may hold identifying
//                      details the respondent typed in;
//   consent_record     which consent items were accepted, and when.
//
// The server adds record_id (never the browser's), the study slug from the
// signed session, and the receipt time, and builds research_row: the same
// coded answers flattened into one object keyed by question_id, which is the
// shape an Excel "Add a row into a table" action can map column by column.

const crypto = require("node:crypto");
const intakeManifest = require("../contracts/intake/answer-code-manifest.json");
const { checkAnswerCodeRows } = require("./transitional-contract");

const INTAKE_CONTRACT_VERSION = "intake-submission/1.0.0";

const INTAKE_EXPECTED_VERSIONS = Object.freeze({
  contract_version: INTAKE_CONTRACT_VERSION,
  questionnaire_version: intakeManifest.questionnaire_version,
  // The consent text is still the one on sale; when the intake consent text
  // arrives it gets its own consent_version, changed here and in app.js together.
  consent_version: "consent/2026-08-26",
  answer_code_schema_version: intakeManifest.schema_version
});

const REQUIRED_CONSENT_ITEMS = Object.freeze(["data_use", "model_limitations", "non_medical_use"]);

const BROWSER_FIELDS = Object.freeze([
  ...Object.keys(INTAKE_EXPECTED_VERSIONS),
  "submitted_at",
  "language",
  "consent_record",
  "answer_code_rows",
  "free_text_answers"
]);

const freeTextQuestions = intakeManifest.questions.filter((question) => question.answer_type === "free_text");
const codedQuestions = intakeManifest.questions.filter(
  (question) => question.answer_type !== "free_text"
    && !["consent_acknowledgement", "email"].includes(question.question_id)
);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

// Returns a list of { path, code, message }; empty means valid. Unknown fields
// are rejected rather than ignored -- in particular an `email` or `full_name`
// arriving here means something upstream is wrong, and is refused outright.
function validateIntakeSubmission(submission) {
  const errors = [];
  const add = (path, code, message) => errors.push({ path, code, message });

  if (!isPlainObject(submission)) {
    add("$", "invalid_type", "Submission must be a JSON object.");
    return errors;
  }
  for (const key of Object.keys(submission)) {
    if (!BROWSER_FIELDS.includes(key)) add(`$.${key}`, "unknown_field", "Not part of the intake submission.");
  }
  for (const key of BROWSER_FIELDS) {
    if (!(key in submission)) add(`$.${key}`, "missing_field", "Required.");
  }
  for (const [key, expected] of Object.entries(INTAKE_EXPECTED_VERSIONS)) {
    if (key in submission && submission[key] !== expected) {
      add(`$.${key}`, "version_mismatch", `Expected ${expected}.`);
    }
  }
  if ("submitted_at" in submission && !Number.isFinite(Date.parse(submission.submitted_at))) {
    add("$.submitted_at", "invalid_datetime", "submitted_at must be a date-time.");
  }
  if ("language" in submission && !["zh", "en"].includes(submission.language)) {
    add("$.language", "invalid_enum", "language must be zh or en.");
  }

  const consent = submission.consent_record;
  if ("consent_record" in submission) {
    if (!isPlainObject(consent) || !sameKeys(consent, ["consent_version", "accepted_at", "accepted_item_ids"])) {
      add("$.consent_record", "invalid_type", "consent_record does not match the contract.");
    } else {
      if (consent.consent_version !== INTAKE_EXPECTED_VERSIONS.consent_version) {
        add("$.consent_record.consent_version", "version_mismatch", "Consent version does not match the submission.");
      }
      if (!Number.isFinite(Date.parse(consent.accepted_at))) {
        add("$.consent_record.accepted_at", "invalid_datetime", "Consent acceptance time is invalid.");
      }
      const ids = consent.accepted_item_ids;
      if (!Array.isArray(ids) || ids.length !== REQUIRED_CONSENT_ITEMS.length
          || new Set(ids).size !== ids.length
          || REQUIRED_CONSENT_ITEMS.some((item) => !ids.includes(item))) {
        add("$.consent_record.accepted_item_ids", "incomplete_consent", "All consent item IDs are required.");
      }
    }
  }

  if ("answer_code_rows" in submission) {
    checkAnswerCodeRows(submission.answer_code_rows, intakeManifest, add);
  }

  if ("free_text_answers" in submission) {
    const rows = submission.free_text_answers;
    if (!Array.isArray(rows) || rows.length !== freeTextQuestions.length) {
      add("$.free_text_answers", "invalid_array", `Exactly ${freeTextQuestions.length} free-text rows are required.`);
    } else {
      rows.forEach((row, index) => {
        const definition = freeTextQuestions[index];
        const path = `$.free_text_answers[${index}]`;
        if (!isPlainObject(row) || !sameKeys(row, ["question_id", "status", "value"])) {
          add(path, "row_shape_mismatch", "Free-text row must contain question_id, status, and value only.");
          return;
        }
        if (row.question_id !== definition.question_id) {
          add(`${path}.question_id`, "question_order_mismatch", `Expected ${definition.question_id}.`);
        }
        if (!["answered", "unknown", "not_applicable"].includes(row.status)) {
          add(`${path}.status`, "invalid_enum", "Unsupported answer status.");
        } else if (row.status !== "answered") {
          if (row.value !== null) add(`${path}.value`, "invalid_missing_value", "Unknown and not-applicable answers must use null.");
        } else if (typeof row.value !== "string" || !row.value.trim()) {
          add(`${path}.value`, "invalid_type", "An answered free-text value must be a non-empty string.");
        } else if (row.value.length > definition.max_length) {
          add(`${path}.value`, "too_long", `At most ${definition.max_length} characters.`);
        } else if (/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(row.value)) {
          add(`${path}.value`, "invalid_characters", "Control characters other than newline are not allowed.");
        }
      });
    }
  }
  return errors;
}

// One cell of research_row. Answered: the code, the codes joined with "|" for a
// multiple choice, or the number. Otherwise the status itself -- "unknown" or
// "not_applicable" -- so a skipped question can never read as a 0 or a "no".
function researchCell(row) {
  if (row.status !== "answered") return row.status;
  if (Array.isArray(row.value)) return row.value.join("|");
  return row.value;
}

function buildResearchRow(submission, { recordId, study }) {
  const row = {
    record_id: recordId,
    study,
    submitted_at: submission.submitted_at,
    questionnaire_version: submission.questionnaire_version
  };
  for (const answer of submission.answer_code_rows) row[answer.question_id] = researchCell(answer);
  return row;
}

// What the intake flow receives. Called only after validateIntakeSubmission
// returned no errors.
function buildIntakeFlowPayload(submission, { study, recordId = crypto.randomUUID(), receivedAt = new Date().toISOString() } = {}) {
  return {
    contract_version: submission.contract_version,
    questionnaire_version: submission.questionnaire_version,
    consent_version: submission.consent_version,
    answer_code_schema_version: submission.answer_code_schema_version,
    record_id: recordId,
    study,
    submitted_at: submission.submitted_at,
    received_at: receivedAt,
    language: submission.language,
    consent_record: submission.consent_record,
    answer_code_rows: submission.answer_code_rows,
    research_row: buildResearchRow(submission, { recordId, study }),
    free_text_answers: submission.free_text_answers
  };
}

module.exports = {
  INTAKE_CONTRACT_VERSION,
  INTAKE_EXPECTED_VERSIONS,
  intakeManifest,
  codedQuestions,
  freeTextQuestions,
  validateIntakeSubmission,
  buildIntakeFlowPayload,
  buildResearchRow
};
