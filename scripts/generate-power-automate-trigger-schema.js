const fs = require("node:fs");
const path = require("node:path");
const {
  POWER_AUTOMATE_CONTRACT_VERSION,
  POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS
} = require("../lib/power-automate-adapter");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "contracts", "power-automate", "transitional-submission.schema.json");
const outputPath = path.join(root, "contracts", "power-automate", "deployed-flow-trigger.schema.json");
// The free line runs in its own Flow, so it gets its own trigger schema.
// Two files rather than one shared one is what lets the institution Flow
// stay frozen: its schema is additionalProperties:false, so adding these
// three fields to the schema it already has pasted in would mean re-pasting
// it -- and a re-paste is an edit, on the Flow serving every paying vendor.
// See FREEMIUM_SPEC.md section 7.6.
const publicOutputPath = path.join(root, "contracts", "power-automate", "deployed-flow-trigger-public.schema.json");

// Added by server.js to a public submission only, after contract validation.
// The institution payload never carries them, which is why they are absent
// from the file above rather than merely optional in it.
const PUBLIC_ONLY_FIELDS = {
  delivery_mode: {
    // Only "public": a Flow B run holding an institution submission is a
    // routing bug, and should fail at the trigger rather than send a paying
    // customer an email with no report attached.
    type: "string",
    enum: ["public"]
  },
  report_ticket: {
    // Null when REPORT_TICKET_SECRET is unset -- the free email then has no
    // payment link, which is visibly broken rather than quietly forgeable.
    type: ["string", "null"]
  },
  grant_id: {
    type: ["integer", "null"]
  }
};

// The deployed Power Automate Flow's HTTP trigger and Parse JSON actions do
// NOT accept the full transitional-submission.schema.json shape. Every
// outbound request is first passed through buildPowerAutomatePayload()
// (lib/power-automate-adapter.js), which strips POWER_AUTOMATE_UNSUPPORTED_
// ROOT_FIELDS and overwrites contract_version to POWER_AUTOMATE_CONTRACT_
// VERSION before it ever reaches the Flow. Pasting the full schema into the
// Flow (as the runbook's older wording suggested) makes the Flow require
// fields the adapter never sends, and reject the version the adapter always
// sends -- exactly the TriggerInputSchemaMismatch this script exists to
// prevent. Regenerate this file after any change to the source schema and
// paste ITS content into both Flow actions, never the source schema's.
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const schema = JSON.parse(JSON.stringify(source));

// Power Automate's HTTP trigger schema validator implements only a subset of
// JSON Schema. In particular, saving a Flow with schema validation enabled
// fails when `pattern` or `patternProperties` appears anywhere in the schema.
// Keep these constraints in the browser/API contract and remove them only
// from the generated Flow-compatible copy.
function stripUnsupportedSchemaKeywords(value) {
  if (Array.isArray(value)) {
    value.forEach(stripUnsupportedSchemaKeywords);
    return;
  }
  if (!value || typeof value !== "object") return;

  delete value.pattern;
  delete value.patternProperties;
  Object.values(value).forEach(stripUnsupportedSchemaKeywords);
}

stripUnsupportedSchemaKeywords(schema);

POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS.forEach((field) => {
  delete schema.properties[field];
});
schema.required = schema.required.filter((field) => !POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS.includes(field));
schema.properties.contract_version.enum = [POWER_AUTOMATE_CONTRACT_VERSION];
schema.title = "EG BioMed deployed Power Automate Flow trigger (adapted shape)";

fs.writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);

// Flow B's schema: the institution one plus the three fields the platform
// injects for the free line. Built by copying the finished institution
// schema rather than by re-deriving it, so the two can never drift in the
// parts they share -- whatever changes above lands in both.
const publicSchema = JSON.parse(JSON.stringify(schema));
publicSchema.title = "EG BioMed deployed Power Automate Flow trigger, free line (adapted shape)";
Object.assign(publicSchema.properties, JSON.parse(JSON.stringify(PUBLIC_ONLY_FIELDS)));
// Required, not optional: a payload without delivery_mode is not a free-line
// submission, and Flow B should refuse it at the trigger instead of running
// the free-email path over whatever it was handed.
publicSchema.required = [...schema.required, ...Object.keys(PUBLIC_ONLY_FIELDS)];

fs.writeFileSync(publicOutputPath, `${JSON.stringify(publicSchema, null, 2)}\n`);
console.log(`Wrote ${publicOutputPath}`);
