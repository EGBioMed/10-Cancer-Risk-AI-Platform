const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const { createChatSession } = require("./chat-session");
const intake = require("./answer-intake");

// Each test gets its own app: `answers` is module-scoped inside app.js and the
// appliesIf closures read it directly, so a shared instance would let one
// conversation decide which questions another one is asked.
function freshSession(options) {
  const app = loadApp();
  return { app, session: createChatSession({ app, ...(options || {}) }) };
}

// What a cooperative person says: the question's own first option, or a
// plausible value for the typed questions. Deliberately not the exact label
// for every case -- "是" and a bare number go through the resolver's rules
// rather than its exact-match path, which is the half a real conversation uses.
function cooperativeReply(question) {
  if (question.type === "number") {
    if (question.id.includes("birth_year")) return "1980";
    if (question.id.includes("height")) return "165";
    if (question.id.includes("weight")) return "60";
    return "1";
  }
  if (question.type === "name") return "王小明";
  if (question.type === "email") return "chat-test@example.com";
  if (question.type === "multi") {
    return question.id === "consent_acknowledgement" ? [...question.options] : [question.options[0]];
  }
  return question.options ? question.options[0] : "1";
}

function runToCompletion(session, reply) {
  const asked = [];
  for (let step = 0; step < 500; step += 1) {
    const turn = session.next();
    if (turn.done) return asked;
    const answer = reply(turn.question, turn);
    const result = session.receive(answer);
    asked.push({ id: turn.question.id, kind: turn.kind, status: result.status });
    if (result.status === "blocked") return asked;
  }
  throw new Error("the conversation did not finish within 500 turns");
}

// ---------------------------------------------------------------------------
// 1. A whole questionnaire, answered by talking.
// ---------------------------------------------------------------------------

test("a cooperative conversation completes and produces a valid submission", () => {
  const { app, session } = freshSession();
  const asked = runToCompletion(session, cooperativeReply);

  assert.equal(session.isComplete(), true, "the session did not finish");
  assert(asked.every((turn) => turn.status === "answered"), "a cooperative reply was not accepted");

  // Not a fixed count: answering the first option of everything produces a
  // male respondent reporting no symptoms, so most of the 41 conditional
  // questions correctly never come up. What has to hold is that the
  // conversation asked exactly the questions that ended up applying -- no
  // question asked and then discarded, none applicable and never asked.
  const progress = session.progress();
  assert.equal(asked.length, progress.applicable, "asked and applicable disagree");
  assert.equal(progress.remaining, 0);
  assert(asked.length > 40, `only ${asked.length} questions were asked`);
  assert.equal(new Set(asked.map((turn) => turn.id)).size, asked.length, "a question was asked twice");

  const submission = app.storeSubmissionForIntegration();
  assert.doesNotThrow(() => app.validateSubmissionBeforeSend(submission));

  // Every canonical question accounted for, with nothing left in between.
  const statuses = new Set(submission.answer_code_rows.map((row) => row.status));
  for (const status of statuses) {
    assert(
      ["answered", "unknown", "not_applicable"].includes(status),
      `unexpected status ${status}`
    );
  }
  assert.equal(
    submission.answer_code_rows.length,
    app.canonicalAnswerQuestions.length,
    "the submission is missing canonical questions"
  );
});

