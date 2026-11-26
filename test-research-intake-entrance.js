const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const {
  parseReportRecipients,
  recipientForInstitution,
  applyReportRecipient,
  researchIdentifierProblems,
  RESEARCH_IDENTIFIER_LIMITS
} = require("./lib/report-recipients");
const {
  sanitizeLegacyDirectIdentifiers,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

// The research-intake entrance: a 雙和-style entrance -- reports go to one
// mailbox -- with "staffDiagnosis": true. Since v19.17 (2026-11-23) its
// questionnaire ends with a page the research staff fill in: the participant's
// name, medical record number and hospital, so the diagnosis can be filled in
// later from the medical record (v19.15-v19.16 asked for the diagnosis itself
// there). What these tests pin down:
//   1. every other entrance never sees that page and asks the name as before;
//   2. at a research-intake entrance the staff page replaces the participant's
//      own name question, last before the confirmation;
//   3. all three are direct identifiers: contact_row only, never rows, codes
//      or a feature row;
//   4. the entrance, not the page, decides (researchIdentifierProblems).

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const STAFF_IDS = ["staff_patient_name", "staff_medical_record_number", "staff_hospital"];
const MRN = "A1234567";
const HOSPITAL = "測試醫院";

function fillEveryQuestion(app) {
  for (const question of app.questions) {
    if (!question.field || question.matrixGroup || question.type === "longtext" || question.module === "staff") continue;
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

function fillStaffPage(app, { name = "陳大文", mrn = MRN, hospital = HOSPITAL } = {}) {
  for (const [id, value] of [["staff_patient_name", name], ["staff_medical_record_number", mrn], ["staff_hospital", hospital]]) {
    const question = app.questions.find((item) => item.id === id);
    app.answers[question.field] = app.makeAnswerEntry(question, value, "test");
  }
}

const researchWhitelist = () => parseReportRecipients(JSON.stringify({
  research: { label: "收案", email: "egbiomedai@eg-bio.com", codes: ["egresearch01"], staffDiagnosis: true }
}));

test("an ordinary entrance never sees the staff page and asks the name as before", () => {
  const app = loadApp();
  fillEveryQuestion(app);
  const active = app.getActiveQuestions().map((question) => question.id);
  for (const id of STAFF_IDS) assert(!active.includes(id), `${id} is asked at an ordinary entrance`);
  assert(active.includes("full_name"));
  assert(!app.getShownModules().some((module) => module.id === "staff"), "the staff section is listed");
  const posted = plain(app.storeSubmissionForIntegration());
  assert.deepEqual(Object.keys(posted.contact_row).sort(), ["email", "full_name", "language", "record_id", "report_language", "submitted_at"]);
  assert.deepEqual(researchIdentifierProblems(posted.contact_row, null), []);
});

test("a research-intake entrance asks the staff page last, in place of the participant's own name question", () => {
  const app = loadApp({ researchIntakeEntrance: true });
  fillEveryQuestion(app);
  const active = app.getActiveQuestions().map((question) => question.id);
  assert(!active.includes("full_name"), "the participant is still asked for the name");
  assert.deepEqual(plain(active.slice(-3)), STAFF_IDS);
  assert.deepEqual(plain(app.getShownModules().map((module) => module.id).slice(-3)), ["staff", "confirm", "result"]);

  const [name, mrn, hospital] = STAFF_IDS.map((id) => app.questions.find((question) => question.id === id));
  assert.equal(name.type, "name");
  assert.equal(mrn.type, "shorttext");
  assert.equal(mrn.maxLength, RESEARCH_IDENTIFIER_LIMITS.medical_record_number);
  assert.equal(hospital.type, "shorttext");
  assert.equal(hospital.maxLength, RESEARCH_IDENTIFIER_LIMITS.hospital);
  for (const question of [name, mrn, hospital]) {
    assert.equal(question.required, true);
    assert.equal(question.excludeFromCanonicalContract, true);
    assert(question.titleEn && question.placeholderEn, `${question.id} has no English copy`);
  }
});

test("the three identifiers travel in contact_row only, and the contract accepts it", () => {
  const app = loadApp({ researchIntakeEntrance: true });
  fillEveryQuestion(app);
  fillStaffPage(app);
  const submission = app.storeSubmissionForIntegration();
  app.validateSubmissionBeforeSend(submission);
  const posted = plain(submission);

  assert.equal(posted.full_name, "陳大文");
  assert.equal(posted.contact_row.full_name, "陳大文");
  assert.equal(posted.contact_row.medical_record_number, MRN);
  assert.equal(posted.contact_row.hospital, HOSPITAL);
  for (const id of STAFF_IDS) {
    assert(!posted.rows.some((row) => row.question_id === id), `${id} is in rows`);
    assert(!posted.answer_code_rows.some((row) => row.question_id === id), `${id} has a code row`);
  }
  const outside = JSON.stringify({ ...posted, contact_row: null, full_name: null });
  assert(!outside.includes(MRN) && !outside.includes(HOSPITAL), "an identifier left contact_row");

  applyReportRecipient(posted, recipientForInstitution(researchWhitelist(), "research"));
  assert.equal(posted.email, "egbiomedai@eg-bio.com");
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(plain(posted))), []);
  assert.deepEqual(researchIdentifierProblems(posted.contact_row, recipientForInstitution(researchWhitelist(), "research")), []);
});

test("the server refuses the identifiers from any other entrance, and requires them at a research-intake one", () => {
  const research = recipientForInstitution(researchWhitelist(), "research");
  const row = { record_id: "x", full_name: "x", email: "x", submitted_at: "x", language: "zh", report_language: "zh-Hant" };
  assert.deepEqual(researchIdentifierProblems({ ...row, medical_record_number: MRN, hospital: HOSPITAL }, { label: "雙和醫院", email: "a@b.co" }),
    ["research identifiers are not accepted from this entrance"]);
  assert.deepEqual(researchIdentifierProblems({ ...row, hospital: HOSPITAL }, null),
    ["research identifiers are not accepted from this entrance"]);
  assert.deepEqual(researchIdentifierProblems(row, research),
    ["medical_record_number is required at this entrance", "hospital is required at this entrance"]);
  assert.deepEqual(researchIdentifierProblems({ ...row, medical_record_number: "x".repeat(31), hospital: "<b>" }, research),
    ["medical_record_number is longer than 30 characters", "hospital contains characters that are not allowed"]);
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
