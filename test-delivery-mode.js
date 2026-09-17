const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const vm = require("node:vm");
const { verifyReportTicket } = require("./lib/report-ticket");

const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

// server.js listens on load and exports nothing, so the two pure functions
// are lifted out of the source and run in a sandbox -- the same approach
// test-contract.js already takes for app.js.
function grab(header) {
  const start = serverSource.indexOf(header);
  assert(start >= 0, `Could not locate ${header} in server.js`);
  const tail = serverSource.slice(start);
  // Tolerates either line ending: this checkout materialises CRLF.
  const match = tail.match(/\r?\n\}\r?\n/);
  assert(match, `Could not find the end of ${header} in server.js`);
  return tail.slice(0, match.index + match[0].length);
}

function loadDeliveryHelpers() {
  const sandbox = { signReportTicket: require("./lib/report-ticket").signReportTicket };
  vm.createContext(sandbox);
  vm.runInContext([
    grab("function normalizeDeliveryMode(rawMode) {"),
    grab("function applyDeliveryFields(submission, {"),
    "globalThis.__delivery = { normalizeDeliveryMode, applyDeliveryFields };"
  ].join("\n"), sandbox);
  return sandbox.__delivery;
}

const SECRET = "test-report-ticket-secret";
const RECORD_ID = "123e4567-e89b-12d3-a456-426614174000";

// A stand-in for the submission object as it reaches the forwarding step.
function makeSubmission() {
  return {
    contract_version: "assessment-submission/1.2.0",
    questionnaire_version: "questionnaire/2026-09-08-v19.9-phase1",
    full_name: "王小明",
    email: "patient@example.com",
    ai_api_feature_row: { record_id: RECORD_ID, age: 52 },
    excel_row: { record_id: RECORD_ID },
    rows: []
  };
}

// The single most consequential assertion in this file. The institution
// flow's HTTP trigger schema is additionalProperties:false, so one extra key
// in what it receives makes it reject every institution submission -- every
// vendor code (Numia, Myrostar, Garmin, 華康) failing at the same moment,
// with the TriggerInputSchemaMismatch this project has already seen once.
test("an institution submission is left byte-identical", () => {
  const { applyDeliveryFields } = loadDeliveryHelpers();
  const submission = makeSubmission();
  const before = JSON.stringify(submission);

  applyDeliveryFields(submission, {
    deliveryMode: "institution",
    grantId: 39,
    recordId: RECORD_ID,
    ticketSecret: SECRET
  });

  assert.equal(JSON.stringify(submission), before);
  assert.equal("delivery_mode" in submission, false);
  assert.equal("grant_id" in submission, false);
  assert.equal("report_ticket" in submission, false);
});

test("a public submission carries the mode, grant and a valid ticket", () => {
  const { applyDeliveryFields } = loadDeliveryHelpers();
  const submission = makeSubmission();

  applyDeliveryFields(submission, {
    deliveryMode: "public",
    grantId: 40,
    recordId: RECORD_ID,
    ticketSecret: SECRET
  });

  assert.equal(submission.delivery_mode, "public");
  assert.equal(submission.grant_id, 40);
  // The ticket must actually verify back to this submission's record, or the
  // payment link buys nothing.
  assert.equal(verifyReportTicket(submission.report_ticket, SECRET), RECORD_ID);
});

test("a missing ticket secret yields no ticket rather than an unsigned one", () => {
  const { applyDeliveryFields } = loadDeliveryHelpers();
  const submission = makeSubmission();

  applyDeliveryFields(submission, {
    deliveryMode: "public",
    grantId: 40,
    recordId: RECORD_ID,
    ticketSecret: ""
  });

  assert.equal(submission.report_ticket, null);
  assert.equal(submission.delivery_mode, "public");
});

// The mode comes from the grant that was redeemed, sealed into a signed
// cookie. Anything the browser says is irrelevant -- including a body that
// claims the institution line in order to collect the full PDF for free.
test("only an explicit public mode is public; everything else is institution", () => {
  const { normalizeDeliveryMode } = loadDeliveryHelpers();

  assert.equal(normalizeDeliveryMode("public"), "public");

  for (const raw of [undefined, null, "", "institution", "Public", "PUBLIC", "free", 1, {}]) {
    assert.equal(
      normalizeDeliveryMode(raw),
      "institution",
      `${JSON.stringify(raw)} must not be treated as the free line`
    );
  }
});

test("the submission handler takes the mode from the cookie, not the body", () => {
  const handlerStart = serverSource.indexOf("async function receiveSubmission(");
  assert(handlerStart >= 0, "receiveSubmission not found");
  const handler = serverSource.slice(handlerStart, serverSource.indexOf("\nasync function", handlerStart + 1));

  assert.match(handler, /normalizeDeliveryMode\(sessionPayload && sessionPayload\.mode\)/);
  // Never read back off the request body.
  assert.doesNotMatch(handler, /submission\.delivery_mode\s*\|\|/);
  assert.doesNotMatch(handler, /body\.delivery_mode/);
});

test("the redeemed grant's mode is sealed into the signed cookie", () => {
  // Inside signSessionCookie's payload, so forging it means forging the HMAC.
  assert.match(serverSource, /signSessionCookie\(\{ grantId, mode, sid, exp: expiresAtSeconds \}/);
  // Both redemption paths -- the link and the typed code -- must pass it on,
  // or one of the two silently mints institution sessions for public codes.
  const callSites = serverSource.match(/buildAccessSessionCookie\(result\.grantId, result\.deliveryMode\)/g);
  assert.equal(callSites && callSites.length, 2, "both redemption paths must pass the delivery mode");
});

// Falling back to the institution webhook would send a free user's
// submission to the flow that attaches the full PDF -- giving away the paid
// report. No email at all is the correct failure.
test("a public submission never falls back to the institution webhook", () => {
  const handlerStart = serverSource.indexOf("async function receiveSubmission(");
  const handler = serverSource.slice(handlerStart, serverSource.indexOf("\nasync function", handlerStart + 1));

  assert.match(handler, /deliveryMode === "public"\s*\r?\n?\s*\? POWER_AUTOMATE_WEBHOOK_URL_PUBLIC/);
  assert.match(handler, /if \(!webhookUrl\) \{/);
  // The forward must use the selected URL, not the institution constant.
  assert.match(handler, /await fetch\(webhookUrl,/);
  assert.doesNotMatch(handler, /await fetch\(POWER_AUTOMATE_WEBHOOK_URL,/);
});

test("the ticket secret is its own variable, not the session secret", () => {
  assert.match(serverSource, /const REPORT_TICKET_SECRET = process\.env\.REPORT_TICKET_SECRET/);
  // Sharing one secret would make a leaked session secret forge paid reports
  // as well as questionnaire access.
  assert.doesNotMatch(serverSource, /REPORT_TICKET_SECRET = .*ACCESS_GATE_SESSION_SECRET/);
});
