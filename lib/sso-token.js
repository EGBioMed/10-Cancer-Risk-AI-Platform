const crypto = require("crypto");

// Verifies the short-lived token a partner's app hands a user on their way in,
// so they reach the questionnaire without typing an access code.
//
// The partner signs; we only verify. We never hold their private key and never
// mint one of these.
//
// Everything here refuses rather than repairs. A token this module cannot
// vouch for is simply not a token, and the caller shows one message for every
// reason -- the same rule the access gate already follows, so a caller probing
// the endpoint learns nothing about which check it failed.
//
// The three mistakes this file is written around:
//
//   alg confusion -- the classic JWT break. The header says which algorithm
//     signed it, and an implementation that believes the header can be handed
//     `alg: none`, or `alg: HS256` with the signature computed using the
//     *public* key as the HMAC secret. The public key is public, so the
//     attacker can do that. The algorithm therefore comes from OUR
//     configuration; the header's only role is to be rejected when it does not
//     match.
//
//   trusting claims before the signature -- every claim is attacker-controlled
//     until the signature verifies. Nothing is read out of the payload until
//     after.
//
//   a token that outlives its purpose -- the partner says ten minutes, but if
//     their signer is ever misconfigured we would honour whatever `exp` it
//     claims. maxLifetimeSeconds bounds that independently of what arrives.

// Each entry: how to call crypto.verify, and what the JWS signature looks like.
//
// ES256 is the trap here. JWS carries an EC signature as the raw r||s pair,
// and Node's verify expects DER unless told otherwise -- so an ES256 token
// fails verification for a reason that looks like a bad signature and is not.
const ALGORITHMS = {
  RS256: { hash: "sha256", options: { padding: crypto.constants.RSA_PKCS1_PADDING } },
  RS384: { hash: "sha384", options: { padding: crypto.constants.RSA_PKCS1_PADDING } },
  RS512: { hash: "sha512", options: { padding: crypto.constants.RSA_PKCS1_PADDING } },
  PS256: { hash: "sha256", options: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 } },
  PS384: { hash: "sha384", options: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 } },
  PS512: { hash: "sha512", options: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 } },
  ES256: { hash: "sha256", options: { dsaEncoding: "ieee-p1363" } },
  ES384: { hash: "sha384", options: { dsaEncoding: "ieee-p1363" } },
  ES512: { hash: "sha512", options: { dsaEncoding: "ieee-p1363" } }
};

// Clocks disagree. Without a little slack a token minted at the boundary fails
// for some users and not others, which is the hardest kind of report to act on.
const DEFAULT_LEEWAY_SECONDS = 60;

// Independent of the token's own exp: ten minutes is what the partner says
// they issue, and this is what we accept however their signer is configured.
const DEFAULT_MAX_LIFETIME_SECONDS = 15 * 60;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 8192;

function fail(reason, detail) {
  return { ok: false, reason, detail: detail === undefined ? null : detail };
}

