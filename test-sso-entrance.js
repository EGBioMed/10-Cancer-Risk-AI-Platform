const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const {
  ENV_PREFIX,
  parseSsoConfig,
  codeForOrg,
  resolveSsoEntrance,
  renderSsoErrorPage
} = require("./lib/sso-entrance");
const { createReplayGuard } = require("./lib/sso-token");

// The entrance around the signature check: what a deployment is configured to
// trust, which code an enterprise enters under, and what the person sees when
// the link does not work. test-sso-token.js covers the signature itself.
//
// The last section is the one that matters most. The entrance is a door -- it
// has to answer without a session, because creating one is what it is for --
// and reachability is decided by where the route sits relative to the gate
// block, not by what any comment says. So it is asked of a running server, the
// same way test-gate-coverage.js asks the opposite question of everything else.

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" });
const KID = "2026-a";
const ORG_CODE = "021x29d312fc5yj9vkajrht90gpc3mkc";

function base64url(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(claims, { kid = KID, alg = "RS256" } = {}) {
  const input = `${base64url({ alg, typ: "JWT", kid })}.${base64url(claims)}`;
  const signature = crypto.sign("sha256", Buffer.from(input, "utf8"), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  });
  return `${input}.${signature.toString("base64url")}`;
}

function liveClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: "joiiup", sub: "user-1", org: "ACME", iat: now, exp: now + 600, jti: crypto.randomUUID(), ...overrides };
}

function env(overrides = {}) {
  return {
    [`${ENV_PREFIX}ALGORITHMS`]: "RS256",
    [`${ENV_PREFIX}KEYS`]: JSON.stringify({ [KID]: PUBLIC_PEM }),
    [`${ENV_PREFIX}ISSUER`]: "joiiup",
    [`${ENV_PREFIX}ORG_GRANTS`]: JSON.stringify({ ACME: ORG_CODE }),
    ...overrides
  };
}

// ---------------------------------------------------------------- configuration

test("an unconfigured deployment is disabled and says what is missing", () => {
  const config = parseSsoConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(config.missing.sort(), [
    `${ENV_PREFIX}ALGORITHMS`,
    `${ENV_PREFIX}ISSUER`,
    `${ENV_PREFIX}KEYS`,
    `${ENV_PREFIX}ORG_GRANTS`
  ].sort());
});

test("each piece missing on its own still disables the entrance", () => {
  for (const name of ["ALGORITHMS", "KEYS", "ISSUER", "ORG_GRANTS"]) {
    const config = parseSsoConfig(env({ [`${ENV_PREFIX}${name}`]: "" }));
    assert.equal(config.enabled, false, `${name} missing should disable the entrance`);
    assert.ok(
      config.missing.includes(`${ENV_PREFIX}${name}`),
      `${name} missing should be named`
    );
  }
});

test("a complete configuration is enabled with no problems", () => {
  const config = parseSsoConfig(env());
  assert.equal(config.enabled, true);
  assert.deepEqual(config.problems, []);
  assert.deepEqual(config.missing, []);
});

// Half-enabled is the dangerous state: a deployment that parsed most of its
// configuration and silently dropped the rest would verify against whichever
// key did parse.
test("a configuration that parsed with problems is disabled, not partly on", () => {
  const config = parseSsoConfig(env({
    [`${ENV_PREFIX}KEYS`]: JSON.stringify({ [KID]: PUBLIC_PEM, broken: "not a pem" })
  }));
  assert.equal(config.keys.size, 1, "the usable key is still read");
  assert.equal(config.problems.length, 1);
  assert.match(config.problems[0], /broken/);
  assert.equal(config.enabled, false, "a named problem must disable the entrance");
});

test("malformed JSON is reported rather than thrown", () => {
  const config = parseSsoConfig(env({ [`${ENV_PREFIX}KEYS`]: "{not json" }));
  assert.equal(config.enabled, false);
  assert.ok(config.problems.some((problem) => problem.includes(`${ENV_PREFIX}KEYS`)));
});

test("a JSON array is not an object and is refused", () => {
  const config = parseSsoConfig(env({ [`${ENV_PREFIX}ORG_GRANTS`]: '["ACME"]' }));
  assert.equal(config.enabled, false);
  assert.ok(config.problems.some((problem) => /must be a JSON object/.test(problem)));
});

test("algorithms are a list, trimmed, and the header may only match one of them", () => {
  const config = parseSsoConfig(env({ [`${ENV_PREFIX}ALGORITHMS`]: " RS256 , ES256 " }));
  assert.deepEqual(config.algorithms, ["RS256", "ES256"]);
});

// ---------------------------------------------------------------- the org map

test("an org maps to a normalized access code", () => {
  const config = parseSsoConfig(env({
    [`${ENV_PREFIX}ORG_GRANTS`]: JSON.stringify({ ACME: `  ${ORG_CODE.toUpperCase()}  ` })
  }));
  assert.equal(codeForOrg(config, "ACME"), ORG_CODE, "the code is normalized the way a typed one is");
});

