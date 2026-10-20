const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { parseEntryCode, isExemptFromGate, hashToken, normalizeCode } = require("./lib/access-gate");

// An institution's printed entrance: GET /entry/<code>, so the people at a
// clinic scan a QR instead of typing a code, and their reports go to the
// institution's mailbox rather than being asked of each respondent.
//
// The whole story is checked end to end against a running server, because the
// parts of it that can go wrong are all joins: the path has to reach a handler
// without a session, the handler has to redeem the same row the typed form
// would, the cookie has to carry the institution, and the page has to be told
// the same thing the submission handler will act on. A unit test of any one of
// those passes while the chain is broken.
//
// The gate backend is a stub HTTP server here. The alternative -- no backend at
// all, as in test-gate-coverage.js -- makes every redemption fail, which is
// indistinguishable from an entrance that does not work.

const SHUANGHO_CODE = "egshuangho2026";
const UNLISTED_CODE = "egsomeoneelse9";
const WHITELIST = {
  shuangho: {
    label: "雙和醫院",
    email: "reports@shuangho.example.org",
    codes: [SHUANGHO_CODE]
  }
};

// grant 61 belongs to 雙和, grant 77 is an ordinary institution code that is
// not on the whitelist. Anything else is refused, the way the real gate
// refuses a code that does not exist.
const GRANTS = new Map([
  [hashToken(SHUANGHO_CODE), { ok: true, grantId: 61, deliveryMode: "institution" }],
  [hashToken(UNLISTED_CODE), { ok: true, grantId: 77, deliveryMode: "institution" }]
]);

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

const redemptions = [];

