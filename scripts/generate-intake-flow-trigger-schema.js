// Writes contracts/power-automate/intake-flow-trigger.schema.json: the schema to
// paste into the research-intake flow's "When a HTTP request is received"
// trigger (and its Parse JSON action, if it has one).
//
// The intake flow is a NEW flow. It is not the flow that mails reports, and it
// must never be pointed at by POWER_AUTOMATE_WEBHOOK_URL or _PUBLIC.
//
// Two lessons from the sale flow's schema (generate-power-automate-trigger-
// schema.js) are applied here from the start:
//   1. Power Automate refuses to save a trigger schema containing `pattern`,
//      so there is none.
//   2. No counts are pinned. The Render server validates every row against the
//      intake answer-code manifest before forwarding; a count pinned here would
//      turn "a question was added" into "every submission is rejected until
//      someone re-pastes this schema".
// research_row lists its columns -- so the flow designer offers each one as
// dynamic content for an Excel row -- but does not require them or forbid
// others, for the same reason as 2.

const fs = require("node:fs");
const path = require("node:path");
const {
  INTAKE_CONTRACT_VERSION,
  INTAKE_EXPECTED_VERSIONS,
  codedQuestions,
  freeTextQuestions
} = require("../lib/intake-contract");

const outputPath = path.join(__dirname, "..", "contracts", "power-automate", "intake-flow-trigger.schema.json");

const answerRow = {
  type: "object",
  properties: {
    question_id: { type: "string" },
    status: { type: "string", enum: ["answered", "unknown", "not_applicable"] },
    value: {}
  },
  required: ["question_id", "status", "value"]
};

const researchColumns = {
  record_id: { type: "string" },
  study: { type: "string" },
  submitted_at: { type: "string" },
  questionnaire_version: { type: "string" }
};
for (const question of codedQuestions) {
  researchColumns[question.question_id] = {
    type: question.answer_type === "number" ? ["number", "string"] : "string",
    description: `${question.title_zh} -- answered: the code${question.answer_type === "code_array" ? "s joined with |" : ""}; otherwise "unknown" or "not_applicable".`
  };
}

const schema = {
  title: "EG BioMed research-intake flow trigger",
  description:
    "Sent by the Render server after it has validated the submission in full. Carries no name, no Email and no " +
    "model features. Free text is in free_text_answers only -- never in research_row.",
  type: "object",
  additionalProperties: false,
  properties: {
    contract_version: { type: "string", enum: [INTAKE_CONTRACT_VERSION] },
    questionnaire_version: { type: "string", enum: [INTAKE_EXPECTED_VERSIONS.questionnaire_version] },
    consent_version: { type: "string" },
    answer_code_schema_version: { type: "string" },
    record_id: { type: "string" },
    study: { type: "string" },
    submitted_at: { type: "string" },
    received_at: { type: "string" },
    language: { type: "string", enum: ["zh", "en"] },
    consent_record: {
      type: "object",
      properties: {
        consent_version: { type: "string" },
        accepted_at: { type: "string" },
        accepted_item_ids: { type: "array", items: { type: "string" } }
      },
      required: ["consent_version", "accepted_at", "accepted_item_ids"]
    },
    answer_code_rows: { type: "array", items: answerRow },
    research_row: {
      type: "object",
      properties: researchColumns,
      required: ["record_id", "study", "submitted_at", "questionnaire_version"]
    },
    free_text_answers: {
      type: "array",
      description: `Free-text questions: ${freeTextQuestions.map((question) => question.question_id).join(", ")}. value is a string or null.`,
      items: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          status: { type: "string", enum: ["answered", "unknown", "not_applicable"] },
          value: { type: ["string", "null"] }
        },
        required: ["question_id", "status", "value"]
      }
    }
  },
  required: [
    "contract_version", "questionnaire_version", "consent_version", "answer_code_schema_version",
    "record_id", "study", "submitted_at", "received_at", "language",
    "consent_record", "answer_code_rows", "research_row", "free_text_answers"
  ]
};

// Written only when changed, and atomically: see generate-answer-code-manifest.js.
const content = `${JSON.stringify(schema, null, 2)}\n`;
if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== content) {
  const temp = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, outputPath);
}
console.log(`Wrote ${outputPath}`);