test("an org mapped to something that is not a usable code is dropped and named", () => {
  const config = parseSsoConfig(env({
    [`${ENV_PREFIX}ORG_GRANTS`]: JSON.stringify({ ACME: ORG_CODE, SHORT: "abc", NUMBER: 12345 })
  }));
  assert.equal(codeForOrg(config, "ACME"), ORG_CODE);
  assert.equal(codeForOrg(config, "SHORT"), null, "a six-character minimum applies here too");
  assert.equal(codeForOrg(config, "NUMBER"), null);
  assert.equal(config.problems.length, 2);
  assert.equal(config.enabled, false);
});

test("an org nobody minted a code for resolves to null, not to another org's code", () => {
  const config = parseSsoConfig(env());
  assert.equal(codeForOrg(config, "NOT-A-CLIENT"), null);
  assert.equal(codeForOrg(config, ""), null);
  assert.equal(codeForOrg(config, null), null);
  // Object.prototype is reachable through a plain lookup; a Map is not.
  assert.equal(codeForOrg(config, "constructor"), null);
  assert.equal(codeForOrg(config, "__proto__"), null);
});

// ---------------------------------------------------------------- defaults

test("the subject is not stored unless a deployment says so", () => {
  assert.equal(parseSsoConfig(env()).storeSubject, false);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}STORE_SUBJECT`]: "true" })).storeSubject, true);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}STORE_SUBJECT`]: "TRUE" })).storeSubject, true);
  // Anything that is not an explicit yes is a no, including the near-misses.
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}STORE_SUBJECT`]: "yes" })).storeSubject, false);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}STORE_SUBJECT`]: "1" })).storeSubject, false);
});

