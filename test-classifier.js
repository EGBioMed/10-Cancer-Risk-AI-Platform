const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
const classifier = require("./lib/classifier");
const resolver = require("./answer-resolver");
const intake = require("./answer-intake");
const { createChatSession } = require("./chat-session");
const evalRunner = require("./eval-classifier");

// Nothing here touches the network. The model's accuracy is measured by
// eval-classifier.js, which costs money and needs a key; what is checked here
// is everything that has to hold whatever the model says -- the request only
// permits an index, the response is read safely, and the eval set is a ruler
// that still fits the questionnaire.

const app = loadApp();
const questionById = (id) => app.questions.find((question) => question.id === id);

// ---------------------------------------------------------------------------
// 1. The request can only come back as an index.
// ---------------------------------------------------------------------------

test("the schema enumerates exactly this question's indices", () => {
  const question = questionById("exercise_time");
  const schema = classifier.buildSchema(question);
  assert.deepEqual(schema.properties.indices.items.enum, [0, 1, 2, 3]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["indices"]);
});

test("a single-choice question cannot be answered with two indices", () => {
  assert.equal(classifier.buildSchema(questionById("sex")).properties.indices.maxItems, 1);
  const multi = questionById("chronic_conditions");
  assert.equal(classifier.buildSchema(multi).properties.indices.maxItems, multi.options.length);
});

test("every question with options can be given a schema", () => {
  let built = 0;
  for (const question of app.questions) {
    if (!Array.isArray(question.options) || question.options.length === 0) continue;
    const schema = classifier.buildSchema(question);
    assert.equal(schema.properties.indices.items.enum.length, question.options.length);
    built += 1;
  }
  assert(built > 60, `only ${built} questions produced a schema`);
});

test("a question with no options is refused rather than sent", () => {
  assert.throws(() => classifier.buildSchema({ id: "blank", options: [] }), /no options/);
});

test("the request carries the structured-output format and a low effort", () => {
  const request = classifier.buildRequest(questionById("sex"), "男的");
  assert.equal(request.output_config.format.type, "json_schema");
  assert.equal(request.output_config.effort, "low");
  assert.equal(request.model, "claude-opus-5-5");
  assert.equal(request.max_tokens, 256);
});

test("the prompt shows the options with the indices the answer is given in", () => {
  const question = questionById("exercise_time");
  const prompt = classifier.buildUserPrompt(question, "每天走路半小時");
  question.options.forEach((option, index) => {
    assert(prompt.includes(`${index}. ${option}`), `option ${index} is missing from the prompt`);
  });
  assert(prompt.includes("每天走路半小時"));
  assert(prompt.includes("單選"));
  assert(classifier.buildUserPrompt(questionById("chronic_conditions"), "x").includes("複選"));
});

test("the instructions tell the model that abstaining is a right answer", () => {
  assert(classifier.SYSTEM_PROMPT.includes("空清單"), "abstention is not described");
  assert(classifier.SYSTEM_PROMPT.includes("只能回傳選項編號"), "the index-only rule is missing");
});

// ---------------------------------------------------------------------------
// 2. Reading the reply: every unusable shape becomes an abstention.
// ---------------------------------------------------------------------------

test("a usable verdict is read, and everything else abstains", () => {
  const single = questionById("sex");
  const multi = questionById("chronic_conditions");

  assert.equal(classifier.parseVerdict(single, { indices: [1] }), 1);
  assert.deepEqual(classifier.parseVerdict(multi, { indices: [0, 1] }), [0, 1]);
  assert.deepEqual(classifier.parseVerdict(multi, { indices: [2, 2] }), [2]);

  for (const parsed of [
    null,
    undefined,
    {},
    { indices: null },
    { indices: "0" },
    { indices: [] },
    { indices: [0.5] },
    { indices: [-1] },
    { indices: [99] },
    { indices: ["0"] },
    { indices: [0, 99] }
  ]) {
    assert.equal(
      classifier.parseVerdict(single, parsed),
      null,
      `${JSON.stringify(parsed)} was not read as an abstention`
    );
  }

  // Two indices on a single-choice question means the schema was not applied.
  // Taking the first would be a guess dressed as an answer.
  assert.equal(classifier.parseVerdict(single, { indices: [0, 1] }), null);
});

test("a refusal is read as an abstention even when content came back with it", async () => {
  // The stub answers with a perfectly usable index alongside the refusal. A
  // version of this test where parsed_output was null passed whether or not
  // the refusal was handled at all, because an unparseable reply abstains
  // anyway -- it proved nothing. A refusal is a declined request, so whatever
  // arrived with it is not an answer to the question we asked.
  const classify = classifier.createAnthropicClassifier({
    client: {
      messages: {
        parse: async () => ({ stop_reason: "refusal", parsed_output: { indices: [0] } })
      }
    }
  });
  assert.equal(await classify(questionById("sex"), "男的"), null);
});

