(function registerAnswerIntake(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EGAnswerIntake = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createAnswerIntake() {
  // The gate every non-form front end writes an answer through.
  //
  // `answers` does not hold answer codes. It holds the display label, and
  // answer-codes.js turns it into a code with `question.options.indexOf(option)`.
  // An exact string, or nothing: a synonym, a trimmed label, a different
  // punctuation mark, or the code itself all miss, and the miss is silent in
  // three separate places --
  //
  //   type "multi"   buildAnswerCodeRows maps then `.filter(Boolean)`, so an
  //                  unresolved option is DROPPED from the array while the
  //                  question still reports status "answered". Three symptoms
  //                  become two and nothing anywhere says so.
  //   type "single"  the row becomes { status: "answered", value: null } --
  //                  answered, with no answer in it.
  //   symptom row    buildSymptomFeatureRow asks `selected.includes(label)`,
  //                  so a label that does not match sets that column to 0.
  //                  Not missing: zero. The model is told the person denied a
  //                  symptom they actually reported.
  //
  // The form cannot reach any of these, because it only ever writes strings it
  // took out of `question.options` itself. A conversational front end composes
  // strings for a living, so this is a risk the chat intake introduces rather
  // than one already present -- which is why the guard belongs on the seam
  // between the two, and why it refuses rather than repairs. A near-miss that
  // gets "fixed" by fuzzy matching is the same fabricated answer, arrived at
  // more confidently.
  //
  // Everything downstream of this module is the existing, contract-pinned
  // pipeline. Nothing here needs to know what a feature column is.

  // How the rest of the app says "the person did not give us this". Recognised
  // in nine places across the builders (buildAnswerCodeRows, the symptom row,
  // the rule inputs, the research row...), and the symptom row in particular
  // maps it to null rather than 0 -- an absent answer instead of a denial. The
  // skip button has written exactly this pair since the form existed; an
  // unresolved utterance degrades onto the same path rather than a new one, so
  // no builder has to learn a second spelling of uncertainty.
  const UNCERTAIN_VALUE = "不確定";
  const UNCERTAIN_SOURCE = "uncertain";

  // Stored values are always the Chinese canonical label, whatever language the
  // question was asked in: getOptionCode matches against question.options, and
  // the English wording lives in display copy that never reaches the data. An
  // English-speaking chatbot still writes 不確定 and 是 and 否.
  const CANONICAL_LANGUAGE = "zh";

  // Three questions the form's skip button has always refused, and for reasons
  // that do not soften in conversation: consent is a legal record, and the name
  // and email are how the report reaches a person at all. "Unknown" is not a
  // degraded answer for these, it is a missing submission -- so an unresolved
  // value is rejected outright and the caller has to ask again.
  const NON_DEGRADABLE_TYPES = new Set(["name", "email"]);
  const CONSENT_QUESTION_IDS = new Set(["consent_acknowledgement"]);
  const NON_DEGRADABLE_IDS = CONSENT_QUESTION_IDS;

  const FREE_TEXT_TYPES = new Set(["name", "email"]);

  function canDegradeToUnknown(question) {
    return !NON_DEGRADABLE_TYPES.has(question.type) && !NON_DEGRADABLE_IDS.has(question.id);
  }

  function isExactOption(question, candidate) {
    return Array.isArray(question.options) && question.options.indexOf(candidate) >= 0;
  }

  function answered(value) {
    return { status: "answered", value };
  }

  function unknown(reason, unresolved) {
    return { status: "unknown", value: UNCERTAIN_VALUE, reason, unresolved: unresolved || [] };
  }

  function rejected(reason, unresolved) {
    return { status: "rejected", value: null, reason, unresolved: unresolved || [] };
  }

  // Degrade where that is honest, refuse where it is not. Both are "did not
  // write what the caller proposed"; only the caller can tell them apart,
  // which is why the two come back as different statuses.
  function degrade(question, reason, unresolved) {
    return canDegradeToUnknown(question)
      ? unknown(reason, unresolved)
      : rejected(reason, unresolved);
  }

  function resolve(question, candidate) {
    if (!question || typeof question !== "object") {
      throw new TypeError("resolve requires a question definition");
    }

    if (question.type === "number") {
      if (candidate === null || candidate === undefined || candidate === "") {
        return degrade(question, "empty");
      }
      const text = String(candidate).trim();
      // Number("") is 0 and Number(" ") is 0, so the emptiness check above has
      // to come first or a blank answer becomes a confident zero.
      if (!text || !Number.isFinite(Number(text))) {
        return degrade(question, "not_a_number", [text]);
      }
      return answered(text);
    }

    if (FREE_TEXT_TYPES.has(question.type)) {
      const text = typeof candidate === "string" ? candidate.trim() : "";
      if (!text) return rejected("empty");
      return answered(text);
    }

    if (question.type === "multi") {
      if (!Array.isArray(candidate)) return degrade(question, "wrong_shape");

      // Consent is shaped like a multi-select and is not one. The submission
      // contract requires all three items, so a partial selection cannot be
      // submitted at all -- and because the check lives at the very end, the
      // person finds that out after answering the other fifty-odd questions,
      // with nothing to do but start again. Refusing it here costs them one
      // tap; letting it through costs them the session. Found by walking the
      // chat page by hand.
      if (CONSENT_QUESTION_IDS.has(question.id)) {
        const missing = question.options.filter((option) => !candidate.includes(option));
        if (missing.length > 0) return rejected("incomplete_consent", missing);
      }
      // An empty selection is not "nothing is wrong with me". The symptom row
      // reads an empty array as every column 0, so it would publish a full set
      // of denials the person never made. Saying "none of these" is an option
      // the question carries (noneOption) and has to be chosen, not inferred
      // from silence.
      if (candidate.length === 0) return degrade(question, "empty");

      const unresolved = candidate.filter((option) => !isExactOption(question, option));
      // All or nothing, deliberately. Writing the options that did resolve
      // would reproduce the `.filter(Boolean)` defect this module exists to
      // close: a shorter list that still claims status "answered". If one of
      // three symptoms could not be matched, what we know about this question
      // is not "two symptoms" -- it is that we need to ask again.
      if (unresolved.length > 0) return degrade(question, "unresolved", unresolved);

      // Duplicates would survive into the code array as repeated codes.
      const seen = new Set();
      const value = candidate.filter((option) => {
        if (seen.has(option)) return false;
        seen.add(option);
        return true;
      });
      return answered(value);
    }

    // "single", and anything else that carries an options list.
    if (Array.isArray(question.options)) {
      if (typeof candidate !== "string" || !candidate) return degrade(question, "empty");
      if (!isExactOption(question, candidate)) return degrade(question, "unresolved", [candidate]);
      return answered(candidate);
    }

    // No options to match against: free text whose shape this module cannot
    // check. Refuse an empty one and pass the rest through unchanged.
    if (typeof candidate === "string" && candidate.trim()) return answered(candidate.trim());
    return degrade(question, "empty");
  }

  // Resolve, then write -- or write the uncertain pair, or write nothing. The
  // result comes back so a chatbot can act on it: ask the question again on
  // "unresolved", insist on "rejected", move on when it is answered.
  //
  // makeAnswerEntry is injected rather than imported because it lives inside
  // app.js's module scope. Passing it keeps this file free of any opinion about
  // how an answer entry is shaped, which is also what lets the form and the
  // chat front end share it.
  function write(answers, question, candidate, options) {
    const settings = options || {};
    const makeAnswerEntry = settings.makeAnswerEntry;
    if (typeof makeAnswerEntry !== "function") {
      throw new TypeError("write requires a makeAnswerEntry function");
    }
    if (!answers || typeof answers !== "object") {
      throw new TypeError("write requires an answers store");
    }
    if (!question.field) {
      throw new TypeError(`question ${question.id} has no field to write to`);
    }

    const resolution = resolve(question, candidate);

    if (resolution.status === "answered") {
      answers[question.field] = makeAnswerEntry(question, resolution.value, settings.source || "chat");
      return resolution;
    }

    if (resolution.status === "unknown") {
      answers[question.field] = makeAnswerEntry(question, UNCERTAIN_VALUE, UNCERTAIN_SOURCE);
      return resolution;
    }

    // Rejected: leave the store untouched. A half-written consent record or a
    // blank email is worse than an absent one -- absent is a question the
    // caller can still ask again, written is a submission that looks complete.
    return resolution;
  }

  return Object.freeze({
    UNCERTAIN_VALUE,
    UNCERTAIN_SOURCE,
    CANONICAL_LANGUAGE,
    canDegradeToUnknown,
    isExactOption,
    resolve,
    write
  });
}));
