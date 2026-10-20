const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

// What is behind the gate, asked of a running server rather than of the source.
//
// The reason this file exists: /api/chat/classify was registered above the gate
// block and so ran for anyone, with no session at all. It would have spent
// money on behalf of whoever found it the moment an API key was configured.
// The test that was supposed to cover it asserted that the path was absent from
// isExemptFromGate and that the route was registered -- both true, both
// irrelevant. Neither is reachability, and placement is what decides that.
//
// So this starts the real server with the gate enforced and knocks on each
// door with no cookie. A route moved above the gate block fails here however
// its comments read.

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
      ACCESS_GATE_SESSION_SECRET: "gate-coverage-test-secret",
      // Enough to make the classifier look configured: the point is that the
      // request never reaches it, and an unconfigured one answers 503 either
      // way, which would hide the very failure this file is about.
      ANTHROPIC_API_KEY: "sk-ant-not-a-real-key",
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
let base;

test.before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = await startServer(port);
});

test.after(() => { if (server) server.kill(); });

// Every route that must not answer without a session, and why it matters that
// it does not.
const PROTECTED = [
  ["POST", "/api/chat/classify", "every call is a billed model request"],
  ["GET", "/api/session/delivery", "it answers about a session"],
  ["POST", "/api/submit", "it stores a health questionnaire"]
];

// Keys only a handler produces. Seeing one means the request got past the
// gate, whatever the status code says.
const HANDLER_KEYS = ["forced", "indices", "code", "details", "record_id"];

for (const [method, route, why] of PROTECTED) {
  test(`${method} ${route} is refused without a session -- ${why}`, async () => {
    const response = await fetch(base + route, {
      method,
      // Manual: the gate answers an unauthenticated GET with a redirect to the
      // code-entry page, and following it turns a 302 into the gate page's own
      // 403 -- which looks like a refusal of the route and is not one.
      redirect: "manual",
      headers: method === "POST" ? { "Content-Type": "application/json" } : {},
      body: method === "POST" ? JSON.stringify({ question_id: "sex", utterance: "男的" }) : undefined
    });

    assert.equal(
      [302, 403].includes(response.status),
      true,
      `${route} answered ${response.status} with no cookie`
    );

    const body = await response.json().catch(() => null);
    if (body) {
      assert.equal(body.ok, false, `${route} answered ok:true with no session`);
      for (const key of HANDLER_KEYS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(body, key) && key !== "code",
          false,
          `${route} reached its handler before the gate (body has ${key})`
        );
      }
      // The gate's own refusals are the only codes allowed here.
      if (body.code !== undefined) {
        assert.equal(
          body.code === "session_expired",
          true,
          `${route} answered with a handler code: ${body.code}`
        );
      }
    }
  });
}

test("the door itself still opens", async () => {
  // The gate is only correct if the things that must work without a session
  // still do. A fix that locked these would be caught here and not in
  // production, where it means nobody can get in at all.
  // Reachable, not healthy: with no DATABASE_URL this instance reports 503,
  // and that is the handler answering. Asserting 200 would make this test fail
  // for a reason that has nothing to do with the gate.
  const health = await fetch(base + "/api/health", { redirect: "manual" });
  assert.equal([302, 403].includes(health.status), false, "the health check is behind the gate");
  assert.equal(typeof (await health.json()).access_gate_mode, "string");

  const styles = await fetch(base + "/styles.css", { redirect: "manual" });
  assert.equal(styles.status, 200);

  // The code entry page: a GET of "/" with no session renders the gate view
  // rather than redirecting away from it.
  const home = await fetch(base + "/", { redirect: "manual" });
  assert.equal(home.status, 403);
  assert.match(await home.text(), /<form|<input/i, "the gate page has no way to enter a code");
});

test("an unknown path does not leak which routes exist", async () => {
  // A 404 here and a 403 there would enumerate the API for anyone asking.
  const unknown = await fetch(base + "/api/not-a-real-route", { redirect: "manual" });
  assert.equal([302, 403].includes(unknown.status), true, `unknown path answered ${unknown.status}`);
});
