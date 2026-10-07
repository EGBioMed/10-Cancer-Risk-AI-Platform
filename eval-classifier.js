// Measures the chat intake's escalation classifier against eval/classifier-cases.json.
//
//   node eval-classifier.js                        # the default model
//   node eval-classifier.js --model claude-haiku-4-5
//   node eval-classifier.js --effort medium
//   node eval-classifier.js --case smoke-past      # one case, for debugging a prompt change
//
// Needs ANTHROPIC_API_KEY. It spends money -- the run prints what it cost.
//
// The headline number is not accuracy. It is the harmful rate: how often the
// model put a wrong answer into someone's cancer risk assessment, counting both
// picking the wrong option and picking one where the honest reply was "I cannot
// tell". Accuracy and the harmful rate move together only while abstention is
// free; a model that guesses more scores better on accuracy and worse on the
// thing that matters, so both are reported and the harmful one is first.

const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./lib/load-app-sandbox");
const resolver = require("./answer-resolver");
const classifierModule = require("./lib/classifier");

const CASES_PATH = path.join(__dirname, "eval", "classifier-cases.json");
const CONCURRENCY = 5;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadCases() {
  return JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
}

// A case that names a question which no longer exists, or an index past the end
// of its options, is not a failing case -- it is a broken ruler. Checked before
// anything is spent, and again in test-classifier.js so a questionnaire edit
// that invalidates the eval set is caught in CI rather than by a confusing run.
function validateCases(cases, questions) {
  const problems = [];
  const seen = new Set();
  for (const item of cases) {
    if (seen.has(item.id)) problems.push(`${item.id}: duplicate case id`);
    seen.add(item.id);

    const question = questions.find((candidate) => candidate.id === item.question_id);
    if (!question) {
      problems.push(`${item.id}: no question named ${item.question_id}`);
      continue;
    }
    const size = (question.options || []).length;
    for (const index of item.expect) {
      if (!Number.isInteger(index) || index < 0 || index >= size) {
        problems.push(`${item.id}: index ${index} is outside ${item.question_id} (${size} options)`);
      }
    }
    if (question.type !== "multi" && item.expect.length > 1) {
      problems.push(`${item.id}: ${item.question_id} is single-choice but expects ${item.expect.length} answers`);
    }
  }
  return problems;
}

