const { signSessionCookie, verifySessionCookie } = require("./access-gate");

// Bumped only if the payload's shape changes. verifyReportTicket refuses a
// version it does not know, so an old ticket cannot be reinterpreted under
// new rules -- it is rejected outright and the holder is told to ask
// support, which is the safe outcome for something that gates a purchase.
const TICKET_VERSION = "rt1";

// 30 days. The session cookie's 30 minutes is sized to one sitting at the
// questionnaire; this is sized to how long someone might sit on a free
// report before deciding to buy, which is a different question entirely.
// It is a deliberate ceiling rather than an unlimited link: a ticket that
// never expires is one that stays valid in an inbox, a screenshot or a
// forwarded thread indefinitely.
const TICKET_TTL_SECONDS = 30 * 24 * 60 * 60;

// The payment link carries this instead of a bare record_id. A raw id in
// the URL would let anyone edit a character and buy the report belonging
// to whoever owns the id they landed on -- someone else's cancer risk
// assessment, delivered to their own inbox. The HMAC makes any edit fail.
//
// It reuses signSessionCookie rather than reimplementing the construction:
// the two are the same primitive (base64url payload, HMAC-SHA256, exp
// checked on the way back), and a second hand-rolled copy is a second
// chance to get it subtly wrong.
function signReportTicket(recordId, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof recordId !== "string" || !recordId) {
    throw new Error("signReportTicket requires a record id");
  }
  if (typeof secret !== "string" || !secret) {
    throw new Error("signReportTicket requires a secret");
  }

  return signSessionCookie(
    { v: TICKET_VERSION, rid: recordId, exp: nowSeconds + TICKET_TTL_SECONDS },
    secret
  );
}

// Returns the record id, or null for every failure -- forged signature,
// wrong secret, expired, unknown version, malformed. One null rather than
// a reason, for the same rationale the gate gives a single denial message:
// the caller is a payment webhook, and telling it which check failed only
// helps someone probing it.
function verifyReportTicket(ticket, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof ticket !== "string" || !ticket) return null;
  if (typeof secret !== "string" || !secret) return null;

  const payload = verifySessionCookie(ticket, secret, nowSeconds);
  if (!payload) return null;
  if (payload.v !== TICKET_VERSION) return null;
  if (typeof payload.rid !== "string" || !payload.rid) return null;

  return payload.rid;
}

module.exports = {
  TICKET_VERSION,
  TICKET_TTL_SECONDS,
  signReportTicket,
  verifyReportTicket
};
