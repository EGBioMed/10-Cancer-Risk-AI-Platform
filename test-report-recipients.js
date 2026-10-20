const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseReportRecipients,
  institutionForEntrance,
  recipientForInstitution,
  applyReportRecipient,
  MAX_LABEL_LENGTH
} = require("./lib/report-recipients");

// 雙和醫院 collects at a clinic: respondents are there in person, many have no
// email, and the hospital prints the reports. So every report from that
// entrance goes to one mailbox. What is checked here is that an entrance -- not
// a request -- decides that, and that a misconfiguration is visible rather than
// quiet.

const SHUANGHO = { email: "reports@example.org", label: "雙和醫院" };
const GOOD = JSON.stringify({
  shuangho: { ...SHUANGHO, codes: ["egshuangho2026"], grants: [61] }
});

// The two together, since every caller does both: which institution this
// entrance belongs to, and where that institution's reports go.
function resolve(whitelist, entrance) {
  return recipientForInstitution(whitelist, institutionForEntrance(whitelist, entrance));
}

test("a configured entrance resolves to its mailbox", () => {
  const whitelist = parseReportRecipients(GOOD);
  assert.deepEqual(whitelist.problems, []);
  assert.deepEqual(resolve(whitelist, { code: "egshuangho2026" }), { slug: "shuangho", ...SHUANGHO });
  assert.deepEqual(resolve(whitelist, { grantId: 61 }), { slug: "shuangho", ...SHUANGHO });
  // The grant id arrives from the signed cookie as a number and is configured
  // as a JSON value, which may be either. A lookup that only worked for one of
  // those would fail in production and nowhere else.
  assert.deepEqual(resolve(whitelist, { grantId: "61" }), resolve(whitelist, { grantId: 61 }));
});

// The reason the whitelist is keyed on the institution and not on the grant:
// codes get re-minted, and the old key would quietly stop matching.
test("a second code for the same institution reaches the same mailbox", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    shuangho: { ...SHUANGHO, codes: ["egshuangho2026", "egshuangho2027"] }
  }));
  assert.deepEqual(whitelist.problems, []);
  assert.equal(institutionForEntrance(whitelist, { code: "egshuangho2026" }), "shuangho");
  assert.equal(institutionForEntrance(whitelist, { code: "egshuangho2027" }), "shuangho");
});

test("a code is matched the way a typed one is normalized", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    shuangho: { ...SHUANGHO, codes: ["  EGShuangHo2026 "] }
  }));
  // Configured with stray case and spaces, presented however the scanner or
  // the person produced it. Both go through normalizeCode, or the whitelist
  // would miss a code the gate itself accepted.
  assert.equal(institutionForEntrance(whitelist, { code: "egshuangho2026" }), "shuangho");
  assert.equal(institutionForEntrance(whitelist, { code: "EGSHUANGHO2026" }), "shuangho");
});

test("the code decides, and the grant is only the fallback", () => {
  // A single-use /access/<token> link has no code at all; the typed, scanned
  // and partner entrances all have one.
  const whitelist = parseReportRecipients(GOOD);
  assert.equal(institutionForEntrance(whitelist, { code: "egshuangho2026", grantId: 999 }), "shuangho");
  assert.equal(institutionForEntrance(whitelist, { code: "not-a-listed-code", grantId: 61 }), "shuangho");
  assert.equal(institutionForEntrance(whitelist, { grantId: 61 }), "shuangho");
});

test("an entrance with no entry is left alone", () => {
  const whitelist = parseReportRecipients(GOOD);
  assert.equal(institutionForEntrance(whitelist, { grantId: 58 }), null);
  assert.equal(institutionForEntrance(whitelist, { code: "egsomeoneelse" }), null);
  assert.equal(institutionForEntrance(whitelist, { grantId: null }), null);
  assert.equal(institutionForEntrance(whitelist, {}), null);
  assert.equal(institutionForEntrance(whitelist), null);
  assert.equal(recipientForInstitution(whitelist, "nobody"), null);
  assert.equal(recipientForInstitution(whitelist, null), null);
});

test("no configuration at all is not an error", () => {
  for (const raw of ["", "   ", null, undefined]) {
    const whitelist = parseReportRecipients(raw);
    assert.equal(whitelist.institutions.size, 0);
    assert.deepEqual(whitelist.problems, [], `${JSON.stringify(raw)} was reported as a problem`);
  }
});

