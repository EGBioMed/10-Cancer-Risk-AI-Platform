const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadApp } = require("./lib/load-app-sandbox");
const scoring = require("./lib/asr-eval");
const adapters = require("./lib/asr-adapters");
const { loadManifest, scoreOne } = require("./eval-asr");

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
