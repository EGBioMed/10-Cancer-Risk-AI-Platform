const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { signSessionCookie, SESSION_COOKIE_NAME, hashToken } = require("./lib/access-gate");
const {
  MODE_SCRIPT,
  parseIntakeEntrances,
  intakeStudyForEntrance,
  intakeStudyForSession,
  questionnaireModeForSession,
  applyQuestionnaireMode
} = require("./lib/questionnaire-mode");

// The questionnaire switch (2026-11-18): an entrance listed in INTAKE_ENTRANCES
// opens the research-intake questionnaire; every other entrance opens the
// questionnaire on sale, exactly as before. The entrance decides -- never the
// browser -- and until intake answers have a destination of their own, an
// intake session's submission is refused before it can reach the flow that
// mails reports.

const CONFIG = JSON.stringify({
  study2026: { label: "2026 收案", codes: ["EGSTUDY2026"], grants: ["77"] }
});

// ---------------------------------------------------------------------------
// The whitelist
// ---------------------------------------------------------------------------

test("an entrance is matched by its code (any case) or by its grant", () => {
  const list = parseIntakeEntrances(CONFIG);
  assert.deepEqual(list.problems, []);
  assert.equal(intakeStudyForEntrance(list, { code: "egstudy2026" }), "study2026");
  assert.equal(intakeStudyForEntrance(list, { grantId: 77 }), "study2026");
  assert.equal(intakeStudyForEntrance(list, { code: "someothercode", grantId: 5 }), null);
});

test("no configuration means every entrance is the questionnaire on sale", () => {
  for (const raw of [undefined, "", "   "]) {
    const list = parseIntakeEntrances(raw);
    assert.deepEqual(list.problems, []);
    assert.equal(list.studies.size, 0);
    assert.equal(questionnaireModeForSession(list, { grantId: 77, stu: "study2026" }), "sale");
  }
});

test("bad configuration is reported, not thrown, and opens nothing", () => {
  const cases = [
    ["{not json", /not valid JSON/],
    ["[]", /must be an object/],
    [JSON.stringify({ "Bad Slug": { label: "x", codes: ["abc12345"] } }), /study key/],
    [JSON.stringify({ s1: { codes: ["abc12345"] } }), /no usable label/],
    [JSON.stringify({ s1: { label: "x" } }), /no codes and no grants/],
    [JSON.stringify({ s1: { label: "x", grants: ["abc"] } }), /not a grant id/]
  ];
  for (const [raw, pattern] of cases) {
    const list = parseIntakeEntrances(raw);
    assert(list.problems.some((problem) => pattern.test(problem)), `${raw}: ${list.problems.join(" | ")}`);
    assert.equal(list.studies.size, 0, raw);
  }
});

test("a code claimed by two studies opens neither", () => {
  const list = parseIntakeEntrances(JSON.stringify({
    a: { label: "A", codes: ["SHARED2026"] },
    b: { label: "B", codes: ["SHARED2026"] }
  }));
  assert(list.problems.some((problem) => /more than one study/.test(problem)));
  assert.equal(intakeStudyForEntrance(list, { code: "SHARED2026" }), null);
  assert.equal(list.studies.size, 0);
});

test("a session is intake only while its study is still configured", () => {
  const list = parseIntakeEntrances(CONFIG);
  assert.equal(questionnaireModeForSession(list, { stu: "study2026" }), "intake");
  // A cookie signed before `stu` existed still resolves through its grant.
  assert.equal(questionnaireModeForSession(list, { grantId: 77 }), "intake");
  // A study removed from the list stops being intake at once, cookie or not.
  assert.equal(questionnaireModeForSession(list, { stu: "removed_study" }), "sale");
  assert.equal(questionnaireModeForSession(list, null), "sale");
  assert.equal(intakeStudyForSession(list, { stu: "study2026" }).label, "2026 收案");
});

test("the page on sale is served byte for byte unchanged; an intake page gets the mode first", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.equal(applyQuestionnaireMode(html, "sale"), html);
  assert.equal(applyQuestionnaireMode(html, "anything-else"), html);

  const intake = applyQuestionnaireMode(html, "intake");
  assert.equal(intake.split(MODE_SCRIPT).length, 2, "the mode script must appear exactly once");
  assert(intake.indexOf(MODE_SCRIPT) < intake.indexOf('<script src="app.js'), "the mode must be set before app.js runs");
  assert(intake.indexOf(MODE_SCRIPT) < intake.indexOf("</head>"));
});

// ---------------------------------------------------------------------------
// The running server
// ---------------------------------------------------------------------------

const SECRET = "questionnaire-mode-test-secret";

// The gate backend is a stub, as in test-institution-entry.js, so a real
// /entry/<code> scan can be followed through redemption to the cookie it
// seals. The intake code redeems to grant 900, which is NOT in CONFIG's
// grants -- so a pass here proves the code itself was matched at the door.
const INTAKE_CODE = "egstudy2026";
const ORDINARY_CODE = "egordinary2026";
const GRANTS = new Map([
  [hashToken(INTAKE_CODE), { ok: true, grantId: 900, deliveryMode: "institution" }],
  [hashToken(ORDINARY_CODE), { ok: true, grantId: 901, deliveryMode: "institution" }]
]);