test("a malformed entry is dropped and reported, never guessed at", () => {
  const cases = [
    ["{not json", /not valid JSON/],
    ["[]", /keyed by institution slug/],
    ['{"Shuang Ho":{"email":"a@b.co","label":"X","codes":["egcode"]}}', /must be 1-32 lowercase/],
    ['{"shuangho":{"email":"notanemail","label":"X","codes":["egcode"]}}', /no usable email/],
    ['{"shuangho":{"email":"a@b.co","codes":["egcode"]}}', /no usable label/],
    ['{"shuangho":{"email":"a@b.co","label":"","codes":["egcode"]}}', /no usable label/],
    [`{"shuangho":{"email":"a@b.co","label":"${"x".repeat(MAX_LABEL_LENGTH + 1)}","codes":["egcode"]}}`, /no usable label/],
    ['{"shuangho":"reports@example.org"}', /no usable email/],
    // Listed, and nothing can ever match it: configuration that looks finished.
    ['{"shuangho":{"email":"a@b.co","label":"X"}}', /no codes and no grants/],
    ['{"shuangho":{"email":"a@b.co","label":"X","codes":["abc"]}}', /not a usable access code/],
    ['{"shuangho":{"email":"a@b.co","label":"X","grants":["sixty-one"]}}', /not a grant id/]
  ];
  for (const [raw, expected] of cases) {
    const whitelist = parseReportRecipients(raw);
    assert.equal(whitelist.institutions.size, 0, `${raw} produced a recipient`);
    assert.equal(whitelist.problems.length >= 1, true, `${raw} was dropped silently`);
    assert.match(whitelist.problems.join(" "), expected);
  }
});

test("one bad entry does not take the good ones with it", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    shuangho: { ...SHUANGHO, codes: ["egshuangho2026"] },
    other: { email: "broken", label: "另一家", codes: ["egother"] }
  }));
  assert.equal(whitelist.institutions.size, 1);
  assert.equal(resolve(whitelist, { code: "egshuangho2026" }).email, "reports@example.org");
  assert.equal(whitelist.problems.length, 1);
});

// The worst thing this module could do is address a health report to the wrong
// hospital, so an ambiguous code routes to neither.
test("a code claimed by two institutions routes to neither", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    shuangho: { ...SHUANGHO, codes: ["shared-code", "egshuangho2026"] },
    other: { email: "other@example.org", label: "另一家", codes: ["shared-code"] }
  }));
  assert.equal(institutionForEntrance(whitelist, { code: "shared-code" }), null);
  assert.match(whitelist.problems.join(" "), /claimed by more than one institution/);
  // The institutions' own, undisputed codes still work.
  assert.equal(institutionForEntrance(whitelist, { code: "egshuangho2026" }), "shuangho");
  // 另一家 had nothing else, so it is gone entirely rather than left as a slug
  // an old cookie could still resolve against.
  assert.equal(recipientForInstitution(whitelist, "other"), null);
});

test("a grant claimed by two institutions routes to neither", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    shuangho: { ...SHUANGHO, grants: [61] },
    other: { email: "other@example.org", label: "另一家", grants: [61] }
  }));
  assert.equal(institutionForEntrance(whitelist, { grantId: 61 }), null);
  assert.equal(whitelist.institutions.size, 0);
  assert.match(whitelist.problems.join(" "), /claimed by more than one institution/);
});

test("a single code or grant need not be written as a list", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    shuangho: { ...SHUANGHO, codes: "egshuangho2026", grants: 61 }
  }));
  assert.deepEqual(whitelist.problems, []);
  assert.equal(institutionForEntrance(whitelist, { code: "egshuangho2026" }), "shuangho");
  assert.equal(institutionForEntrance(whitelist, { grantId: 61 }), "shuangho");
});

test("both places the address lives are overwritten", () => {
  // submission.email is what the delivery flow reads; contact_row.email is
  // what the contact table stores. Leaving either behind means the report and
  // the record disagree about who received it.
  const submission = {
    email: "patient@example.com",
    contact_row: { full_name: "王小明", email: "patient@example.com" }
  };
  applyReportRecipient(submission, { email: "reports@example.org", label: "雙和醫院" });
  assert.equal(submission.email, "reports@example.org");
  assert.equal(submission.contact_row.email, "reports@example.org");
  assert.equal(submission.contact_row.full_name, "王小明", "the name must survive -- it is how the clinic matches the report to a person");
});

test("a submission with no contact_row is not broken by the override", () => {
  const submission = { email: "patient@example.com" };
  applyReportRecipient(submission, { email: "reports@example.org", label: "X" });
  assert.equal(submission.email, "reports@example.org");
});

test("no recipient means nothing is touched", () => {
  const submission = { email: "patient@example.com", contact_row: { email: "patient@example.com" } };
  applyReportRecipient(submission, null);
  assert.equal(submission.email, "patient@example.com");
  assert.equal(submission.contact_row.email, "patient@example.com");
});

