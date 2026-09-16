const assert = require("node:assert/strict");
const test = require("node:test");
const {
  TICKET_VERSION,
  TICKET_TTL_SECONDS,
  signReportTicket,
  verifyReportTicket
} = require("./lib/report-ticket");

const SECRET = "test-report-ticket-secret-do-not-reuse";
const OTHER_SECRET = "a-different-secret-entirely";
const RECORD_ID = "123e4567-e89b-12d3-a456-426614174000";

test("a ticket round-trips to the record it was signed for", () => {
  const ticket = signReportTicket(RECORD_ID, SECRET);
  assert.equal(verifyReportTicket(ticket, SECRET), RECORD_ID);
});

// The reason the link carries a ticket at all. With a bare record_id in
// the URL, editing one character buys whoever owns that id their report --
// someone else's cancer risk assessment, delivered to the editor's inbox.
test("any edit to the ticket invalidates it", () => {
  const ticket = signReportTicket(RECORD_ID, SECRET);

  for (let i = 0; i < ticket.length; i += 1) {
    const original = ticket[i];
    // The replacement has to differ from the original *case-insensitively*.
    // The signature half is hex, where Buffer.from(.., "hex") reads 'a' and
    // 'A' as the same byte -- swapping one for the other edits the string
    // without editing the value, and the ticket then verifies exactly as it
    // should. An earlier version of this test did that and reported a
    // false failure at the first lowercase hex letter.
    const swapped = original.toLowerCase() === "a" ? "b" : "a";
    const tampered = ticket.slice(0, i) + swapped + ticket.slice(i + 1);
    if (tampered === ticket) continue;

    assert.equal(
      verifyReportTicket(tampered, SECRET),
      null,
      `a ticket edited at index ${i} must not verify`
    );
  }
});

test("a ticket signed with another secret never verifies", () => {
  const ticket = signReportTicket(RECORD_ID, OTHER_SECRET);
  assert.equal(verifyReportTicket(ticket, SECRET), null);
});

test("a ticket for one record cannot be re-pointed at another", () => {
  const mine = signReportTicket(RECORD_ID, SECRET);
  const theirs = signReportTicket("99999999-9999-9999-9999-999999999999", SECRET);

  // Splicing my signature onto their payload, and vice versa, must fail
  // both ways -- the signature covers the payload, not the other way round.
  const mixedA = theirs.slice(0, theirs.indexOf(".")) + mine.slice(mine.indexOf("."));
  const mixedB = mine.slice(0, mine.indexOf(".")) + theirs.slice(theirs.indexOf("."));

  assert.equal(verifyReportTicket(mixedA, SECRET), null);
  assert.equal(verifyReportTicket(mixedB, SECRET), null);
});

test("a ticket expires, and does so on the stated schedule", () => {
  const issuedAt = 1_800_000_000;
  const ticket = signReportTicket(RECORD_ID, SECRET, issuedAt);

  assert.equal(verifyReportTicket(ticket, SECRET, issuedAt), RECORD_ID);
  assert.equal(
    verifyReportTicket(ticket, SECRET, issuedAt + TICKET_TTL_SECONDS),
    RECORD_ID,
    "still valid at the last second of its window"
  );
  assert.equal(
    verifyReportTicket(ticket, SECRET, issuedAt + TICKET_TTL_SECONDS + 1),
    null,
    "rejected one second past its window"
  );

  // 30 days: long enough that someone can sit on a free report and come
  // back, bounded so a link in a forwarded inbox does not stay live for
  // ever.
  assert.equal(TICKET_TTL_SECONDS, 30 * 24 * 60 * 60);
});

test("a ticket from an unknown version is refused, not reinterpreted", () => {
  const forgedPayload = Buffer.from(
    JSON.stringify({ v: "rt0", rid: RECORD_ID, exp: Math.floor(Date.now() / 1000) + 600 }),
    "utf8"
  ).toString("base64url");

  // Signed correctly, so only the version check can reject it.
  const crypto = require("crypto");
  const signature = crypto.createHmac("sha256", SECRET).update(forgedPayload).digest("hex");

  assert.equal(verifyReportTicket(`${forgedPayload}.${signature}`, SECRET), null);
  assert.equal(TICKET_VERSION, "rt1");
});

test("a payload with no record id is refused even when correctly signed", () => {
  const crypto = require("crypto");
  const exp = Math.floor(Date.now() / 1000) + 600;

  for (const rid of [null, "", 42, undefined]) {
    const payload = Buffer.from(
      JSON.stringify({ v: TICKET_VERSION, rid, exp }),
      "utf8"
    ).toString("base64url");
    const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

    assert.equal(
      verifyReportTicket(`${payload}.${signature}`, SECRET),
      null,
      `rid ${JSON.stringify(rid)} must not verify`
    );
  }
});

test("malformed input returns null rather than throwing", () => {
  for (const bad of ["", "no-separator", ".", "a.", ".b", null, undefined, 42, {}]) {
    assert.equal(verifyReportTicket(bad, SECRET), null);
  }
});

// Verification is what a payment webhook calls. If a missing secret
// verified anything, a deployment that forgot the variable would hand out
// paid reports to any caller instead of failing.
test("a missing secret signs nothing and verifies nothing", () => {
  assert.throws(() => signReportTicket(RECORD_ID, ""));
  assert.throws(() => signReportTicket("", SECRET));

  const ticket = signReportTicket(RECORD_ID, SECRET);
  assert.equal(verifyReportTicket(ticket, ""), null);
  assert.equal(verifyReportTicket(ticket, undefined), null);
});

// The ticket is tamper-proof, not unreadable -- a deliberate, documented
// trade-off (FREEMIUM_SPEC.md 4.2). This test states it so that if the
// requirement ever hardens to "must not be readable", the decision shows
// up as a failing test rather than an assumption nobody rechecked.
test("the payload is signed, not encrypted -- known and accepted", () => {
  const ticket = signReportTicket(RECORD_ID, SECRET);
  const decoded = JSON.parse(
    Buffer.from(ticket.slice(0, ticket.indexOf(".")), "base64url").toString("utf8")
  );

  assert.equal(decoded.rid, RECORD_ID);
  // Readable, but useless on its own: without a valid signature it buys
  // nothing, and the id is a server-generated UUID that grants no access
  // anywhere else.
  assert.equal(verifyReportTicket(`${ticket.slice(0, ticket.indexOf("."))}.${"0".repeat(64)}`, SECRET), null);
});
