const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  sanitizeLegacyDirectIdentifiers,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");

// 這一支補的是所有既有測試共同的缺口：沒有任何一支從「填完整份問卷」開始，用
// app.js 真正的 storeSubmissionForIntegration() 組出送件物件，再讓前端與後端的
// 合約檢查跑過它。缺了這一段，2026-09-07 那種錯誤可以全綠上線——當時 country 讓
// ai_api_feature_row 變成 72 個鍵、對不上 71 欄的清單，於是每一筆送件都在瀏覽器
// 端就被自己的檢查擋掉，而測試只比對原始碼字串或用不帶 country 的假 fixture。
//
// 做法是把 app.js 到第一行 DOM 操作為止的部分放進 vm，補一組最小的 document 假物件，
// 然後照題目定義把每一題都填掉。填的值不追求臨床上合理（那是報告端的測試在管），
// 這裡只驗證形狀：向量鍵數、答案碼列數、同意紀錄、識別資訊外洩。
function loadApp() {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  // 注意要抓行首那一個，檔案前段的 renderer 內也有同名選擇器。
  const cutoff = source.indexOf('\ndocument.querySelectorAll(".mode-tab")') + 1;
  assert(cutoff > 0, "Could not find the top-level DOM bootstrap in app.js");

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
    EGAnswerCodes: require("./answer-codes"),
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
  vm.runInContext(`${source.slice(0, cutoff)}
globalThis.__app = {
  questions, answers, makeAnswerEntry,
  storeSubmissionForIntegration, validateSubmissionBeforeSend
};`, sandbox);
  return sandbox.__app;
}

const app = loadApp();

function fillEveryQuestion() {
  for (const question of app.questions) {
    if (!question.field) continue;
    let value;
    if (question.type === "multi") value = [question.options?.[0]];
    else if (question.options) value = question.options[0];
    else if (question.type === "email") value = "contract-test@example.com";
    else if (question.type === "name") value = "王小明";
    else if (question.id.includes("birth_year")) value = "1980";
    else if (question.id.includes("height")) value = "165";
    else if (question.id.includes("weight")) value = "60";
    else value = "1";
    if (value === undefined) continue;
    app.answers[question.field] = app.makeAnswerEntry(question, value, "contract_test");
  }
  // 同意題必須三項全選，否則 buildConsentRecord 只會收錄選到的那些。
  const consent = app.questions.find((question) => question.id === "consent_acknowledgement");
  app.answers[consent.field] = app.makeAnswerEntry(consent, [...consent.options], "contract_test");
}

function submitAs(countryLabel) {
  const country = app.questions.find((question) => question.id === "country");
  app.answers[country.field] = app.makeAnswerEntry(country, countryLabel, "contract_test");
  return app.storeSubmissionForIntegration();
}

fillEveryQuestion();

// 每個國別選項都要能送得出去。「臺灣」也在其中，因為 2026-09-07 的故障與選了哪個
// 國家無關：只要 country 存在，每一筆都會被擋。
for (const [label, expectedCode] of [
  ["臺灣", "TW"], ["香港", "TW"], ["中國", "TW"], ["美國", "US"],
  ["日本", "TW"], ["加拿大", "CA"], ["馬來西亞", "TW"]
]) {
  test(`a completed questionnaire submitted from ${label} passes both contract validators`, () => {
    const submission = submitAs(label);
    assert.equal(submission.ai_api_feature_row.country, expectedCode);
    app.validateSubmissionBeforeSend(submission);
    // vm realm 的物件過不了後端的 isPlainObject，所以先過一次 JSON——線上也是這樣
    // 走的（瀏覽器 JSON.stringify 後 POST，伺服器再 parse）。
    const posted = JSON.parse(JSON.stringify(submission));
    assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(posted)), []);
  });
}

test("an unanswered country question still submits and falls back to the Taiwan baseline", () => {
  const country = app.questions.find((question) => question.id === "country");
  delete app.answers[country.field];
  const submission = app.storeSubmissionForIntegration();
  assert.equal(submission.ai_api_feature_row.country, "TW");
  app.validateSubmissionBeforeSend(submission);
  const posted = JSON.parse(JSON.stringify(submission));
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(posted)), []);
});