test("the server takes the entrance from the session, never from the body", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  // The whole safety property: a client that posts its own grant_id or email
  // must not be able to redirect anybody's report.
  assert.match(
    source,
    /const forcedRecipient = recipientForSession\(sessionPayload\);/,
    "the override no longer reads the entrance from the session"
  );
  // recipientForSession reads the slug and the grant out of the signed cookie
  // and takes nothing else.
  const start = source.indexOf("function recipientForSession(");
  assert.ok(start >= 0, "recipientForSession not found");
  const body = source.slice(start, source.indexOf("\n}", start));
  assert.match(body, /sessionPayload\.inst/);
  assert.match(body, /grantId: sessionPayload\.grantId/);
  assert.doesNotMatch(body, /submission|req\.|body/, "the override reads something other than the session");
});

// Both halves of the same promise go through one function: the page tells the
// respondent where their report is going, and the submission handler sends it
// there. Resolved separately they could drift, and the drift would be a person
// told their report goes to the clinic while it goes to them, or the reverse.
test("the page and the submission ask the same question", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const callers = source.match(/recipientForSession\(/g) || [];
  assert.equal(callers.length, 3, "expected the definition plus the two callers");
  assert.match(source, /const recipient = recipientForSession\(payload\);/, "the delivery endpoint resolves it some other way");
});

// ---------------------------------------------------------------------------
// The respondent has to be told. This is the consent-relevant half.
// ---------------------------------------------------------------------------

const { loadApp } = require("./lib/load-app-sandbox");

const CLINIC = { ok: true, forced: true, label: "雙和醫院", email: "reports@example.org" };
const reply = (body, ok = true) => async () => ({ ok, json: async () => body });

test("a forced entrance changes what the email question says", async () => {
  const app = loadApp({ fetch: reply(CLINIC) });
  const email = app.questions.find((question) => question.type === "email");

  // Before: the stock note promises the report goes to the address typed in.
  assert.match(app.getQuestionCopy(email).note, /sent to this email/i);

  await app.loadForcedReportRecipient();

  // After: it names the clinic and says no address is needed. The server
  // overwrites the recipient either way -- what this prevents is a person
  // being asked for an email, giving one, and never learning it was
  // disregarded, on a form that also collects their consent.
  const copy = app.getQuestionCopy(email);
  assert.match(copy.note, /雙和醫院/);
  assert.match(copy.note, /do not need an email/i);
  assert.doesNotMatch(copy.note, /sent to this email/i);
});

test("only the email question is reworded", async () => {
  const app = loadApp({ fetch: reply(CLINIC) });
  await app.loadForcedReportRecipient();
  for (const question of app.questions) {
    if (question.type === "email" || !question.title) continue;
    assert.doesNotMatch(
      app.getQuestionCopy(question).note || "",
      /雙和醫院/,
      `${question.id} was reworded`
    );
  }
});

test("an entrance with no forced recipient is untouched", async () => {
  const app = loadApp({ fetch: reply({ ok: true, forced: false }) });
  const email = app.questions.find((question) => question.type === "email");
  await app.loadForcedReportRecipient();
  assert.match(app.getQuestionCopy(email).note, /sent to this email/i);
});

test("an unreachable or malformed answer leaves the question as it was", async () => {
  // The server still redirects the report, so nothing is delivered wrongly.
  // The respondent is asked for an address that will not be used -- visibly
  // wrong to anyone testing the entrance, rather than quietly wrong.
  const broken = [
    async () => { throw new Error("offline"); },
    reply({ ok: true, forced: true, label: "雙和醫院" }),          // no email
    reply({ ok: true, forced: true, email: "reports@example.org" }), // no label
    reply(CLINIC, false),                                            // HTTP error
    async () => ({ ok: true, json: async () => { throw new Error("not json"); } })
  ];
  for (const fetchStub of broken) {
    const app = loadApp({ fetch: fetchStub });
    const email = app.questions.find((question) => question.type === "email");
    await app.loadForcedReportRecipient();
    assert.match(app.getQuestionCopy(email).note, /sent to this email/i);
  }
});

// Reachability is tested against a running server in test-gate-coverage.js.
test("the delivery endpoint is not in the gate exemption list", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  // It answers about a session, so it must have one. isExemptFromGate is the
  // list of things reachable without: the door itself and the stylesheet.
  const gate = fs.readFileSync(path.join(__dirname, "lib", "access-gate.js"), "utf8");
  assert.equal(gate.includes("/api/session/delivery"), false, "the endpoint was added to the gate exemptions");

  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(server, /pathname === "\/api\/session\/delivery"/, "the endpoint is not registered");
});
