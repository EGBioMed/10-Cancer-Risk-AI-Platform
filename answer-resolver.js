(function registerAnswerResolver(root, factory) {
  const api = factory(
    typeof require === "function" ? require("./answer-codes") : root.EGAnswerCodes
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EGAnswerResolver = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createAnswerResolver(answerCodes) {
  const { getOptionCode } = answerCodes;

  // Turns what a person said into one of the question's own options.
  //
  // The rule that shapes everything else: this module returns an INDEX, and
  // the label is read back out of question.options[index]. It never composes,
  // trims or repairs a string and hands that over. A resolver that returns text
  // is a resolver that can return text which is almost right, and almost right
  // is the failure mode answer-intake.js exists to catch -- better to make it
  // unreachable than to catch it. Classification in, lookup out.
  //
  // What lives here is only the deterministic layer: exact matches, the same
  // answer written with different spacing or half-width punctuation, and the
  // universal yes/no/don't-know vocabulary. It deliberately stops where
  // understanding begins. "我最近胃不太舒服" is not resolvable by any rule that
  // is honest about what it knows, and guessing is what produces a confident
  // wrong answer. Those come back `unmatched`, for the caller to escalate --
  // to a model, or to asking again.
  //
  // The escalation seam has the same shape as the rest: an injected classifier
  // is required to return an index into question.options, and anything else it
  // returns is discarded. A model cannot introduce a near-miss string into the
  // answer store through this module, because no path through it writes a
  // string a model produced.

  const FULLWIDTH_OFFSET = 0xfee0;

  // Collapsing whitespace entirely rather than to a single space: the options
  // themselves are inconsistent about it (每週至少 3 次 beside 每週至少一次),
  // and in Chinese the spaces are typographic rather than lexical, so removing
  // them compares what the words say rather than how they were typeset.
  const WHITESPACE = /[\s　]+/g;
  const TRAILING_PUNCTUATION = /[。．.!！?？,，、;；:：]+$/;
  const QUOTES = /[「」『』“”"']/g;

  function toHalfWidth(text) {
    return text.replace(/[！-～]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - FULLWIDTH_OFFSET)
    );
  }

  function normalizeText(value) {
    if (typeof value !== "string") return "";
    return toHalfWidth(value)
      .replace(QUOTES, "")
      .replace(WHITESPACE, "")
      .replace(TRAILING_PUNCTUATION, "")
      .toLowerCase();
  }

  // Said in reply to a yes/no question, these are answers. Said in reply to
  // anything else they are not, which is why they resolve through the
  // question's own options rather than to a literal: the utterance maps to an
  // intent, the intent maps to an answer code, and the code is looked for
  // among this question's options. A question with no 是 option simply has no
  // match for 對, instead of being handed a label it does not contain.
  const INTENT_BY_UTTERANCE = new Map([
    ["是", "yes"], ["對", "yes"], ["有", "yes"], ["有的", "yes"], ["會", "yes"],
    ["沒錯", "yes"], ["正確", "yes"], ["yes", "yes"], ["y", "yes"],
    ["否", "no"], ["不是", "no"], ["沒有", "no"], ["不會", "no"], ["沒", "no"],
    ["不對", "no"], ["no", "no"], ["n", "no"],
    ["不確定", "unknown"], ["不知道", "unknown"], ["不清楚", "unknown"],
    ["不記得", "unknown"], ["忘了", "unknown"], ["忘記了", "unknown"],
    ["沒印象", "unknown"], ["不太確定", "unknown"], ["不想說", "unknown"],
    ["跳過", "unknown"], ["skip", "unknown"], ["unknown", "unknown"],
    ["以上皆無", "none"], ["都沒有", "none"], ["都不是", "none"],
    ["沒有以上", "none"], ["none", "none"]
  ]);

  const NUMERALS = /-?\d+(?:\.\d+)?/;

  function optionIndexesByCode(question, code) {
    if (!Array.isArray(question.options)) return [];
    const matches = [];
    question.options.forEach((option, index) => {
      if (getOptionCode(question, option) === code) matches.push(index);
    });
    return matches;
  }

  // Built per call rather than cached on the question: these objects come out
  // of app.js's module scope and are not ours to decorate, and a stale cache
  // keyed on a mutable object is a bug that only appears once the questionnaire
  // is edited.
  function normalizedIndex(question) {
    const byNormalized = new Map();
    (question.options || []).forEach((option, index) => {
      const key = normalizeText(option);
      if (!key) return;
      const existing = byNormalized.get(key);
      if (existing) existing.push(index);
      else byNormalized.set(key, [index]);
    });
    return byNormalized;
  }

  function matched(question, index, via) {
    return { status: "matched", index, value: question.options[index], via };
  }

  function unmatched(via, detail) {
    return { status: "unmatched", index: -1, value: null, via, detail: detail || null };
  }

  function ambiguous(indices, via) {
    return { status: "ambiguous", index: -1, value: null, via, indices };
  }

  // The person told us they do not know. Distinct from `unmatched`, which is
  // us not understanding them: both end up as the same thing in the data, but
  // only one of them is worth asking again.
  function declined(via) {
    return { status: "declined", index: -1, value: null, via };
  }

  function resolveIntent(question, intent, via) {
    const indices = optionIndexesByCode(question, intent);
    if (indices.length === 1) return matched(question, indices[0], via);
    if (indices.length > 1) return ambiguous(indices, via);
    // "不知道" on a question with no unknown option is still the person
    // declining, not a failure to understand them.
    if (intent === "unknown") return declined(via);
    return unmatched(via, intent);
  }

  function resolveSingle(question, utterance) {
    if (typeof utterance !== "string" || !utterance.trim()) return unmatched("empty");

    const index = (question.options || []).indexOf(utterance);
    if (index >= 0) return matched(question, index, "exact");

    const key = normalizeText(utterance);
    if (!key) return unmatched("empty");

    const byNormalized = normalizedIndex(question);
    const candidates = byNormalized.get(key);
    if (candidates && candidates.length === 1) return matched(question, candidates[0], "normalized");
    // Two options that normalise to the same string are not a match to pick
    // between -- whichever we chose would be a coin toss recorded as data.
    if (candidates && candidates.length > 1) return ambiguous(candidates, "normalized");

    const intent = INTENT_BY_UTTERANCE.get(key);
    if (intent) return resolveIntent(question, intent, "intent");

    return unmatched("no_rule");
  }

  function resolveNumber(question, utterance) {
    if (typeof utterance === "number" && Number.isFinite(utterance)) {
      return { status: "matched", index: -1, value: String(utterance), via: "number" };
    }
    if (typeof utterance !== "string" || !utterance.trim()) return unmatched("empty");

    const key = normalizeText(utterance);
    if (INTENT_BY_UTTERANCE.get(key) === "unknown") return declined("intent");

    // Half-width conversion happens in normalizeText, so １６５ and 165 both
    // arrive here as digits. Chinese numerals (十八) deliberately do not: a
    // rule that reads 十八 as 18 also has to decide what 十幾 means, and a
    // range guessed at is worse than a question asked twice.
    const found = key.match(NUMERALS);
    if (!found) return unmatched("no_number", key);

    // One number only. "165 公分 60 公斤" answers two questions, and picking
    // the first would silently file the height as the weight.
    const all = key.match(new RegExp(NUMERALS.source, "g")) || [];
    if (all.length > 1) return ambiguous([], "multiple_numbers");

    return { status: "matched", index: -1, value: found[0], via: "number" };
  }

  // For a multi question the caller passes the items it believes were
  // mentioned, one utterance each. Decomposing a sentence into items is the
  // escalation layer's job, not a rule's.
  //
  // All or nothing, matching answer-intake.js: a partially resolved list is not
  // a shorter answer, it is a question that has to be asked again.
  function resolveMulti(question, utterances) {
    const list = Array.isArray(utterances) ? utterances : [utterances];
    if (list.length === 0) return unmatched("empty");

    // A whole-utterance match first, so "以上皆無" said on its own works
    // without the caller having to know it is one of the options.
    if (list.length === 1) {
      const whole = resolveSingle(question, list[0]);
      if (whole.status === "matched") return { ...whole, value: [whole.value] };
      if (whole.status === "declined") return whole;
    }

    const indices = [];
    const unresolved = [];
    for (const utterance of list) {
      const result = resolveSingle(question, utterance);
      if (result.status === "matched") {
        if (!indices.includes(result.index)) indices.push(result.index);
      } else if (result.status === "declined") {
        return result;
      } else {
        unresolved.push(utterance);
      }
    }

    if (unresolved.length > 0) return unmatched("unresolved", unresolved);
    if (indices.length === 0) return unmatched("empty");
    return {
      status: "matched",
      index: -1,
      value: indices.map((index) => question.options[index]),
      via: "items"
    };
  }

  // The escalation seam. `classifier` is handed the question and the utterance
  // and must answer with an index into question.options -- a number, or an
  // array of numbers for a multi question. Anything else it returns is
  // discarded rather than interpreted, which is what keeps a model's prose out
  // of the answer store no matter how it is prompted or what it decides to say.
  // Split from the call so the sync and async paths validate identically. A
  // real classifier is a network call and returns a promise; a test's is a
  // plain function. Both have to be held to the same rule about what may come
  // back, and the way to guarantee that is for there to be one copy of it.
  function applyVerdict(question, verdict) {
    const size = (question.options || []).length;
    const isIndex = (value) => Number.isInteger(value) && value >= 0 && value < size;

    if (question.type === "multi") {
      if (!Array.isArray(verdict) || verdict.length === 0) return unmatched("classifier_shape");
      if (!verdict.every(isIndex)) return unmatched("classifier_shape");
      const unique = [...new Set(verdict)];
      return {
        status: "matched",
        index: -1,
        value: unique.map((index) => question.options[index]),
        via: "classifier"
      };
    }

    if (!isIndex(verdict)) return unmatched("classifier_shape");
    return matched(question, verdict, "classifier");
  }

  function applyClassifier(question, utterance, classifier) {
    let verdict;
    try {
      verdict = classifier(question, utterance);
    } catch (error) {
      return unmatched("classifier_threw", error && error.message);
    }
    return applyVerdict(question, verdict);
  }

  async function applyClassifierAsync(question, utterance, classifier) {
    let verdict;
    try {
      verdict = await classifier(question, utterance);
    } catch (error) {
      return unmatched("classifier_threw", error && error.message);
    }
    return applyVerdict(question, verdict);
  }

  function resolveByRules(question, utterance) {
    if (!question || typeof question !== "object") {
      throw new TypeError("resolve requires a question definition");
    }
    if (question.type === "number") return resolveNumber(question, utterance);
    if (question.type === "multi") return resolveMulti(question, utterance);
    if (Array.isArray(question.options)) return resolveSingle(question, utterance);

    const text = typeof utterance === "string" ? utterance.trim() : "";
    return text
      ? { status: "matched", index: -1, value: text, via: "free_text" }
      : unmatched("empty");
  }

  // Only `unmatched` escalates. `ambiguous` means the rules found more than one
  // defensible reading, and `declined` means the person already answered --
  // sending either to a model invites it to break a tie or to overrule someone
  // who said they did not know. A question with no options has nothing for a
  // classifier to choose between.
  function shouldEscalate(question, result, settings) {
    return result.status === "unmatched"
      && typeof settings.classifier === "function"
      && Array.isArray(question.options)
      && question.options.length > 0;
  }

  function resolve(question, utterance, options) {
    const settings = options || {};
    const result = resolveByRules(question, utterance);
    if (!shouldEscalate(question, result, settings)) return result;
    return applyClassifier(question, utterance, settings.classifier);
  }

  // The same decision, for a classifier that is a network call. Kept as a
  // separate entry point rather than making `resolve` async: the rules alone
  // answer most replies, and a caller that has no model should not have to
  // await anything to find that out.
  async function resolveAsync(question, utterance, options) {
    const settings = options || {};
    const result = resolveByRules(question, utterance);
    if (!shouldEscalate(question, result, settings)) return result;
    return applyClassifierAsync(question, utterance, settings.classifier);
  }

  return Object.freeze({
    normalizeText,
    resolve,
    resolveAsync,
    resolveSingle,
    resolveMulti,
    resolveNumber,
    INTENT_BY_UTTERANCE
  });
}));