// The opposite default, for the opposite reason: storing the subject is a
// decision nobody should inherit, and running without replay protection is a
// decision nobody should inherit either.
test("a jti is required unless a deployment turns the requirement off", () => {
  assert.equal(parseSsoConfig(env()).requireJti, true);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}REQUIRE_JTI`]: "false" })).requireJti, false);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}REQUIRE_JTI`]: "FALSE" })).requireJti, false);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}REQUIRE_JTI`]: "no" })).requireJti, true);
});

test("an absent audience is null rather than an empty string", () => {
  // "" would be falsy in sso-token's check and skip the comparison; null says
  // the same thing without depending on that.
  assert.equal(parseSsoConfig(env()).audience, null);
  assert.equal(parseSsoConfig(env()).deepLink, null);
  assert.equal(parseSsoConfig(env({ [`${ENV_PREFIX}AUDIENCE`]: "eg-bio" })).audience, "eg-bio");
});

// ---------------------------------------------------------------- resolution

test("a disabled entrance refuses without verifying anything", () => {
  const good = sign(liveClaims());
  const config = parseSsoConfig({});
  const result = resolveSsoEntrance(good, config, { replayGuard: createReplayGuard() });
  assert.deepEqual(result, { ok: false, reason: "not_configured" });
});

test("a verified token resolves to the enterprise's code", () => {
  const config = parseSsoConfig(env());
  const result = resolveSsoEntrance(sign(liveClaims()), config, { replayGuard: createReplayGuard() });
  assert.equal(result.ok, true);
  assert.equal(result.code, ORG_CODE);
  assert.equal(result.claims.org, "ACME");
  assert.equal(result.claims.sub, "user-1");
});

test("a verified token for an unknown org is a configuration gap, named as one", () => {
  const config = parseSsoConfig(env());
  const result = resolveSsoEntrance(sign(liveClaims({ org: "NOT-A-CLIENT" })), config, {
    replayGuard: createReplayGuard()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unknown_org");
  assert.equal(result.code, undefined, "no code comes back from a refusal");
});

test("the second use of a token is refused", () => {
  const config = parseSsoConfig(env());
  const guard = createReplayGuard();
  const token = sign(liveClaims());
  assert.equal(resolveSsoEntrance(token, config, { replayGuard: guard }).ok, true);
  assert.equal(resolveSsoEntrance(token, config, { replayGuard: guard }).reason, "replayed");
});

test("a tampered payload does not resolve to anything", () => {
  const config = parseSsoConfig(env());
  const token = sign(liveClaims({ org: "NOT-A-CLIENT" }));
  const [header, , signature] = token.split(".");
  const forged = `${header}.${base64url(liveClaims({ org: "ACME" }))}.${signature}`;
  const result = resolveSsoEntrance(forged, config, { replayGuard: createReplayGuard() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_signature");
});

test("a token signed by a key we do not hold does not resolve", () => {
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const input = `${base64url({ alg: "RS256", typ: "JWT", kid: KID })}.${base64url(liveClaims())}`;
  const forged = `${input}.${crypto
    .sign("sha256", Buffer.from(input, "utf8"), { key: other.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING })
    .toString("base64url")}`;
  const result = resolveSsoEntrance(forged, parseSsoConfig(env()), { replayGuard: createReplayGuard() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_signature");
});

test("without a replay guard a configuration that requires a jti refuses everything", () => {
  const config = parseSsoConfig(env());
  const result = resolveSsoEntrance(sign(liveClaims()), config, {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_replay_guard");
});

// ---------------------------------------------------------------- the error page

test("the error page offers the way back only when one is configured", () => {
  const withLink = renderSsoErrorPage("joiiup://hra");
  assert.match(withLink, /href="joiiup:\/\/hra"/);

  const without = renderSsoErrorPage(null);
  assert.doesNotMatch(without, /<a class="primary-action"/, "an unconfigured deep link would be a dead button");
  assert.match(without, /連結已失效/, "the page still explains what happened");
});

test("the deep link is escaped", () => {
  const page = renderSsoErrorPage('joiiup://hra" onclick="alert(1)');
  assert.doesNotMatch(page, /onclick="alert/);
  assert.match(page, /&quot;/);
});

// One message for every reason. A page that said "wrong issuer" would tell a
// caller probing the door exactly how to make a better token.
test("the page never names which check failed", () => {
  const page = renderSsoErrorPage("joiiup://hra");
  for (const reason of ["bad_signature", "expired", "wrong_issuer", "unknown_org", "replayed", "not_configured"]) {
    assert.doesNotMatch(page, new RegExp(reason), `the page must not mention ${reason}`);
  }
  assert.match(page, /egbiomedai@eg-bio\.com/, "someone genuinely stuck needs somewhere to go");
});

// ---------------------------------------------------------------- the door, live

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ACCESS_GATE_MODE: "enforced",
      ACCESS_GATE_SESSION_SECRET: "sso-entrance-test-secret",
      SUBMISSION_MODE: "postgres",
      DATABASE_URL: "",
      ...env()
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start within 20s")), 20000);
    const ready = () => { clearTimeout(timer); resolve(child); };
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("listening")) ready(); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
  });
}

let server;
let base;

test.before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = await startServer(port);
});

test.after(() => { if (server) server.kill(); });

const SSO_PAGE = /連結已失效/;

test("the entrance answers with no session at all", async () => {
  // The point of the door. A route registered below the gate block would
  // redirect to the code-entry page instead -- which is the gate answering,
  // not the entrance, and would mean a JoiiUp user is asked for a code.
  const response = await fetch(`${base}/sso/joiiup?token=not-a-token`, { redirect: "manual" });
  const body = await response.text();

  assert.equal(response.status, 403);
  assert.match(body, SSO_PAGE, "the entrance did not answer; something else did");
  assert.doesNotMatch(body, /<input/i, "this is the gate's code-entry page, not the entrance");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a verified token gets past verification and on to redemption", async () => {
  // This instance has no gate database, so redemption cannot complete -- 503
  // is the handler saying so. What it establishes is that the token passed
  // every check: a signature, issuer, lifetime or org failure stops at 403
  // with the error page, which is what the previous test gets.
  const response = await fetch(`${base}/sso/joiiup?token=${sign(liveClaims())}`, { redirect: "manual" });
  assert.equal(response.status, 503, "a valid token should have reached the gate backend");
});

test("a token for an org this deployment does not know stops at the door", async () => {
  const response = await fetch(`${base}/sso/joiiup?token=${sign(liveClaims({ org: "NOT-A-CLIENT" }))}`, {
    redirect: "manual"
  });
  assert.equal(response.status, 403);
  assert.match(await response.text(), SSO_PAGE);
});

test("no token at all is a refusal, not a crash", async () => {
  const response = await fetch(`${base}/sso/joiiup`, { redirect: "manual" });
  assert.equal(response.status, 403);
  assert.match(await response.text(), SSO_PAGE);
});

test("only GET is a door", async () => {
  // The exemption is written for GET. A POST to the same path has to meet the
  // gate like anything else, or the entrance would be a hole shaped like a
  // method name.
  const response = await fetch(`${base}/sso/joiiup`, { method: "POST", redirect: "manual" });
  const body = await response.text().catch(() => "");
  assert.equal([302, 403].includes(response.status), true, `POST answered ${response.status}`);
  assert.doesNotMatch(body, SSO_PAGE, "POST reached the entrance handler");
});

test("a path that merely starts with the entrance is still behind the gate", async () => {
  // The exemption matches one exact path. Written as a prefix it would hand a
  // free pass to everything under /sso/joiiup*, which is a hole whether or not
  // anything is currently served there -- so the check is that these meet the
  // gate, not merely that they miss the entrance handler.
  for (const route of ["/sso/joiiup/", "/sso/joiiupx", "/sso/other"]) {
    const response = await fetch(base + route, { redirect: "manual" });
    const body = await response.text().catch(() => "");
    assert.doesNotMatch(body, SSO_PAGE, `${route} reached the entrance handler`);
    assert.equal(
      [302, 403].includes(response.status),
      true,
      `${route} answered ${response.status} with no session -- it is not behind the gate`
    );
  }
});
