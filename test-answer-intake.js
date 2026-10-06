const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const { getOptionCode } = require("./answer-codes");
const intake = require("./answer-intake");

// What this file is for: a conversational front end writes answers by composing
// strings, and `answers` is matched against question.options by exact equality.
// A near miss is not refused anywhere downstream -- it is dropped from a multi
// answer, or stored as a null single answer, or, worst, read by
// buildSymptomFeatureRow as "this label is not in the selected list" and
// written out as a 0: a denial the person never made, on its way to the model.
//
// So the tests below are not about the module's surface. They are about whether
// the defect is actually closed in the real pipeline, which is why most of them
// end at storeSubmissionForIntegration() rather than at a return value.

const app = loadApp();

const withOptions = app.questions.filter(
  (question) => question.field && Array.isArray(question.options) && question.options.length > 0
);

const symptomGroup = app.questions.find(
  (question) => question.field && question.isSymptomGroup && (question.options || []).length >= 2
);

function fillEveryQuestion(answers, writer) {
  for (const question of app.questions) {
    if (!question.field) continue;
    let value;
    if (question.type === "multi") value = [question.options?.[0]];
    else if (question.options) value = question.options[0];
    else if (question.type === "email") value = "contract-test@example.com";
    else if (question.type === "name") value = "王小明";
    else if (question.id.includes("birth_year")) value = "1980";
    else if (question.id.includes("height")) value = "165";
    else if (question.id.includes("weight")) value = "60";
    else value = "1";
    if (value === undefined) continue;
    writer(answers, question, value);
  }
  const consent = app.questions.find((question) => question.id === "consent_acknowledgement");
  writer(answers, consent, [...consent.options]);
}

const formWriter = (answers, question, value) => {
  answers[question.field] = app.makeAnswerEntry(question, value, "contract_test");
};

const chatWriter = (answers, question, value) => {
  const result = intake.write(answers, question, value, {
    makeAnswerEntry: app.makeAnswerEntry,
    source: "contract_test"
  });
  assert.notEqual(
    result.status,
    "rejected",
    `${question.id} was rejected while filling a complete questionnaire: ${result.reason}`
  );
};

function submissionFrom(writer) {
  for (const key of Object.keys(app.answers)) delete app.answers[key];
  fillEveryQuestion(app.answers, writer);
  const country = app.questions.find((question) => question.id === "country");
  writer(app.answers, country, "臺灣");
  return app.storeSubmissionForIntegration();
}

// Two submissions taken a millisecond apart are never byte-identical: the wall
// clock appears as submitted_at and accepted_at, and record_id is derived from
// it. They are stripped by exact key name, recursively, rather than by a
// pattern over key names -- a question about a date would match a pattern, and
// quietly excusing a real difference is exactly the kind of hole this
// comparison exists to close.
const VOLATILE_KEYS = new Set(["submitted_at", "accepted_at", "recorded_at", "record_id", "timestamp"]);

function withoutTimestamps(submission) {
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        if (VOLATILE_KEYS.has(key)) continue;
        out[key] = strip(value);
      }
      return out;
    }
    return node;
  };
  return strip(JSON.parse(JSON.stringify(submission)));
}

// ---------------------------------------------------------------------------
// 1. The guard must never stand in the way of a legitimate answer.
// ---------------------------------------------------------------------------

test("every option of every question survives the guard and maps to a code", () => {
  let checked = 0;
  for (const question of withOptions) {
    for (const option of question.options) {
      const candidate = question.type === "multi" ? [option] : option;
      const result = intake.resolve(question, candidate);
      assert.equal(
        result.status,
        "answered",
        `${question.id} refused its own option ${JSON.stringify(option)} (${result.reason})`
      );
      assert.notEqual(
        getOptionCode(question, option),
        null,
        `${question.id} option ${JSON.stringify(option)} has no answer code`
      );
      checked += 1;
    }
  }
  // A guard that passes everything and a guard that is never exercised look the
  // same from here, so the count is asserted rather than printed.
  assert(checked > 300, `only ${checked} options were checked; the questionnaire has more`);
});

// ---------------------------------------------------------------------------
// 2. A near miss is refused, not repaired.
// ---------------------------------------------------------------------------

test("a near-miss label is refused rather than silently matched", () => {
  const variants = (option) => [
    `${option} `,
    ` ${option}`,
    `${option}。`,
    option.replace(/（/g, "(").replace(/）/g, ")"),
    option.replace(/、/g, "，"),
    option.slice(0, Math.max(1, option.length - 1))
  ];

  let checked = 0;
  for (const question of withOptions) {
    for (const option of question.options) {
      for (const variant of variants(option)) {
        // A "corruption" that lands on another real option is a different
        // answer, not a near miss, and the guard is right to accept it.
        if (question.options.includes(variant)) continue;
        const candidate = question.type === "multi" ? [variant] : variant;
        const result = intake.resolve(question, candidate);
        assert.notEqual(
          result.status,
          "answered",
          `${question.id} accepted ${JSON.stringify(variant)}, which is not one of its options`
        );
        checked += 1;
      }
    }
  }
  assert(checked > 300, `only ${checked} variants were checked`);
});

test("an answer code is not accepted in place of the label it stands for", () => {
  const question = withOptions.find((candidate) => candidate.type === "single");
  const code = getOptionCode(question, question.options[0]);
  const result = intake.resolve(question, code);
  assert.notEqual(result.status, "answered", `${question.id} accepted its own answer code as a label`);
});

// ---------------------------------------------------------------------------
// 3. Multi answers are all or nothing.
// ---------------------------------------------------------------------------

