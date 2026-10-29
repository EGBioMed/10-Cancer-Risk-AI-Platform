// Compares ASR vendors on what matters here: whether a spoken answer, once
// transcribed and run through the chat page's own resolver, lands on the option
// the respondent meant. See eval/asr/README.md for the recording protocol.
//
//   node eval-asr.js --asr transcript                 # ceiling: perfect ASR
//   node eval-asr.js --asr taiwan-tongues             # needs TT_BASE_URL + credentials
//   node eval-asr.js --asr taiwan-tongues --classifier  # add the model escalation (ANTHROPIC_API_KEY)
//   node eval-asr.js --reuse eval/asr/results/<file>.json  # re-score saved transcripts, no ASR calls
//   node eval-asr.js --manifest <path> --only <id>
//
// Recordings and results are personal health data. Both live under
// eval/asr/recordings/ and eval/asr/results/, which are git-ignored; nothing
// here uploads anything except to the ASR named on the command line.

const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./lib/load-app-sandbox");
const resolver = require("./answer-resolver");
const scoring = require("./lib/asr-eval");
const { createAdapter } = require("./lib/asr-adapters");

const DEFAULT_MANIFEST = path.join(__dirname, "eval", "asr", "recordings", "manifest.json");
const RESULTS_DIR = path.join(__dirname, "eval", "asr", "results");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name) => process.argv.includes(name);

function loadManifest(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || parsed.schema !== "asr-eval/1" || !Array.isArray(parsed.recordings)) {
    throw new Error(`${file} is not an asr-eval/1 manifest`);
  }
  return parsed;
}

function resolverInput(question, text) {
  return question.type === "multi" ? [text] : text;
}

async function resolveText(app, question, text, classifier) {
  const options = { numberBounds: app.getNumberBounds, classifier };
  return resolver.resolveAsync(question, resolverInput(question, text), options);
}

function createClassifier() {
  const classifierModule = require("./lib/classifier");
  const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
  return classifierModule.createAnthropicClassifier({ client: new Anthropic() });
}

async function scoreOne(app, item, transcript, classifier) {
  const question = app.questions.find((candidate) => candidate.id === item.question_id);
  const heardResult = await resolveText(app, question, transcript.text, classifier);
  const heard = scoring.verdictFor(item, question, scoring.answerFromResolution(question, heardResult));

  let reference = null;
  if (typeof item.reference_text === "string" && item.reference_text.trim()) {
    const refResult = await resolveText(app, question, item.reference_text, classifier);
    reference = scoring.verdictFor(item, question, scoring.answerFromResolution(question, refResult));
  }

  return {
    id: item.id,
    question_id: item.question_id,
    language: item.language,
    environment: item.environment || "unknown",
    text: transcript.text,
    latencyMs: transcript.latencyMs,
    via: heardResult.via,
    heard,
    reference,
    attribution: scoring.attribute(reference, heard),
    // CER against a person's transcription is only meaningful where the ASR
    // writes the same script the reference does. For Taiwanese and Hakka the
    // output convention (漢字, Tâi-lô, or a Mandarin rendering) is itself one of
    // the things being evaluated, so it is reported but not averaged in.
    cer: item.language === "zh" && item.reference_text
      ? scoring.characterErrorRate(item.reference_text, transcript.text)
      : null
  };
}

function pct(value) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function printSummary(label, summary) {
  console.log(`${label.padEnd(10)} 有害率 ${pct(summary.harmfulRate).padStart(6)}  (${summary.harmful}/${summary.scored})` +
    `   正確 ${pct(summary.rightRate).padStart(6)}   該答卻棄權 ${pct(summary.abstainWrongRate).padStart(6)}` +
    (summary.meanCer !== null ? `   CER ${pct(summary.meanCer)}` : "") +
    (summary.errors ? `   失敗 ${summary.errors}` : ""));
}

