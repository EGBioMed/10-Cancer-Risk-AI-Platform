// 症狀區塊：文獻高風險規則層唯一的資料來源。
//
// 2026-09-08 查出的接線缺口：問卷確實收了 symptom_feature_row 與 rule_input_row，但它們
// 是 submission 的獨立頂層欄位，而 Power Automate 的 HTTP action 只把 ai_api_feature_row
// 原封不動當 API body 送出。API 端 SurveyInput.symptoms 預設 None，而 to_rule_dict() 的
// 症狀欄位只從那個區塊填，所以 40 條硬規則在線上等於全暗——規則層實際只看得到
// weight_change_6m／chronic_diabetes／chronic_asthma_copd／smoking 這 4 個舊欄位的回退值，
// 唯一還可能命中的是 A-36（50 歲以上男性＋體重變化）。每一份報告的「文獻高風險規則層」
// 都印「本次問卷未觸發任何硬規則」，與受檢者實際填了什麼無關。
//
// 修法沿用 country 那次的決定：塞進 ai_api_feature_row，Power Automate 的 flow 不必改。
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
    return symptoms;
  }

  return Object.freeze({
    buildApiSymptoms,
    CODE_MAPS,
    EXCLUDED_RULE_INPUTS,
    NOT_APPLICABLE
  });
}));
