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
    // index.html 的 <script> 順序在這裡用 require 重現：app.js 在頂層就取用
    // EGApiSymptoms，少了它整份 app.js 連載入都會 ReferenceError。
    EGApiSymptoms: require("./api-symptoms"),
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

// 症狀區塊：2026-09-08 之前 ai_api_feature_row 根本沒有這個鍵，API 的
// SurveyInput.symptoms 就落到預設 None，to_rule_dict() 只填得出四個 legacy
// fallback 欄位，於是 40 條硬規則裡只有 A-36 有可能觸發，每份報告都印「未觸發」。
// 前端這一側能驗的是「送出去的形狀對不對」；「規則層真的因此觸發」由 API 端的
// test_symptoms_wiring.py 驗（它同時跑對照組，證明差別確實來自 symptoms）。
const apiSymptoms = require("./api-symptoms");

// 一律經由這個 helper 取值，不要直接 .ai_api_feature_row.symptoms。整個鍵不見時
// 直接索引會丟 TypeError: Cannot read properties of undefined，下一個讀到紅字的人
// 看不出病灶在哪；這裡先斷言，訊息會直接指出接線斷了。
function symptomsOf(countryLabel = "臺灣") {
  const featureRow = submitAs(countryLabel).ai_api_feature_row;
  assert(
    "symptoms" in featureRow,
    "ai_api_feature_row 沒有 symptoms：規則層會收不到任何症狀，每份報告都會印「未觸發任何硬規則」"
  );
  return featureRow.symptoms;
}

test("the submission carries a symptoms block for the literature high-risk rule layer", () => {
  const symptoms = symptomsOf();
  assert.equal(typeof symptoms, "object");
  assert(symptoms !== null && !Array.isArray(symptoms));
  // 空物件過不了：{} 到了 API 端會讓每個欄位都退回宣告預設值（大多是 0），規則層
  // 看起來「有資料」卻全暗，比整個鍵不存在更難察覺。
  assert(Object.keys(symptoms).length > 50, `symptoms only carried ${Object.keys(symptoms).length} fields`);
  // 規則層唯一會讀的就是這些欄位；抽三條實際會觸發的硬規則所引用的欄位來釘住。
  // A-05 胰臟癌 = {jaundice}、A-02 = {jaundice, weight_loss}、A-36 = {weight_loss}。
  for (const field of ["symptom_jaundice", "symptom_unexplained_weight_loss_6m"]) {
    assert(field in symptoms, `${field} must reach the rule layer`);
  }
});

test("every value in the symptoms block is inside the API's declared range", () => {
  const symptoms = symptomsOf();
  for (const [field, value] of Object.entries(symptoms)) {
    // null 一律不送而是整個欄位省略：省略時 API 用宣告預設值，語意等於「未填」，
    // 而 null 得靠 API 端的 _null_means_not_applicable 兜，兩層都對才不會 422。
    assert(value !== null && value !== undefined, `${field} must be omitted rather than sent as null`);
    assert(Number.isInteger(value), `${field} must be an integer, got ${typeof value}`);
    if (/_(repeat_count|interval_days)$/.test(field)) {
      // 次數與間隔天數不是二元欄位，API 那側只宣告 ge=0，9 代表「9 次」而非哨兵值。
      assert(value >= 0, `${field} must not be negative`);
      continue;
    }
    // 其餘欄位在 API 上都是 Field(0, ge=0, le=1)。問卷端的 9（不適用）與
    // 1/2/3（選項代碼）必須在 api-symptoms.js 就翻譯完，送到這裡只能是 0 或 1；
    // 沒翻到的話 API 會 422，整個 symptoms 連帶失效，規則層又回到全暗。
    assert(value === 0 || value === 1, `${field} must be 0 or 1, got ${value}`);
  }
});

test("the symptoms block omits the rule columns the API does not declare", () => {
  const symptoms = symptomsOf();
  const ruleInputRow = submitAs("臺灣").rule_input_row;
  // 這九欄帶的是 1/2/3 病程／持續時間／部位代碼，v19.12 沒有任何規則引用它們，
  // 而 API 上也沒有對應欄位宣告。要放行必須先在 API 端宣告，不能只是拿掉排除。
  for (const field of apiSymptoms.EXCLUDED_RULE_INPUTS) {
    assert(field in ruleInputRow, `${field} should still be collected in rule_input_row`);
    assert(!(field in symptoms), `${field} must not be sent to the API`);
  }
});

