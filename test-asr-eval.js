const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadApp } = require("./lib/load-app-sandbox");
const scoring = require("./lib/asr-eval");
const adapters = require("./lib/asr-adapters");
const { loadManifest, scoreOne, createUsageTally, addUsage, usageLines } = require("./eval-asr");
const classifierModule = require("./lib/classifier");

const app = loadApp();
const question = (id) => app.questions.find((candidate) => candidate.id === id);

test("the example manifest stays valid against the live questionnaire", () => {
  // A questionnaire edit that renames a question or drops an option should
  // break this here, in CI, not in front of someone holding fifty recordings.
  const manifest = loadManifest(path.join(__dirname, "eval", "asr", "manifest.example.json"));
  assert.deepEqual(scoring.validateRecordings(manifest.recordings, app.questions), []);
});

test("validateRecordings refuses a broken ruler", () => {
  const problems = scoring.validateRecordings([
    { id: "a", audio: "a.wav", question_id: "no_such_question", expect: [0], language: "zh" },
    { id: "b", audio: "b.wav", question_id: "smoking_ever", expect: [5], language: "zh" },
    { id: "c", audio: "c.wav", question_id: "smoking_ever", expect: [0, 1], language: "zh" },
    { id: "d", audio: "d.wav", question_id: "height_cm", expect: [0], language: "zh" },
    { id: "e", audio: "e.wav", question_id: "smoking_ever", expect: [0], language: "klingon" },
    { id: "e", audio: "e.wav", question_id: "smoking_ever", expect: [0], language: "zh" }
  ], app.questions);
  assert.equal(problems.length, 6);
  assert.match(problems.join("\n"), /no question named no_such_question/);
  assert.match(problems.join("\n"), /index 5 is outside smoking_ever/);
  assert.match(problems.join("\n"), /single-choice but expects 2/);
  assert.match(problems.join("\n"), /needs expect_number/);
  assert.match(problems.join("\n"), /language must be one of/);
  assert.match(problems.join("\n"), /duplicate id/);
});

test("verdicts: only a wrong answer or a guess where abstaining was right is harmful", () => {
  const q = question("smoking_ever");
  const item = { expect: [0] };
  const blank = { expect: [] };
  assert.equal(scoring.verdictFor(item, q, { kind: "indices", indices: [0] }), "correct");
  assert.equal(scoring.verdictFor(item, q, { kind: "indices", indices: [1] }), "wrong");
  assert.equal(scoring.verdictFor(item, q, { kind: "abstain" }), "abstained_wrong");
  assert.equal(scoring.verdictFor(blank, q, { kind: "abstain" }), "abstained_right");
  assert.equal(scoring.verdictFor(blank, q, { kind: "indices", indices: [1] }), "overconfident");

  const h = question("height_cm");
  assert.equal(scoring.verdictFor({ expect_number: 165 }, h, { kind: "number", value: 165 }), "correct");
  assert.equal(scoring.verdictFor({ expect_number: 165 }, h, { kind: "number", value: 156 }), "wrong");
  assert.equal(scoring.verdictFor({ expect_number: null }, h, { kind: "number", value: 165 }), "overconfident");
});

test("CER ignores punctuation, spacing and full width, and counts real edits", () => {
  assert.equal(scoring.characterErrorRate("我沒有抽菸。", "我 沒有抽菸"), 0);
  assert.equal(scoring.characterErrorRate("ＡＢＣ", "abc"), 0);
  assert.equal(scoring.characterErrorRate("我沒有抽菸", "我有抽菸"), 1 / 5);
  assert.equal(scoring.characterErrorRate("", "anything"), null);
});

test("attribution separates what the ASR lost from what the resolver never could read", () => {
  assert.equal(scoring.attribute("correct", "wrong"), "asr_caused_harm");
  assert.equal(scoring.attribute("correct", "abstained_wrong"), "asr_caused_abstain");
  assert.equal(scoring.attribute("abstained_wrong", "abstained_wrong"), "resolver_limit");
  assert.equal(scoring.attribute("abstained_wrong", "correct"), "asr_luck");
  assert.equal(scoring.attribute("correct", "correct"), "fine");
  assert.equal(scoring.attribute(null, "correct"), "unattributed");
});

test("a run where everything failed reports no rate, not a perfect score", () => {
  const tally = scoring.emptyTally();
  scoring.addToTally(tally, { error: "down" });
  scoring.addToTally(tally, { error: "down" });
  const summary = scoring.summarize(tally);
  assert.equal(summary.scored, 0);
  assert.equal(summary.harmfulRate, null);
});

test("scoreOne runs a transcript through the chat page's resolver and attributes it", async () => {
  const item = {
    id: "x", question_id: "betel_nut", expect: [1], language: "zh", environment: "quiet",
    reference_text: "否"
  };
  const right = await scoreOne(app, item, { text: "否", latencyMs: 10 }, undefined);
  assert.equal(right.heard, "correct");
  assert.equal(right.attribution, "fine");
  assert.equal(right.cer, 0);

  const misheard = await scoreOne(app, item, { text: "是", latencyMs: 10 }, undefined);
  assert.equal(misheard.heard, "wrong");
  assert.equal(misheard.attribution, "asr_caused_harm");
});

test("scoreOne reports a classifier that threw as a failure, not as an abstention", async () => {
  const item = { id: "x", question_id: "betel_nut", expect: [1], language: "nan", environment: "quiet" };
  const broken = async () => { throw new Error("401 invalid x-api-key"); };
  await assert.rejects(scoreOne(app, item, { text: "無喔", latencyMs: 10 }, broken), /classifier failed: 401 invalid x-api-key/);
});

function stubResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

test("Taiwan Tongues adapter: login, create, poll until done, download TXT", async () => {
  const calls = [];
  const statuses = [13, 22, 3];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", auth: init.headers && init.headers.Authorization });
    if (url.endsWith("/api/v1/login")) return stubResponse(200, { code: 200, token: "jwt-1" });
    if (url.endsWith("/api/v1/subtitle/tasks")) return stubResponse(200, { code: 200, id: 42 });
    if (url.endsWith("/api/v1/subtitle/tasks/42")) return stubResponse(200, { code: 200, data: [{ status: statuses.shift(), progress: 50 }] });
    if (url.endsWith("/subtitle?type=TXT")) return stubResponse(200, "無啦，我無咧食檳榔。\n");
    return stubResponse(404, {});
  };
  const adapter = adapters.createTaiwanTonguesAdapter({
    baseUrl: "http://asr.test:5000/", username: "u", password: "p",
    fetch, readFile: async () => Buffer.from("RIFF"), sleep: async () => {}
  });

  const first = await adapter.transcribe({}, "s02/betel_nut.wav");
  assert.equal(first.text, "無啦，我無咧食檳榔。");
  assert.deepEqual(calls.map((c) => c.url.replace("http://asr.test:5000", "")), [
    "/api/v1/login",
    "/api/v1/subtitle/tasks",
    "/api/v1/subtitle/tasks/42",
    "/api/v1/subtitle/tasks/42",
    "/api/v1/subtitle/tasks/42",
    "/api/v1/subtitle/tasks/42/subtitle?type=TXT"
  ]);
  assert.ok(calls.slice(1).every((c) => c.auth === "Bearer jwt-1"));

  // The token is reused: a second recording does not log in again.
  statuses.push(3);
  calls.length = 0;
  await adapter.transcribe({}, "s02/height_cm.wav");
  assert.ok(!calls.some((c) => c.url.endsWith("/api/v1/login")));
});

test("Taiwan Tongues adapter: a failed task is an error, never an empty transcript", async () => {
  const fetch = async (url) => {
    if (url.endsWith("/api/v1/subtitle/tasks")) return stubResponse(200, { code: 200, id: 7 });
    if (url.endsWith("/api/v1/subtitle/tasks/7")) return stubResponse(200, { code: 200, data: [{ status: 4 }] });
    return stubResponse(404, {});
  };
  const adapter = adapters.createTaiwanTonguesAdapter({
    baseUrl: "http://asr.test", token: "t", fetch, readFile: async () => Buffer.from(""), sleep: async () => {}
  });
  await assert.rejects(adapter.transcribe({}, "a.wav"), /status 4/);
});

test("adapters refuse to run half-configured rather than guess", async () => {
  assert.throws(() => adapters.createAdapter("taiwan-tongues", {}), /TT_BASE_URL/);
  assert.throws(() => adapters.createAdapter("taiwan-tongues", { TT_BASE_URL: "http://x" }), /TT_TOKEN/);
  assert.throws(() => adapters.createAdapter("whisper", {}), /unknown ASR/);
  await assert.rejects(adapters.createAdapter("myvoca", {}).transcribe({}, "a.wav"), /API specification/);
  await assert.rejects(adapters.createAdapter("transcript", {}).transcribe({}), /reference_text/);
});

test("a run tallies every model call's tokens and prints what it cost", async () => {
  const tally = createUsageTally();
  // A fake client shaped like the SDK's: the tally is fed through the real
  // classifier's onUsage, not by calling addUsage directly.
  const client = {
    messages: {
      parse: async () => ({
        model: "claude-opus-5-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 600, output_tokens: 40 },
        parsed_output: { indices: [0] }
      })
    }
  };
  const classify = classifierModule.createAnthropicClassifier({
    client,
    onUsage: (usage, model) => addUsage(tally, usage, model)
  });
  await classify(question("sex"), "查某");
  await classify(question("sex"), "查某");
  assert.deepEqual(tally, { calls: 2, inputTokens: 1200, outputTokens: 80, model: "claude-opus-5-5" });

  const lines = usageLines(tally, classifierModule.DEFAULT_MODEL, classifierModule.priceOf).join("\n");
  assert.match(lines, /2 次/);
  assert.match(lines, /輸入 1200  輸出 80/);
  // 1200 × $4/M + 80 × $20/M = $0.0064
  assert.match(lines, /US\$0\.0064/);
});

test("a model missing from the price table says so instead of printing $0", () => {
  const tally = createUsageTally();
  addUsage(tally, { input_tokens: 10, output_tokens: 1 }, "claude-unknown-model");
  const lines = usageLines(tally, classifierModule.DEFAULT_MODEL, classifierModule.priceOf).join("\n");
  assert.match(lines, /不在 lib\/classifier\.js 的價目表裡/);
  assert.doesNotMatch(lines, /US\$0\.0000/);
});

test("a recording's asked wording reaches the classifier, and a malformed one is refused", async () => {
  const seen = [];
  const item = { id: "x", question_id: "sex", expect: [1], language: "nan", environment: "quiet", asked: "你是查某乎？" };
  const result = await scoreOne(app, item, { text: "著", latencyMs: null }, async (q, u, context) => { seen.push(context); return 1; });
  assert.equal(result.heard, "correct");
  assert.deepEqual(seen, [{ asked: "你是查某乎？" }]);

  const problems = scoring.validateRecordings([
    { id: "a", audio: "a.wav", question_id: "sex", expect: [1], language: "nan", asked: "" }
  ], app.questions);
  assert.equal(problems.length, 1);
});
