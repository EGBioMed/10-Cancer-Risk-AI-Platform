// The escalation layer behind answer-resolver.js: when the rules cannot tell
// which option someone meant, a model picks one.
//
// It picks by index. The request is shaped so that an index is the only thing
// the model can return -- a structured output whose schema enumerates this
// question's valid indices and nothing else -- and answer-resolver.js discards
// anything that is not one. Two independent guards for the same property,
// because the thing being prevented is a model producing text that is almost
// one of the options and that text reaching the answer store, where it becomes
// either a dropped symptom or a fabricated denial. See answer-intake.js.
//
// Abstention is a first-class answer. An empty list means "I cannot tell",
// which the resolver reads as unresolved, which the session turns into asking
// again and eventually into an honest "unknown". For an assessment that feeds
// a cancer risk model, a wrong confident pick is far worse than a question
// asked twice, and the prompt says so.

// $ per million tokens. Used only by the eval to price a run; the classifier
// itself does not read it. Kept here so the two cannot disagree about which
// models are on the table.
const MODEL_PRICING = {
  "claude-opus-5-5": { input: 4.0, output: 20.0 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 }
};

const DEFAULT_MODEL = "claude-opus-5-5";

// Classification is the case the effort guidance calls out as not repaying a
// high setting, and this one is a short multiple-choice decision over a list
// the request already contains. Raise it only if the eval shows headroom.
const DEFAULT_EFFORT = "low";

// The answer is a short list of integers, but thinking counts against this
// ceiling too. At 256, a long Taiwanese multi-question exchange spent the
// budget thinking and the JSON was cut off mid-string (2 of 45 calls,
// 2026-11-04). Only tokens actually produced are billed, so headroom is free.
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = [
  "你的工作是把受訪者的一句回答，對應到問卷題目的選項編號。",
  "",
  "規則：",
  "1. 只能回傳選項編號。不要寫出選項文字，不要解釋。",
  "2. 只採計受訪者明確表達的內容。他否認的、推測的、問回來的，都不算。",
  "3. 無法確定時回傳空清單。這是正確答案，不是失敗。",
  "   這份問卷的結果會進入癌症風險模型。猜錯一題所造成的傷害，遠大於再問一次。",
  "4. 單選題最多一個編號。複選題可以多個，但同樣只採計明確提到的。",
  "5. 受訪者說「不知道」「不確定」時：若選項裡有對應的「不確定」類選項就選它，",
  "   否則回傳空清單。不要替他挑一個看起來差不多的答案。",
  "6. 若有提供「實際的問法」，那是受訪者實際聽到的問句。簡短的回答（著、對、是、無、沒有）",
  "   要照那句話理解：例如實際問「你是查某乎？」答「著」，就是女性。",
  "   實際的問法沒有指向任何一個選項時，簡短的回答仍然無法判斷，回傳空清單。"
].join("\n");

// The question as the person actually heard it, when that differs from the
// questionnaire's own wording: an interviewer's "你是查某乎？", a chatbot's
// rephrasing, or "您的意思比較接近哪一個？" after an ambiguity. A reply of "著"
// to "您的性別？" means nothing; to "你是查某乎？" it means female. Capped,
// because it is text a client sends, and the cap is far beyond any real
// question.
const MAX_ASKED_LENGTH = 300;

function askedLine(question, context) {
  const asked = context && typeof context.asked === "string" ? context.asked.trim() : "";
  if (!asked || asked === question.title) return null;
  return `實際的問法：${asked.slice(0, MAX_ASKED_LENGTH)}`;
}

// Number questions get their own instructions. The rules in answer-resolver.js
// read only Arabic digits, and spoken answers mostly are not: 一百六十五, the
// Taiwanese 百六 (160), 民國69年. On the first Taiwanese recording (2026-11-04)
// every birth year, height and weight went unresolved for both ASRs because
// numbers never reached a model at all.
//
// The model still may not write the answer. It returns a number, which the
// resolver bounds-checks against the same min, max and step the form enforces,
// and stores as a string it formats itself.
const NUMBER_SYSTEM_PROMPT = [
  "你的工作是從受訪者的一句回答中，讀出問卷數字題的答案。",
  "",
  "規則：",
  "1. 只回傳一個數字，用題目要求的單位。不要寫文字，不要解釋。",
  "2. 可以換算說法：國字或台語的數字（一百六十五、五十五；台語「百六」是 160、「百五五」是 155），",
  "   民國年換成西元年（民國年加 1911，例如民國 69 年是 1980 年）。",
  "3. 只採計受訪者明確說出的數字。範圍或含糊的說法（「六十幾」「五六十」）不算，回傳空清單。",
  "4. 回答可能是語音辨識的逐字稿，會有錯字、重複或亂碼。看不出是哪一個數字時，回傳空清單。",
  "   這份問卷的結果會進入癌症風險模型。猜錯一個數字所造成的傷害，遠大於再問一次。",
  "5. 受訪者說「不知道」「不記得」時，回傳空清單。",
  "6. 若有提供「實際的問法」，那是受訪者實際聽到的問句。簡短的確認（著、對）要照那句話裡的數字理解；",
  "   那句話裡沒有數字時，簡短的確認無法判斷，回傳空清單。"
].join("\n");

