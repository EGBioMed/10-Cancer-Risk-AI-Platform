// Where an institution's reports are delivered, when they do not go to the
// person who answered.
//
// 雙和醫院 collects at a clinic: the respondents are there in person, many have
// no email, and the hospital prints the reports and hands them over. So every
// report from that entrance goes to one hospital mailbox instead of to each
// participant.
//
// The mapping is keyed on the grant that was redeemed -- the same thing the
// session cookie already seals and that decides which line a submission is on
// -- so an entrance, not a request, decides where its reports go. A client
// that posts a different address has it overwritten, exactly as its record_id
// and delivery_mode already are.
//
// Configuration rather than a column: this is one hospital's arrangement, and
// adding a field to the grant would mean changing the gate's schema, its API,
// the mint script and the repository for a value that fits in an environment
// variable. If a second and third institution want the same thing, that is the
// point to move it into the grant.
//
// INSTITUTION_REPORT_RECIPIENTS='{"61":{"email":"reports@example.org","label":"雙和醫院"}}'

// Character for character the pattern app.js, server.js and answer-intake.js
// use; test-answer-intake.js collects every copy and requires them identical.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_LABEL_LENGTH = 60;

// Returns { recipients: Map, problems: [] }. Problems are returned rather than
// thrown: a malformed entry must not stop the server from starting -- the rest
// of the questionnaire works without this, and a deployment that cannot boot
// takes down the form page too. The caller logs them, and the entrance whose
// entry was dropped falls back to asking the respondent for an address, which
// is visibly wrong rather than quietly wrong.
function parseReportRecipients(raw) {
  const recipients = new Map();
  const problems = [];
  if (!raw || !String(raw).trim()) return { recipients, problems };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    problems.push(`INSTITUTION_REPORT_RECIPIENTS is not valid JSON: ${error.message}`);
    return { recipients, problems };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push("INSTITUTION_REPORT_RECIPIENTS must be an object keyed by grant id");
    return { recipients, problems };
  }

  for (const [grantId, value] of Object.entries(parsed)) {
    const key = String(grantId).trim();
    if (!/^[0-9]+$/.test(key)) {
      problems.push(`grant id ${JSON.stringify(grantId)} is not a number`);
      continue;
    }
    const entry = value && typeof value === "object" ? value : null;
    const email = entry && typeof entry.email === "string" ? entry.email.trim() : "";
    const label = entry && typeof entry.label === "string" ? entry.label.trim() : "";

    if (!EMAIL_PATTERN.test(email)) {
      problems.push(`grant ${key} has no usable email address`);
      continue;
    }
    // The label is shown to the respondent -- "your report will be sent to X"
    // -- so it is required. Without it the page could only say the address,
    // and an address tells someone standing in a clinic nothing.
    if (!label || label.length > MAX_LABEL_LENGTH) {
      problems.push(`grant ${key} has no usable label (1-${MAX_LABEL_LENGTH} characters)`);
      continue;
    }
    recipients.set(key, { email, label });
  }

  return { recipients, problems };
}

function recipientForGrant(recipients, grantId) {
  if (!recipients || grantId === null || grantId === undefined) return null;
  return recipients.get(String(grantId)) || null;
}

// Both places the address appears. submission.email is what the delivery flow
// reads; contact_row.email is what the contact table stores. Leaving either
// behind means the report and the record disagree about who received it.
function applyReportRecipient(submission, recipient) {
  if (!submission || !recipient) return submission;
  submission.email = recipient.email;
  if (submission.contact_row && typeof submission.contact_row === "object") {
    submission.contact_row.email = recipient.email;
  }
  return submission;
}

module.exports = {
  EMAIL_PATTERN,
  MAX_LABEL_LENGTH,
  parseReportRecipients,
  recipientForGrant,
  applyReportRecipient
};
