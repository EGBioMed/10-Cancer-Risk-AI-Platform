const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./lib/load-app-sandbox");
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

// 自述癌症病史：決定免費信裡的檢測產品推薦要用病史文案還是風險文案。少了它，
// 已確診者會拿到「與某癌相關的風險因子較為集中」那套說法——文案不同、外觀相同，
// 所以壞掉不會有人發現。excel_row 那一欄在 0938952 之前就是這樣靜默空了一整段時間。
test("the submission carries the reported cancer history for the API", () => {
  const question = app.questions.find((entry) => entry.id === "personal_cancer_types");
  app.answers[question.field] = app.makeAnswerEntry(question, ["乳癌", "大腸直腸癌"], "contract_test");
  const submission = submitAs("臺灣");
  assert.equal(
    submission.ai_api_feature_row.personal_cancer_types,
    "乳癌; 大腸直腸癌",
    "ai_api_feature_row 少了 personal_cancer_types：已確診者會拿到風險文案而非病史文案"
  );
  // 兩處必須是同一個值。分頭各組一份，正是 2026-09-22 那個 bug 的成因結構。
  assert.equal(
    submission.excel_row.personal_cancer_types,
    submission.ai_api_feature_row.personal_cancer_types
  );
  app.validateSubmissionBeforeSend(submission);
});

