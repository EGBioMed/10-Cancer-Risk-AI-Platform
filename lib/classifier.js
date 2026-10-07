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

// The answer is a short list of integers. Thinking is billed separately from
// this ceiling and is not capped by it.
const MAX_TOKENS = 256;

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
  "   否則回傳空清單。不要替他挑一個看起來差不多的答案。"
].join("\n");

function optionLines(question) {
  return (question.options || [])
    .map((option, index) => `${index}. ${option}`)
    .join("\n");
}

function buildUserPrompt(question, utterance) {
  const kind = question.type === "multi" ? "複選" : "單選";
  const text = Array.isArray(utterance) ? utterance.join("；") : String(utterance ?? "");
  return [
    `題目（${kind}）：${question.title || question.id}`,
    "",
    "選項：",
    optionLines(question),
    "",
    `受訪者的回答：${text}`
  ].join("\n");
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
        items: { type: "integer", enum: Array.from({ length: size }, (_, index) => index) },
        // A single-choice question that comes back with two indices has not
        // answered it. The cap makes that unrepresentable rather than
        // something to detect afterwards.
        maxItems: question.type === "multi" ? size : 1
      }
    },
    required: ["indices"],
    additionalProperties: false
  };
}

function buildRequest(question, utterance, options) {
  const settings = options || {};
  return {
    model: settings.model || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(question, utterance) }],
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
  if (!parsed || !Array.isArray(parsed.indices)) return null;

  const size = (question.options || []).length;
  const indices = parsed.indices.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < size
  );
  if (indices.length !== parsed.indices.length) return null;
  if (indices.length === 0) return null;

  if (question.type === "multi") return [...new Set(indices)];
  // The schema caps this at one, so more than one means the schema was not
  // applied -- treat it as a reply we cannot use rather than taking the first.
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

  return async function classify(question, utterance) {
    const response = await client.messages.parse(buildRequest(question, utterance, settings));
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
  buildUserPrompt,
  buildSchema,
  buildRequest,
  parseVerdict,
  createAnthropicClassifier,
  priceOf
};
