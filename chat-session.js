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

    // The composite containers carry no field of their own; their rows are
    // separate questions in the same list, and asking those one at a time is
    // what a conversation does anyway.
    const askable = app.questions.filter((question) => Boolean(question.field));

    let current = null;
    let attempts = 0;
    let pending = null; // the last unresolved reply, for the caller to act on

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
      if (current && !isAnswered(answers, current) && isApplicable(current, answers)) {
        const kind = pending && pending.status === "ambiguous" ? "disambiguate"
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

    function receive(utterance) {
      const question = questionForReply();
      if (!question) return { status: "done", question: null };
      const resolution = resolver.resolve(question, utterance, resolverOptions);
      return applyResolution(question, resolution);
    }

    // The same turn, for a classifier that is a network call.
    async function receiveAsync(utterance) {
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
          current = null;
          return { status: "answered", question, value: resolution.value, via: resolution.via };
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
      return findNext() === null;
    }

    return {
      next,
      receive,
      receiveAsync,
      progress,
      isComplete,
      get currentQuestion() { return current; }
    };
  }

  return Object.freeze({ createChatSession, DEFAULT_MAX_ATTEMPTS });
}));
