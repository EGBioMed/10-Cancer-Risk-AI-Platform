const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const resolver = require("./answer-resolver");
const intake = require("./answer-intake");

// The resolver turns an utterance into an index; answer-intake.js refuses
// anything that is not an exact option. The two only work as a pair, so the
// test that matters most here is not about any single rule -- it is that
// everything the resolver is willing to call a match is something the intake
// is willing to write. If that ever stops holding, one of the two has drifted,
// and the symptom in production would be answers quietly becoming "unknown"
// (at best) for reasons no one can see from either file alone.

const app = loadApp();

const withOptions = app.questions.filter(
  (question) => question.field && Array.isArray(question.options) && question.options.length > 0
);

const yesNoQuestions = withOptions.filter(
  (question) => question.options.includes("是") && question.options.includes("否")
);

const symptomGroup = app.questions.find(
  (question) => question.field && question.isSymptomGroup && (question.options || []).length >= 2
);

function spokenVariants(option) {
  return [
    option,
    ` ${option} `,
    `${option}。`,
    option.replace(/\s+/g, ""),
    option.replace(/（/g, "(").replace(/）/g, ")"),
    `「${option}」`
  ];
}

// A variant that normalises onto a different option is a different answer, and
// one that collides with a sibling is correctly refused as ambiguous. Neither
// is a resolver defect, so neither belongs in the "must match" set.
function isUnambiguous(question, variant, expectedIndex) {
  const key = resolver.normalizeText(variant);
  const hits = question.options
    .map((option, index) => (resolver.normalizeText(option) === key ? index : -1))
    .filter((index) => index >= 0);
  return hits.length === 1 && hits[0] === expectedIndex;
}

// ---------------------------------------------------------------------------
// 1. The pair holds: a match is always writable.
// ---------------------------------------------------------------------------

test("everything the resolver matches, the intake accepts", () => {
  let checked = 0;
  for (const question of withOptions) {
    question.options.forEach((option, index) => {
      for (const variant of spokenVariants(option)) {
        if (!isUnambiguous(question, variant, index)) continue;
        const input = question.type === "multi" ? [variant] : variant;
        const resolution = resolver.resolve(question, input);
        if (resolution.status !== "matched") continue;

        const written = intake.resolve(question, resolution.value);
        // The invariant is about the near-miss class specifically: the
        // resolver must never hand over a string the intake refuses for not
        // being one of the question's options. An intake rule about the
        // answer as a whole -- consent needing all three items -- is policy the
        // resolver has no business knowing, and refusing for that reason is
        // correct on both sides. Naming the permitted reasons keeps the test
        // load-bearing: a new string-matching failure still fails it.
        const STRING_REASONS = ["unresolved", "wrong_shape", "empty"];
        assert.equal(
          written.status === "answered" || !STRING_REASONS.includes(written.reason),
          true,
          `${question.id}: resolver matched ${JSON.stringify(variant)} and the intake refused it as ${written.reason}`
        );
        if (written.status !== "answered") continue;
        checked += 1;
      }
    });
  }
  assert(checked > 500, `only ${checked} resolver/intake pairs were exercised`);
});

test("a matched value is read out of the question, never built from the utterance", () => {
  const question = withOptions.find((candidate) => candidate.type === "single");
  const resolution = resolver.resolve(question, ` ${question.options[1]} 。`);
  assert.equal(resolution.status, "matched");
  // Identity, not equality: the resolver returned the question's own string.
  assert.equal(resolution.value, question.options[1]);
  assert.equal(resolution.value === question.options[1], true);
});

// ---------------------------------------------------------------------------
// 2. Saying the option back, however it is typed.
// ---------------------------------------------------------------------------

test("every option resolves to itself when said verbatim", () => {
  for (const question of withOptions) {
    question.options.forEach((option, index) => {
      if (!isUnambiguous(question, option, index)) return;
      const input = question.type === "multi" ? [option] : option;
      const resolution = resolver.resolve(question, input);
      assert.equal(resolution.status, "matched", `${question.id} could not match its own ${JSON.stringify(option)}`);
      if (question.type !== "multi") assert.equal(resolution.via, "exact");
    });
  }
});

test("spacing and half-width punctuation do not change the answer", () => {
  const question = withOptions.find((candidate) =>
    candidate.type === "single" && candidate.options.some((option) => /\s|（/.test(option))
  );
  assert(question, "no question has an option with a space or a full-width bracket");
  const option = question.options.find((candidate) => /\s|（/.test(candidate));
  const retyped = option.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
  if (retyped === option) return;

  const resolution = resolver.resolve(question, retyped);
  assert.equal(resolution.status, "matched");
  assert.equal(resolution.value, option);
  assert.equal(resolution.via, "normalized");
});

test("two options that normalise alike are ambiguous, not a coin toss", () => {
  const question = {
    id: "synthetic",
    type: "single",
    field: "synthetic.field",
    options: ["每週 3 次", "每週3次"]
  };
  const resolution = resolver.resolve(question, "每週3 次");
  assert.equal(resolution.status, "ambiguous");
  assert.deepEqual(resolution.indices, [0, 1]);
  assert.equal(resolution.value, null);
});