// 選項代碼→規則層二元語意的翻譯是這次修正裡最容易靜默錯掉的一段：翻錯不會報錯，
// 只會讓 B-28（子宮頸癌）與 G-03（攝護腺癌）在錯誤的答案上觸發或不觸發。
for (const [questionId, answer, field, expected] of [
  ["pap_smear_timing", "3 年內", "screen_pap_overdue_or_out_of_range", 0],
  ["pap_smear_timing", "3 年以上", "screen_pap_overdue_or_out_of_range", 1],
  ["pap_smear_timing", "從未做過", "screen_pap_overdue_or_out_of_range", 1],
  ["pap_smear_timing", "不記得", "screen_pap_overdue_or_out_of_range", undefined],
  ["psa_history", "做過且曾被告知偏高", "screen_psa_elevated", 1],
  ["psa_history", "做過且結果正常", "screen_psa_elevated", 0],
  ["psa_history", "沒做過", "screen_psa_elevated", 0],
  ["psa_history", "不記得", "screen_psa_elevated", undefined]
]) {
  test(`${questionId} = 「${answer}」 reaches the rule layer as ${field}=${expected}`, () => {
    const question = app.questions.find((entry) => entry.id === questionId);
    app.answers[question.field] = app.makeAnswerEntry(question, answer, "contract_test");
    const symptoms = symptomsOf();
    if (expected === undefined) {
      // 「不記得」不是 0：規則層若收到 0 會當成「已排除」，E 節的負向證據可能因此
      // 誤扣分。不知道就整個欄位不送。
      assert(!(field in symptoms), `${field} must be omitted when the answer is 不記得`);
    } else {
      assert.equal(symptoms[field], expected);
    }
  });
}

// 上層概念欄位：規則讀 symptom_abdominal_pain，問卷問的是四個細項。app.js 的
// derivedParents 一直知道怎麼組，但組出來的值只拿去決定要不要追問復發次數，沒送給
// API，所以 A-01、A-27、B-14 等 12 條引用它的規則在線上永遠讀到 0。這一類錯不會有任何
// 錯誤訊息——欄位不存在與欄位為 0，在規則引擎裡是同一件事（_num() 兩者都回 0）。
test("the symptoms block carries the rule layer's parent concept fields", () => {
  const symptoms = symptomsOf();
  for (const parent of Object.keys(apiSymptoms.DERIVED_FIELDS)) {
    assert(parent in symptoms, `${parent} must reach the rule layer`);
    assert(symptoms[parent] === 0 || symptoms[parent] === 1, `${parent} must be 0 or 1`);
  }
});

// 合併語意直接打 buildApiSymptoms()，不繞問卷：要精準控制「某個細項是 null」這種狀態，
// 從答案層很難構造，而這裡要驗的正是三態的分界。
for (const [name, children, expected] of [
  ["任一細項為 1 就是 1", { symptom_persistent_abdominal_pain: 0, symptom_epigastric_pain: 1, symptom_upper_abdominal_discomfort: 0, symptom_right_upper_abdominal_discomfort: null }, 1],
  ["全部為 0 才是 0", { symptom_persistent_abdominal_pain: 0, symptom_epigastric_pain: 0, symptom_upper_abdominal_discomfort: 0, symptom_right_upper_abdominal_discomfort: 0 }, 0],
  ["有細項未填且無人為 1 時整欄不送", { symptom_persistent_abdominal_pain: 0, symptom_epigastric_pain: null, symptom_upper_abdominal_discomfort: 0, symptom_right_upper_abdominal_discomfort: 0 }, undefined]
]) {
  test(`symptom_abdominal_pain：${name}`, () => {
    const symptoms = apiSymptoms.buildApiSymptoms(children, {});
    if (expected === undefined) {
      // 不送 ≠ 送 0。送 0 在規則層是「已排除」，E 節的陰性證據會據此扣分；
      // 不知道就不要表態。
      assert(!("symptom_abdominal_pain" in symptoms), "未填的細項不得被當成 0 併入上層欄位");
    } else {
      assert.equal(symptoms.symptom_abdominal_pain, expected);
    }
  });
}

test("2026-09-16 裁示的兩個語意對應確實生效", () => {
  // 問卷只問噁心、問不到嘔吐；問的是反覆感染、不是一般感染。兩者都比規則的定義嚴格，
  // 偏保守。對應關係若被誰拿掉，A-08／A-18／B-20／B-21／B-64 與 A-34 會靜默失效。
  const symptoms = apiSymptoms.buildApiSymptoms(
    { symptom_nausea: 1, symptom_recurrent_infection: 1 }, {}
  );
  assert.equal(symptoms.symptom_nausea_vomiting, 1);
  assert.equal(symptoms.symptom_infection, 1);
});

test("兩個 row 若自己帶了同名的上層欄位，不得被衍生值蓋掉", () => {
  // rule_input_row 的 symptom_mass 就是這種情形（buildRuleInputRow 已用
  // getRuleParentState 組好）。同樣的狀況日後若發生在其他上層欄位，明確給的值優先。
  const symptoms = apiSymptoms.buildApiSymptoms(
    { symptom_persistent_back_pain: 0 }, { symptom_back_pain: 1 }
  );
  assert.equal(symptoms.symptom_back_pain, 1);
});

test("an unanswered country question still submits and falls back to the Taiwan baseline", () => {
  const country = app.questions.find((question) => question.id === "country");
  delete app.answers[country.field];
  const submission = app.storeSubmissionForIntegration();
  assert.equal(submission.ai_api_feature_row.country, "TW");
  app.validateSubmissionBeforeSend(submission);
  const posted = JSON.parse(JSON.stringify(submission));
  assert.deepEqual(validateTransitionalSubmission(sanitizeLegacyDirectIdentifiers(posted)), []);
});
