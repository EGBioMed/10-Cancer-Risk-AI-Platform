const fs = require("node:fs");
const path = require("node:path");
const {
  POWER_AUTOMATE_CONTRACT_VERSION,
  POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS
} = require("../lib/power-automate-adapter");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "contracts", "power-automate", "transitional-submission.schema.json");
const outputPath = path.join(root, "contracts", "power-automate", "deployed-flow-trigger.schema.json");

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

POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS.forEach((field) => {
  delete schema.properties[field];
});
schema.required = schema.required.filter((field) => !POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS.includes(field));
schema.properties.contract_version.enum = [POWER_AUTOMATE_CONTRACT_VERSION];
schema.title = "EG BioMed deployed Power Automate Flow trigger (adapted shape)";

fs.writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