test("usage is reported so a run can be priced", async () => {
  const seen = [];
  const classify = classifier.createAnthropicClassifier({
    client: {
      messages: {
        parse: async () => ({
          usage: { input_tokens: 400, output_tokens: 12 },
          model: "claude-opus-5-5",
          parsed_output: { indices: [0] }
        })
      }
    },
    onUsage: (usage) => seen.push(usage)
  });
  assert.equal(await classify(questionById("sex"), "男的"), 0);
  assert.deepEqual(seen, [{ input_tokens: 400, output_tokens: 12 }]);

  const cost = classifier.priceOf("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 1e6 });
  assert.equal(cost, 24);
  assert.equal(classifier.priceOf("not-a-model", { input_tokens: 1 }), null);
});

// ---------------------------------------------------------------------------
// 3. End to end, with the model stubbed: a verdict still cannot write prose.
// ---------------------------------------------------------------------------

test("an async classifier reaches the resolver and only an index gets through", async () => {
  const question = questionById("exercise_time");

  const good = await resolver.resolveAsync(question, "有空就會去走走", {
    classifier: async () => 2
  });
  assert.equal(good.status, "matched");
  assert.equal(good.value, question.options[2]);
  assert.equal(good.via, "classifier");

  for (const verdict of ["1-2 小時", "1-2 小時 ", null, 99, [0], {}]) {
    const bad = await resolver.resolveAsync(question, "有空就會去走走", {
      classifier: async () => verdict
    });
    assert.equal(bad.status, "unmatched", `${JSON.stringify(verdict)} got through the async seam`);
  }
});

test("an async classifier that rejects does not take the conversation down", async () => {
  const session = createChatSession({
    app: loadApp(),
    classifier: async () => { throw new Error("model unavailable"); }
  });
  const consent = session.next().question;
  const result = await session.receiveAsync([...consent.options]);
  assert.equal(result.status, "answered", "a resolvable reply should not have needed the model");

  // And on a reply the rules cannot resolve, the failure degrades rather than throws.
  let turn = session.next();
  while (!turn.done && !(turn.canDegrade && Array.isArray(turn.options) && turn.options.length > 0)) {
    await session.receiveAsync(turn.question.options ? turn.question.options[0] : "1");
    turn = session.next();
  }
  const degraded = await session.receiveAsync("完全無法用規則解析的一句話");
  assert.equal(degraded.status, "unmatched");
});

// ---------------------------------------------------------------------------
// 4. The eval set is a ruler, and it has to still fit.
// ---------------------------------------------------------------------------

test("every eval case names a real question and a real option", () => {
  const { cases } = evalRunner.loadCases();
  assert(cases.length >= 40, `the eval set has only ${cases.length} cases`);
  assert.deepEqual(evalRunner.validateCases(cases, app.questions), []);
});

test("no eval case is one the rules already answer", () => {
  // A case the rules resolve never reaches the model. Scoring it would measure
  // answer-resolver.js and print the number under the model's name.
  const { cases } = evalRunner.loadCases();
  assert.deepEqual(evalRunner.casesTheRulesAlreadyAnswer(cases, app.questions), []);
});

test("the eval set covers both answering and abstaining, and says why for each", () => {
  const { cases } = evalRunner.loadCases();
  const abstain = cases.filter((item) => item.expect.length === 0);
  const answer = cases.filter((item) => item.expect.length > 0);
  // Without abstention cases the eval rewards guessing, which is the single
  // behaviour this classifier most needs not to have.
  assert(abstain.length >= 8, `only ${abstain.length} abstention cases`);
  assert(answer.length >= 25, `only ${answer.length} answerable cases`);
  for (const item of cases) {
    // The reason, not its length: a label nobody can check is a label nobody
    // can correct, and a terse "明確否認" checks fine.
    assert(item.why && item.why.trim(), `${item.id} has no stated reason for its label`);
    assert(item.kind, `${item.id} has no kind`);
    assert(item.utterance && item.utterance.trim(), `${item.id} has no utterance`);
  }
});

test("expected indices really are what the labels say they are", () => {
  // Spot-checks that the label text matches the option it points at, so a
  // renumbered questionnaire cannot silently turn a correct label into a wrong
  // one that still validates.
  const expectations = [
    ["chronic-hepb", "chronic_conditions", "肝病"],
    ["chronic-none", "chronic_conditions", "以上皆無"],
    ["sym-upper-heartburn", "symptoms_upper_digestive", "灼熱感"],
    ["band-cant-recall", "symptom_hn_lump_duration_band", "不確定"],
    ["sex-male", "sex", "男性"]
  ];
  const { cases } = evalRunner.loadCases();
  for (const [caseId, questionId, fragment] of expectations) {
    const item = cases.find((candidate) => candidate.id === caseId);
    assert(item, `eval case ${caseId} is missing`);
    const question = questionById(questionId);
    const labels = item.expect.map((index) => question.options[index]).join(" ");
    assert(labels.includes(fragment), `${caseId} points at ${JSON.stringify(labels)}, not ${fragment}`);
  }
});

test("the intake would accept every label the eval expects", () => {
  // The eval's own answers have to be writable, or a model scoring 100% would
  // still produce nothing.
  const { cases } = evalRunner.loadCases();
  for (const item of cases) {
    if (item.expect.length === 0) continue;
    const question = questionById(item.question_id);
    const value = question.type === "multi"
      ? item.expect.map((index) => question.options[index])
      : question.options[item.expect[0]];
    assert.equal(
      intake.resolve(question, value).status,
      "answered",
      `${item.id}'s expected answer would be refused by the intake`
    );
  }
});
