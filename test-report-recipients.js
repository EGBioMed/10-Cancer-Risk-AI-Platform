const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseReportRecipients,
  recipientForGrant,
  applyReportRecipient,
  MAX_LABEL_LENGTH
} = require("./lib/report-recipients");

// 雙和醫院 collects at a clinic: respondents are there in person, many have no
// email, and the hospital prints the reports. So every report from that
// entrance goes to one mailbox. What is checked here is that an entrance -- not
// a request -- decides that, and that a misconfiguration is visible rather than
// quiet.

const GOOD = JSON.stringify({
  61: { email: "reports@example.org", label: "雙和醫院" }
});

test("a configured entrance resolves to its mailbox", () => {
  const { recipients, problems } = parseReportRecipients(GOOD);
  assert.deepEqual(problems, []);
  assert.deepEqual(recipientForGrant(recipients, 61), { email: "reports@example.org", label: "雙和醫院" });
  // The grant id arrives from the signed cookie as a number and is configured
  // as a JSON key, which is a string. A lookup that only worked for one of
  // those would fail in production and nowhere else.
  assert.deepEqual(recipientForGrant(recipients, "61"), recipientForGrant(recipients, 61));
});

test("an entrance with no entry is left alone", () => {
  const { recipients } = parseReportRecipients(GOOD);
  assert.equal(recipientForGrant(recipients, 58), null);
  assert.equal(recipientForGrant(recipients, null), null);
  assert.equal(recipientForGrant(recipients, undefined), null);
});

test("no configuration at all is not an error", () => {
  for (const raw of ["", "   ", null, undefined]) {
    const { recipients, problems } = parseReportRecipients(raw);
    assert.equal(recipients.size, 0);
    assert.deepEqual(problems, [], `${JSON.stringify(raw)} was reported as a problem`);
  }
});

test("a malformed entry is dropped and reported, never guessed at", () => {
  const cases = [
    ["{not json", /not valid JSON/],
    ["[]", /object keyed by grant id/],
    ['{"abc":{"email":"a@b.co","label":"X"}}', /not a number/],
    ['{"61":{"email":"notanemail","label":"X"}}', /no usable email/],
    ['{"61":{"email":"a@b.co"}}', /no usable label/],
    ['{"61":{"email":"a@b.co","label":""}}', /no usable label/],
    [`{"61":{"email":"a@b.co","label":"${"x".repeat(MAX_LABEL_LENGTH + 1)}"}}`, /no usable label/],
    ['{"61":"reports@example.org"}', /no usable email/]
  ];
  for (const [raw, expected] of cases) {
    const { recipients, problems } = parseReportRecipients(raw);
    assert.equal(recipients.size, 0, `${raw} produced a recipient`);
    assert.equal(problems.length >= 1, true, `${raw} was dropped silently`);
    assert.match(problems.join(" "), expected);
  }
});

test("one bad entry does not take the good ones with it", () => {
  const { recipients, problems } = parseReportRecipients(JSON.stringify({
    61: { email: "reports@example.org", label: "雙和醫院" },
    62: { email: "broken", label: "另一家" }
  }));
  assert.equal(recipients.size, 1);
  assert.equal(recipientForGrant(recipients, 61).email, "reports@example.org");
  assert.equal(problems.length, 1);
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

test("the server takes the grant from the session, never from the body", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  // The whole safety property: a client that posts its own grant_id or email
  // must not be able to redirect anybody's report.
  assert.match(
    source,
    /const forcedRecipient = recipientForGrant\(reportRecipients, sessionGrantId\);/,
    "the override no longer reads the grant from the session"
  );
  assert.match(source, /const sessionGrantId = sessionPayload \? sessionPayload\.grantId : null;/);
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
