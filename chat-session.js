(function registerChatSession(root, factory) {
  const api = factory(
    typeof require === "function" ? require("./answer-resolver") : root.EGAnswerResolver,
    typeof require === "function" ? require("./answer-intake") : root.EGAnswerIntake
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EGChatSession = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createChatSessionApi(resolver, intake) {

  // Decides what to ask next and what to do with the reply. It renders nothing
  // and owns no copy -- it hands back the question object and the caller writes
  // the words, which is what lets the same session drive text, voice, or a test.
  //
  // Two policies here are the whole point of the file, and both are about when
  // to stop trying:
  //
  //   Re-asking is bounded. After maxAttempts the question is recorded as
  //   unknown and the conversation moves on. An unbounded loop is worse than a
  //   missing answer: the person cannot leave, and the data model already has
  //   an honest way to say "we did not get this one". Three goes at the same
  //   question is where a person decides the thing is broken.
  //
  //   Consent, name and email never auto-advance. They cannot be recorded as
  //   unknown (answer-intake.js refuses to), and moving past them produces a
  //   submission that cannot be delivered or lawfully used. The session stops
  //   and says so, rather than quietly finishing something unusable.

  const DEFAULT_MAX_ATTEMPTS = 2;

  // Read-back. An understood answer is said back before it counts: "you were
  // born in 1997, is that right?". In the two Taiwanese role-play tests
  // (2026-11) the worst errors -- a weight of 46 heard as 40, a joking "有有有"
  // taken at its word -- were both ones a read-back catches on the spot, and
  // neither raised any error anywhere.
  //
  // Which answers get read back is a policy the caller passes in; this is the
  // one the chat page uses. Numbers, because a misheard number slips past every
  // option list straight into the model. And anything a model had to interpret,
  // because that is where a confident wrong reading comes from. An option the
  // person tapped, or typed word for word, is not read back: asking someone to
  // confirm the button they just pressed teaches them to say yes to everything.
  function readBackPolicy(question, resolution) {
    return question.type === "number" || resolution.via === "classifier";
  }

  // What counts as "yes, that's right" and "no" to a read-back. Taiwanese and
  // Mandarin forms both, since that is how the people this page is for answer.
  // Anything else is neither, and the read-back is asked again rather than
  // guessed at.
  const CONFIRM_YES = new Set([
    "對", "是", "著", "有", "沒錯", "正確", "對的", "是的", "著啊", "著著著", "嗯", "好", "沒問題",
    "yes", "y", "correct", "right", "ok", "okay"
  ]);
  const CONFIRM_NO = new Set([
    "不對", "不是", "毋著", "毋是", "錯", "錯了", "否", "不", "無", "沒有",
    "no", "n", "wrong", "incorrect"
  ]);

  function confirmIntent(utterance) {
    const key = resolver.normalizeText(Array.isArray(utterance) ? utterance.join("") : String(utterance ?? ""));
    if (CONFIRM_YES.has(key)) return "yes";
    if (CONFIRM_NO.has(key)) return "no";
    return null;
  }

  function isAnswered(answers, question) {
    return Object.prototype.hasOwnProperty.call(answers, question.field);
  }

  // appliesIf closures in app.js read its module-scoped `answers` directly and
  // ignore the argument, so this is only meaningful when the session is driving
  // that same object -- which is why `answers` is taken from the app rather
  // than created here.
  function isApplicable(question, answers) {
    if (typeof question.appliesIf !== "function") return true;
    try {
      return Boolean(question.appliesIf(answers));
    } catch (error) {
      // A condition that cannot be evaluated is not a licence to skip a
      // question: ask it. A question asked unnecessarily costs a moment; one
      // skipped in error is a hole in the assessment that nothing reports.
      return true;
    }
  }

  function createChatSession(options) {
    const settings = options || {};
    const app = settings.app;
    if (!app || !Array.isArray(app.questions) || !app.answers || typeof app.makeAnswerEntry !== "function") {
      throw new TypeError("createChatSession requires { app: { questions, answers, makeAnswerEntry } }");
    }

    const answers = app.answers;
    const maxAttempts = Number.isInteger(settings.maxAttempts) && settings.maxAttempts > 0
      ? settings.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;
    const classifier = typeof settings.classifier === "function" ? settings.classifier : undefined;
    // Passed through to the resolver so a number answer is held to the same
    // range the form's own <input> would have enforced. Without it the chat
    // path accepts values the form refuses -- see answer-resolver.js.
    const numberBounds = typeof settings.numberBounds === "function" ? settings.numberBounds : undefined;
    const resolverOptions = (classifier || numberBounds) ? { classifier, numberBounds } : undefined;
    const source = settings.source || "chat";
    // Off unless the caller asks for it, so a session built without the option
    // behaves exactly as it always has.
    const shouldReadBack = typeof settings.readBack === "function" ? settings.readBack : null;

    // The composite containers carry no field of their own; their rows are
    // separate questions in the same list, and asking those one at a time is
    // what a conversation does anyway.
    const askable = app.questions.filter((question) => Boolean(question.field));

    // Questions the conversation answers itself instead of asking -- today only
    // collection_mode, which on this page is "self-completed" by definition.
    // Written through the intake like any reply, so the default is held to the
    // same rule: it has to be one of the question's own options.
    for (const question of askable) {
      if (question.chatDefault === undefined || isAnswered(answers, question)) continue;
      intake.write(answers, question, question.chatDefault, { makeAnswerEntry: app.makeAnswerEntry, source });
    }

    let current = null;
    let attempts = 0;
    let pending = null; // the last unresolved reply, for the caller to act on
    // An answer that has been written but not yet confirmed. While it is set,
    // the next reply is a yes or no to the read-back, not an answer.
    let awaiting = null;
    let confirmAttempts = 0;
    let corrections = 0;

    // Scanned from the start every time rather than walked with a cursor: an
    // answer can make an earlier question applicable that was skipped when we
    // passed it, and a cursor would never come back for it.
    function findNext() {
      for (const question of askable) {
        if (isAnswered(answers, question)) continue;
        if (!isApplicable(question, answers)) continue;
        return question;
      }
      return null;
    }

    function describe(question, kind) {
      return {
        done: false,
        question,
        kind,
        attempt: attempts + 1,
        maxAttempts,
        canDegrade: intake.canDegradeToUnknown(question),
        options: Array.isArray(question.options) ? question.options.slice() : null,
        pending
      };
    }

    function next() {
      if (awaiting) {
        return { ...describe(awaiting.question, "confirm"), value: awaiting.value };
      }
      if (current && !isAnswered(answers, current) && isApplicable(current, answers)) {
        const kind = pending && pending.status === "corrected" ? "correct"
          : pending && pending.status === "ambiguous" ? "disambiguate"
          : attempts > 0 ? "retry"
          : "ask";
        return describe(current, kind);
      }

      current = findNext();
      attempts = 0;
      pending = null;
      if (!current) return { done: true, question: null };
      return describe(current, "ask");
    }

    function recordUnknown(question) {
      return intake.write(answers, question, intake.UNCERTAIN_VALUE, {
        makeAnswerEntry: app.makeAnswerEntry,
        source
      });
    }

    // Pulls the question this reply belongs to, or null when there is none
    // left. next() has to run before a reply can be attributed: guessing which
    // question an answer was for is the quietest possible way to corrupt a
    // submission.
    function questionForReply() {
      if (current) return current;
      const upcoming = next();
      return upcoming.done ? null : current;
    }

    // The reply to a read-back. "Yes" keeps the answer; "no" discards it and
    // asks the question again; anything else asks the read-back again. Both
    // loops are bounded like every other: after maxAttempts unclear replies the
    // answer is treated as not confirmed, and after maxAttempts corrections the
    // question is recorded as unknown -- an answer the person kept rejecting is
    // not one to keep.
    function receiveConfirmation(utterance) {
      const { question, value, via } = awaiting;
      const intent = confirmIntent(utterance);

      if (intent === "yes") {
        awaiting = null;
        confirmAttempts = 0;
        corrections = 0;
        attempts = 0;
        pending = null;
        current = null;
        return { status: "answered", question, value, via, confirmed: true };
      }

      if (intent === null) {
        confirmAttempts += 1;
        if (confirmAttempts < maxAttempts) {
          return { status: "confirm_unclear", question, value, attempts: confirmAttempts };
        }
      }

      // Not confirmed: "no", or unclear too many times.
      delete answers[question.field];
      awaiting = null;
      confirmAttempts = 0;
      corrections += 1;
      if (corrections > maxAttempts) {
        corrections = 0;
        attempts = 0;
        pending = null;
        current = null;
        // A question that cannot fall back to unknown (consent, name, email)
        // is never read back by the policy, so recording unknown is safe here.
        recordUnknown(question);
        return { status: "gave_up", question, attempts: 0, pending: { reason: "not_confirmed" } };
      }
      attempts = 0;
      current = question;
      pending = { status: "corrected", via: "read_back", reason: null, detail: null, candidates: null };
      return { status: "corrected", question, value };
    }

    function receive(utterance) {
      if (awaiting) return receiveConfirmation(utterance);
      const question = questionForReply();
      if (!question) return { status: "done", question: null };
      const resolution = resolver.resolve(question, utterance, resolverOptions);
      return applyResolution(question, resolution);
    }

    // The same turn, for a classifier that is a network call.
    async function receiveAsync(utterance) {
      if (awaiting) return receiveConfirmation(utterance);
      const question = questionForReply();
      if (!question) return { status: "done", question: null };
      const resolution = await resolver.resolveAsync(
        question,
        utterance,
        resolverOptions
      );
      return applyResolution(question, resolution);
    }

    function applyResolution(question, resolution) {
      if (resolution.status === "matched") {
        const written = intake.write(answers, question, resolution.value, {
          makeAnswerEntry: app.makeAnswerEntry,
          source
        });
        if (written.status === "answered") {
          pending = null;
          attempts = 0;
          if (shouldReadBack && shouldReadBack(question, resolution)) {
            // Written already, so the intake has accepted it; it only counts
            // once the person says it is right.
            awaiting = { question, value: resolution.value, via: resolution.via };
            confirmAttempts = 0;
            return { status: "confirm", question, value: resolution.value, via: resolution.via };
          }
          corrections = 0;
          current = null;
          return { status: "answered", question, value: resolution.value, via: resolution.via };
        }
        // "unknown" means the intake wrote the uncertain marker. The question
        // is recorded, so asking it again would be asking something already
        // answered -- and the retry path below would do exactly that while
        // next() quietly skipped past it, because a question with a marker
        // counts as answered. Advance instead, and say what happened.
        if (written.status === "unknown") {
          pending = null;
          attempts = 0;
          current = null;
          return { status: "gave_up", question, attempts: 0, pending: { reason: written.reason } };
        }
        // The resolver matched and the intake still refused. Two ways that
        // happens. One is a rule about the answer as a whole, which the
        // resolver cannot see -- consent needing all three items is the live
        // example -- and the caller needs the intake's own reason to say what
        // is still missing, so it is carried through rather than flattened.
        // The other is genuine drift between the two modules, which their
        // shared test exists to prevent; if it ever happens anyway the honest
        // outcome is the same as any other unresolved reply, not a crash
        // halfway through someone's questionnaire.
        resolution.status = "unmatched";
        resolution.via = "intake_refused";
        resolution.reason = written.reason;
        resolution.detail = written.unresolved && written.unresolved.length
          ? written.unresolved
          : resolution.detail;
      }

      if (resolution.status === "declined") {
        // The person said they do not know. Re-asking that is not clarifying,
        // it is not listening.
        const written = recordUnknown(question);
        if (written.status === "rejected") {
          pending = { status: "declined", via: resolution.via };
          attempts += 1;
          return { status: "blocked", question, reason: "cannot_decline", attempts };
        }
        pending = null;
        attempts = 0;
        current = null;
        return { status: "declined", question };
      }

      attempts += 1;
      pending = {
        status: resolution.status,
        via: resolution.via,
        // The intake's own reason when it was the intake that refused, so the
        // caller can say "these two are still missing" instead of "try again".
        reason: resolution.reason || null,
        detail: resolution.detail || null,
        // For an ambiguity the caller can offer the readings back rather than
        // repeating the question unchanged, which is the difference between
        // being asked again and being understood halfway.
        candidates: Array.isArray(resolution.indices)
          ? resolution.indices.map((index) => question.options[index])
          : null
      };

      if (!intake.canDegradeToUnknown(question)) {
        return { status: "blocked", question, reason: resolution.status, attempts, pending };
      }

      if (attempts >= maxAttempts) {
        recordUnknown(question);
        const exhausted = { status: "gave_up", question, attempts, pending };
        pending = null;
        attempts = 0;
        current = null;
        return exhausted;
      }

      return { status: resolution.status, question, attempts, pending };
    }

    // Counted against what currently applies rather than against all 82: the
    // denominator moves as answers change, and reporting a fixed total would
    // show someone a progress bar that goes backwards.
    function progress() {
      let applicable = 0;
      let answered = 0;
      let unknown = 0;
      for (const question of askable) {
        const answeredHere = isAnswered(answers, question);
        if (!answeredHere && !isApplicable(question, answers)) continue;
        applicable += 1;
        if (!answeredHere) continue;
        answered += 1;
        if (answers[question.field].source === intake.UNCERTAIN_SOURCE) unknown += 1;
      }
      return { answered, applicable, unknown, remaining: applicable - answered };
    }

    function isComplete() {
      return awaiting === null && findNext() === null;
    }

    // Discards an answer so the question comes round again. For the checks
    // that can only run once several answers exist -- the form's BMI check
    // across height and weight is the one in play -- where the alternative is
    // refusing to submit and leaving the person with no way to correct it.
    // Returns whether there was anything to reopen.
    function reopen(questionIds) {
      const wanted = new Set(Array.isArray(questionIds) ? questionIds : [questionIds]);
      let reopened = 0;
      for (const question of askable) {
        if (!wanted.has(question.id)) continue;
        if (!isAnswered(answers, question)) continue;
        delete answers[question.field];
        reopened += 1;
      }
      if (reopened > 0) {
        current = null;
        attempts = 0;
        pending = null;
        if (awaiting && wanted.has(awaiting.question.id)) awaiting = null;
      }
      return reopened;
    }

    return {
      next,
      receive,
      receiveAsync,
      progress,
      isComplete,
      reopen,
      get currentQuestion() { return current; },
      get awaitingConfirmation() { return awaiting ? { question: awaiting.question, value: awaiting.value } : null; }
    };
  }

  return Object.freeze({ createChatSession, DEFAULT_MAX_ATTEMPTS, readBackPolicy, confirmIntent });
}));