async function main() {
  const app = loadApp();
  const reuse = argument("--reuse");
  const manifestPath = argument("--manifest") || DEFAULT_MANIFEST;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到錄音清單 ${manifestPath}。格式見 eval/asr/manifest.example.json 與 eval/asr/README.md。`);
  }
  const manifest = loadManifest(manifestPath);
  const only = argument("--only");
  const selected = only ? manifest.recordings.filter((item) => item.id === only) : manifest.recordings;
  if (selected.length === 0) throw new Error(only ? `no recording named ${only}` : "the manifest is empty");

  const problems = scoring.validateRecordings(selected, app.questions);
  if (problems.length > 0) {
    console.error("錄音清單本身有問題，先修它，不要花錢跑：");
    for (const problem of problems) console.error("  " + problem);
    process.exitCode = 1;
    return;
  }

  let asrName;
  let transcripts;
  if (reuse) {
    const saved = JSON.parse(fs.readFileSync(reuse, "utf8"));
    asrName = saved.asr;
    transcripts = new Map(saved.outcomes.filter((o) => !o.error).map((o) => [o.id, { text: o.text, latencyMs: o.latencyMs }]));
  } else {
    asrName = argument("--asr");
    if (!asrName) throw new Error("--asr is required (transcript / taiwan-tongues / myvoca), or --reuse a results file");
  }
  const adapter = reuse ? null : createAdapter(asrName);
  const classifier = flag("--classifier") ? createClassifier() : undefined;
  const audioRoot = path.dirname(manifestPath);

  console.log(`ASR ${asrName}${reuse ? "（重算已存的逐字稿）" : ""}  判讀 ${classifier ? "規則＋模型" : "只有規則"}  錄音 ${selected.length} 筆`);
  if (manifest.provenance) console.log(`來源：${manifest.provenance}`);
  console.log("");

  const outcomes = [];
  for (const item of selected) {
    let transcript;
    try {
      if (reuse) {
        transcript = transcripts.get(item.id);
        if (!transcript) throw new Error("not in the reused results");
      } else {
        transcript = await adapter.transcribe(item, path.resolve(audioRoot, item.audio));
      }
      outcomes.push(await scoreOne(app, item, transcript, classifier));
    } catch (error) {
      outcomes.push({ id: item.id, question_id: item.question_id, language: item.language, environment: item.environment || "unknown", error: error.message });
    }
  }

  const overall = scoring.emptyTally();
  for (const outcome of outcomes) scoring.addToTally(overall, outcome);
  const summary = scoring.summarize(overall);

  for (const outcome of outcomes) {
    if (outcome.error) {
      console.log(`  ✖ ${outcome.id}  失敗：${outcome.error}`);
      continue;
    }
    if (!scoring.HARMFUL.has(outcome.heard) && outcome.attribution !== "asr_caused_abstain") continue;
    const mark = scoring.HARMFUL.has(outcome.heard) ? "✖" : "·";
    console.log(`  ${mark} ${outcome.id} [${outcome.language}] ${outcome.question_id}  聽到「${outcome.text}」→ ${outcome.heard}（${outcome.attribution}）`);
  }

  console.log("\n" + "=".repeat(72));
  if (summary.errors > 0) console.log(`⚠ ${summary.errors} / ${summary.total} 筆沒有結果，比率只以成功的 ${summary.scored} 筆計算。`);
  printSummary("全部", summary);
  console.log("-".repeat(72));
  for (const [language, group] of scoring.groupSummaries(outcomes, (o) => o.language)) printSummary(language, group);
  console.log("-".repeat(72));
  for (const [environment, group] of scoring.groupSummaries(outcomes, (o) => o.environment)) printSummary(environment, group);
  console.log("-".repeat(72));
  console.log(`ASR 造成的傷害   ${summary.asrCausedHarm}   （人工逐字稿判讀正確，ASR 逐字稿卻判成錯的答案）← 比廠商看這個`);
  console.log(`ASR 造成的重問   ${summary.asrCausedAbstain}   （人工逐字稿判得出來，ASR 逐字稿判不出來）`);
  console.log(`判讀層本身的極限 ${summary.resolverLimit}   （連人工逐字稿都判不出來，不能算在 ASR 頭上）`);
  if (summary.unattributed) console.log(`無法歸因         ${summary.unattributed}   （沒有 reference_text）`);
  if (summary.meanLatencyMs !== null) console.log(`平均處理時間     ${(summary.meanLatencyMs / 1000).toFixed(2)} 秒（檔案模式，含排隊；不是串流延遲）`);

  if (!reuse) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const out = path.join(RESULTS_DIR, `${asrName}-${stamp}.json`);
    fs.writeFileSync(out, JSON.stringify({ schema: "asr-eval-result/1", asr: asrName, manifest: manifestPath, outcomes, summary }, null, 2));
    console.log(`\n逐字稿與結果已存到 ${path.relative(__dirname, out)}（含健康資訊，已被 git 忽略）`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { loadManifest, scoreOne };
