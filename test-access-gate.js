const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const {
  generateRawToken,
  hashToken,
  constantTimeEqualHex,
  signSessionCookie,
  verifySessionCookie,
  parseAccessToken,
  normalizeCode,
  getClientIp,
  isExemptFromGate,
  parseCookies,
  buildCookieHeader,
  MIN_CODE_LENGTH,
  MAX_CODE_LENGTH
} = require("./lib/access-gate");

test("generated tokens are high-entropy and hash deterministically", () => {
  const tokenA = generateRawToken();
  const tokenB = generateRawToken();
  assert.notEqual(tokenA, tokenB);
  assert.ok(tokenA.length >= 32);
  assert.equal(hashToken(tokenA), hashToken(tokenA));
  assert.notEqual(hashToken(tokenA), hashToken(tokenB));
  assert.match(hashToken(tokenA), /^[0-9a-f]{64}$/);
});

test("constantTimeEqualHex compares equal and unequal hashes correctly", () => {
  const hashA = hashToken("token-a");
  const hashB = hashToken("token-b");
  assert.equal(constantTimeEqualHex(hashA, hashA), true);
  assert.equal(constantTimeEqualHex(hashA, hashB), false);
  assert.equal(constantTimeEqualHex(hashA, hashA.slice(0, -2)), false);
  assert.equal(constantTimeEqualHex(hashA, 123), false);
});

test("session cookie signs and verifies a round trip", () => {
  const secret = "test-secret";
  const now = 1_700_000_000;
  const cookie = signSessionCookie({ grantId: 42, exp: now + 1800 }, secret);
  const payload = verifySessionCookie(cookie, secret, now);
  assert.equal(payload.grantId, 42);
});

test("session cookie verification rejects wrong secret, expiry, and tampering", () => {
  const now = 1_700_000_000;
  const cookie = signSessionCookie({ grantId: 42, exp: now + 1800 }, "correct-secret");

  assert.equal(verifySessionCookie(cookie, "wrong-secret", now), null);
  assert.equal(verifySessionCookie(cookie, "correct-secret", now + 3600), null);
  assert.equal(verifySessionCookie(`${cookie}tampered`, "correct-secret", now), null);
  assert.equal(verifySessionCookie("not-a-valid-cookie", "correct-secret", now), null);
  assert.equal(verifySessionCookie(null, "correct-secret", now), null);
});

test("parseAccessToken accepts a valid token path and rejects malformed paths", () => {
  const validToken = generateRawToken();
  assert.equal(parseAccessToken(`/access/${validToken}`), validToken);
  assert.equal(parseAccessToken("/access/"), null);
  assert.equal(parseAccessToken("/access"), null);
  assert.equal(parseAccessToken("/access/../../etc/passwd"), null);
  assert.equal(parseAccessToken("/access/short"), null);
  assert.equal(parseAccessToken("/access/has spaces"), null);
  assert.equal(parseAccessToken("/other/path"), null);
});

test("isExemptFromGate allowlists health check, access-token redemption, code redemption, and the denial page's own static assets", () => {
  const token = generateRawToken();
  assert.equal(isExemptFromGate("GET", "/api/health"), true);
  assert.equal(isExemptFromGate("GET", `/access/${token}`), true);
  assert.equal(isExemptFromGate("POST", "/api/access/redeem-code"), true);
  assert.equal(isExemptFromGate("GET", "/api/access/redeem-code"), false);
  assert.equal(isExemptFromGate("GET", "/styles.css"), true);
  assert.equal(isExemptFromGate("GET", "/assets/eg-biomed-icon.png"), true);
  assert.equal(isExemptFromGate("GET", "/"), false);
  assert.equal(isExemptFromGate("GET", "/app.js"), false);
  assert.equal(isExemptFromGate("POST", "/api/submit"), false);
});

test("normalizeCode trims, lowercases, and collapses whitespace", () => {
  assert.equal(normalizeCode("  Health-Check   A1  "), "health-check a1");
  assert.equal(normalizeCode("健檢中心A1"), "健檢中心a1");
});

test("normalizeCode enforces length bounds and rejects invalid input", () => {
  assert.equal(normalizeCode("short"), null);
  assert.equal(normalizeCode("a".repeat(MIN_CODE_LENGTH)), "a".repeat(MIN_CODE_LENGTH));
  assert.equal(normalizeCode("a".repeat(MAX_CODE_LENGTH)), "a".repeat(MAX_CODE_LENGTH));
  assert.equal(normalizeCode("a".repeat(MAX_CODE_LENGTH + 1)), null);
  assert.equal(normalizeCode(`abc${String.fromCharCode(1)}def`), null);
  assert.equal(normalizeCode(123), null);
  assert.equal(normalizeCode("   "), null);
});

test("getClientIp prefers the last X-Forwarded-For hop and falls back to the socket address", () => {
  assert.equal(getClientIp("1.1.1.1, 2.2.2.2, 3.3.3.3", "9.9.9.9"), "3.3.3.3");
  assert.equal(getClientIp(undefined, "9.9.9.9"), "9.9.9.9");
  assert.equal(getClientIp("", "9.9.9.9"), "9.9.9.9");
  assert.equal(getClientIp(undefined, undefined), "unknown");
});

test("parseCookies handles multiple cookies and an empty header", () => {
  assert.deepEqual(parseCookies(""), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(
    parseCookies("eg_access_session=abc123; other=value"),
    { eg_access_session: "abc123", other: "value" }
  );
});

test("buildCookieHeader sets HttpOnly, SameSite, and Secure flags", () => {
  const secureHeader = buildCookieHeader("eg_access_session", "abc123", { ttlSeconds: 1800, secure: true });
  assert.match(secureHeader, /^eg_access_session=abc123; Path=\/; HttpOnly; SameSite=Lax; Max-Age=1800; Secure$/);

  const insecureHeader = buildCookieHeader("eg_access_session", "abc123", { ttlSeconds: 1800, secure: false });
  assert.doesNotMatch(insecureHeader, /Secure/);
});

test("access-gate migration defines a hashed-only token table and a sibling audit log", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "database", "migrations", "002_access_gate.sql"),
    "utf8"
  );
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS access/);
  assert.match(sql, /token_hash char\(64\) NOT NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS grants_token_hash_idx/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS operations\.access_events/);
  assert.doesNotMatch(sql, /\btoken text\b/);
  assert.doesNotMatch(sql, /\braw_token\b/);
});

test("access-codes migration adds a credential-type discriminator and nullable expiry", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "database", "migrations", "003_access_codes.sql"),
    "utf8"
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS credential_type text NOT NULL DEFAULT 'link'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS code text/);
  assert.match(sql, /ALTER COLUMN expires_at DROP NOT NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS grants_code_active_idx/);
  assert.match(sql, /grants_code_matches_type/);
  assert.match(sql, /grant_topped_up/);
});
