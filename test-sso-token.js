const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  verifySsoToken,
  createReplayGuard,
  DEFAULT_MAX_LIFETIME_SECONDS
} = require("./lib/sso-token");

// This file is mostly attacks. A verifier that accepts a valid token is easy;
// what decides whether this one is worth having is what it does with the
// invalid ones, and every case below is a way a JWT implementation has been
// broken in the field.

const NOW = 1760421600;

const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaPem = rsa.publicKey.export({ type: "spki", format: "pem" });
const otherRsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const ecPem = ec.publicKey.export({ type: "spki", format: "pem" });

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function signRs256(header, payload, key = rsa.privateKey) {
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = crypto
    .sign("sha256", Buffer.from(input), { key, padding: crypto.constants.RSA_PKCS1_PADDING })
    .toString("base64url");
  return `${input}.${signature}`;
}

function signEs256(header, payload) {
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = crypto
    .sign("sha256", Buffer.from(input), { key: ec.privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${input}.${signature}`;
}

const claims = (overrides = {}) => ({
  iss: "joiiup",
  sub: "u-1",
  org: "ACME",
  iat: NOW,
  exp: NOW + 600,
  jti: "j-1",
  ...overrides
});

const opts = (overrides = {}) => ({
  algorithms: ["RS256"],
  keys: { default: rsaPem },
  issuer: "joiiup",
  now: NOW,
  ...overrides
});

const reasonOf = (result) => (result.ok ? "ok" : result.reason);

// ---------------------------------------------------------------------------
// 1. The one it has to accept.
// ---------------------------------------------------------------------------

test("a token the partner signed, in date, is accepted", () => {
  const result = verifySsoToken(signRs256({ alg: "RS256", typ: "JWT" }, claims()), opts());
  assert.equal(result.ok, true, reasonOf(result));
  assert.deepEqual(result.claims, {
    iss: "joiiup", sub: "u-1", org: "ACME", jti: "j-1", iat: NOW, exp: NOW + 600
  });
});

// ---------------------------------------------------------------------------
// 2. alg confusion. The reason this module exists.
// ---------------------------------------------------------------------------

test("alg:none is refused", () => {
  // The oldest one: declare no algorithm and send an empty signature. An
  // implementation that branches on the header's alg has nothing to check.
  const input = `${b64({ alg: "none", typ: "JWT" })}.${b64(claims())}`;
  assert.equal(reasonOf(verifySsoToken(`${input}.`, opts())), "malformed");
  assert.equal(reasonOf(verifySsoToken(`${input}.AA`, opts())), "algorithm_not_allowed");
});

test("the public key cannot be used as an HMAC secret", () => {
  // The dangerous one. The attacker takes our PUBLIC key -- which is public --
  // computes HMAC-SHA256 over the token with it, and says alg:HS256. A
  // verifier that trusts the header looks up "the key for this issuer", finds
  // the PEM, and HMACs with it: the signature matches, and anyone can mint a
  // token for any user.
  const header = { alg: "HS256", typ: "JWT" };
  const input = `${b64(header)}.${b64(claims({ sub: "somebody-else" }))}`;
  const forged = crypto.createHmac("sha256", rsaPem).update(input).digest("base64url");

  const result = verifySsoToken(`${input}.${forged}`, opts());
  assert.equal(result.ok, false);
  assert.equal(result.reason, "algorithm_not_allowed");
  assert.equal(result.detail, "HS256");
});

test("an algorithm outside the configured list is refused even when genuinely signed", () => {
  // Signed with the real EC key, and valid ES256 -- but the deployment is
  // configured for RS256, so it is not a token we accept.
  const token = signEs256({ alg: "ES256", typ: "JWT" }, claims());
  assert.equal(reasonOf(verifySsoToken(token, opts({ keys: { default: ecPem } }))), "algorithm_not_allowed");

  // And with ES256 configured, the same token verifies -- so the refusal above
  // is the configuration doing its job, not ES256 being broken here. This also
  // pins the JWS r||s encoding: with Node's DER default the signature check
  // fails and reads like a forgery.
  const allowed = verifySsoToken(token, opts({ algorithms: ["ES256"], keys: { default: ecPem } }));
  assert.equal(allowed.ok, true, reasonOf(allowed));
});

test("a deployment with no algorithm or no key verifies nothing", () => {
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims());
  assert.equal(reasonOf(verifySsoToken(token, opts({ algorithms: [] }))), "no_algorithm_configured");
  assert.equal(reasonOf(verifySsoToken(token, opts({ keys: {} }))), "no_key_configured");
  assert.equal(reasonOf(verifySsoToken(token, opts({ algorithms: ["XS999"] }))), "unsupported_algorithm");
});

// ---------------------------------------------------------------------------
// 3. The signature itself.
// ---------------------------------------------------------------------------

test("a token signed with the wrong key is refused", () => {
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims(), otherRsa.privateKey);
  assert.equal(reasonOf(verifySsoToken(token, opts())), "bad_signature");
});

test("editing a claim invalidates the signature", () => {
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims());
  const [header, , signature] = token.split(".");
  const tampered = `${header}.${b64(claims({ org: "SOMEONE-ELSE" }))}.${signature}`;
  assert.equal(reasonOf(verifySsoToken(tampered, opts())), "bad_signature");
});

test("claims are not read before the signature is checked", () => {
  // A token whose payload would fail several claim checks, signed with the
  // wrong key. The reported reason must be the signature -- anything else
  // means a claim was read out of an unverified payload.
  const token = signRs256(
    { alg: "RS256", typ: "JWT" },
    claims({ iss: "attacker", exp: NOW - 9999, sub: "" }),
    otherRsa.privateKey
  );
  assert.equal(reasonOf(verifySsoToken(token, opts())), "bad_signature");
});

// ---------------------------------------------------------------------------
// 4. Time.
// ---------------------------------------------------------------------------

test("an expired token is refused, with slack for clock drift", () => {
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ iat: NOW - 600, exp: NOW - 30 }));
  // 30 seconds past expiry: inside the leeway, because the two clocks are not
  // the same clock and a token at the boundary would otherwise fail for some
  // users and not others.
  assert.equal(verifySsoToken(token, opts()).ok, true);
  assert.equal(reasonOf(verifySsoToken(token, opts({ now: NOW + 60 }))), "expired");
  assert.equal(reasonOf(verifySsoToken(token, opts({ leewaySeconds: 0 }))), "expired");
});

test("a token with no expiry is refused", () => {
  for (const exp of [undefined, null, "600", 0, -1, 1.5]) {
    const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ exp }));
    assert.equal(reasonOf(verifySsoToken(token, opts())), "no_expiry", `exp=${exp} was accepted`);
  }
});

test("a token claiming a long life is refused however it was signed", () => {
  // Independent of the partner: ten minutes is what they say they issue, and
  // this is what we accept if their signer is ever misconfigured. A token good
  // for a year is a password.
  const year = 365 * 24 * 3600;
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ iat: NOW, exp: NOW + year }));
  const result = verifySsoToken(token, opts());
  assert.equal(result.reason, "lifetime_too_long");
  assert.equal(result.detail, year);

  // At the cap it is still accepted.
  const atCap = signRs256(
    { alg: "RS256", typ: "JWT" },
    claims({ iat: NOW, exp: NOW + DEFAULT_MAX_LIFETIME_SECONDS })
  );
  assert.equal(verifySsoToken(atCap, opts()).ok, true);
});

test("a token issued in the future is refused", () => {
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ iat: NOW + 600, exp: NOW + 900 }));
  assert.equal(reasonOf(verifySsoToken(token, opts())), "issued_in_future");
  // Inside the leeway it is drift, not a claim about the future.
  const slight = signRs256({ alg: "RS256", typ: "JWT" }, claims({ iat: NOW + 30, exp: NOW + 600 }));
  assert.equal(verifySsoToken(slight, opts()).ok, true);
});

// ---------------------------------------------------------------------------
// 5. Who it is from, and who it is for.
// ---------------------------------------------------------------------------

test("a token from another issuer is refused", () => {
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ iss: "someone-else" }));
  assert.equal(reasonOf(verifySsoToken(token, opts())), "wrong_issuer");
});

test("audience is checked when configured, and ignored when not", () => {
  // The partner has been asked for aud and may not add it, so the check has to
  // work both ways: with it, a token minted for one of their other partners
  // cannot be replayed here.
  const forUs = signRs256({ alg: "RS256", typ: "JWT" }, claims({ aud: "egbiomed" }));
  const forThem = signRs256({ alg: "RS256", typ: "JWT" }, claims({ aud: "another-partner" }));
  const none = signRs256({ alg: "RS256", typ: "JWT" }, claims());

  assert.equal(verifySsoToken(forUs, opts({ audience: "egbiomed" })).ok, true);
  assert.equal(reasonOf(verifySsoToken(forThem, opts({ audience: "egbiomed" }))), "wrong_audience");
  assert.equal(reasonOf(verifySsoToken(none, opts({ audience: "egbiomed" }))), "wrong_audience");
  assert.equal(verifySsoToken(none, opts()).ok, true);

  // JWT allows an array.
  const many = signRs256({ alg: "RS256", typ: "JWT" }, claims({ aud: ["other", "egbiomed"] }));
  assert.equal(verifySsoToken(many, opts({ audience: "egbiomed" })).ok, true);
});

test("a token with no subject or no org is refused", () => {
  for (const sub of [undefined, "", "   ", 123, null]) {
    const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ sub }));
    assert.equal(reasonOf(verifySsoToken(token, opts())), "no_subject", `sub=${sub} was accepted`);
  }
  const noOrg = signRs256({ alg: "RS256", typ: "JWT" }, claims({ org: undefined }));
  assert.equal(reasonOf(verifySsoToken(noOrg, opts())), "no_org");
  // org is what an enterprise's usage is counted against; a deployment that
  // does not need it can say so.
  assert.equal(verifySsoToken(noOrg, opts({ requireOrg: false })).ok, true);
});

// ---------------------------------------------------------------------------
// 6. Replay.
// ---------------------------------------------------------------------------

test("the same token cannot be used twice", () => {
  const replayGuard = createReplayGuard();
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims());

  assert.equal(verifySsoToken(token, opts({ replayGuard })).ok, true);
  const second = verifySsoToken(token, opts({ replayGuard }));
  assert.equal(second.reason, "replayed");
  assert.equal(second.detail, "j-1");
});

test("two tokens differing only in jti are both accepted", () => {
  const replayGuard = createReplayGuard();
  for (const jti of ["j-1", "j-2"]) {
    const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ jti }));
    assert.equal(verifySsoToken(token, opts({ replayGuard })).ok, true, `${jti} was refused`);
  }
});

test("replay protection without a jti is absent, not weaker", () => {
  const replayGuard = createReplayGuard();
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims({ jti: undefined }));
  // There is nothing to deduplicate on, so the token is refused rather than
  // let through unprotected. This is the case to point at if the partner
  // declines to add jti.
  assert.equal(reasonOf(verifySsoToken(token, opts({ replayGuard }))), "no_jti");

  // A deployment that knowingly runs without replay protection gets a token
  // through -- and requireJti is how it says it did not mean to.
  assert.equal(verifySsoToken(token, opts()).ok, true);
  assert.equal(reasonOf(verifySsoToken(token, opts({ requireJti: true }))), "no_replay_guard");
});

test("the replay guard forgets entries only once they cannot be replayed", () => {
  const replayGuard = createReplayGuard();
  replayGuard.consume("old", NOW - 1);
  replayGuard.consume("live", NOW + 600);

  replayGuard.sweep(NOW);
  assert.equal(replayGuard.has("old"), false);
  assert.equal(replayGuard.has("live"), true, "a jti was forgotten while its token was still valid");
});

// ---------------------------------------------------------------------------
// 7. Key rotation.
// ---------------------------------------------------------------------------

test("kid picks the key, so old and new can overlap during a rotation", () => {
  const keys = { "2026-a": rsaPem, "2026-b": otherRsa.publicKey.export({ type: "spki", format: "pem" }) };
  const byOld = signRs256({ alg: "RS256", typ: "JWT", kid: "2026-a" }, claims());
  const byNew = signRs256({ alg: "RS256", typ: "JWT", kid: "2026-b" }, claims({ jti: "j-2" }), otherRsa.privateKey);

  assert.equal(verifySsoToken(byOld, opts({ keys })).ok, true);
  assert.equal(verifySsoToken(byNew, opts({ keys })).ok, true);

  // A kid naming a key we do not hold is refused rather than tried against
  // every key we do.
  const unknown = signRs256({ alg: "RS256", typ: "JWT", kid: "2027-a" }, claims());
  assert.equal(reasonOf(verifySsoToken(unknown, opts({ keys }))), "unknown_key");
});

test("without a kid, more than one key is a refusal rather than a guess", () => {
  const keys = { a: rsaPem, b: otherRsa.publicKey.export({ type: "spki", format: "pem" }) };
  const token = signRs256({ alg: "RS256", typ: "JWT" }, claims());
  assert.equal(reasonOf(verifySsoToken(token, opts({ keys }))), "kid_required");
});

// ---------------------------------------------------------------------------
// 8. Malformed input.
// ---------------------------------------------------------------------------

test("anything that is not a token is refused as malformed", () => {
  const cases = [
    "", "   ", null, undefined, 123, {}, [],
    "one-part", "two.parts", "a.b.c.d",
    "!!!.###.$$$",
    `${b64({ alg: "RS256" })}.not-base64url!.sig`,
    // A payload that parses but is not an object: every claim reads undefined.
    `${b64({ alg: "RS256", typ: "JWT" })}.${Buffer.from('"a string"').toString("base64url")}.AA`,
    `${b64({ alg: "RS256", typ: "JWT" })}.${Buffer.from("[1,2,3]").toString("base64url")}.AA`,
    "a".repeat(9000)
  ];
  for (const raw of cases) {
    const result = verifySsoToken(raw, opts());
    // String() first: JSON.stringify(undefined) is undefined, and slicing that
    // throws -- which crashed this test rather than reporting what it found.
    assert.equal(result.ok, false, `${String(JSON.stringify(raw)).slice(0, 40)} was accepted`);
  }
});

test("a header claiming another type is refused", () => {
  const token = signRs256({ alg: "RS256", typ: "JWE" }, claims());
  assert.equal(reasonOf(verifySsoToken(token, opts())), "wrong_type");
  // typ is optional in JWT, so its absence is not a fault.
  assert.equal(verifySsoToken(signRs256({ alg: "RS256" }, claims()), opts()).ok, true);
});

test("no failure reason reaches the caller as a usable token", () => {
  // Whatever goes wrong, the result shape is the same: ok:false and a reason
  // for the log. The endpoint shows one message for all of them, so a caller
  // probing it cannot learn which check it failed.
  const broken = [
    "", "a.b.c",
    signRs256({ alg: "RS256", typ: "JWT" }, claims(), otherRsa.privateKey),
    signRs256({ alg: "RS256", typ: "JWT" }, claims({ exp: NOW - 9999, iat: NOW - 10599 })),
    signRs256({ alg: "RS256", typ: "JWT" }, claims({ iss: "nope" }))
  ];
  for (const raw of broken) {
    const result = verifySsoToken(raw, opts());
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason, "string");
    assert.equal("claims" in result, false, "a refused token still returned claims");
  }
});