test("an unreported cancer history reaches the API as an empty string, not a missing key", () => {
  const question = app.questions.find((entry) => entry.id === "personal_cancer_types");
  delete app.answers[question.field];
  const featureRow = submitAs("臺灣").ai_api_feature_row;
  // 送空字串而不是整個欄位不送：API 端的 parse_personal_cancer_types 兩者都當成
  // 無病史，但欄位存在才能從送件紀錄分辨「問卷沒問到」與「有問但沒作答」。
  assert.equal(featureRow.personal_cancer_types, "");
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

// 2026-10-27 新增的三題心理題。這一段擋的是這個 repo 反覆出現的同一種故障：題目
// 加了、受試者答了，值卻沒有到達目的地，而且沒有任何錯誤訊息。country 就是這樣
// 過了一次（v19.6 問了國家，值只進 excel_row，API 從來沒看到），症狀題組也是。
//
// 這三題刻意只進研究資料，不進模型請求：71 欄的模型特徵與 33 欄的 vNext 候選欄位
// 都在流程觸發 schema 裡以筆數釘死，走那兩條路會讓每次問卷改版都變成一次對付費
// 客戶流程的編輯。所以下面同時驗「有到研究列」與「沒有混進模型請求」。
const PSYCH_FIELDS = [
  ["psych_rumination", "mental_health.psych_rumination"],
  ["psych_social_support", "mental_health.psych_social_support"],
  ["psych_neuroticism_informant", "mental_health.psych_neuroticism_informant"]
];

test("the three psychological items reach the research row with the answer, not a placeholder", () => {
  const picked = "經常";
  for (const [, field] of PSYCH_FIELDS) {
    const question = app.questions.find((item) => item.field === field);
    assert(question, `${field} 這一題不存在`);
    // JSON 先過一次：vm realm 回來的陣列原型不同，deepEqual 會以「結構相同但
    // 不是同一個參考」拒絕，與這支檔案其他地方同樣的處理。
    assert.deepEqual(JSON.parse(JSON.stringify(question.options)), ["從不", "很少", "有時", "經常", "總是"]);
    app.answers[field] = app.makeAnswerEntry(question, picked, "contract_test");
  }

  const submission = submitAs("臺灣");
  for (const [column] of PSYCH_FIELDS) {
    assert.equal(
      submission.excel_row[column],
      picked,
      `excel_row.${column} 不是受試者選的值——題目在、答案在，但值沒有到研究資料表`
    );
  }
});

test("the three psychological items are coded answers, not free text", () => {
  const submission = submitAs("臺灣");
  for (const [column, field] of PSYCH_FIELDS) {
    const row = submission.answer_code_rows.find((entry) => entry.question_id === column);
    assert(row, `answer_code_rows 裡沒有 ${column}：跳過與回答「從不」將無法分辨`);
    assert.equal(row.status, "answered");
    // 答案碼而不是中文標籤：報告語言換成英文時，存下來的值必須是同一個。
    assert.match(String(row.value), /^psych_[a-z_]+\.option_0[1-5]$/, `${column} 存的是顯示標籤而不是答案碼`);
    assert.equal(app.questions.find((item) => item.field === field).module, "mental");
  }
});

test("the three psychological items stay out of the model request and the frozen vectors", () => {
  const submission = submitAs("臺灣");
  for (const [column] of PSYCH_FIELDS) {
    for (const row of ["ai_api_feature_row", "optimized_feature_row", "vnext_feature_row", "rule_input_row"]) {
      assert(
        !(column in submission[row]),
        `${column} 跑進了 ${row}：模型請求只收 71 欄加 country，而 vNext 與規則層的欄位數在流程觸發 schema 裡釘死，多一欄會讓每一筆送件被拒`
      );
    }
  }
  // 筆數沒有變，就是上面那句話的憑據。
  assert.equal(submission.optimized_feature_columns.length, 71);
  assert.equal(submission.vnext_feature_columns.length, 33);
  assert.equal(submission.rule_input_columns.length, 36);
});

// 2026-11-16 新增的胰臟癌早期症狀追問：勾了「食慾降低」或「容易過早飽足」才問，
// 問首次出現時間、持續或反覆、是否影響食量。跟心理題同一條路：只進研究列與答案碼，
// 不進模型請求，也不進釘死筆數的 vNext 與規則層欄位。
const GI_FOLLOW_UPS = [
  ["symptoms.general", "食慾降低或食量明顯減少", "appetite_loss"],
  ["symptoms.upper_digestive", "容易過早飽足（吃少量就飽）", "early_satiety"]
];
const GI_PARTS = ["onset", "course", "intake_effect"];
const giQuestion = (id) => app.questions.find((question) => question.id === id);
function setSymptomGroup(field, selected) {
  const group = app.questions.find((question) => question.field === field);
  app.answers[field] = app.makeAnswerEntry(group, selected, "contract_test");
}

test("the pancreatic follow-ups appear only when their symptom is checked", () => {
  for (const [field, label, key] of GI_FOLLOW_UPS) {
    const group = app.questions.find((question) => question.field === field);
    const other = group.options.find((option) => option !== label && option !== "以上皆無" && option !== "不確定");
    setSymptomGroup(field, [other]);
    for (const part of GI_PARTS) {
      assert.equal(giQuestion(`${key}_${part}`).appliesIf(app.answers), false, `${key}_${part} 在沒勾症狀時也會問`);
    }
    setSymptomGroup(field, [label]);
    for (const part of GI_PARTS) {
      assert.equal(giQuestion(`${key}_${part}`).appliesIf(app.answers), true, `${key}_${part} 勾了症狀卻不問`);
    }
  }
});

test("the pancreatic follow-ups reach the research row and are coded answers", () => {
  const picked = { onset: 2, course: 1, intake_effect: 0 };
  for (const [field, label, key] of GI_FOLLOW_UPS) {
    setSymptomGroup(field, [label]);
    for (const part of GI_PARTS) {
      const question = giQuestion(`${key}_${part}`);
      assert.equal(question.field, `symptoms.follow_up.${key}_${part}`);
      app.answers[question.field] = app.makeAnswerEntry(question, question.options[picked[part]], "contract_test");
    }
  }
  const submission = submitAs("臺灣");
  for (const [, , key] of GI_FOLLOW_UPS) {
    for (const part of GI_PARTS) {
      const id = `${key}_${part}`;
      assert.equal(submission.excel_row[id], giQuestion(id).options[picked[part]], `excel_row.${id} 沒有拿到受試者選的值`);
      const row = submission.answer_code_rows.find((entry) => entry.question_id === id);
      assert(row, `answer_code_rows 裡沒有 ${id}`);
      assert.equal(row.status, "answered");
      assert.equal(row.value, `${id}.option_0${picked[part] + 1}`);
    }
  }
});

test("the pancreatic follow-ups stay out of the model request and the frozen vectors", () => {
  const submission = submitAs("臺灣");
  for (const [, , key] of GI_FOLLOW_UPS) {
    for (const part of GI_PARTS) {
      for (const row of ["ai_api_feature_row", "optimized_feature_row", "vnext_feature_row", "rule_input_row"]) {
        assert(!(`${key}_${part}` in submission[row]), `${key}_${part} 跑進了 ${row}`);
      }
    }
  }
  assert.equal(submission.optimized_feature_columns.length, 71);
  assert.equal(submission.vnext_feature_columns.length, 33);
  assert.equal(submission.rule_input_columns.length, 36);
});

// 2026-11-16 補的兩題：油便（肝膽胰症狀的 extraOption）與急性胰臟炎（病史，勾「是」才追問
// 次數、最近一次、原因）。同樣只進研究列與答案碼。
const FATTY_STOOL = "大便油油亮亮、浮在水面或不容易沖掉（油便）";
const AP_FOLLOW_UPS = ["acute_pancreatitis_episodes", "acute_pancreatitis_last_episode", "acute_pancreatitis_cause"];

test("oily stool is a separate checkbox from pale stool and reaches the research row", () => {
  const group = app.questions.find((question) => question.id === "symptoms_hepatobiliary");
  assert(group.options.includes(FATTY_STOOL));
  assert(group.options.includes("糞便顏色變淺或呈灰白色"));
  assert(!group.symptomDefinitions.some(([label]) => label === FATTY_STOOL), "油便變成了症狀特徵欄");

  setSymptomGroup("symptoms.hepatobiliary", [FATTY_STOOL]);
  let submission = submitAs("臺灣");
  assert.equal(submission.excel_row.fatty_stool, 1);
  assert.equal(submission.excel_row.symptom_pale_stool, 0, "勾油便不該連帶勾到灰白便");
  const row = submission.answer_code_rows.find((entry) => entry.question_id === "symptoms_hepatobiliary");
  assert(row.value.includes("symptoms_hepatobiliary.option_08"), "答案碼裡沒有油便");

  setSymptomGroup("symptoms.hepatobiliary", ["糞便顏色變淺或呈灰白色"]);
  submission = submitAs("臺灣");
  assert.equal(submission.excel_row.fatty_stool, 0);

  setSymptomGroup("symptoms.hepatobiliary", ["不確定"]);
  assert.equal(submitAs("臺灣").excel_row.fatty_stool, "");
});

test("the acute pancreatitis follow-ups appear only after a yes", () => {
  const parent = giQuestion("acute_pancreatitis");
  for (const answer of ["否", "不確定"]) {
    app.answers[parent.field] = app.makeAnswerEntry(parent, answer, "contract_test");
    for (const id of AP_FOLLOW_UPS) assert.equal(giQuestion(id).appliesIf(app.answers), false, `${id} 在回答「${answer}」時也會問`);
  }
  app.answers[parent.field] = app.makeAnswerEntry(parent, "是，曾由醫師診斷", "contract_test");
  for (const id of AP_FOLLOW_UPS) assert.equal(giQuestion(id).appliesIf(app.answers), true, `${id} 回答是卻不問`);
});

test("acute pancreatitis reaches the research row as coded answers and stays out of the model", () => {
  const parent = giQuestion("acute_pancreatitis");
  app.answers[parent.field] = app.makeAnswerEntry(parent, "是，曾由醫師診斷", "contract_test");
  const picked = { acute_pancreatitis_episodes: 1, acute_pancreatitis_last_episode: 0, acute_pancreatitis_cause: 2 };
  for (const id of AP_FOLLOW_UPS) {
    const question = giQuestion(id);
    assert.equal(question.field, `medical_history.${id}`);
    app.answers[question.field] = app.makeAnswerEntry(question, question.options[picked[id]], "contract_test");
  }
  const submission = submitAs("臺灣");
  assert.equal(submission.excel_row.acute_pancreatitis, "是，曾由醫師診斷");
  for (const id of AP_FOLLOW_UPS) {
    assert.equal(submission.excel_row[id], giQuestion(id).options[picked[id]], `excel_row.${id} 沒有拿到受試者選的值`);
    const row = submission.answer_code_rows.find((entry) => entry.question_id === id);
    assert(row, `answer_code_rows 裡沒有 ${id}`);
    assert.equal(row.value, `${id}.option_0${picked[id] + 1}`);
  }
  for (const id of ["acute_pancreatitis", ...AP_FOLLOW_UPS, "fatty_stool"]) {
    for (const rowName of ["ai_api_feature_row", "optimized_feature_row", "vnext_feature_row", "rule_input_row"]) {
      assert(!(id in submission[rowName]), `${id} 跑進了 ${rowName}`);
    }
  }
  assert.equal(submission.optimized_feature_columns.length, 71);
  assert.equal(submission.vnext_feature_columns.length, 33);
  assert.equal(submission.rule_input_columns.length, 36);
});

// ---------------------------------------------------------------------------
// v19.18 (2026-11-23): the clinician review of the head-and-neck and male
// reproductive factor lists.
// ---------------------------------------------------------------------------

const NPC_CLUSTER = [
  "symptom_epistaxis",
  "symptom_blood_streaked_nasal_discharge",
  "symptom_unilateral_aural_fullness_or_hearing_loss",
  "symptom_tinnitus",
  "symptom_diplopia",
  "symptom_unilateral_facial_numbness"
];
const BOWEL_RULE_INPUTS = ["symptom_diarrhea", "symptom_stool_frequency_increased", "symptom_bowel_urgency"];

// Which vector a new symptom lands in is the whole decision, and it is made by
// where the line is written rather than by anything that reads like a choice:
// an entry in a group's `options` becomes a symptom feature column, an entry in
// `extraOptions` does not. The nasopharyngeal cluster is meant to be in the
// symptom vector; the three bowel items are meant to stay out of it, because
// the model takes a fixed feature set and only the rule layer asked for them.
test("the nasopharyngeal cluster is a symptom column and the bowel rule inputs are not", () => {
  const submission = submitAs("臺灣");

  for (const column of [...NPC_CLUSTER, "symptom_aspiration_on_liquids"]) {
    assert(column in submission.symptom_feature_row, `${column} 不在 symptom_feature_row`);
    assert(!(column in submission.rule_input_row), `${column} 同時進了 rule_input_row`);
    assert(!(column in submission.ai_api_feature_row), `${column} 跑進了送模型的本文`);
  }

  for (const column of BOWEL_RULE_INPUTS) {
    assert(column in submission.rule_input_row, `${column} 不在 rule_input_row`);
    assert(!(column in submission.symptom_feature_row),
      `${column} 進了 symptom_feature_row -- 它應該放在 extraOptions，不是 options`);
    assert(!(column in submission.ai_api_feature_row), `${column} 跑進了送模型的本文`);
  }

  assert.equal(submission.symptom_feature_columns.length, 91);
  assert.equal(submission.rule_input_columns.length, 36);
  assert.equal(submission.optimized_feature_columns.length, 71);
});

// Rule B-87 scores an untreated polyp. A treated one is evidence the rule does
// not fire, which is a 0; "not sure" is an absence of evidence, which is null.
// Collapsing the two would make every treated polyp look like missing data.
test("a treated nasal polyp is a 0, not a null", () => {
  const question = app.questions.find((item) => item.id === "nasal_polyp");
  assert.equal(question.field, "rule_inputs.nasal_polyp_untreated");

  for (const [answer, expected] of [["是，但尚未治療", 1], ["是，已接受治療", 0], ["否", 0], ["不確定", null]]) {
    app.answers[question.field] = app.makeAnswerEntry(question, answer, "contract_test");
    assert.equal(submitAs("臺灣").rule_input_row.nasal_polyp_untreated, expected, `「${answer}」對應錯誤`);
  }
});

// B-89 is a sibling's lung cancer and B-90 is a mother's liver cancer, so the
// relative has to be paired with the cancer. A relative list that does not名
// the one the rule names is a 0; a question that was never asked, because that
// cancer was not reported in the family, is null rather than 0 -- nobody said
// no sibling had lung cancer, they said no one in the family had lung cancer.
test("the family relative questions answer the rule the literature actually supports", () => {
  const familyTypes = app.questions.find((item) => item.id === "family_self_types");
  const lung = app.questions.find((item) => item.id === "family_lung_relatives");
  const liver = app.questions.find((item) => item.id === "family_liver_relatives");

  app.answers[familyTypes.field] = app.makeAnswerEntry(familyTypes, ["乳癌"], "contract_test");
  assert.equal(lung.appliesIf(app.answers), false, "沒報肺癌卻問了是哪位親屬");
  let row = submitAs("臺灣").rule_input_row;
  assert.equal(row.family_cancer_history_lung_sibling, null);
  assert.equal(row.family_cancer_history_liver_mother, null);

  app.answers[familyTypes.field] = app.makeAnswerEntry(familyTypes, ["肺癌", "肝癌"], "contract_test");
  assert.equal(lung.appliesIf(app.answers), true);
  assert.equal(liver.appliesIf(app.answers), true);

  app.answers[lung.field] = app.makeAnswerEntry(lung, ["兄弟姊妹"], "contract_test");
  app.answers[liver.field] = app.makeAnswerEntry(liver, ["父親"], "contract_test");
  row = submitAs("臺灣").rule_input_row;
  assert.equal(row.family_cancer_history_lung_sibling, 1);
  assert.equal(row.family_cancer_history_liver_mother, 0, "父親的肝癌不是 B-90 說的那一位");

  app.answers[lung.field] = app.makeAnswerEntry(lung, ["父親", "母親"], "contract_test");
  app.answers[liver.field] = app.makeAnswerEntry(liver, ["母親", "子女"], "contract_test");
  row = submitAs("臺灣").rule_input_row;
  assert.equal(row.family_cancer_history_lung_sibling, 0);
  assert.equal(row.family_cancer_history_liver_mother, 1);

  app.answers[lung.field] = app.makeAnswerEntry(lung, ["不確定"], "contract_test");
  assert.equal(submitAs("臺灣").rule_input_row.family_cancer_history_lung_sibling, null,
    "「不確定」不是「沒有兄弟姊妹得肺癌」");
});