// ---------------------------------------------------------------------------
// 3. Yes, no, and not knowing.
// ---------------------------------------------------------------------------

test("yes/no is understood by its synonyms, through the question's own options", () => {
  assert(yesNoQuestions.length > 0, "the questionnaire has no yes/no question");
  const question = yesNoQuestions[0];
  for (const utterance of ["對", "沒錯", "有", "yes", "Y"]) {
    const resolution = resolver.resolve(question, utterance);
    assert.equal(resolution.status, "matched", `${utterance} did not resolve`);
    assert.equal(resolution.value, "是");
  }
  for (const utterance of ["不是", "沒有", "no"]) {
    const resolution = resolver.resolve(question, utterance);
    assert.equal(resolution.status, "matched", `${utterance} did not resolve`);
    assert.equal(resolution.value, "否");
  }
});

test("a yes/no synonym is not forced onto a question that has no such option", () => {
  const question = withOptions.find(
    (candidate) => candidate.type === "single" && !candidate.options.includes("是")
  );
  const resolution = resolver.resolve(question, "對");
  assert.notEqual(resolution.status, "matched");
});

test("not knowing picks the question's own unknown option when it has one", () => {
  // 11 of the yes/no questions offer 是/否, and 5 of those also offer 不確定.
  // Where the option exists, "不知道" belongs in it: that records a real answer
  // code the question defines, which is more than the uncertain marker says.
  const withUnknown = yesNoQuestions.find((question) => question.options.includes("不確定"));
  assert(withUnknown, "no yes/no question offers 不確定");
  for (const utterance of ["不知道", "忘了", "不想說"]) {
    const resolution = resolver.resolve(withUnknown, utterance);
    assert.equal(resolution.status, "matched", `${utterance} did not reach the unknown option`);
    assert.equal(resolution.value, "不確定");
  }
});

test("not knowing is told apart from not being understood", () => {
  const withoutUnknown = yesNoQuestions.find((question) => !question.options.includes("不確定"));
  assert(withoutUnknown, "every yes/no question offers 不確定");

  // Nothing to select, so the person's "I don't know" is carried as a decline
  // rather than discarded -- the caller can stop asking.
  for (const utterance of ["不知道", "忘了", "不想說"]) {
    const resolution = resolver.resolve(withoutUnknown, utterance);
    assert.equal(resolution.status, "declined", `${utterance} should be a decline`);
  }

  // Us failing to understand them is a different thing, and worth asking again.
  const confusion = resolver.resolve(withoutUnknown, "我最近胃不太舒服");
  assert.equal(confusion.status, "unmatched");
});

// ---------------------------------------------------------------------------
// 4. Numbers.
// ---------------------------------------------------------------------------

test("a number is read out of a sentence, but only when there is exactly one", () => {
  const question = app.questions.find((candidate) => candidate.type === "number" && candidate.field);
  assert.equal(resolver.resolve(question, "大概 165 公分").value, "165");
  assert.equal(resolver.resolve(question, "１６５").value, "165");
  assert.equal(resolver.resolve(question, 165).value, "165");
  // "165 公分 60 公斤" answers two questions; taking the first would file the
  // height as the weight and nothing would look wrong.
  assert.equal(resolver.resolve(question, "165 公分 60 公斤").status, "ambiguous");
  assert.equal(resolver.resolve(question, "十八").status, "unmatched");
  assert.equal(resolver.resolve(question, "不記得").status, "declined");
});

// ---------------------------------------------------------------------------
// 5. Multi answers.
// ---------------------------------------------------------------------------

test("a multi answer is all or nothing", () => {
  const [first, second] = symptomGroup.options;
  const good = resolver.resolve(symptomGroup, [first, second]);
  assert.equal(good.status, "matched");
  assert.deepEqual(good.value, [first, second]);

  const partial = resolver.resolve(symptomGroup, [first, "胃部悶悶的"]);
  assert.equal(partial.status, "unmatched");
  assert.deepEqual(partial.detail, ["胃部悶悶的"]);
  assert.equal(partial.value, null);
});

test("a single utterance that is itself an option works on a multi question", () => {
  assert(symptomGroup.noneOption, "the symptom group has no none option");
  const resolution = resolver.resolve(symptomGroup, symptomGroup.noneOption);
  assert.equal(resolution.status, "matched");
  assert.deepEqual(resolution.value, [symptomGroup.noneOption]);
});

test("the same option mentioned twice is selected once", () => {
  const option = symptomGroup.options[0];
  const resolution = resolver.resolve(symptomGroup, [option, option]);
  assert.deepEqual(resolution.value, [option]);
});

// ---------------------------------------------------------------------------
// 6. The escalation seam: a model may choose, it may not write.
// ---------------------------------------------------------------------------

