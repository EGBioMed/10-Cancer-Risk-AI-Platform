// The JoiiUp hand-off entrance: configuration, the org → grant lookup, and
// the page a failed hand-off lands on.
//
// Signature verification is lib/sso-token.js. This file is everything around
// it -- what the deployment is configured to trust, which grant an enterprise
// enters under, and what the person sees when the link does not work.
//
// Absent configuration disables the entrance rather than half-enabling it. A
// deployment that has not been given a key, an issuer and an org map cannot
// verify anything, and the honest response to "/sso/joiiup" there is the same
// as to a link that has gone wrong, not an attempt.
//
// Why a grant per enterprise rather than one grant plus a stored org: the
// partner wants per-enterprise completion counts, and a grant already carries
// a use_count, an event log, an independent quota and -- on the free line --
// a grant_id that reaches the submission. Mapping org → grant buys all of
// that with configuration instead of a column in three systems. The cost is
// minting a code per enterprise; if that stops being worth it, the org
// belongs on the submission instead.

const { verifySsoToken } = require("./sso-token");
const { normalizeCode } = require("./access-gate");

const ENV_PREFIX = "SSO_JOIIUP_";

function readJson(raw, label, problems) {
  if (!raw || !String(raw).trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      problems.push(`${label} must be a JSON object`);
      return null;
    }
    return parsed;
  } catch (error) {
    problems.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

// PEMs are multi-line, so they arrive as JSON strings with \n escapes:
//   SSO_JOIIUP_KEYS={"2026-a":"-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----\n"}
// A key that is not a public key in PEM form is dropped and named. Letting it
// through would surface later as every token failing with "bad signature",
// which reads as the partner's fault.
function readKeys(raw, problems) {
  const parsed = readJson(raw, `${ENV_PREFIX}KEYS`, problems);
  if (!parsed) return new Map();

  const keys = new Map();
  for (const [kid, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value.includes("BEGIN PUBLIC KEY")) {
      problems.push(`key ${JSON.stringify(kid)} is not a PEM public key`);
      continue;
    }
    keys.set(String(kid), value);
  }
  return keys;
}

// org → the access code that enterprise enters under:
//   SSO_JOIIUP_ORG_GRANTS={"ACME":"021x29d312fc5yj9vkajrht90gpc3mkc"}
//
// A code rather than a grant id, because a code is what the gate can already
// redeem. Mapping to an id would mean a redeem-by-id endpoint on the gate API,
// its client, and the Azure service -- three changes across two repositories
// to reach the same row.
//
// It does mean the configuration holds credentials. They are the same codes an
// institution would be handed, kept where the gate's own key and the database
// URL already are.
function readOrgGrants(raw, problems, normalizeCode) {
  const parsed = readJson(raw, `${ENV_PREFIX}ORG_GRANTS`, problems);
  if (!parsed) return new Map();

  const map = new Map();
  for (const [org, code] of Object.entries(parsed)) {
    if (!String(org).trim()) {
      problems.push("an org code is empty");
      continue;
    }
    const normalized = typeof code === "string" ? normalizeCode(code) : null;
    if (!normalized) {
      problems.push(`org ${JSON.stringify(org)} is not mapped to a usable access code`);
      continue;
    }
    map.set(String(org), normalized);
  }
  return map;
}

function parseSsoConfig(env = process.env) {
  const problems = [];

  const algorithms = String(env[`${ENV_PREFIX}ALGORITHMS`] || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const keys = readKeys(env[`${ENV_PREFIX}KEYS`], problems);
  const orgGrants = readOrgGrants(env[`${ENV_PREFIX}ORG_GRANTS`], problems, normalizeCode);
  const issuer = String(env[`${ENV_PREFIX}ISSUER`] || "").trim();
  const audience = String(env[`${ENV_PREFIX}AUDIENCE`] || "").trim();
  const deepLink = String(env[`${ENV_PREFIX}DEEP_LINK`] || "").trim();

  // Default false, and the only way to turn it on is to say so. Keeping the
  // partner's user identifier means our health records gain a foreign key
  // into their user base, which is a decision for the protocol rather than a
  // default anybody inherits.
  const storeSubject = String(env[`${ENV_PREFIX}STORE_SUBJECT`] || "").toLowerCase() === "true";

  // Whether a token with no jti is refused. The partner has been asked for the
  // field; until it arrives a deployment has to say out loud that it is
  // running without replay protection.
  const requireJti = String(env[`${ENV_PREFIX}REQUIRE_JTI`] || "true").toLowerCase() !== "false";

  // Enabled means "has everything it needs to verify something". Each of
  // these missing on its own would otherwise fail later, at a point where the
  // symptom is a user who cannot get in and a log line about a bad token.
  const missing = [];
  if (algorithms.length === 0) missing.push(`${ENV_PREFIX}ALGORITHMS`);
  if (keys.size === 0) missing.push(`${ENV_PREFIX}KEYS`);
  if (!issuer) missing.push(`${ENV_PREFIX}ISSUER`);
  if (orgGrants.size === 0) missing.push(`${ENV_PREFIX}ORG_GRANTS`);

  return {
    enabled: missing.length === 0 && problems.length === 0,
    missing,
    problems,
    algorithms,
    keys,
    orgGrants,
    issuer,
    audience: audience || null,
    deepLink: deepLink || null,
    storeSubject,
    requireJti
  };
}

// The access code this enterprise enters under, or null when the partner
// sends an org we were never told about -- a new enterprise client of theirs
// that nobody minted a code for. That is a configuration gap, not a bad
// token, and the log line says so.
function codeForOrg(config, org) {
  if (!config || !org) return null;
  const code = config.orgGrants.get(String(org));
  return code === undefined ? null : code;
}

// Verifies, then resolves the enterprise. Returns the same shape either way so
// the caller has one path: { ok, grantId, claims } or { ok: false, reason }.
//
// The reason is for the log. What the person sees is one message for every
// reason -- the gate already works that way, and telling a caller which check
// their token failed is telling them how to make a better one.
function resolveSsoEntrance(token, config, { replayGuard, now } = {}) {
  if (!config || !config.enabled) return { ok: false, reason: "not_configured" };

  const verified = verifySsoToken(token, {
    algorithms: config.algorithms,
    keys: config.keys,
    issuer: config.issuer,
    audience: config.audience,
    replayGuard,
    requireJti: config.requireJti,
    now
  });
  if (!verified.ok) return { ok: false, reason: verified.reason, detail: verified.detail };

  const code = codeForOrg(config, verified.claims.org);
  if (code === null) return { ok: false, reason: "unknown_org", detail: verified.claims.org };

  return { ok: true, code, claims: verified.claims };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

// One page for every failure. The person is in a clinic or on a phone and
// cannot act on "wrong issuer"; what they can act on is going back and
// starting again. The deep link is the partner's, and is only rendered when
// configured -- an unconfigured one would be a dead button.
function renderSsoErrorPage(deepLink) {
  const button = deepLink
    ? `<p><a class="primary-action" href="${escapeHtml(deepLink)}">返回 App 重新進入</a></p>`
    : "";
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>連結已失效</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="app-shell">
      <section class="validation-card access-gate-panel" aria-labelledby="ssoErrorTitle">
        <h2 id="ssoErrorTitle">連結已失效</h2>
        <p>這個進入連結已經過期或已經使用過了。請返回 App 重新點選一次，系統會產生新的連結。</p>
        ${button}
        <p class="access-gate-support">仍然無法進入？請聯繫 <a href="mailto:egbiomedai@eg-bio.com">egbiomedai@eg-bio.com</a>。</p>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = {
  ENV_PREFIX,
  parseSsoConfig,
  codeForOrg,
  resolveSsoEntrance,
  renderSsoErrorPage
};
