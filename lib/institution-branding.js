// Co-branding: which entrances show a partner's logo beside ours.
//
// Numia sends people to the assessment from their own landing page and their
// own Meta campaign, and asked that the page not look like it belongs to a
// company their users have never heard of. So an entrance can carry a partner
// brand, and the hero shows both marks.
//
// One entry per partner, listing the codes that partner enters under:
//
//   INSTITUTION_BRANDING={
//     "numia": {
//       "name": "Numia Health",
//       "logo": "brand/numia-health-colour.svg",
//       "logoOnDark": "brand/numia-health-white.svg",
//       "codes": ["EGNUMEDJ"]
//     }
//   }
//
// Two logos, because the hero has two backgrounds. Above 840px it is a
// photograph under a near-black gradient and the brand row is written in
// near-white; below it the overlay is switched off and the row sits on plain
// white. A single file cannot serve both -- the first attempt shipped only the
// reversed logo, which was invisible on every phone, rendering perfectly at
// 42x22 in white on white. `logoOnDark` is optional, and a partner who gives
// us one file gets it on both.
//
// Shaped like INSTITUTION_REPORT_RECIPIENTS on purpose -- keyed on the
// partner, listing codes, resolved at the door -- because it answers the same
// kind of question about the same entrances. It is a separate list rather than
// another field on that one because the two do not travel together: Numia is
// co-branded and its reports go to each participant, 雙和 is unbranded and its
// reports go to the hospital. Folding them into one list would make every
// future partner choose both or neither.
//
// The duplication between the two parsers is deliberate for now and small. A
// third list keyed the same way is the point to extract the claim-resolution
// into one place.

const { normalizeCode } = require("./access-gate");

// Same slug rule as lib/report-recipients.js: it rides in the signed session
// cookie, so it stays short and boring. It is never shown -- `name` is.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const MAX_NAME_LENGTH = 60;

// A path inside the deployment, one directory deep, and nothing else.
//
// Not a URL. A remote logo would report every visitor's address and page view
// to a third party we do not control, and could be swapped for anything at any
// time without a deploy on our side. Not a data: or javascript: URI either,
// which is how an environment variable turns into script injection. Confining
// it to brand/<file> means the worst a bad value can do is fail to load.
const LOGO_PATTERN = /^brand\/[A-Za-z0-9][A-Za-z0-9._-]*\.(svg|png)$/;