// Every case has to be one the rules could not resolve. A case the rules answer
// never reaches the model, so scoring it would measure the rules and report the
// number as the model's.
function casesTheRulesAlreadyAnswer(cases, questions) {
  const resolved = [];
  for (const item of cases) {
    const question = questions.find((candidate) => candidate.id === item.question_id);
    if (!question) continue;
    const input = question.type === "multi" ? [item.utterance] : item.utterance;
    const result = resolver.resolve(question, input);
    if (result.status === "matched" || result.status === "declined") {
      resolved.push(`${item.id} (${result.status} via ${result.via})`);
    }
  }
  return resolved;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

function toIndices(verdict) {
  if (verdict === null || verdict === undefined) return [];
  return Array.isArray(verdict) ? verdict : [verdict];
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const app = loadApp();
  const { cases, provenance } = loadCases();

  const only = argument("--case");
  const selected = only ? cases.filter((item) => item.id === only) : cases;
  if (selected.length === 0) throw new Error(only ? `no case named ${only}` : "the eval set is empty");

  const problems = validateCases(selected, app.questions);
  if (problems.length > 0) {
    console.error("評估集本身有問題，先修它，不要花錢跑：");
    for (const problem of problems) console.error("  " + problem);
    process.exitCode = 1;
    return;
  }

  const alreadyAnswered = casesTheRulesAlreadyAnswer(selected, app.questions);
  if (alreadyAnswered.length > 0) {
    console.error("這些案例規則層就答得出來，不會送到模型，留在評估集裡會虛報模型的成績：");
    for (const item of alreadyAnswered) console.error("  " + item);
    process.exitCode = 1;
    return;
  }

  const model = argument("--model") || classifierModule.DEFAULT_MODEL;
  const effort = argument("--effort") || classifierModule.DEFAULT_EFFORT;

  const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
  const client = new Anthropic();

  let inputTokens = 0;
  let outputTokens = 0;
  const classify = classifierModule.createAnthropicClassifier({
    client,
    model,
    effort,
    onUsage: (usage) => {
      inputTokens += Number(usage.input_tokens || 0);
      outputTokens += Number(usage.output_tokens || 0);
    }
  });

  console.log(`模型 ${model}  effort ${effort}  案例 ${selected.length} 筆`);
  console.log(provenance ? `來源：${provenance}\n` : "");

  const started = Date.now();
  const outcomes = await mapWithLimit(selected, CONCURRENCY, async (item) => {
    const question = app.questions.find((candidate) => candidate.id === item.question_id);
    let got;
    try {
      got = toIndices(await classify(question, item.utterance));
    } catch (error) {
      return { item, question, error: error.message };
    }

    const shouldAbstain = item.expect.length === 0;
    const abstained = got.length === 0;
    let verdict;
    if (shouldAbstain) verdict = abstained ? "abstained_right" : "overconfident";
    else if (abstained) verdict = "abstained_wrong";
    else verdict = sameSet(got, item.expect) ? "correct" : "wrong";

    return { item, question, got, verdict };
  });

  const tally = { correct: 0, wrong: 0, abstained_right: 0, abstained_wrong: 0, overconfident: 0, errors: 0 };
  const show = (indices, question) =>
    indices.length === 0 ? "（棄權）" : indices.map((index) => `${index}:${question.options[index]}`).join(" + ");

  for (const outcome of outcomes) {
    if (outcome.error) {
      tally.errors += 1;
      console.log(`  ✖ ${outcome.item.id}  呼叫失敗：${outcome.error}`);
      continue;
    }
    tally[outcome.verdict] += 1;
    if (outcome.verdict === "correct" || outcome.verdict === "abstained_right") continue;
    const mark = outcome.verdict === "abstained_wrong" ? "·" : "✖";
    console.log(`  ${mark} ${outcome.item.id}  [${outcome.item.kind}] ${outcome.item.utterance}`);
    console.log(`      應為 ${show(outcome.item.expect, outcome.question)}`);
    console.log(`      得到 ${show(outcome.got, outcome.question)}`);
    console.log(`      理由 ${outcome.item.why}`);
  }

  const total = selected.length;
  const harmful = tally.wrong + tally.overconfident;
  const cost = classifierModule.priceOf(model, { input_tokens: inputTokens, output_tokens: outputTokens });
  const pct = (value) => `${((value / total) * 100).toFixed(1)}%`;

  console.log("\n" + "=".repeat(64));
  console.log(`有害率            ${String(harmful).padStart(3)} / ${total}  ${pct(harmful)}   ← 看這個`);
  console.log(`  選錯選項        ${String(tally.wrong).padStart(3)}`);
  console.log(`  該棄權卻選了    ${String(tally.overconfident).padStart(3)}`);
  console.log("-".repeat(64));
  console.log(`完全正確          ${String(tally.correct + tally.abstained_right).padStart(3)} / ${total}  ${pct(tally.correct + tally.abstained_right)}`);
  console.log(`  選對            ${String(tally.correct).padStart(3)}`);
  console.log(`  該棄權且棄權了  ${String(tally.abstained_right).padStart(3)}`);
  console.log(`該選卻棄權        ${String(tally.abstained_wrong).padStart(3)}  （保守，不危險：會再問一次）`);
  if (tally.errors > 0) console.log(`呼叫失敗          ${String(tally.errors).padStart(3)}`);
  console.log("-".repeat(64));
  console.log(`token             輸入 ${inputTokens}  輸出 ${outputTokens}`);
  if (cost !== null) {
    console.log(`花費              US$${cost.toFixed(4)}  （每題 US$${(cost / total).toFixed(5)}）`);
  } else {
    console.log(`花費              ${model} 不在價目表裡，無法計價`);
  }
  console.log(`耗時              ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
}

// Guarded so test-classifier.js can check the eval set itself without spending
// anything: requiring this file must not start a run.
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateCases, casesTheRulesAlreadyAnswer, sameSet, toIndices, loadCases, CASES_PATH };