function startStubGate(port) {
  const server = http.createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/health") return reply(200, { ok: true });

    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (req.url !== "/api/access-gate/redemptions") return reply(404, { ok: false });
      let body;
      try { body = JSON.parse(raw); } catch (error) { return reply(400, { ok: false }); }
      redemptions.push(body.token_hash);
      return reply(200, GRANTS.get(body.token_hash) || { ok: false, reason: "not_found" });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function startServer(port, gatePort) {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ACCESS_GATE_MODE: "enforced",
      ACCESS_GATE_SESSION_SECRET: "institution-entry-test-secret",
      ACCESS_GATE_COOKIE_SECURE: "false",
      ACCESS_GATE_BACKEND: "azure_mysql",
      AZURE_ACCESS_GATE_API_BASE_URL: `http://127.0.0.1:${gatePort}`,
      AZURE_ACCESS_GATE_API_KEY: "stub-key",
      INSTITUTION_REPORT_RECIPIENTS: JSON.stringify(WHITELIST),
      SUBMISSION_MODE: "postgres",
      DATABASE_URL: ""
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
let stubGate;
let base;

test.before(async () => {
  const gatePort = await freePort();
  stubGate = await startStubGate(gatePort);
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = await startServer(port, gatePort);
});

test.after(() => {
  if (server) server.kill();
  if (stubGate) stubGate.close();
});

// The Set-Cookie header, pulled back out as something fetch can send again.
function sessionFrom(response) {
  const header = response.headers.getSetCookie
    ? response.headers.getSetCookie()[0]
    : response.headers.get("set-cookie");
  return header ? header.split(";")[0] : null;
}

async function scan(code) {
  return fetch(`${base}/entry/${encodeURIComponent(code)}`, { redirect: "manual" });
}

async function deliveryFor(cookie) {
  const response = await fetch(`${base}/api/session/delivery`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {}
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

// ------------------------------------------------------------------ the path

test("the entrance is one path segment, matched exactly", () => {
  assert.equal(parseEntryCode("/entry/egshuangho2026"), "egshuangho2026");
  // Percent-encoding is decoded by the caller before this sees it, so a code
  // with a space arrives as a space.
  assert.equal(parseEntryCode("/entry/shared code"), "shared code");

  for (const miss of ["/entry/", "/entry", "/entry/a/b", "/entryx/abc", "/access/abc", "/"]) {
    assert.equal(parseEntryCode(miss), null, `${miss} was read as an entrance`);
  }
  // A path long enough to be worth refusing before any work is done on it.
  assert.equal(parseEntryCode("/entry/" + "x".repeat(129)), null);
});

test("only GET at that exact shape is exempt from the gate", () => {
  assert.equal(isExemptFromGate("GET", "/entry/egshuangho2026"), true);
  assert.equal(isExemptFromGate("POST", "/entry/egshuangho2026"), false);
  assert.equal(isExemptFromGate("GET", "/entry/a/b"), false);
  assert.equal(isExemptFromGate("GET", "/entry/"), false);
});

// ------------------------------------------------------------------ the scan

test("scanning an institution's QR opens a session with no code typed", async () => {
  const response = await scan(SHUANGHO_CODE);
  assert.equal(response.status, 302, "the entrance did not answer without a session");
  assert.equal(response.headers.get("location"), "/");
  assert.ok(sessionFrom(response), "no session cookie was issued");

  // The code itself must not survive into the address bar: the redirect goes
  // to "/", so what stays on screen and in any onward Referer is the home
  // page, not a credential.
  assert.doesNotMatch(response.headers.get("location"), new RegExp(SHUANGHO_CODE, "i"));
});

test("the code is redeemed against the same row the typed form would use", async () => {
  redemptions.length = 0;
  await scan(` ${SHUANGHO_CODE.toUpperCase()} `);
  assert.deepEqual(
    redemptions,
    [hashToken(normalizeCode(SHUANGHO_CODE))],
    "a scanned code is normalized differently from a typed one"
  );
});

test("the session that scan opened knows where its report goes", async () => {
  const cookie = sessionFrom(await scan(SHUANGHO_CODE));
  const { status, body } = await deliveryFor(cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    forced: true,
    label: "雙和醫院",
    email: "reports@shuangho.example.org"
  });
});

test("an institution code nobody whitelisted still gets in, and is asked for an email", async () => {
  // The whitelist decides where reports go. It does not decide who may enter
  // -- that is the grant's job, and conflating the two would lock out every
  // ordinary institution code the moment this feature shipped.
  const response = await scan(UNLISTED_CODE);
  assert.equal(response.status, 302);
  const { body } = await deliveryFor(sessionFrom(response));
  assert.deepEqual(body, { ok: true, forced: false });
});

test("a code the gate refuses opens nothing", async () => {
  const response = await scan("egnotarealcode");
  assert.equal(response.status, 302, "a refused scan should look like any other");
  assert.equal(response.headers.get("location"), "/");
  assert.equal(sessionFrom(response), null, "a refused code was given a session");
});

test("a scan that is not a usable code is refused without asking the gate", async () => {
  redemptions.length = 0;
  for (const bad of ["abc", "x".repeat(65)]) {
    const response = await scan(bad);
    assert.equal(response.status, 302);
    assert.equal(sessionFrom(response), null);
  }
  assert.deepEqual(redemptions, [], "a code that cannot be valid was still sent to the gate");
});

test("a refused scan and a successful one are told apart only by the cookie", async () => {
  // Same status, same location, no body to read. Someone trying codes learns
  // whether one worked only by whether they are now inside -- which the quota
  // and the rate limiter are what bound.
  const good = await scan(SHUANGHO_CODE);
  const bad = await scan("egnotarealcode");
  assert.equal(good.status, bad.status);
  assert.equal(good.headers.get("location"), bad.headers.get("location"));
});

// ------------------------------------------------------------------ the gate

test("the entrance does not become a way past the gate", async () => {
  // It is a door: it answers without a session. What it must not do is let
  // anything else through, so the method and the shape are both checked
  // against the running server rather than against the exemption list.
  const posted = await fetch(`${base}/entry/${SHUANGHO_CODE}`, { method: "POST", redirect: "manual" });
  assert.equal(posted.status, 403, `POST answered ${posted.status}`);
  assert.equal(sessionFrom(posted), null, "POST to the entrance issued a session");

  const nested = await fetch(`${base}/entry/${SHUANGHO_CODE}/x`, { redirect: "manual" });
  assert.equal([302, 403].includes(nested.status), true);
  assert.equal(sessionFrom(nested), null, "a nested path issued a session");
});

test("the delivery endpoint says nothing without a session", async () => {
  const { status, body } = await deliveryFor(null);
  assert.equal([302, 403].includes(status), true, `it answered ${status}`);
  if (body) assert.notEqual(body.forced, true, "it named an institution to an unauthenticated caller");
});
