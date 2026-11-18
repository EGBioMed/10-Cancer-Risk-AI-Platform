// The intake whitelist: which entrances open the research-intake questionnaire
// instead of the questionnaire on sale.
//
// The intake questionnaire (2026-11-18) is the same page with different
// questions: no Email, no report, a chronic-condition follow-up table and a
// free-text question at the end. Which one a person gets is decided by the door
// they came in through, exactly like INSTITUTION_REPORT_RECIPIENTS and
// INSTITUTION_BRANDING decide where reports go and whose logo is shown:
//
//   INTAKE_ENTRANCES={
//     "study2026": {
//       "label": "2026 收案（現場）",
//       "codes": ["egstudy2026"]
//     }
//   }
//
// `label` is for operators only (logs, /api/health) -- the respondent never
// sees it. `grants` exists for the entrances that have no code: a single-use
// /access/<token> link.
//
// The study slug is sealed into the signed session cookie at redemption (`stu`),
// so the browser cannot choose its own questionnaire: the server writes the
// mode into the page it serves, and refuses a submission whose session does not
// match. Anything that does not resolve to a configured study -- no cookie, an
// old cookie, a slug removed from the list -- is the questionnaire on sale,
// which is what every entrance was before this existed.
//
// Problems are returned rather than thrown, for the same reason as the other two
// whitelists: a malformed entry must not stop the server, which would take the
// form page down for everyone.

const { normalizeCode } = require("./access-gate");

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_LABEL_LENGTH = 60;

const QUESTIONNAIRE_MODES = Object.freeze({ SALE: "sale", INTAKE: "intake" });

function listOf(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseIntakeEntrances(raw) {
  const studies = new Map();
  const byCode = new Map();
  const byGrant = new Map();
  const problems = [];
  const whitelist = { studies, byCode, byGrant, problems };

  if (!raw || !String(raw).trim()) return whitelist;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    problems.push(`INTAKE_ENTRANCES is not valid JSON: ${error.message}`);
    return whitelist;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push("INTAKE_ENTRANCES must be an object keyed by study slug");
    return whitelist;
  }

  const codeClaims = new Map();
  const grantClaims = new Map();

  for (const [rawSlug, value] of Object.entries(parsed)) {
    const slug = String(rawSlug).trim();
    if (!SLUG_PATTERN.test(slug)) {
      problems.push(`study key ${JSON.stringify(rawSlug)} must be 1-32 lowercase letters, digits, - or _`);
      continue;
    }
    const entry = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const label = entry && typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label || label.length > MAX_LABEL_LENGTH) {
      problems.push(`study ${slug} has no usable label (1-${MAX_LABEL_LENGTH} characters)`);
      continue;
    }

    const codes = [];
    for (const candidate of listOf(entry.codes)) {
      const normalized = typeof candidate === "string" ? normalizeCode(candidate) : null;
      if (!normalized) {
        problems.push(`study ${slug} lists ${JSON.stringify(candidate)}, which is not a usable access code`);
        continue;
      }
      codes.push(normalized);
    }
    const grants = [];
    for (const candidate of listOf(entry.grants)) {
      const asString = String(candidate).trim();
      if (!/^[0-9]+$/.test(asString)) {
        problems.push(`study ${slug} lists grant ${JSON.stringify(candidate)}, which is not a grant id`);
        continue;
      }
      grants.push(asString);
    }
    if (codes.length === 0 && grants.length === 0) {
      problems.push(`study ${slug} lists no codes and no grants, so nothing can ever match it`);
      continue;
    }

    studies.set(slug, { slug, label });
    for (const code of codes) {
      if (!codeClaims.has(code)) codeClaims.set(code, []);
      codeClaims.get(code).push(slug);
    }
    for (const grant of grants) {
      if (!grantClaims.has(grant)) grantClaims.set(grant, []);
      grantClaims.get(grant).push(slug);
    }
  }

  // A code claimed by two studies cannot be resolved; both lose it rather than
  // the first one winning on JSON key order.
  for (const [code, claimants] of codeClaims) {
    if (claimants.length > 1) {
      problems.push(`an access code is claimed by more than one study (${claimants.join(", ")}); it opens the questionnaire on sale`);
      continue;
    }
    byCode.set(code, claimants[0]);
  }
  for (const [grant, claimants] of grantClaims) {
    if (claimants.length > 1) {
      problems.push(`grant ${grant} is claimed by more than one study (${claimants.join(", ")}); it opens the questionnaire on sale`);
      continue;
    }
    byGrant.set(grant, claimants[0]);
  }

  const reachable = new Set([...byCode.values(), ...byGrant.values()]);
  for (const slug of [...studies.keys()]) {
    if (!reachable.has(slug)) studies.delete(slug);
  }
  return whitelist;
}

// Which study an entrance belongs to, decided at the door. Same precedence as
// institutionForEntrance: the code that was presented, then the grant.
function intakeStudyForEntrance(whitelist, { code, grantId } = {}) {
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

// The study this session is in, or null. The slug sealed in the cookie is
// looked up again so that removing a study from the list takes effect at once
// rather than when its cookies expire; the grant is a second place to look for
// a cookie signed before `stu` existed, and is sealed in the same HMAC.
function intakeStudyForSession(whitelist, sessionPayload) {
  if (!whitelist || !sessionPayload) return null;
  const slug = sessionPayload.stu
    || intakeStudyForEntrance(whitelist, { grantId: sessionPayload.grantId });
  return slug ? whitelist.studies.get(String(slug)) || null : null;
}

function questionnaireModeForSession(whitelist, sessionPayload) {
  return intakeStudyForSession(whitelist, sessionPayload)
    ? QUESTIONNAIRE_MODES.INTAKE
    : QUESTIONNAIRE_MODES.SALE;
}

// Writes the mode into a served page, ahead of every other script, so app.js
// sees it when it builds its question list. The questionnaire on sale gets the
// page untouched -- byte for byte what it got before this existed.
const MODE_SCRIPT = '<script>window.EG_QUESTIONNAIRE_MODE = "intake";</script>';

function applyQuestionnaireMode(html, mode) {
  if (mode !== QUESTIONNAIRE_MODES.INTAKE) return html;
  const source = String(html);
  const headEnd = source.indexOf("</head>");
  if (headEnd >= 0) return `${source.slice(0, headEnd)}  ${MODE_SCRIPT}\n${source.slice(headEnd)}`;
  const firstScript = source.indexOf("<script");
  if (firstScript >= 0) return `${source.slice(0, firstScript)}${MODE_SCRIPT}\n${source.slice(firstScript)}`;
  // A page with no <head> and no scripts has no questionnaire to switch.
  return source;
}

module.exports = {
  QUESTIONNAIRE_MODES,
  MODE_SCRIPT,
  parseIntakeEntrances,
  intakeStudyForEntrance,
  intakeStudyForSession,
  questionnaireModeForSession,
  applyQuestionnaireMode
};
