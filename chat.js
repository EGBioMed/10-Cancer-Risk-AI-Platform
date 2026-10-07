(function conversationalIntake() {
  "use strict";

  // The conversational front end. It owns the words and the markup and nothing
  // else: what to ask next is chat-session.js, what a reply means is
  // answer-resolver.js, and what may be written is answer-intake.js.
  //
  // It borrows app.js's question definitions and submission builders rather
  // than restating them. Classic scripts share a global lexical environment, so
  // the `const questions` / `const answers` at the top of app.js are reachable
  // here by name -- which is the whole design: one questionnaire, one set of
  // feature-row builders, one contract. A second copy of 84 questions is a
  // second thing to keep in step with the manifest, and it would drift.
  //
  // Everything is built with textContent and createElement rather than
  // innerHTML. The text going onto this page includes what the person just
  // typed, and a questionnaire that renders a respondent's own words is not a
  // place to be clever about escaping.

  const CLASSIFY_ENDPOINT = "/api/chat/classify";

  const transcript = document.querySelector("#transcript");
  const optionsArea = document.querySelector("#options");
  const composer = document.querySelector("#composer");
  const input = document.querySelector("#reply");
  const progressBar = document.querySelector("#progressBar");
  const progressText = document.querySelector("#progressText");

  const lang = typeof currentLang === "string" ? currentLang : "zh";
  const isEnglish = lang === "en";

  const COPY = {
    zh: {
      intro: "您好，我會用對話的方式請教您一些健康相關的問題。您可以直接用自己的話回答，也可以點下面的選項。",
      retry: "抱歉，我沒有把您的回答對應到任何一個選項。可以換個說法，或直接點下面的選項嗎？",
      retryNoOptions: "抱歉，我沒有看懂。可以再說一次嗎？",
      retryNumber: "請給我一個數字就好。",
      disambiguate: "您的意思比較接近哪一個？",
      gaveUp: "這題先記成「不確定」，我們繼續往下。您之後可以再補。",
      declined: "好的，這題記成「不確定」。",
      blocked: "這一題不能跳過，需要您明確回答才能繼續。",
      consentIncomplete: "三項都需要您同意才能繼續。還缺：",
      contradictory: "您同時選了「以上皆無」和其他項目，這兩個意思互相矛盾。可以再選一次嗎？",
      done: "問卷到這裡結束，謝謝您。正在送出⋯⋯",
      submitted: "已送出。評估結果會寄到您填寫的 Email。",
      failed: "送出失敗：",
      multiHint: "可複選，選好後按「這些就是了」。",
      multiConfirm: "這些就是了",
      skip: "不確定",
      send: "送出",
      progress: (done, total) => `已完成 ${done} / ${total} 題`
    },
    en: {
      intro: "Hello. I'll ask you some health questions in a conversation. Answer in your own words, or tap one of the options below.",
      retry: "Sorry, I couldn't match that to any of the options. Could you put it another way, or tap one below?",
      retryNoOptions: "Sorry, I didn't follow that. Could you say it again?",
      retryNumber: "A number on its own, please.",
      disambiguate: "Which of these is closer to what you meant?",
      gaveUp: "I'll record this one as \"not sure\" and move on. You can come back to it later.",
      declined: "That's fine, I'll record this one as \"not sure\".",
      blocked: "This question can't be skipped -- I need a clear answer before we continue.",
      consentIncomplete: "All three need your agreement before we can continue. Still missing: ",
      contradictory: "You picked 'none of these' together with other items, which contradict each other. Could you choose again?",
      done: "That's the end of the questionnaire. Thank you. Submitting...",
      submitted: "Submitted. Your assessment will be emailed to the address you gave.",
      failed: "Submission failed: ",
      multiHint: "Choose as many as apply, then press \"That's all\".",
      multiConfirm: "That's all",
      skip: "Not sure",
      send: "Send",
      progress: (done, total) => `${done} of ${total} answered`
    }
  };

  const copy = COPY[isEnglish ? "en" : "zh"];

  // Escalation goes to the server, which holds the API key and builds the
  // request from its own copy of the questionnaire. This function sends the
  // question's id and the sentence, and gets back indices -- never text. If
  // the endpoint is unconfigured, unreachable, rate-limited or slow, it
  // answers null, which the resolver reads as unresolved and the session turns
  // into asking again: the questionnaire works whether or not a model is
  // behind it, and a bad day for the model is a slightly more repetitive
  // conversation rather than a broken one.
  async function classifyRemotely(question, utterance) {
    const text = Array.isArray(utterance) ? utterance.join("；") : String(utterance ?? "");
    let payload;
    try {
      const response = await fetch(CLASSIFY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: question.id, utterance: text })
      });
      if (!response.ok) return null;
      payload = await response.json();
    } catch (error) {
      return null;
    }

    if (!payload || payload.ok !== true || !Array.isArray(payload.indices)) return null;
    if (payload.indices.length === 0) return null;
    if (question.type === "multi") return payload.indices;
    return payload.indices.length === 1 ? payload.indices[0] : null;
  }

  const session = EGChatSession.createChatSession({
    app: { questions, answers, makeAnswerEntry },
    numberBounds: getNumberBounds,
    classifier: classifyRemotely,
    source: "chat"
  });

  let awaitingMultiSelection = null;

  function say(text, who) {
    const line = document.createElement("div");
    line.className = `bubble bubble--${who}`;
    line.textContent = text;
    transcript.appendChild(line);
    transcript.scrollTop = transcript.scrollHeight;
    return line;
  }

  function note(text) {
    const line = document.createElement("div");
    line.className = "note";
    line.textContent = text;
    transcript.appendChild(line);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function questionText(question) {
    if (typeof getQuestionCopy === "function") {
      const written = getQuestionCopy(question);
      if (written && written.title) return written.title;
    }
    return isEnglish && question.titleEn ? question.titleEn : question.title;
  }

  function clearOptions() {
    optionsArea.replaceChildren();
    awaitingMultiSelection = null;
  }

  function chip(label, onClick, selected) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = selected ? "chip chip--on" : "chip";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  // Tapping an option sends the option -- the exact string out of
  // question.options, not the label as rendered and not a reconstruction of it.
  // That is what makes the tap path incapable of the near-miss that
  // answer-intake.js exists to catch, and it is why the chips are offered at
  // all rather than insisting on free text.
  function renderOptions(question, turn) {
    clearOptions();
    const offered = turn.kind === "disambiguate" && turn.pending && turn.pending.candidates
      ? turn.pending.candidates
      : question.options;
    if (!Array.isArray(offered) || offered.length === 0) return;

    if (question.type === "multi") {
      const chosen = new Set();
      awaitingMultiSelection = chosen;
      const hint = document.createElement("p");
      hint.className = "options__hint";
      hint.textContent = copy.multiHint;
      optionsArea.appendChild(hint);

      for (const option of offered) {
        const button = chip(option, () => {
          if (chosen.has(option)) chosen.delete(option);
          else chosen.add(option);
          button.className = chosen.has(option) ? "chip chip--on" : "chip";
        });
        optionsArea.appendChild(button);
      }

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "chip chip--confirm";
      confirm.textContent = copy.multiConfirm;
      confirm.addEventListener("click", () => {
        if (chosen.size === 0) return;
        reply([...chosen], [...chosen].join("、"));
      });
      optionsArea.appendChild(confirm);
      return;
    }

    for (const option of offered) {
      optionsArea.appendChild(chip(option, () => reply(option, option)));
    }
  }

  function renderProgress() {
    const { answered, applicable } = session.progress();
    const percent = applicable === 0 ? 0 : Math.round((answered / applicable) * 100);
    progressBar.style.width = `${percent}%`;
    progressBar.parentElement.setAttribute("aria-valuenow", String(percent));
    progressText.textContent = copy.progress(answered, applicable);
  }

  function retryLine(question) {
    if (question.type === "number") return copy.retryNumber;
    if (!Array.isArray(question.options) || question.options.length === 0) return copy.retryNoOptions;
    return copy.retry;
  }

  function ask() {
    renderProgress();
    const turn = session.next();
    if (turn.done) return finish();

    // The generic retry line points at options. On a question that has none,
    // that is an instruction the page cannot honour, so it gets its own wording.
    if (turn.kind === "retry") {
      say(turn.pending && turn.pending.reason === "contradictory_selection"
        ? copy.contradictory
        : retryLine(turn.question), "bot");
    }
    else if (turn.kind === "disambiguate") say(copy.disambiguate, "bot");
    else say(questionText(turn.question), "bot");

    renderOptions(turn.question, turn);
    input.disabled = false;
    input.focus();
    return undefined;
  }

  // Async now that a reply may wait on the server. The composer is disabled
  // while it does: without that, pressing send twice attributes the second
  // sentence to whichever question the first one advanced to.
  let inFlight = false;
  async function reply(utterance, shown) {
    if (inFlight) return;
    inFlight = true;
    say(shown, "me");
    clearOptions();
    input.disabled = true;

    let result;
    try {
      result = await session.receiveAsync(utterance);
    } finally {
      inFlight = false;
      input.disabled = false;
    }

    if (result.status === "declined" || result.status === "gave_up") {
      note(result.status === "declined" ? copy.declined : copy.gaveUp);
    } else if (result.status === "blocked") {
      // Say what is still needed. "This cannot be skipped" is true and useless
      // when the person did answer and just did not tick everything.
      const missing = result.pending && result.pending.reason === "incomplete_consent"
        ? result.pending.detail
        : null;
      say(missing ? copy.consentIncomplete + "\n\n" + missing.join("\n\n") : copy.blocked, "bot");
      // Re-render the same question's options so the way forward is visible
      // rather than implied.
      const turn = session.next();
      if (!turn.done) renderOptions(turn.question, turn);
      renderProgress();
      return;
    }

    ask();
  }

  async function finish() {
    clearOptions();
    input.disabled = true;
    say(copy.done, "bot");
    try {
      const submission = storeSubmissionForIntegration();
      await submitSubmission(submission);
      say(copy.submitted, "bot");
    } catch (error) {
      // userMessage is the wording app.js already writes for a lapsed session
      // or a rejected submission; repeating it here keeps one explanation of
      // each failure rather than a second one that drifts.
      say(copy.failed + (error.userMessage || error.message), "bot");
    }
  }

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    // Free text on a multi question is handed over as one item: the rules match
    // it whole if it is an option, and otherwise it escalates. Splitting a
    // sentence into items is the classifier's job, and guessing at it here
    // with a comma split would quietly drop whatever did not split cleanly.
    reply(awaitingMultiSelection ? [text] : text, text);
  });

  document.querySelector("#skip").addEventListener("click", () => {
    reply(isEnglish ? "unknown" : "不確定", copy.skip);
  });

  say(copy.intro, "bot");
  ask();
}());
