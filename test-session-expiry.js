const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  SESSION_COOKIE_NAME,
  signSessionCookie,
  verifySessionCookie,
  readSignedSessionPayload
} = require("./lib/access-gate");

// The gate refuses at submit time, after every question has been answered.
// Until 2026-09-24 that refusal read "資料送出失敗（參考代碼 403）", which is
// wrong twice over: it does not say the time ran out, and it invites a retry
// that cannot work. These run the real server, because the thing being
// tested is the shape of an HTTP response, and asserting on the source
// instead would pass just as happily with the branch wired to nothing.

const SECRET = "test-session-secret";

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function request(port, { method = "POST", path: urlPath = "/api/submit", cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {})
        }
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (error) {
            json = null;
          }
          resolve({ status: res.statusCode, body, json });
        });
      }
    );
    req.on("error", reject);
    req.end(method === "GET" ? undefined : "{}");
  });
}

// Reports what the child actually said when it fails to come up. A bare
// "did not become healthy" sends the next person to debug the wrong thing.
async function waitForHealth(port, attempts = 100) {
  for (let i = 0; i < attempts; i += 1) {
    if (exited !== null) {
      throw new Error(`server exited with code ${exited}\n--- stderr ---\n${output}`);
    }
    try {
      // Any status means the process is accepting connections, which is all
      // this needs. /api/health reports 503 here on purpose -- no gate
      // backend is configured in this environment, and none is needed: every
      // assertion below is about a request the gate refuses before it would
      // reach one.
      const res = await request(port, { method: "GET", path: "/api/health" });
      if (res.status) return;
    } catch (error) {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not become healthy in ${attempts / 10}s\n--- output ---\n${output}`);
}

let child;
let port;
let output = "";
let exited = null;

test.before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ACCESS_GATE_MODE: "enforced",
      ACCESS_GATE_SESSION_SECRET: SECRET,
      ACCESS_GATE_COOKIE_SECURE: "false",
      // Never reached: nothing in this file submits successfully. Set only
      // so the server does not choose the Postgres path and try to connect.
      SUBMISSION_MODE: "power-automate",
      POWER_AUTOMATE_WEBHOOK_URL: "https://example.invalid/never-called",
      // Deliberately NOT set, so the built-in default is what gets asserted.
      ACCESS_GATE_SESSION_TTL_HOURS: undefined
    }
  });

  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  child.on("exit", (code) => (exited = code));

  await waitForHealth(port);
});

test.after(() => {
  if (child) child.kill();
});

function cookieFor({ secret = SECRET, expOffsetSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const value = signSessionCookie(
    { grantId: 1, mode: "public", sid: `sid-${expOffsetSeconds}`, exp: now + expOffsetSeconds },
    secret
  );
  return `${SESSION_COOKIE_NAME}=${value}`;
}

test("a lapsed session is named, so the participant knows what to do", async () => {
  const res = await request(port, { cookie: cookieFor({ expOffsetSeconds: -10 }) });

  assert.equal(res.status, 403);
  assert.equal(res.json.code, "session_expired");
  assert.equal(
    typeof res.json.session_ttl_hours,
    "number",
    "the client writes the sentence but takes the number from here, so it must be sent"
  );
});

test("the limit defaults to two hours", async () => {
  const res = await request(port, { cookie: cookieFor({ expOffsetSeconds: -10 }) });

  // Asserted through the running server rather than by reading the constant:
  // this is the number the participant is told, and it is the default that
  // applies wherever the environment variable was never set -- including the
  // on-premises deployment.
  assert.equal(res.json.session_ttl_hours, 2);
});

test("no session at all stays generic", async () => {
  const res = await request(port, {});

  assert.equal(res.status, 403);
  assert.equal(res.json.code, undefined, "there is nothing to tell someone who never had a session");
  assert.match(res.json.error, /valid payment confirmation link/);
});

// The expiry is only reported for a cookie this server signed. Reporting it
// for any expired-looking cookie would turn the endpoint into an oracle for
// whether a forged payload was well-formed.
test("a forged cookie is not told that it expired", async () => {
  const res = await request(port, {
    cookie: cookieFor({ secret: "not-the-servers-secret", expOffsetSeconds: -10 })
  });

  assert.equal(res.status, 403);
  assert.equal(res.json.code, undefined);
  assert.match(res.json.error, /valid payment confirmation link/);
});

test("a live session is not refused", async () => {
  const res = await request(port, { cookie: cookieFor({ expOffsetSeconds: 3600 }) });

  // It gets past the gate; what happens next is the submission contract's
  // business, not this file's. What matters is that it is not a 403.
  assert.notEqual(res.status, 403);
});

// Unit-level, so the split introduced for this feature cannot quietly lose
// the expiry check it was carved out of.
test("reading a payload without the expiry check still requires the signature", () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = signSessionCookie({ sid: "a", exp: now - 10 }, SECRET);

  assert.equal(verifySessionCookie(expired, SECRET, now), null, "expiry must still be enforced");

  const payload = readSignedSessionPayload(expired, SECRET);
  assert(payload, "a validly signed but expired cookie must still be readable");
  assert.equal(payload.sid, "a");

  assert.equal(
    readSignedSessionPayload(expired, "wrong-secret"),
    null,
    "a bad signature must not yield a payload, expired or not"
  );
  assert.equal(readSignedSessionPayload(`${expired}tampered`, SECRET), null);
  assert.equal(readSignedSessionPayload("not-a-cookie", SECRET), null);
});

// ---------------------------------------------------------------------------
// The sentence the participant actually reads. Extracted from app.js and run,
// rather than asserted as source text: a message that never gets built is
// still present in the file.

function loadMessageBuilder() {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8").replace(/\r\n/g, "\n");

  const header = "function buildSubmitErrorMessage(responsePayload, status, lang) {";
  const start = source.indexOf(header);
  assert(start >= 0, "buildSubmitErrorMessage is gone from app.js");
  const end = source.indexOf("\n}\n", start);
  assert(end > start, "could not find the end of buildSubmitErrorMessage");

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    `${source.slice(start, end + 2)}\nglobalThis.__build = buildSubmitErrorMessage;`,
    sandbox
  );
  return sandbox.__build;
}

const buildSubmitErrorMessage = loadMessageBuilder();

test("the expiry message states the limit the server enforced", () => {
  const zh = buildSubmitErrorMessage({ code: "session_expired", session_ttl_hours: 2 }, 403, "zh");
  assert.match(zh, /2 小時/);
  assert.match(zh, /並未送出/, "the participant must be told the answers did not go through");
  assert.match(zh, /重新整理/, "and what to do about it");
  assert.doesNotMatch(zh, /403/, "a reference code is not an explanation");

  const en = buildSubmitErrorMessage({ code: "session_expired", session_ttl_hours: 2 }, 403, "en");
  assert.match(en, /2-hour/);
  assert.match(en, /were not sent/);
  assert.match(en, /reload/);
});

test("the message follows the server's limit rather than a number of its own", () => {
  // If the deployment raises the limit by environment variable, the sentence
  // has to move with it. Hard-coding "2" here would be a second source of
  // truth that nothing would notice had gone stale.
  const zh = buildSubmitErrorMessage({ code: "session_expired", session_ttl_hours: 6 }, 403, "zh");
  assert.match(zh, /6 小時/);
  assert.doesNotMatch(zh, /2 小時/);
});

test("any other failure keeps the reference code", () => {
  const zh = buildSubmitErrorMessage({ error: "boom" }, 502, "zh");
  assert.match(zh, /502/);
  assert.doesNotMatch(zh, /小時/, "an unrelated failure must not blame the time limit");

  const missing = buildSubmitErrorMessage({}, 500, "en");
  assert.match(missing, /reference 500/);
});
