const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const {
  parseReportRecipients,
  recipientForInstitution,
  applyReportRecipient
} = require("./lib/report-recipients");
const {
  sanitizeLegacyDirectIdentifiers,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

// The research-intake entrance: a 雙和-style entrance -- reports go to one
// mailbox -- with "staffDiagnosis": true, which shows a 收案平台 badge
// (test-institution-entry.js). Until v19.17 (2026-11-23) the flag also added a
// page the research staff filled in (a diagnosis and its basis); that page was
// removed because the diagnosis is filled in later from medical records,
// outside the form. What these tests pin down:
//   1. no entrance asks a research-staff question any more;
//   2. a submission from a research-intake entrance is an ordinary one, sent
//      to the configured mailbox;
//   3. the whitelist still reads the flag strictly.

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const REMOVED_IDS = ["staff_diagnosis", "staff_diagnosis_basis"];

function fillEveryQuestion(app) {
  for (const question of app.questions) {
    if (!question.field || question.matrixGroup || question.type === "longtext") continue;
    let value;
    if (question.type === "multi") value = [question.options?.[0]];
    else if (question.options) value = question.options[0];
    else if (question.type === "email") value = "contract-test@example.com";
    else if (question.type === "name") value = "王小明";
    else if (question.id.includes("birth_year")) value = "1980";
    else if (question.id.includes("height")) value = "165";
    else if (question.id.includes("weight")) value = "60";
    else value = "1";
    app.answers[question.field] = app.makeAnswerEntry(question, value, "contract_test");
  }
  const consent = app.questions.find((question) => question.id === "consent_acknowledgement");
  app.answers[consent.field] = app.makeAnswerEntry(consent, [...consent.options], "contract_test");
}

test("no entrance asks a research-staff question, and there is no staff section", () => {
  const app = loadApp();
  for (const id of REMOVED_IDS) assert(!app.questions.some((question) => question.id === id), `${id} is still asked`);
  assert(!app.questions.some((question) => question.module === "staff"), "a question still sits in the staff section");
  assert.equal(app.getShownModules, undefined, "the entrance-dependent section list is back");
});

test("a research-intake submission is an ordinary one, sent to the configured mailbox", () => {
  const app = loadApp();
  fillEveryQuestion(app);
  const submission = app.storeSubmissionForIntegration();
  app.validateSubmissionBeforeSend(submission);
  const posted = plain(submission);
  for (const id of REMOVED_IDS) {
    assert(!posted.answer_code_rows.some((row) => row.question_id === id), `${id} is in answer_code_rows`);
    assert(!posted.rows.some((row) => row.question_id === id), `${id} is in rows`);
  }

  const whitelist = parseReportRecipients(JSON.stringify({
    research: { label: "收案", email: "egbiomedai@eg-bio.com", codes: ["egresearch01"], staffDiagnosis: true }
  }));
  applyReportRecipient(posted, recipientForInstitution(whitelist, "research"));
  assert.equal(posted.email, "egbiomedai@eg-bio.com");
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(plain(posted))), []);
});

test("staffDiagnosis in the whitelist: true switches it on, absent leaves the entry as it was, anything else is refused", () => {
  const whitelist = parseReportRecipients(JSON.stringify({
    research: { label: "收案", email: "egbiomedai@eg-bio.com", codes: ["egresearch01"], staffDiagnosis: true },
    shuangho: { label: "雙和醫院", email: "reports@example.org", codes: ["egshuangho2026"] },
    typo: { label: "X", email: "x@example.org", codes: ["egtypo01"], staffDiagnosis: "yes" }
  }));
  assert.deepEqual(plain(recipientForInstitution(whitelist, "research")),
    { slug: "research", label: "收案", email: "egbiomedai@eg-bio.com", staffDiagnosis: true });
  // 雙和's entry is exactly what it was before the flag existed.
  assert.deepEqual(plain(recipientForInstitution(whitelist, "shuangho")),
    { slug: "shuangho", label: "雙和醫院", email: "reports@example.org" });
  assert.equal(recipientForInstitution(whitelist, "typo"), null);
  assert(whitelist.problems.some((problem) => /typo has staffDiagnosis "yes"/.test(problem)));
});