function startStubGate(port) {
  const stub = http.createServer((req, res) => {
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
      return reply(200, GRANTS.get(body.token_hash) || { ok: false, reason: "not_found" });
    });
  });
  return new Promise((resolve) => stub.listen(port, "127.0.0.1", () => resolve(stub)));
}

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

function startServer(port, gatePort) {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ACCESS_GATE_MODE: "enforced",
      ACCESS_GATE_SESSION_SECRET: SECRET,
      ACCESS_GATE_COOKIE_SECURE: "false",
      ACCESS_GATE_BACKEND: "azure_mysql",
      AZURE_ACCESS_GATE_API_BASE_URL: `http://127.0.0.1:${gatePort}`,
      AZURE_ACCESS_GATE_API_KEY: "stub-key",
      INTAKE_ENTRANCES: CONFIG,
      SUBMISSION_MODE: "postgres",
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start within 20s")), 20000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) { clearTimeout(timer); resolve(child); }
    });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
  });
}

function cookieFor(payload) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const value = signSessionCookie({ sid: `sid-${Math.random()}`, mode: "standard", ...payload, exp }, SECRET);
  return `${SESSION_COOKIE_NAME}=${value}`;
}

let server;
let stubGate;
let base;
test.before(async () => {
  const gatePort = await freePort();
  stubGate = await startStubGate(gatePort);
  const port = await freePort();
  server = await startServer(port, gatePort);
  base = `http://127.0.0.1:${port}`;
});
test.after(() => {
  if (server) server.kill();
  if (stubGate) stubGate.close();
});

async function scan(code) {
  const response = await fetch(`${base}/entry/${encodeURIComponent(code)}`, { redirect: "manual" });
  const header = response.headers.getSetCookie ? response.headers.getSetCookie()[0] : response.headers.get("set-cookie");
  return { status: response.status, cookie: header ? header.split(";")[0] : null };
}

test("server: scanning an intake code opens the intake questionnaire, end to end", async () => {
  const { status, cookie } = await scan(INTAKE_CODE.toUpperCase());
  assert.equal(status, 302);
  assert(cookie, "no session was issued");
  const page = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert(page.includes(MODE_SCRIPT), "the redeemed intake code did not open the intake page");
  const submit = await fetch(`${base}/api/submit`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal((await submit.json()).code, "intake_submission_not_configured");
});

test("server: scanning any other code opens the questionnaire on sale, end to end", async () => {
  const { status, cookie } = await scan(ORDINARY_CODE);
  assert.equal(status, 302);
  const page = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert(!page.includes("EG_QUESTIONNAIRE_MODE"));
});

const saleCookie = () => cookieFor({ grantId: 5 });
const intakeCookie = () => cookieFor({ grantId: 77, stu: "study2026" });

test("server: an intake session gets the intake page, a sale session the page on sale", async () => {
  const intakePage = await (await fetch(`${base}/`, { headers: { cookie: intakeCookie() } })).text();
  assert(intakePage.includes(MODE_SCRIPT), "intake session did not get the intake page");

  const salePage = await (await fetch(`${base}/`, { headers: { cookie: saleCookie() } })).text();
  assert(!salePage.includes("EG_QUESTIONNAIRE_MODE"), "sale session got the intake page");

  // A cookie naming a study that is not configured is the page on sale.
  const stale = await (await fetch(`${base}/`, { headers: { cookie: cookieFor({ grantId: 5, stu: "removed_study" }) } })).text();
  assert(!stale.includes("EG_QUESTIONNAIRE_MODE"));
});

test("server: the browser cannot ask for the intake page itself", async () => {
  const page = await (await fetch(`${base}/?mode=intake`, {
    headers: { cookie: saleCookie(), "x-questionnaire-mode": "intake" }
  })).text();
  assert(!page.includes("EG_QUESTIONNAIRE_MODE"));
});

test("server: an intake submission is refused before it can reach any destination", async () => {
  const response = await fetch(`${base}/api/submit`, {
    method: "POST",
    headers: { cookie: intakeCookie(), "content-type": "application/json" },
    body: JSON.stringify({ email: "someone@example.com" })
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, "intake_submission_not_configured");
});

test("server: a sale submission is not affected by the intake refusal", async () => {
  const response = await fetch(`${base}/api/submit`, {
    method: "POST",
    headers: { cookie: saleCookie(), "content-type": "application/json" },
    body: JSON.stringify({})
  });
  const payload = await response.json().catch(() => ({}));
  assert.notEqual(payload.code, "intake_submission_not_configured");
  // An empty body fails the frozen contract, as it always has.
  assert.equal(response.status, 422);
});

test("server: the conversational page sends an intake session to the form", async () => {
  const intake = await fetch(`${base}/chat.html`, { headers: { cookie: intakeCookie() }, redirect: "manual" });
  assert.equal(intake.status, 302);
  assert.equal(intake.headers.get("location"), "/");
  const sale = await fetch(`${base}/chat.html`, { headers: { cookie: saleCookie() }, redirect: "manual" });
  assert.equal(sale.status, 200);
});

test("server: /api/health reports how many studies are configured, not which", async () => {
  const body = await (await fetch(`${base}/api/health`)).json();
  assert.equal(body.intake_studies_configured, 1);
  assert(!JSON.stringify(body).toLowerCase().includes("egstudy2026"));
});
