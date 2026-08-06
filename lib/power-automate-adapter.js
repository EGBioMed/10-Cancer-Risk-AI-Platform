const POWER_AUTOMATE_CONTRACT_VERSION = "assessment-submission/1.0.0";
const POWER_AUTOMATE_UNSUPPORTED_ROOT_FIELDS = Object.freeze([
  "answer_code_schema_version",
  "consent_record",
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
  buildPowerAutomatePayload
};