function decodeSegment(segment) {
  if (!BASE64URL.test(segment)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    // A JWT segment must be a JSON object. An array or a bare string parses
    // fine and would then be indexed for claims that are all undefined.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

// Matches a configured audience against the claim, which JWT allows to be a
// string or an array of them.
function audienceMatches(claim, expected) {
  if (typeof claim === "string") return claim === expected;
  if (Array.isArray(claim)) return claim.some((entry) => entry === expected);
  return false;
}

function verifySsoToken(raw, options) {
  const settings = options || {};

  const allowed = Array.isArray(settings.algorithms) ? settings.algorithms : [];
  if (allowed.length === 0) {
    // Not a token problem: refusing to verify anything is the only safe
    // response to "we never decided which algorithm to trust".
    return fail("no_algorithm_configured");
  }
  for (const algorithm of allowed) {
    if (!ALGORITHMS[algorithm]) return fail("unsupported_algorithm", algorithm);
  }

  const keys = settings.keys instanceof Map ? settings.keys : new Map(Object.entries(settings.keys || {}));
  if (keys.size === 0) return fail("no_key_configured");

  if (typeof raw !== "string" || !raw || raw.length > MAX_TOKEN_LENGTH) return fail("malformed");
  const parts = raw.split(".");
  if (parts.length !== 3) return fail("malformed");

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  if (!BASE64URL.test(signatureSegment)) return fail("malformed");

  const header = decodeSegment(headerSegment);
  if (!header) return fail("malformed");

  // The header's algorithm is read only to be checked against ours. "none" and
  // any HMAC algorithm land here and are refused like anything else, because
  // neither appears in a configuration that lists asymmetric algorithms.
  if (typeof header.alg !== "string" || !allowed.includes(header.alg)) {
    return fail("algorithm_not_allowed", typeof header.alg === "string" ? header.alg : null);
  }
  if (header.typ !== undefined && String(header.typ).toUpperCase() !== "JWT") {
    return fail("wrong_type", header.typ);
  }

  // A kid picks the key, which is what makes rotation overlap possible: both
  // the old and the new key can be configured, and each token says which one
  // signed it. Without one there must be exactly one key, or we would be
  // guessing.
  let key;
  if (header.kid !== undefined) {
    if (typeof header.kid !== "string" || !keys.has(header.kid)) return fail("unknown_key", header.kid);
    key = keys.get(header.kid);
  } else if (keys.size === 1) {
    key = [...keys.values()][0];
  } else {
    return fail("kid_required");
  }

  // allowed is validated against ALGORITHMS above and header.alg must be in
  // allowed, so this lookup cannot miss.
  const spec = ALGORITHMS[header.alg];
  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      spec.hash,
      Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8"),
      { key, ...spec.options },
      Buffer.from(signatureSegment, "base64url")
    );
  } catch (error) {
    // A key that does not fit the algorithm (an EC key for RS256, say) throws
    // rather than returning false. That is a misconfiguration, not a forged
    // token, but from here the safe answer is the same.
    return fail("bad_signature", error.message);
  }
  if (!signatureValid) return fail("bad_signature");

  // Past this line, and not before, the payload is something the partner said.
  const claims = decodeSegment(payloadSegment);
  if (!claims) return fail("malformed");

  const now = Number.isFinite(settings.now) ? settings.now : Math.floor(Date.now() / 1000);
  const leeway = Number.isFinite(settings.leewaySeconds) ? settings.leewaySeconds : DEFAULT_LEEWAY_SECONDS;
  const maxLifetime = Number.isFinite(settings.maxLifetimeSeconds)
    ? settings.maxLifetimeSeconds
    : DEFAULT_MAX_LIFETIME_SECONDS;

  if (settings.issuer && claims.iss !== settings.issuer) return fail("wrong_issuer", claims.iss);

  // Optional because the partner may not add it. With it, a token minted for
  // one of their other integrations cannot be replayed at us; without it, the
  // issuer and the key are what bound the token's reach.
  if (settings.audience && !audienceMatches(claims.aud, settings.audience)) {
    return fail("wrong_audience", claims.aud);
  }

  if (!isPositiveInteger(claims.exp)) return fail("no_expiry");
  if (now > claims.exp + leeway) return fail("expired", claims.exp);

  if (!isPositiveInteger(claims.iat)) return fail("no_issued_at");
  if (claims.iat > now + leeway) return fail("issued_in_future", claims.iat);
  if (claims.exp - claims.iat > maxLifetime) return fail("lifetime_too_long", claims.exp - claims.iat);

  if (typeof claims.sub !== "string" || !claims.sub.trim()) return fail("no_subject");
  if (settings.requireOrg !== false && (typeof claims.org !== "string" || !claims.org.trim())) {
    return fail("no_org");
  }

  // Replay. The check and the record have to be one step: two requests
  // carrying the same token can arrive at once, and a check followed by a
  // separate write lets both through.
  //
  // Without a jti there is nothing to deduplicate on, so replay protection is
  // not weaker -- it is absent. Which of those a deployment accepts is a
  // decision, so it is configured rather than assumed.
  if (settings.replayGuard) {
    if (typeof claims.jti !== "string" || !claims.jti.trim()) return fail("no_jti");
    if (!settings.replayGuard.consume(claims.jti, claims.exp + leeway)) return fail("replayed", claims.jti);
  } else if (settings.requireJti) {
    return fail("no_replay_guard");
  }

  return {
    ok: true,
    claims: {
      iss: claims.iss,
      sub: claims.sub,
      org: typeof claims.org === "string" ? claims.org : null,
      jti: typeof claims.jti === "string" ? claims.jti : null,
      iat: claims.iat,
      exp: claims.exp
    }
  };
}

// One token, one entry. Same shape and the same honest limitation as
// createConsumedSessionStore in lib/access-gate.js: in-memory and
// per-instance, so a restart forgets what it has seen and a second instance
// never knew. Within a ten-minute token lifetime that is a small window, but
// it is not zero, and a deployment that runs more than one instance does not
// have replay protection at all -- it has it per instance, which is not the
// same thing.
function createReplayGuard() {
  const seen = new Map();
  return {
    consume(jti, expiresAtSeconds) {
      if (!jti) return false;
      if (seen.has(jti)) return false;
      seen.set(jti, expiresAtSeconds || 0);
      return true;
    },
    has(jti) {
      return seen.has(jti);
    },
    size() {
      return seen.size;
    },
    sweep(now = Math.floor(Date.now() / 1000)) {
      for (const [jti, expiresAt] of seen) {
        if (expiresAt <= now) seen.delete(jti);
      }
    }
  };
}

module.exports = {
  ALGORITHMS,
  DEFAULT_LEEWAY_SECONDS,
  DEFAULT_MAX_LIFETIME_SECONDS,
  MAX_TOKEN_LENGTH,
  verifySsoToken,
  createReplayGuard
};