test("nothing reaches the answer store that is not one of the question's own options", () => {
  const { app, session } = freshSession();
  runToCompletion(session, cooperativeReply);

  for (const question of app.questions) {
    if (!question.field) continue;
    const entry = app.answers[question.field];
    if (!entry || !Array.isArray(question.options)) continue;
    if (entry.source === intake.UNCERTAIN_SOURCE) continue;
    const values = Array.isArray(entry.value) ? entry.value : [entry.value];
    for (const value of values) {
      assert(
        question.options.includes(value),
        `${question.id} holds ${JSON.stringify(value)}, which is not one of its options`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. When we cannot understand them.
// ---------------------------------------------------------------------------

test("re-asking is bounded, and the question is recorded as unknown rather than looped", () => {
  const { app, session } = freshSession({ maxAttempts: 2 });

  // Walk to a question that is allowed to degrade, answering everything else.
  let target = null;
  for (let step = 0; step < 500 && !target; step += 1) {
    const turn = session.next();
    if (turn.done) break;
    if (turn.canDegrade && turn.question.type === "single") target = turn.question;
    else session.receive(cooperativeReply(turn.question));
  }
  assert(target, "no degradable single-choice question was reached");

  const first = session.receive("這句話不是任何一個選項");
  assert.equal(first.status, "unmatched");
  assert.equal(first.attempts, 1);
  assert.equal(session.next().kind, "retry", "the second ask was not marked as a retry");
  assert.equal(session.currentQuestion, target, "the session moved on after one failure");

  const second = session.receive("這句話也不是");
  assert.equal(second.status, "gave_up");
  assert.equal(second.attempts, 2);

  // Recorded honestly and left behind.
  assert.equal(app.answers[target.field].source, intake.UNCERTAIN_SOURCE);
  assert.notEqual(session.next().question, target, "the session asked the same question a third time");
});

test("an ambiguity is offered back rather than repeated", () => {
  const app = loadApp();
  const synthetic = {
    id: "synthetic",
    type: "single",
    field: "synthetic.field",
    title: "合成題",
    options: ["每週 3 次", "每週3次"]
  };
  app.questions.unshift(synthetic);
  const session = createChatSession({ app });

  assert.equal(session.next().question, synthetic);
  const result = session.receive("每週3 次");
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.pending.candidates, ["每週 3 次", "每週3次"]);

  const turn = session.next();
  assert.equal(turn.kind, "disambiguate");
  assert.deepEqual(turn.pending.candidates, ["每週 3 次", "每週3次"]);
});

// ---------------------------------------------------------------------------
// 3. When they tell us they do not know.
// ---------------------------------------------------------------------------

test("a decline is accepted the first time and not asked again", () => {
  const { app, session } = freshSession();

  let target = null;
  for (let step = 0; step < 500 && !target; step += 1) {
    const turn = session.next();
    if (turn.done) break;
    const question = turn.question;
    const degradable = turn.canDegrade && question.type === "single";
    if (degradable && Array.isArray(question.options) && !question.options.includes("不確定")) {
      target = question;
    } else {
      session.receive(cooperativeReply(question));
    }
  }
  assert(target, "no degradable question without its own unknown option was reached");

  const result = session.receive("不知道");
  assert.equal(result.status, "declined");
  assert.equal(app.answers[target.field].source, intake.UNCERTAIN_SOURCE);
  // Not a retry: the person answered, we just did not get a value out of it.
  assert.notEqual(session.next().question, target);
});

// ---------------------------------------------------------------------------
// 4. The three that cannot be skipped.
// ---------------------------------------------------------------------------

test("consent, name and email block the conversation instead of degrading", () => {
  const { app, session } = freshSession({ maxAttempts: 2 });
  const first = session.next();
  assert.equal(first.question.id, "consent_acknowledgement");
  assert.equal(first.canDegrade, false);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = session.receive("這不是同意");
    assert.equal(result.status, "blocked", `attempt ${attempt} was not blocked`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(app.answers, first.question.field),
      false,
      "something was written for a blocked question"
    );
    assert.equal(session.next().question, first.question, "the session moved past consent");
  }

  // And it accepts a real answer afterwards, rather than staying stuck.
  session.receive([...first.question.options]);
  assert.notEqual(session.next().question, first.question);
});

test("a decline does not get someone past consent either", () => {
  const { app, session } = freshSession();
  const consent = session.next().question;
  const result = session.receive("不想說");
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "cannot_decline");
  assert.equal(Object.prototype.hasOwnProperty.call(app.answers, consent.field), false);
});

// ---------------------------------------------------------------------------
// 5. Which questions apply.
// ---------------------------------------------------------------------------

test("a conditional question is not asked until its condition holds", () => {
  const femaleOnly = loadApp().questions.find(
    (question) => question.id === "mastalgia"
  );
  assert(femaleOnly, "the female-only follow-up is missing from the questionnaire");

  const male = freshSession();
  runToCompletion(male.session, (question) =>
    question.id === "sex" ? "男性" : cooperativeReply(question)
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(male.app.answers, femaleOnly.field),
    false,
    "a female-only question was asked of a male respondent"
  );

  const female = freshSession();
  const askedOfFemale = runToCompletion(female.session, (question) =>
    question.id === "sex" ? "女性" : cooperativeReply(question)
  );
  assert(
    askedOfFemale.some((turn) => turn.id === "mastalgia"),
    "the female-only question was never asked of a female respondent"
  );
});

test("an unevaluatable condition asks the question rather than skipping it", () => {
  const app = loadApp();
  const exploding = {
    id: "exploding",
    type: "single",
    field: "exploding.field",
    title: "條件會爆炸的題目",
    options: ["是", "否"],
    appliesIf: () => { throw new Error("cannot evaluate"); }
  };
  app.questions.unshift(exploding);
  const session = createChatSession({ app });
  assert.equal(session.next().question, exploding);
});

// ---------------------------------------------------------------------------
// 6. Progress.
// ---------------------------------------------------------------------------

test("progress counts against what currently applies, and reaches zero remaining", () => {
  const { session } = freshSession();
  const start = session.progress();
  assert.equal(start.answered, 0);
  assert(start.applicable > 0);

  let previous = 0;
  runToCompletion(session, (question) => {
    const now = session.progress();
    assert(now.answered >= previous, "progress went backwards");
    previous = now.answered;
    return cooperativeReply(question);
  });

  const end = session.progress();
  assert.equal(end.remaining, 0);
  assert.equal(end.unknown, 0, "a cooperative conversation produced unknown answers");
  assert.equal(session.isComplete(), true);
});

test("progress reports how many answers are unknown rather than hiding them", () => {
  const { session } = freshSession({ maxAttempts: 1 });
  runToCompletion(session, (question, turn) =>
    turn.canDegrade ? "完全無法解析的一句話" : cooperativeReply(question)
  );
  const end = session.progress();
  assert(end.unknown > 0, "nothing was recorded as unknown");
  assert.equal(end.remaining, 0);
});

// ---------------------------------------------------------------------------
// 7. A reply is never attributed to the wrong question.
// ---------------------------------------------------------------------------

test("receive() before next() answers the question that next() would have asked", () => {
  const { app, session } = freshSession();
  const result = session.receive([...app.questions[0].options]);
  assert.equal(result.status, "answered");
  assert.equal(result.question.id, "consent_acknowledgement");
});

test("a classifier is consulted for a reply the rules cannot resolve", () => {
  const seen = [];
  const { session } = freshSession({
    classifier: (question) => {
      seen.push(question.id);
      return question.type === "multi" ? [0] : 0;
    }
  });

  // Walk to a question that has options for a classifier to choose between --
  // free-text and number questions have none, and the session does not escalate
  // what a model would have nothing to pick from.
  let target = null;
  for (let step = 0; step < 500 && !target; step += 1) {
    const turn = session.next();
    if (turn.done) break;
    if (turn.canDegrade && Array.isArray(turn.options) && turn.options.length > 0) target = turn.question;
    else session.receive(cooperativeReply(turn.question));
  }
  assert(target, "no question with options was reached");

  const result = session.receive("完全無法用規則解析的一句話");
  assert.equal(result.status, "answered");
  assert.equal(result.via, "classifier");
  assert.deepEqual(seen, [target.id]);
  // Whatever the model said, what was stored is the question's own option.
  assert.equal(
    Array.isArray(result.value) ? result.value[0] : result.value,
    target.options[0]
  );
});
