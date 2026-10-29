// Scoring for the ASR comparison (eval-asr.js). Pure functions only: no audio,
// no network, no file system, so test-asr-eval.js can check every rule here
// without a recording or a vendor account.
//
// The question an ASR has to answer for this project is not "how many
// characters did you get right". It is "after your transcript went through the
// same resolver the chat page uses, did the respondent's answer land on the
// option they meant". A transcript can misspell half a sentence and still land
// on 否; it can get every character but one right and turn 沒有 into 有. So the
// headline is the harmful rate at the option level, exactly as in
// eval-classifier.js, and CER is reported beside it as a diagnostic.
//
// Every recording is scored twice: once on what the ASR heard, and once on the
// reference text a person transcribed. The difference is the part of the
// damage the ASR is responsible for. Without that baseline, a resolver that
// cannot read 「有啦，以前有抽」 would be scored against the ASR, and two
// vendors would be compared on a weakness neither of them has.

const LANGUAGES = new Set(["zh", "nan", "hak", "en", "mixed"]);
const ENVIRONMENTS = new Set(["quiet", "clinic", "phone"]);

// Number questions carry their expected value in expect_number rather than as
// an option index; null there means the honest reading is "cannot tell".
function validateRecordings(recordings, questions) {
  const problems = [];
  const seen = new Set();
  for (const item of recordings) {
    const label = item && item.id ? item.id : "(no id)";
    if (!item || typeof item.id !== "string" || !item.id) {
      problems.push(`${label}: missing id`);
      continue;
    }
    if (seen.has(item.id)) problems.push(`${label}: duplicate id`);
    seen.add(item.id);

    if (typeof item.audio !== "string" || !item.audio) problems.push(`${label}: missing audio path`);
    if (!LANGUAGES.has(item.language)) problems.push(`${label}: language must be one of ${[...LANGUAGES].join("/")}`);
    if (item.environment !== undefined && !ENVIRONMENTS.has(item.environment)) {
      problems.push(`${label}: environment must be one of ${[...ENVIRONMENTS].join("/")}`);
    }

    const question = questions.find((candidate) => candidate.id === item.question_id);
    if (!question) {
      problems.push(`${label}: no question named ${item.question_id}`);
      continue;
    }

    if (question.type === "number") {
      if (!("expect_number" in item)) problems.push(`${label}: ${question.id} is a number question and needs expect_number`);
      else if (item.expect_number !== null && !Number.isFinite(item.expect_number)) {
        problems.push(`${label}: expect_number must be a number or null`);
      }
      continue;
    }

    if (!Array.isArray(item.expect)) {
      problems.push(`${label}: expect must be an array of option indices ([] = should abstain)`);
      continue;
    }
    const size = (question.options || []).length;
    if (size === 0) problems.push(`${label}: ${question.id} has no options; it cannot be scored`);
    for (const index of item.expect) {
      if (!Number.isInteger(index) || index < 0 || index >= size) {
        problems.push(`${label}: index ${index} is outside ${question.id} (${size} options)`);
      }
    }
    if (question.type !== "multi" && item.expect.length > 1) {
      problems.push(`${label}: ${question.id} is single-choice but expects ${item.expect.length} answers`);
    }
  }
  return problems;
}

