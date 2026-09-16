// 症狀區塊：文獻高風險規則層唯一的資料來源。
//
// 2026-09-08 查出的接線缺口，以及 2026-09-16 對它的更正——兩段都留著，因為誤判本身
// 是這份檔案存在的理由之一：
//
// 當初的判斷是「規則層完全收不到症狀」。那是錯的，依據的 POWER_AUTOMATE_FLOW_AUDIT_
// 2026-08-05.md 已經過期。實地看過 flow 之後確認，HTTP action 的 body 是三層 addProperty，
// 其中一層自己在塞 symptoms，來源是 symptom_feature_row——那 84 欄的鍵名本來就是規則層
// 欄位名，所以症狀一直進得了規則層。
//
// 真正的缺口比較窄，但確實存在，共三類：
//   1. rule_input_row 那 30 欄完全沒送（各 _repeat_count、pap／psa 篩檢代碼、裡急後重、
//      乳房疼痛等），引用它們的規則永遠不觸發。
//   2. 選項代碼沒翻譯（見下方 CODE_MAPS），送原始碼會讓規則讀到錯的值。
//   3. 規則層的「上層概念欄位」沒人組（見下方 DERIVED_FIELDS）。app.js 早就有
//      getRuleParentState() 知道怎麼組，但結果只拿去決定要不要追問復發次數，沒送出去。
//
// 修法沿用 country 那次的決定：塞進 ai_api_feature_row。這在當時以為不必改 flow，實際上
// 撞上了 flow 自己那層 addProperty（addProperty 不允許屬性已存在），線上每一筆送件都失敗，
// 最後是把 flow 那層拿掉收尾。動這條路徑之前請先讀 PIPELINE_READ_FIRST.md。
// 本檔採 answer-codes.js 的同一套 UMD 寫法，讓瀏覽器（app.js）與 Node（server.js 的
// fallback 路徑）共用同一份實作——AI_API_COUNTRY_CODES 當初是複寫兩份再靠測試比對，
// 但那是一張對照表；這裡是有分支的轉換邏輯，複寫必然分岔。
(function registerApiSymptoms(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EGApiSymptoms = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createApiSymptoms() {
  // rule_input_row 帶的是問卷選項代碼，不是規則層的二元語意，送出前必須翻譯：
  //   screen_pap_overdue_or_out_of_range  1=3 年內 → 0；2=3 年以上、3=從未 → 1（B-28 用）
  //   screen_psa_elevated                 1=曾被告知偏高 → 1；2=結果正常、0=沒做過 → 0（G-03 用）
  // 刻意不設 screen_pap_up_to_date_and_in_range（E-05 的 -5 分）：那一欄要求「3 年內且在
  // 篩檢年齡範圍內」，問卷只問得到前半段，寧可不給折扣也不要對不在範圍內的人誤扣。
  const CODE_MAPS = Object.freeze({
    screen_pap_overdue_or_out_of_range: Object.freeze({ 1: 0, 2: 1, 3: 1 }),
    screen_psa_elevated: Object.freeze({ 0: 0, 1: 1, 2: 0 })
  });

  // 病程／持續時間／部位碼：v19.12 規則 JSON 全文檢查過，一條規則都沒有引用這 9 欄，
  // 而且它們的值是 1/2/3 代碼而非二元值，送出去只會變成 API 的 extra 欄位。日後真的有
  // 規則用到，要連同 API 端的欄位宣告一起加回來，不可以只在這裡放行。
  const EXCLUDED_RULE_INPUTS = Object.freeze([
    "symptom_lymphadenopathy_course", "symptom_lymphadenopathy_duration_band",
    "symptom_hn_lump_course", "symptom_hn_lump_duration_band", "symptom_hn_lump_site",
    "symptom_breast_lump_course", "symptom_breast_lump_duration_band",
    "symptom_testicular_lump_course", "symptom_testicular_lump_duration_band"
  ]);

  // buildRuleInputRow() 在上層症狀答「否」時會給 symptom_stool_loose_or_frequent 一個 9
  // 代表不適用；API 的二元欄位是 le=1，9 會讓整包 symptoms 被 422 退掉、連帶整筆推論
  // 失敗，而它的語意就是 0。只對二元欄位做這個代換——_repeat_count 的 9 是「發生 9 次」，
  // 換成 0 會把資料改壞。
  const NOT_APPLICABLE = 9;
  const COUNT_FIELD_PATTERN = /_(repeat_count|interval_days)$/;

  // 規則層的「上層概念欄位」：規則讀的是 symptom_abdominal_pain，問卷問的是上腹不適、
  // 心窩痛、右上腹不適、持續腹痛四個細項。前四筆逐字沿用 app.js 的 derivedParents
  // （那張表原本只拿來決定要不要追問復發次數），symptom_mass 不在此處是因為
  // buildRuleInputRow() 已經用 getRuleParentState() 組好並覆蓋過來。
  //
  // 後兩筆是 2026-09-16 經使用者裁示新增的語意對應，不是命名別名：
  //   symptom_nausea_vomiting ← 問卷只問得到噁心，問不到嘔吐。文獻的 PPV 是用「噁心或
  //     嘔吐」算的，只拿噁心當輸入會讓觸發率略低於文獻情境——偏保守，不會誤報。
  //   symptom_infection ← 問卷問的是「一年內反覆感染 3 次以上或久久不癒」，比規則的
  //     「感染」嚴格。同樣偏保守，考慮到 A-34 是淋巴瘤，寧可難觸發也不要假陽性。
  const DERIVED_FIELDS = Object.freeze({
    symptom_abdominal_pain: Object.freeze([
      "symptom_persistent_abdominal_pain", "symptom_epigastric_pain",
      "symptom_upper_abdominal_discomfort", "symptom_right_upper_abdominal_discomfort"
    ]),
    symptom_back_pain: Object.freeze(["symptom_persistent_back_pain"]),
    symptom_mouth_symptoms: Object.freeze(["symptom_oral_ulcer", "symptom_oral_white_red_patch"]),
    symptom_nausea_vomiting: Object.freeze(["symptom_nausea"]),
    symptom_infection: Object.freeze(["symptom_recurrent_infection"])
  });

  function isBinaryRuleInput(key) {
    return !EXCLUDED_RULE_INPUTS.includes(key)
      && !(key in CODE_MAPS)
      && !COUNT_FIELD_PATTERN.test(key);
  }

  function buildApiSymptoms(symptomFeatureRow, ruleInputRow) {
    const symptoms = {};
    // null／undefined 一律不送。API 對未填欄位的處理（回退既有問卷欄位，或視為 0）比在
    // 前端猜一個值準確，而且 to_rule_dict() 本來就會把 None 跳過；少送也讓 body 小一點。
    const put = (key, value) => {
      if (value === null || value === undefined) return;
      symptoms[key] = value;
    };
    const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

    if (isObject(symptomFeatureRow)) {
      Object.keys(symptomFeatureRow).forEach((key) => put(key, symptomFeatureRow[key]));
    }
    // rule_input_row 後寫，覆蓋 symptom_feature_row 的同名欄位（symptom_mass 與
    // symptom_shortness_of_breath 兩欄重疊）：那邊的值經過 getRuleParentState() 併入衍生
    // 子症狀，比原始勾選更接近規則層要的語意。
    if (isObject(ruleInputRow)) {
      Object.keys(ruleInputRow).forEach((key) => {
        if (EXCLUDED_RULE_INPUTS.includes(key)) return;
        const value = ruleInputRow[key];
        if (key in CODE_MAPS) {
          const mapped = value === null || value === undefined ? null : CODE_MAPS[key][value];
          put(key, mapped === undefined ? null : mapped);
          return;
        }
        put(key, isBinaryRuleInput(key) && value === NOT_APPLICABLE ? 0 : value);
      });
    }

    // 上層概念欄位最後組，來源取已經寫進 symptoms 的值（也就是兩個 row 合併後的結果）。
    // 合併語意與 app.js 的 combineSymptomStates() 一致：任一為 1 就是 1；全部為 0 才是 0；
    // 其餘（有細項未填）視為不知道，整欄不送——送 0 會讓規則層當成「已排除」，E 節的
    // 陰性證據可能因此誤扣分。
    Object.keys(DERIVED_FIELDS).forEach((parent) => {
      // 兩個 row 若哪天自己長出同名欄位，以它為準，不要在這裡蓋掉別人明確給的值。
      if (parent in symptoms) return;
      const states = DERIVED_FIELDS[parent].map((child) => symptoms[child]);
      if (states.some((state) => state === 1)) put(parent, 1);
      else if (states.every((state) => state === 0)) put(parent, 0);
    });

    return symptoms;
  }

  return Object.freeze({
    buildApiSymptoms,
    CODE_MAPS,
    DERIVED_FIELDS,
    EXCLUDED_RULE_INPUTS,
    NOT_APPLICABLE
  });
}));
