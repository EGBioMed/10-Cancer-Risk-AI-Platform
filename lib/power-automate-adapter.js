const POWER_AUTOMATE_CONTRACT_VERSION = "assessment-submission/1.0.0";

// Stripped before the Flow sees them. Both describe the consent transaction
// rather than the submission, and the deployed Flow has nowhere to put them.
const POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS = Object.freeze([
  "answer_code_schema_version",
  "consent_record"
]);

// Forwarded to the Flow, but NOT required by its trigger schema.
//
// answer_code_rows is the only record of which questions were skipped. A skip
// reaches the model as a 0, byte-identical to an explicit "no" for thirteen
// questions including smoking, betel nut and family cancer history
// (UNKNOWN_ANSWER_AUDIT.md). The derived rows are all that was ever stored, so
// every submission taken before this change is permanently ambiguous; the only
// thing that can be fixed is what happens from now on.
//
// Optional rather than required is what makes this deployable at all. The
// trigger schemas are additionalProperties:false, so the Flow has to accept the
// field before Render starts sending it -- and if this service is rolled back,
// a Flow that requires the field would reject every submission. Optional lets
// the two be changed on different days, in either order, with no window where
// production is broken.
const POWER_AUTOMATE_OPTIONAL_ROOT_FIELDS = Object.freeze([
  "answer_code_rows"
]);

function buildPowerAutomatePayload(submission) {
  const payload = { ...submission };
  POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS.forEach((field) => {
    delete payload[field];
  });
  payload.contract_version = POWER_AUTOMATE_CONTRACT_VERSION;
  return payload;
}

module.exports = {
  POWER_AUTOMATE_CONTRACT_VERSION,
  POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS,
  POWER_AUTOMATE_OPTIONAL_ROOT_FIELDS,
  buildPowerAutomatePayload
};
