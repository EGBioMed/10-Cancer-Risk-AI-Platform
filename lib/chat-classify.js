// POST /api/chat/classify -- the conversational page's escalation endpoint.
//
// The browser cannot hold the API key, so the model call has to happen here.
// That makes this endpoint a thing other than a convenience: it is an
// authenticated door onto an account that bills per token, and the shape of
// the request is what decides whether it can be misused.
//
// So the client sends only { question_id, utterance }. It does not send the
// options, the prompt, or the model. The server looks the question up in its
// own copy of the questionnaire and builds the request from that. If the
// client supplied the options instead, anyone holding a session could classify
// arbitrary text against arbitrary "options" -- which is a free LLM proxy on
// the company's account, reachable by anyone who redeemed a code. There is no
// way to validate that back out of a client-supplied prompt, so it is never
// accepted in the first place.
//
// The response is a list of indices. Nothing the model wrote reaches the
// browser as text, which keeps the guarantee answer-resolver.js makes -- a
// model may choose, it may not write -- true across the network boundary too.
//
// What does leave the building: the question's own wording, its options, and
// the sentence the person just typed. That sentence is health information in
// their own words. It is sent only for questions that have options to choose
// between, never for the name or email fields, and nothing else about the
// respondent -- no identifiers, no other answers, no record id -- goes with it.

const UTTERANCE_MAX_LENGTH = 400;

// Free-text questions have nothing to classify into, and they are also the two
// that hold the respondent's name and email. Both reasons point the same way,
// so the rule is stated once and refuses both.
const UNCLASSIFIABLE_TYPES = new Set(["name", "email", "number"]);

function createChatClassifyHandler(options) {
  const settings = options || {};
  const loadQuestions = settings.loadQuestions;
  const classify = settings.classify;
  const limiter = settings.limiter;
  const sendJson = settings.sendJson;
  const readBody = settings.readBody;
  const rateLimitKey = settings.rateLimitKey || (() => "anonymous");
  const onUsage = typeof settings.onUsage === "function" ? settings.onUsage : null;

  if (typeof sendJson !== "function" || typeof readBody !== "function") {
    throw new TypeError("createChatClassifyHandler requires sendJson and readBody");
  }

  // Loaded on first use rather than at boot: reading app.js through a vm is
  // how the server gets the questionnaire, and a change that breaks it should
  // disable this one endpoint, not stop the server from starting and take the
  // form page down with it.
  let questions = null;
  let loadFailed = false;
  function questionnaire() {
    if (questions || loadFailed) return questions;
    try {
      questions = loadQuestions();
    } catch (error) {
      loadFailed = true;
      questions = null;
    }
    return questions;
  }

  return async function handleChatClassify(req, res) {
    if (typeof classify !== "function") {
      // Not an error state. The page falls back to asking again, which is the
      // behaviour it has whenever the rules and the model both come up empty.
      sendJson(res, 503, { ok: false, code: "classifier_unconfigured" });
      return;
    }

    if (limiter && !limiter.check(rateLimitKey(req))) {
      sendJson(res, 429, { ok: false, code: "rate_limited" });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (error) {
      sendJson(res, 400, { ok: false, code: "invalid_json" });
      return;
    }

    const questionId = payload && typeof payload.question_id === "string" ? payload.question_id : "";
    const utterance = payload && typeof payload.utterance === "string" ? payload.utterance : "";

    if (!questionId || !utterance.trim()) {
      sendJson(res, 400, { ok: false, code: "missing_fields" });
      return;
    }
    if (utterance.length > UTTERANCE_MAX_LENGTH) {
      sendJson(res, 400, { ok: false, code: "utterance_too_long" });
      return;
    }

    const all = questionnaire();
    if (!all) {
      sendJson(res, 503, { ok: false, code: "questionnaire_unavailable" });
      return;
    }

    const question = all.find((candidate) => candidate.id === questionId);
    if (!question) {
      sendJson(res, 404, { ok: false, code: "unknown_question" });
      return;
    }
    if (UNCLASSIFIABLE_TYPES.has(question.type) || !Array.isArray(question.options) || question.options.length === 0) {
      sendJson(res, 400, { ok: false, code: "question_not_classifiable" });
      return;
    }

    let verdict;
    try {
      verdict = await classify(question, utterance, { onUsage });
    } catch (error) {
      // The model being unreachable is not the respondent's problem and not a
      // reason to lose their session. The page treats this the same as an
      // abstention: ask again.
      sendJson(res, 502, { ok: false, code: "classifier_failed" });
      return;
    }

    const indices = verdict === null || verdict === undefined
      ? []
      : (Array.isArray(verdict) ? verdict : [verdict]);

    // Checked again on the way out. lib/classifier.js already constrains the
    // model to this question's indices, and answer-resolver.js discards
    // anything that is not one -- but this is the point where a value crosses
    // from the model's reply into a response the browser will act on, and a
    // boundary that is cheap to re-check is worth re-checking.
    const size = question.options.length;
    const clean = indices.filter(
      (index) => Number.isInteger(index) && index >= 0 && index < size
    );
    if (clean.length !== indices.length) {
      sendJson(res, 200, { ok: true, indices: [] });
      return;
    }

    sendJson(res, 200, { ok: true, indices: clean });
  };
}

module.exports = { createChatClassifyHandler, UTTERANCE_MAX_LENGTH, UNCLASSIFIABLE_TYPES };
