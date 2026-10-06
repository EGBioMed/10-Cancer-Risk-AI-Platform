const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Runs app.js's logic outside a browser, so a test can drive the real
// submission pipeline instead of a fixture that drifts from it.
//
// app.js is one file: question definitions, the answer store, every feature-row
// builder, and the DOM wiring. Everything above the first top-level DOM call is
// pure -- none of the builders touch `document` -- so the file is cut there and
// the top half evaluated in a vm with a stub `document` standing in for the
// handful of lookups that happen during setup.
//
// This was written for test-submission-e2e.js, which needed a completed
// questionnaire to reach the real storeSubmissionForIntegration(). It lives
// here because the chat intake needs the same thing for the opposite reason:
// to prove an answer written conversationally produces the same submission as
// the same answer clicked on the form, which can only be shown by running both
// through this pipeline rather than by comparing two descriptions of it.
//
// Each call builds a fresh sandbox, so one test's answers cannot leak into
// another's -- `answers` is module-scoped inside app.js and would otherwise be
// shared by every caller.
function loadApp() {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // 注意要抓行首那一個，檔案前段的 renderer 內也有同名選擇器。
  const cutoff = source.indexOf('\ndocument.querySelectorAll(".mode-tab")') + 1;
  if (cutoff <= 0) {
    throw new Error("Could not find the top-level DOM bootstrap in app.js");
  }

  const noop = () => {};
  const element = new Proxy({}, {
    get(_, prop) {
      if (prop === "classList") return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (prop === "style" || prop === "dataset") return {};
      if (prop === "children") return [];
      if (["innerHTML", "textContent", "value"].includes(prop)) return "";
      if (typeof prop === "string") return () => element;
      return undefined;
    },
    set: () => true
  });

  const sandbox = {
    EGAnswerCodes: require("../answer-codes"),
    // index.html 的 <script> 順序在這裡用 require 重現：app.js 在頂層就取用
    // EGApiSymptoms，少了它整份 app.js 連載入都會 ReferenceError。
    EGApiSymptoms: require("../api-symptoms"),
    document: {
      querySelector: () => element,
      querySelectorAll: () => [],
      createElement: () => element,
      getElementById: () => element,
      addEventListener: noop,
      body: element,
      documentElement: element
    },
    window: {},
    console,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { language: "en" },
    location: { href: "https://ai-cancer-risk.eg-bio.com/", search: "" },
    setTimeout,
    clearTimeout,
    Date
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // typeof-guarded: a name that app.js stops defining should surface as a
  // missing export where the test uses it, not as a ReferenceError thrown
  // while the sandbox is still being built, which would read as "app.js is
  // broken" for every test in the file at once.
  const exposed = [
    "questions",
    "answers",
    "makeAnswerEntry",
    "storeSubmissionForIntegration",
    "validateSubmissionBeforeSend",
    "canonicalAnswerQuestions",
    "symptomGroups",
    "getCompositeRows"
  ];
  const assignments = exposed
    .map((name) => `  ${name}: typeof ${name} === "undefined" ? undefined : ${name}`)
    .join(",\n");

  vm.runInContext(`${source.slice(0, cutoff)}
globalThis.__app = {
${assignments}
};`, sandbox);
  return sandbox.__app;
}

module.exports = { loadApp };