// What the chat page would have recorded. Only a match counts as an answer:
// declined, ambiguous and unmatched all end in asking again or in an honest
// "unknown", which is the conservative outcome rather than a harmful one.
function answerFromResolution(question, result) {
  if (!result || result.status !== "matched") return { kind: "abstain" };
  if (question.type === "number") return { kind: "number", value: Number(result.value) };
  if (question.type === "multi") {
    const values = Array.isArray(result.value) ? result.value : [result.value];
    return { kind: "indices", indices: values.map((value) => question.options.indexOf(value)) };
  }
  return { kind: "indices", indices: [result.index] };
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

// correct / abstained_right are right; abstained_wrong is safe (the person is
// asked again); wrong and overconfident put a false value into a cancer risk
// assessment and are the two that make up the harmful rate.
function verdictFor(item, question, answer) {
  const shouldAbstain = question.type === "number" ? item.expect_number === null : item.expect.length === 0;
  if (answer.kind === "abstain") return shouldAbstain ? "abstained_right" : "abstained_wrong";
  if (shouldAbstain) return "overconfident";
  if (question.type === "number") return answer.value === item.expect_number ? "correct" : "wrong";
  return sameSet(answer.indices, item.expect) ? "correct" : "wrong";
}

const HARMFUL = new Set(["wrong", "overconfident"]);

// CER over normalised characters: punctuation and whitespace removed, full
// width folded to half width, Latin lowercased. The reference is a person's
// transcription and the hypothesis may carry punctuation an ASR's
// post-processor added; neither should count as an error.
function normalizeForCer(text) {
  return String(text ?? "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function characterErrorRate(reference, hypothesis) {
  const ref = [...normalizeForCer(reference)];
  const hyp = [...normalizeForCer(hypothesis)];
  if (ref.length === 0) return null;
  let previous = Array.from({ length: hyp.length + 1 }, (_, index) => index);
  for (let i = 1; i <= ref.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[hyp.length] / ref.length;
}

// One recording's outcome. `reference` is the verdict on the human transcript,
// `heard` the verdict on the ASR's; attribution compares them. A recording with
// no reference_text cannot be attributed, and says so rather than guessing.
function attribute(reference, heard) {
  if (!reference) return "unattributed";
  const refOk = !HARMFUL.has(reference) && reference !== "abstained_wrong";
  const heardOk = !HARMFUL.has(heard) && heard !== "abstained_wrong";
  if (refOk && !heardOk) return HARMFUL.has(heard) ? "asr_caused_harm" : "asr_caused_abstain";
  if (!refOk && heardOk) return "asr_luck";
  if (!refOk) return "resolver_limit";
  return "fine";
}

function emptyTally() {
  return {
    total: 0, errors: 0,
    correct: 0, wrong: 0, abstained_right: 0, abstained_wrong: 0, overconfident: 0,
    asr_caused_harm: 0, asr_caused_abstain: 0, asr_luck: 0, resolver_limit: 0, fine: 0, unattributed: 0,
    cerSum: 0, cerCount: 0, latencySum: 0, latencyCount: 0
  };
}

function addToTally(tally, outcome) {
  tally.total += 1;
  if (outcome.error) {
    tally.errors += 1;
    return;
  }
  tally[outcome.heard] += 1;
  tally[outcome.attribution] += 1;
  if (typeof outcome.cer === "number") {
    tally.cerSum += outcome.cer;
    tally.cerCount += 1;
  }
  if (typeof outcome.latencyMs === "number") {
    tally.latencySum += outcome.latencyMs;
    tally.latencyCount += 1;
  }
}

// Rates are over the recordings that came back. A run where every call failed
// would otherwise report a 0% harmful rate -- the trap eval-classifier.js
// already fell into once.
function summarize(tally) {
  const scored = tally.total - tally.errors;
  const rate = (value) => (scored > 0 ? value / scored : null);
  return {
    total: tally.total,
    scored,
    errors: tally.errors,
    harmful: tally.wrong + tally.overconfident,
    harmfulRate: rate(tally.wrong + tally.overconfident),
    rightRate: rate(tally.correct + tally.abstained_right),
    abstainWrongRate: rate(tally.abstained_wrong),
    asrCausedHarm: tally.asr_caused_harm,
    asrCausedAbstain: tally.asr_caused_abstain,
    resolverLimit: tally.resolver_limit,
    unattributed: tally.unattributed,
    meanCer: tally.cerCount > 0 ? tally.cerSum / tally.cerCount : null,
    meanLatencyMs: tally.latencyCount > 0 ? tally.latencySum / tally.latencyCount : null,
    tally
  };
}

function groupSummaries(outcomes, keyOf) {
  const groups = new Map();
  for (const outcome of outcomes) {
    const key = keyOf(outcome);
    if (!groups.has(key)) groups.set(key, emptyTally());
    addToTally(groups.get(key), outcome);
  }
  return new Map([...groups].map(([key, tally]) => [key, summarize(tally)]));
}

module.exports = {
  LANGUAGES,
  ENVIRONMENTS,
  HARMFUL,
  validateRecordings,
  answerFromResolution,
  verdictFor,
  sameSet,
  normalizeForCer,
  characterErrorRate,
  attribute,
  emptyTally,
  addToTally,
  summarize,
  groupSummaries
};