test("one unresolved option makes the whole multi answer unknown, not a shorter list", () => {
  assert(symptomGroup, "no symptom group with two or more options was found");
  const good = symptomGroup.options[0];
  const result = intake.resolve(symptomGroup, [good, "這不是一個選項"]);

  assert.equal(result.status, "unknown");
  assert.deepEqual(result.unresolved, ["這不是一個選項"]);
  // The defect being closed: `.filter(Boolean)` downstream would have kept the
  // one that resolved and still called the question answered.
  assert.notDeepEqual(result.value, [good]);
});

test("an empty selection is unknown, because the symptom row would read it as all-zero", () => {
  const result = intake.resolve(symptomGroup, []);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "empty");
});

test("duplicate selections are collapsed, so no code appears twice", () => {
  const option = symptomGroup.options[0];
  const result = intake.resolve(symptomGroup, [option, option]);
  assert.equal(result.status, "answered");
  assert.deepEqual(result.value, [option]);
});

// ---------------------------------------------------------------------------
// 4. The part that matters: what reaches the model.
// ---------------------------------------------------------------------------

test("an unresolved symptom reaches the feature row as null, never as a denial", () => {
  const columns = symptomGroup.options
    .map((option) => symptomGroup.symptomDefinitions?.find(([label]) => label === option)?.[2])
    .filter(Boolean);
  assert(columns.length > 0, "the symptom group exposes no feature columns");

  // The unguarded path, to show the defect is real and not hypothetical: write
  // a label the question does not have, exactly as a chatbot composing text
  // would, and the columns come out as zeros.
  const unguarded = submissionFrom((answers, question, value) => {
    formWriter(answers, question, question.id === symptomGroup.id ? ["胃部不適"] : value);
  });
  const unguardedValues = columns.map((column) => unguarded.symptom_feature_row[column]);
  assert(
    unguardedValues.every((value) => value === 0),
    `expected the unguarded path to fabricate denials, got ${JSON.stringify(unguardedValues)}`
  );

  // The same near miss through the guard.
  const guarded = submissionFrom((answers, question, value) => {
    if (question.id !== symptomGroup.id) return chatWriter(answers, question, value);
    const result = intake.write(answers, question, ["胃部不適"], {
      makeAnswerEntry: app.makeAnswerEntry,
      source: "contract_test"
    });
    assert.equal(result.status, "unknown");
  });
  for (const column of columns) {
    assert.equal(
      guarded.symptom_feature_row[column],
      null,
      `${column} came out as ${guarded.symptom_feature_row[column]} instead of null`
    );
  }
});

test("an unresolved answer is reported as unknown in the answer code rows", () => {
  const submission = submissionFrom((answers, question, value) => {
    if (question.id !== symptomGroup.id) return chatWriter(answers, question, value);
    intake.write(answers, question, ["胃部不適"], {
      makeAnswerEntry: app.makeAnswerEntry,
      source: "contract_test"
    });
  });
  const row = submission.answer_code_rows.find((entry) => entry.question_id === symptomGroup.id);
  assert.equal(row.status, "unknown");
  assert.equal(row.value, null);
});

// ---------------------------------------------------------------------------
// 5. Consent, name and email cannot degrade.
// ---------------------------------------------------------------------------

test("consent, name and email are rejected rather than marked unknown", () => {
  const cases = [
    app.questions.find((question) => question.id === "consent_acknowledgement"),
    app.questions.find((question) => question.type === "name"),
    app.questions.find((question) => question.type === "email")
  ];

  for (const question of cases) {
    assert(question, "a non-degradable question is missing from the questionnaire");
    assert.equal(intake.canDegradeToUnknown(question), false, `${question.id} may degrade`);

    const answers = {};
    const candidate = question.type === "name" || question.type === "email" ? "  " : ["不是選項"];
    const result = intake.write(answers, question, candidate, {
      makeAnswerEntry: app.makeAnswerEntry,
      source: "contract_test"
    });

    assert.equal(result.status, "rejected", `${question.id} degraded instead of being rejected`);
    // Nothing written at all: a blank email that looks filled in is worse than
    // an absent one, because only the absent one can still be asked for.
    assert.equal(
      Object.prototype.hasOwnProperty.call(answers, question.field),
      false,
      `${question.id} was written to the store despite being rejected`
    );
  }
});

// ---------------------------------------------------------------------------
// 6. Equivalence: the same answers, two front ends, one submission.
// ---------------------------------------------------------------------------

test("a questionnaire filled through the intake matches one filled by the form", () => {
  const viaForm = withoutTimestamps(submissionFrom(formWriter));
  const viaChat = withoutTimestamps(submissionFrom(chatWriter));
  assert.deepEqual(viaChat, viaForm);
});

test("the intake-filled questionnaire passes the app's own send-time validation", () => {
  // The validator throws rather than returning its findings -- it is the last
  // thing between the browser and the flow, and its job is to stop the send.
  const submission = submissionFrom(chatWriter);
  assert.doesNotThrow(() => app.validateSubmissionBeforeSend(submission));
});

// ---------------------------------------------------------------------------
// 7. Numbers.
// ---------------------------------------------------------------------------

test("a blank number is unknown rather than zero", () => {
  const question = app.questions.find((candidate) => candidate.type === "number" && candidate.field);
  for (const blank of ["", "   ", null, undefined]) {
    const result = intake.resolve(question, blank);
    assert.equal(result.status, "unknown", `${JSON.stringify(blank)} did not come back unknown`);
  }
  assert.equal(intake.resolve(question, "十八").status, "unknown");
  assert.equal(intake.resolve(question, "18").status, "answered");
  assert.equal(intake.resolve(question, 18).value, "18");
});