function listOf(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Returns the whitelist and the problems found in it. Problems are returned
// rather than thrown, for the reason report-recipients gives: a malformed
// entry must not stop the server from starting. The questionnaire works
// perfectly well without a partner logo, and a deployment that cannot boot
// takes the form down for everybody, including the partners whose entries
// were fine.
//
// `logoExists` is injected so the check can be exercised without a filesystem.
// A configured logo whose file is missing is worse than no co-branding: the
// hero renders a broken-image icon next to our own mark, on the one page a
// partner's users see first.
function parseInstitutionBranding(raw, { logoExists = () => true } = {}) {
  const brands = new Map();
  const byCode = new Map();
  const byGrant = new Map();
  const problems = [];
  const whitelist = { brands, byCode, byGrant, problems };

  if (!raw || !String(raw).trim()) return whitelist;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    problems.push(`INSTITUTION_BRANDING is not valid JSON: ${error.message}`);
    return whitelist;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push("INSTITUTION_BRANDING must be an object keyed by partner slug");
    return whitelist;
  }

  // Collected first, applied second, so a code claimed by two partners is
  // dropped from both rather than won by JSON key order. Showing one partner's
  // logo to another partner's users is the kind of mistake that is noticed by
  // the partner, not by us.
  const codeClaims = new Map();
  const grantClaims = new Map();

  for (const [rawSlug, value] of Object.entries(parsed)) {
    const slug = String(rawSlug).trim();
    if (!SLUG_PATTERN.test(slug)) {
      problems.push(`partner key ${JSON.stringify(rawSlug)} must be 1-32 lowercase letters, digits, - or _`);
      continue;
    }

    const entry = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const name = entry && typeof entry.name === "string" ? entry.name.trim() : "";
    const logo = entry && typeof entry.logo === "string" ? entry.logo.trim() : "";

    // The name is the logo's alt text, so it is required: a logo with no
    // accessible name is an unlabelled image on the first page of a medical
    // questionnaire.
    if (!name || name.length > MAX_NAME_LENGTH) {
      problems.push(`partner ${slug} has no usable name (1-${MAX_NAME_LENGTH} characters)`);
      continue;
    }
    if (!LOGO_PATTERN.test(logo)) {
      problems.push(`partner ${slug} has no usable logo path (must be brand/<file>.svg or .png)`);
      continue;
    }
    if (!logoExists(logo)) {
      problems.push(`partner ${slug} points at ${logo}, which is not on disk`);
      continue;
    }

    // Optional, and held to exactly the same rules: a reversed logo is still a
    // path this deployment serves, and a bad one is refused rather than
    // silently falling back, which would put an unreadable mark on the half of
    // the traffic that is on a desktop.
    const rawOnDark = entry && typeof entry.logoOnDark === "string" ? entry.logoOnDark.trim() : "";
    let logoOnDark = null;
    if (rawOnDark) {
      if (!LOGO_PATTERN.test(rawOnDark)) {
        problems.push(`partner ${slug} has no usable logoOnDark path (must be brand/<file>.svg or .png)`);
        continue;
      }
      if (!logoExists(rawOnDark)) {
        problems.push(`partner ${slug} points at ${rawOnDark}, which is not on disk`);
        continue;
      }
      logoOnDark = rawOnDark;
    }

    const codes = [];
    for (const candidate of listOf(entry.codes)) {
      const normalized = typeof candidate === "string" ? normalizeCode(candidate) : null;
      if (!normalized) {
        problems.push(`partner ${slug} lists ${JSON.stringify(candidate)}, which is not a usable access code`);
        continue;
      }
      codes.push(normalized);
    }

    const grants = [];
    for (const candidate of listOf(entry.grants)) {
      const asString = String(candidate).trim();
      if (!/^[0-9]+$/.test(asString)) {
        problems.push(`partner ${slug} lists grant ${JSON.stringify(candidate)}, which is not a grant id`);
        continue;
      }
      grants.push(asString);
    }

    // An entry nothing can match is configuration that looks finished and is
    // not: the partner is listed, and every one of their users still sees an
    // unbranded page.
    if (codes.length === 0 && grants.length === 0) {
      problems.push(`partner ${slug} lists no codes and no grants, so nothing can ever match it`);
      continue;
    }

    brands.set(slug, { slug, name, logo, logoOnDark });
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
      problems.push(`an access code is claimed by more than one partner (${claimants.join(", ")}); nothing will be branded by it`);
      continue;
    }
    byCode.set(code, claimants[0]);
  }
  for (const [grant, claimants] of grantClaims) {
    if (claimants.length > 1) {
      problems.push(`grant ${grant} is claimed by more than one partner (${claimants.join(", ")}); nothing will be branded by it`);
      continue;
    }
    byGrant.set(grant, claimants[0]);
  }

  // A partner every one of whose codes was disputed or dropped can no longer
  // be entered, and leaving it in the map would let a stale slug in an old
  // cookie still resolve to a logo.
  const reachable = new Set([...byCode.values(), ...byGrant.values()]);
  for (const slug of [...brands.keys()]) {
    if (!reachable.has(slug)) brands.delete(slug);
  }

  return whitelist;
}

// Which partner an entrance belongs to, decided at the door. Same order as
// report-recipients: the code is what an operator configured by hand, and the
// grant covers the one entrance that has no code.
function brandForEntrance(whitelist, { code, grantId } = {}) {
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

function brandForSlug(whitelist, slug) {
  if (!whitelist || !slug) return null;
  return whitelist.brands.get(String(slug)) || null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

const BRAND_MARKER = "<!--BRAND:PARTNER-->";

// Writes the partner's mark into the hero, server-side, before the page is
// sent.
//
// Not in the browser. A page that renders our mark and then swaps it shows a
// partner's users the wrong brand on every single load -- briefly, but on the
// first thing they see, which is exactly where it is noticed. The entrance is
// known by the time the HTML is built, so there is nothing to wait for.
//
// No brand removes the marker and leaves the page otherwise byte-identical, so
// an unbranded deployment is not paying for a feature it does not use.
function applyInstitutionBranding(html, brand) {
  if (typeof html !== "string") return html;
  if (!brand) return html.replace(BRAND_MARKER, "");

  const name = escapeHtml(brand.name);
  // Both variants are shipped and CSS decides which one is visible, rather
  // than the server guessing at a viewport it cannot see. The reversed copy
  // is marked decorative so a screen reader announces the partner once, not
  // twice -- only one of the two is ever on screen, but both are in the DOM.
  const marks = brand.logoOnDark
    ? `<img class="brand-partner__on-light" src="/${escapeHtml(brand.logo)}" alt="${name}" />`
      + `<img class="brand-partner__on-dark" src="/${escapeHtml(brand.logoOnDark)}" alt="" aria-hidden="true" />`
    : `<img src="/${escapeHtml(brand.logo)}" alt="${name}" />`;

  const markup = '<span class="brand-row__divider" aria-hidden="true"></span>'
    + `<span class="brand-partner">${marks}</span>`;
  return html.replace(BRAND_MARKER, markup);
}

module.exports = {
  SLUG_PATTERN,
  MAX_NAME_LENGTH,
  LOGO_PATTERN,
  BRAND_MARKER,
  parseInstitutionBranding,
  brandForEntrance,
  brandForSlug,
  applyInstitutionBranding
};