function buildNumberPrompt(question, utterance, context) {
  const text = Array.isArray(utterance) ? utterance.join("；") : String(utterance ?? "");
  return [
    `題目（數字）：${question.title || question.id}`,
    question.note ? `說明：${question.note}` : null,
    askedLine(question, context),
    "",
    `受訪者的回答：${text}`
  ].filter((line) => line !== null).join("\n");
}

function buildNumberSchema() {
  return {
    type: "object",
    properties: {
      // A list rather than a nullable number, for the same reason the option
      // schema uses one: empty is how the model abstains.
      values: { type: "array", items: { type: "number" } }
    },
    required: ["values"],
    additionalProperties: false
  };
}

function optionLines(question) {
  return (question.options || [])
    .map((option, index) => `${index}. ${option}`)
    .join("\n");
}

function buildUserPrompt(question, utterance, context) {
  const kind = question.type === "multi" ? "複選" : "單選";
  const text = Array.isArray(utterance) ? utterance.join("；") : String(utterance ?? "");
  return [
    `題目（${kind}）：${question.title || question.id}`,
    askedLine(question, context),
    "",
    "選項：",
    optionLines(question),
    "",
    `受訪者的回答：${text}`
  ].filter((line) => line !== null).join("\n");
}

// The schema is built per question so the enum holds only that question's
// indices. A model cannot return 7 for a five-option question because 7 is not
// in the schema, which is a stronger guarantee than asking it not to.
function buildSchema(question) {
  const size = (question.options || []).length;
  if (size === 0) throw new Error(`question ${question.id} has no options to classify into`);
  return {
    type: "object",
    properties: {
      indices: {
        type: "array",
        // No maxItems: structured outputs rejects it on arrays with a 400, on
        // every request (found 2026-11-04, the first run with a real key). A
        // single-choice reply with two indices is caught by parseVerdict
        // instead, which abstains rather than taking the first.
        items: { type: "integer", enum: Array.from({ length: size }, (_, index) => index) }
      }
    },
    required: ["indices"],
    additionalProperties: false
  };
}

// `context` is optional: { asked } -- the question as actually spoken.
function buildRequest(question, utterance, options, context) {
  const settings = options || {};
  if (question.type === "number") {
    return {
      model: settings.model || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: NUMBER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildNumberPrompt(question, utterance, context) }],
      output_config: {
        effort: settings.effort || DEFAULT_EFFORT,
        format: { type: "json_schema", schema: buildNumberSchema() }
      }
    };
  }
  return {
    model: settings.model || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(question, utterance, context) }],
    output_config: {
      effort: settings.effort || DEFAULT_EFFORT,
      format: { type: "json_schema", schema: buildSchema(question) }
    }
  };
}

// null means abstain. Every shape that is not a usable answer collapses to it,
// including a response the SDK could not parse -- there is no reading of a
// malformed reply that is safer than asking the person again.
function parseVerdict(question, parsed) {
  if (question.type === "number") {
    if (!parsed || !Array.isArray(parsed.values)) return null;
    // Two numbers is the model saying it could not choose, whatever order it
    // put them in.
    if (parsed.values.length !== 1) return null;
    const value = parsed.values[0];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  if (!parsed || !Array.isArray(parsed.indices)) return null;

  const size = (question.options || []).length;
  const indices = parsed.indices.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < size
  );
  if (indices.length !== parsed.indices.length) return null;
  if (indices.length === 0) return null;

  if (question.type === "multi") return [...new Set(indices)];
  // The API will not let the schema cap this at one, so this is the cap: a
  // single-choice reply with two indices has not answered the question.
  return indices.length === 1 ? indices[0] : null;
}

// Returns the classifier function answer-resolver.js expects: given a question
// and an utterance, an index (or an array of them), or null to abstain.
//
// `client` is injected rather than constructed here so the eval can run the
// same code against a recorded transcript, and so nothing in the test suite
// can reach the network by accident.
function createAnthropicClassifier(options) {
  const settings = options || {};
  const client = settings.client;
  if (!client || !client.messages || typeof client.messages.parse !== "function") {
    throw new TypeError("createAnthropicClassifier requires an Anthropic client");
  }
  const onUsage = typeof settings.onUsage === "function" ? settings.onUsage : null;

  return async function classify(question, utterance, context) {
    const response = await client.messages.parse(buildRequest(question, utterance, settings, context));
    if (onUsage && response && response.usage) onUsage(response.usage, response.model);
    // A safety decline arrives as a 200 with stop_reason "refusal" and no
    // usable content; abstaining is the right reading of it.
    if (response && response.stop_reason === "refusal") return null;
    return parseVerdict(question, response && response.parsed_output);
  };
}

function priceOf(model, usage) {
  const rates = MODEL_PRICING[model];
  if (!rates || !usage) return null;
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  return (input / 1e6) * rates.input + (output / 1e6) * rates.output;
}

module.exports = {
  MODEL_PRICING,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  MAX_TOKENS,
  SYSTEM_PROMPT,
  NUMBER_SYSTEM_PROMPT,
  MAX_ASKED_LENGTH,
  buildUserPrompt,
  buildNumberPrompt,
  buildSchema,
  buildNumberSchema,
  buildRequest,
  parseVerdict,
  createAnthropicClassifier,
  priceOf
};
