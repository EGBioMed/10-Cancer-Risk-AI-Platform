// The institution whitelist: which entrances deliver their reports to an
// institution's mailbox instead of to the person who answered.
//
// 雙和醫院 collects at a clinic: the respondents are there in person, many have
// no email, and the hospital prints the reports and hands them over. So every
// report from that entrance goes to one hospital mailbox instead of to each
// participant.
//
// One entry per institution, listing the codes that institution enters under:
//
//   INSTITUTION_REPORT_RECIPIENTS={
//     "shuangho": {
//       "label": "雙和醫院",
//       "email": "reports@example.org",
//       "codes": ["egshuangho2026"]
//     }
//   }
//
// Keyed on the institution rather than on a grant id because that is the thing
// that stays the same. A code gets re-minted -- a new year, a new quota, a
// topped-up batch -- and a whitelist keyed on the old grant would quietly stop
// matching, which looks like the hospital's reports simply going somewhere
// else. Here the new code is appended to the same entry. `grants` exists for
// the entrances that have no code at all: a single-use /access/<token> link is
// one person's door, not an institution's.
//
// An entrance, not a request, decides where its reports go: the slug is sealed
// into the signed session cookie at redemption, so a client that posts a
// different address has it overwritten, exactly as its record_id and
// delivery_mode already are.
//
// Configuration rather than a column: adding a field to the grant would mean
// changing the gate's schema, its API, the mint script and the repository. If
// this list grows past a handful of institutions, that is the point to move it
// into the grant.

const { normalizeCode } = require("./access-gate");

// Character for character the pattern app.js, server.js and answer-intake.js
// use; test-answer-intake.js collects every copy and requires them identical.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_LABEL_LENGTH = 60;

// The slug travels in the signed session cookie, so it is deliberately boring:
// lowercase, short, no punctuation beyond - and _. It is never shown to anyone
// -- that is what `label` is for.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function listOf(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Returns the whitelist and the problems found in it. Problems are returned
// rather than thrown: a malformed entry must not stop the server from starting
// -- the rest of the questionnaire works without this, and a deployment that
// cannot boot takes down the form page too. The caller logs them, and the
// entrance whose entry was dropped falls back to asking the respondent for an
// address, which is visibly wrong rather than quietly wrong.
function parseReportRecipients(raw) {
  const institutions = new Map();
  const byCode = new Map();
  const byGrant = new Map();
  const problems = [];
  const whitelist = { institutions, byCode, byGrant, problems };

  if (!raw || !String(raw).trim()) return whitelist;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    problems.push(`INSTITUTION_REPORT_RECIPIENTS is not valid JSON: ${error.message}`);
    return whitelist;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push("INSTITUTION_REPORT_RECIPIENTS must be an object keyed by institution slug");
    return whitelist;
  }

  // Collected first, applied second. A code claimed by two institutions cannot
  // be resolved, and guessing would address a health report to the wrong
  // hospital -- so both claimants lose it rather than the first one winning on
  // JSON key order.
  const codeClaims = new Map();
  const grantClaims = new Map();

  for (const [rawSlug, value] of Object.entries(parsed)) {
    const slug = String(rawSlug).trim();
    if (!SLUG_PATTERN.test(slug)) {
      problems.push(`institution key ${JSON.stringify(rawSlug)} must be 1-32 lowercase letters, digits, - or _`);
      continue;
    }

    const entry = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const email = entry && typeof entry.email === "string" ? entry.email.trim() : "";
    const label = entry && typeof entry.label === "string" ? entry.label.trim() : "";

    if (!EMAIL_PATTERN.test(email)) {
      problems.push(`institution ${slug} has no usable email address`);
      continue;
    }
    // The label is shown to the respondent -- "your report will be sent to X"
    // -- so it is required. Without it the page could only say the address,
    // and an address tells someone standing in a clinic nothing.
    if (!label || label.length > MAX_LABEL_LENGTH) {
      problems.push(`institution ${slug} has no usable label (1-${MAX_LABEL_LENGTH} characters)`);
      continue;
    }

    const codes = [];
    for (const candidate of listOf(entry.codes)) {
      const normalized = typeof candidate === "string" ? normalizeCode(candidate) : null;
      if (!normalized) {
        problems.push(`institution ${slug} lists ${JSON.stringify(candidate)}, which is not a usable access code`);
        continue;
      }
      codes.push(normalized);
    }

    const grants = [];
    for (const candidate of listOf(entry.grants)) {
      const asString = String(candidate).trim();
      if (!/^[0-9]+$/.test(asString)) {
        problems.push(`institution ${slug} lists grant ${JSON.stringify(candidate)}, which is not a grant id`);
        continue;
      }
      grants.push(asString);
    }

    // An entry nothing can match is configuration that looks finished and is
    // not: the hospital is listed, and every one of its reports still asks the
    // respondent for an address.
    if (codes.length === 0 && grants.length === 0) {
      problems.push(`institution ${slug} lists no codes and no grants, so nothing can ever match it`);
      continue;
    }

    institutions.set(slug, { slug, label, email });
    for (const code of codes) {
      if (!codeClaims.has(code)) codeClaims.set(code, []);
      codeClaims.get(code).push(slug);
    }
    for (const grant of grants) {
      if (!grantClaims.has(grant)) grantClaims.set(grant, []);
      grantClaims.get(grant).push(slug);
    }
  }

  for (const [code, claimants] of codeClaims) {
    if (claimants.length > 1) {
      problems.push(`an access code is claimed by more than one institution (${claimants.join(", ")}); nothing will be routed by it`);
      continue;
    }
    byCode.set(code, claimants[0]);
  }
  for (const [grant, claimants] of grantClaims) {
    if (claimants.length > 1) {
      problems.push(`grant ${grant} is claimed by more than one institution (${claimants.join(", ")}); nothing will be routed by it`);
      continue;
    }
    byGrant.set(grant, claimants[0]);
  }

  // An institution every one of whose codes was disputed or dropped can no
  // longer be entered, and leaving it in the map would let a stale slug in an
  // old cookie still resolve to a mailbox.
  const reachable = new Set([...byCode.values(), ...byGrant.values()]);
  for (const slug of [...institutions.keys()]) {
    if (!reachable.has(slug)) institutions.delete(slug);
  }

  return whitelist;
}

// Which institution an entrance belongs to, decided at the door. The code is
// what was presented -- typed, carried in an /entry/ link, or resolved from a
// partner's hand-off token -- and is preferred over the grant because it is
// the thing an operator configured by hand. The grant covers the one entrance
// that has no code: a single-use /access/<token> link.
function institutionForEntrance(whitelist, { code, grantId } = {}) {
  if (!whitelist) return null;
  if (code) {
    const normalized = normalizeCode(code);
    const slug = normalized ? whitelist.byCode.get(normalized) : null;
    if (slug) return slug;
  }
  if (grantId !== null && grantId !== undefined) {
    return whitelist.byGrant.get(String(grantId)) || null;
  }
  return null;
}

function recipientForInstitution(whitelist, slug) {
  if (!whitelist || !slug) return null;
  return whitelist.institutions.get(String(slug)) || null;
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
  SLUG_PATTERN,
  parseReportRecipients,
  institutionForEntrance,
  recipientForInstitution,
  applyReportRecipient
};