test("a classifier is consulted only for what the rules could not resolve", () => {
  const question = yesNoQuestions[0];
  const calls = [];
  const classifier = (_, utterance) => { calls.push(utterance); return 0; };

  resolver.resolve(question, "是", { classifier });
  assert.deepEqual(calls, [], "the classifier was consulted for an exact match");

  // A decline has to come from a question with no unknown option of its own,
  // or "不知道" resolves to that option and never reaches the decline branch --
  // which is how an earlier version of this test passed while leaving the
  // branch untested.
  const withoutUnknown = yesNoQuestions.find((candidate) => !candidate.options.includes("不確定"));
  assert(withoutUnknown, "every yes/no question offers 不確定");
  const declined = resolver.resolve(withoutUnknown, "不知道", { classifier });
  assert.equal(declined.status, "declined");
  assert.deepEqual(calls, [], "the classifier was consulted for a decline");

  // Nor for an ambiguity: asking a model to break a tie between two readings
  // the rules found equally defensible is how a coin toss becomes data.
  const ambiguousQuestion = { id: "synthetic", type: "single", field: "s.f", options: ["每週 3 次", "每週3次"] };
  const tie = resolver.resolve(ambiguousQuestion, "每週3 次", { classifier });
  assert.equal(tie.status, "ambiguous");
  assert.deepEqual(calls, [], "the classifier was consulted to break a tie");

  const escalated = resolver.resolve(question, "我想想…應該算有吧", { classifier });
  assert.equal(calls.length, 1);
  assert.equal(escalated.status, "matched");
  assert.equal(escalated.via, "classifier");
  assert.equal(escalated.value, question.options[0]);
});

test("a classifier that returns anything but an index is ignored", () => {
  const question = yesNoQuestions[0];
  const rubbish = ["是", "yes", null, undefined, 1.5, -1, 99, {}, [], "0", true];
  for (const verdict of rubbish) {
    const resolution = resolver.resolve(question, "難說", { classifier: () => verdict });
    assert.equal(
      resolution.status,
      "unmatched",
      `a classifier returning ${JSON.stringify(verdict)} was allowed through`
    );
  }
});

test("a classifier cannot put a string of its own into the answer store", () => {
  const question = yesNoQuestions[0];
  const answers = {};
  // The failure this forecloses: a model answering with prose that is almost
  // one of the options. It is discarded at the seam, so the intake never even
  // sees it, and the question comes back as unknown rather than as a guess.
  const resolution = resolver.resolve(question, "難說", {
    classifier: () => "是 " // a near miss, confidently produced
  });
  assert.equal(resolution.status, "unmatched");

  const written = intake.write(answers, question, resolution.value, {
    makeAnswerEntry: app.makeAnswerEntry,
    source: "chat"
  });
  assert.equal(written.status, "unknown");
  assert.equal(answers[question.field].source, "uncertain");
});

test("a classifier that throws does not take the conversation down with it", () => {
  const question = yesNoQuestions[0];
  const resolution = resolver.resolve(question, "難說", {
    classifier: () => { throw new Error("model unavailable"); }
  });
  assert.equal(resolution.status, "unmatched");
  assert.equal(resolution.via, "classifier_threw");
});

test("a classifier may select several options on a multi question", () => {
  const resolution = resolver.resolve(symptomGroup, "最近腫塊跟疼痛都有", {
    classifier: () => [0, 1, 0]
  });
  assert.equal(resolution.status, "matched");
  assert.deepEqual(resolution.value, [symptomGroup.options[0], symptomGroup.options[1]]);
});

// ---------------------------------------------------------------------------
// 8. A number the form would have refused.
// ---------------------------------------------------------------------------

test("a number outside the question's range is unresolved, not accepted", () => {
  const question = app.questions.find((candidate) => candidate.id === "birth_year");
  const numberBounds = app.getNumberBounds;
  assert(typeof numberBounds === "function", "app.js no longer exposes getNumberBounds");

  // 民國69年次 is an ordinary way to give a birth year in Taiwan. It holds
  // exactly one number, so every rule in resolveNumber is satisfied, and before
  // the bounds were applied it was accepted as the western year 69 -- a
  // fabricated value rather than an unresolved one. Found by walking the chat
  // page by hand, not by a test.
  const fabricated = resolver.resolve(question, "民國69年次", { numberBounds });
  assert.equal(fabricated.status, "unmatched");
  assert.equal(fabricated.via, "out_of_range");

  assert.equal(resolver.resolve(question, "1980", { numberBounds }).value, "1980");
  assert.equal(resolver.resolve(question, "2500", { numberBounds }).status, "unmatched");

  // Without the bounds it is still accepted: the check is the injection doing
  // the work, not something that happens to pass for another reason.
  assert.equal(resolver.resolve(question, "民國69年次").status, "matched");
});

test("a question with no declared bounds is unaffected", () => {
  const counted = app.questions.find(
    (candidate) => candidate.type === "number" && !app.getNumberBounds(candidate)
  );
  if (!counted) return;
  assert.equal(resolver.resolve(counted, "3", { numberBounds: app.getNumberBounds }).value, "3");
});

test("bounds that throw do not block an answer", () => {
  const question = app.questions.find((candidate) => candidate.id === "height_cm");
  const result = resolver.resolve(question, "165", {
    numberBounds: () => { throw new Error("no"); }
  });
  assert.equal(result.status, "matched", "a broken bounds function must not refuse every number");
});
