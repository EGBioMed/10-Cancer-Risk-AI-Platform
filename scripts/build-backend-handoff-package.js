const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageName = "EG_CancerRisk_Backend_Handoff_2026-08-05";
const outputRoot = path.join(root, "output", packageName);

const answerManifest = require(path.join(root, "contracts/v1/answer-code-manifest.json"));
const fieldManifest = require(path.join(root, "contracts/power-automate/transitional-field-manifest.json"));

const moduleNames = {
  consent: ["知情同意", "Consent"],
  basic: ["基本資料", "Basic information"],
  symptoms: ["近期症狀", "Recent symptoms"],
  female: ["女性健康", "Female health"],
  exposure: ["生活與環境暴露", "Lifestyle and environmental exposure"],
  mental: ["心理健康", "Mental health"],
  diet: ["飲食習慣", "Diet"],
  history: ["病史與家族史", "Medical and family history"],
  contact: ["報告聯絡", "Report contact"]
};

const conditionalRules = {
  stool_loose_or_frequent: "僅在 symptom_bowel_habit_change=1 時顯示 / Show only when symptom_bowel_habit_change=1",
  mastalgia: "僅女性 / Female only",
  smoking_quit: "僅抽菸經驗=是 / Show only when smoking_ever=yes",
  personal_cancer_types: "僅目前或過去曾罹癌 / Show only when personal_cancer is positive",
  liver_disease_etiology: "僅勾選肝病 / Show only when liver disease is selected",
  family_self_types: "僅一等親有癌症史 / Show only when family_cancer=yes",
  testicular_pain_pattern: "僅男性且勾選睾丸疼痛 / Male and testicular pain selected",
  pap_smear_timing: "女性且年齡≥18 / Female and age>=18",
  benign_gynae_disease: "僅女性 / Female only",
  orchitis_epididymitis: "僅男性 / Male only",
  psa_history: "男性且年齡≥50 / Male and age>=50"
};

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function copy(relativeSource, relativeDestination = relativeSource) {
  const source = path.join(root, relativeSource);
  const destination = path.join(outputRoot, relativeDestination);
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function write(relativeDestination, content) {
  const destination = path.join(outputRoot, relativeDestination);
  ensureDir(path.dirname(destination));
  fs.writeFileSync(destination, content.endsWith("\n") ? content : `${content}\n`);
}

function cleanTableText(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function buildQuestionnaireSpec() {
  const lines = [
    "# v19.4 雙語題庫與分流規格",
    "",
    `- 問卷版本：\`${answerManifest.questionnaire_version}\``,
    `- 答案代碼版本：\`${answerManifest.schema_version}\``,
    `- 題目定義數：${answerManifest.question_count}`,
    `- 標準答案題數：${answerManifest.canonical_answer_question_count}`,
    "- 中英文只是顯示文字；後端必須使用 `question_id` 與 `code`。",
    "- `unknown` 與 `not_applicable` 不得自動轉成 0。",
    "",
    "## 題庫總覽",
    "",
    "| # | 段落 | question_id | 中文題目 | English | 題型 | 必填 | 顯示條件 |",
    "|---:|---|---|---|---|---|---|---|"
  ];

  answerManifest.questions.forEach((question, index) => {
    const moduleName = moduleNames[question.module] || [question.module, question.module];
    const condition = conditionalRules[question.question_id]
      || (question.question_id.includes("_repeat_count")
        ? "對應母症狀為陽性 / Corresponding parent symptom is positive"
        : question.question_id.includes("_interval_days")
          ? "對應次數≥2 / Corresponding repeat count>=2"
          : "無，或依所屬性別路徑 / Always, or according to the sex-specific path");
    lines.push(`| ${index + 1} | ${cleanTableText(moduleName.join(" / "))} | \`${question.question_id}\` | ${cleanTableText(question.title_zh)} | ${cleanTableText(question.title_en)} | \`${question.answer_type}\` | ${question.required_when_applicable ? "是 / Yes" : "否 / No"} | ${cleanTableText(condition)} |`);
  });

  lines.push("", "## 選項與穩定代碼", "");
  for (const question of answerManifest.questions.filter((item) => item.options?.length)) {
    lines.push(`### ${question.question_id}`, "", `- ${question.title_zh}`, `- ${question.title_en}`, "", "| code | 中文 | English |", "|---|---|---|");
    for (const option of question.options) {
      lines.push(`| \`${option.code}\` | ${cleanTableText(option.label_zh)} | ${cleanTableText(option.label_en)} |`);
    }
    lines.push("");
  }

  lines.push(
    "## 分流與缺失值規則",
    "",
    "1. 未顯示的條件題：`status=not_applicable`, `value=null`。",
    "2. 使用者明確選擇不確定：`status=unknown`, `value=null`。",
    "3. 複選題已回答但未選某項：該選項 feature 可記為 0。",
    "4. 整題未知或不適用：所屬 features 保留 null，不可當成 0。",
    "5. 症狀題的一般回想期為最近 3 個月；v19.4 新增與重複次數追問為最近 6 個月。",
    "6. 腹部壓痛與肛門指診屬醫師檢查，不放入公開自填問卷。"
  );

  return lines.join("\n");
}

function rowFrom(columns, value = null) {
  return Object.fromEntries(columns.map((column) => [column, value]));
}

function buildSample(language) {
  const submittedAt = "2026-08-05T08:00:00.000Z";
  const recordId = language === "zh" ? "HANDOFF-ZH-001" : "HANDOFF-EN-001";
  const optimized = rowFrom(fieldManifest.optimized_feature_columns, 0);
  Object.assign(optimized, {
    record_id: recordId,
    sex: language === "zh" ? 1 : 0,
    age: 46,
    height_cm: 165,
    weight_kg: 60,
    bmi: 22,
    diagnosis: "尚未診斷",
    score: "",
    data_source: "interactive_mvp"
  });
  const symptoms = rowFrom(fieldManifest.symptom_feature_columns, 0);
  const vnext = rowFrom(fieldManifest.vnext_feature_columns, null);
  const research = rowFrom(fieldManifest.research_feature_columns, 0);
  const rules = rowFrom(fieldManifest.rule_input_columns, null);
  const answerRows = answerManifest.questions
    .filter((question) => !["consent_acknowledgement", "email"].includes(question.question_id))
    .map((question) => ({ question_id: question.question_id, status: "unknown", value: null }));

  const setAnswer = (questionId, value) => {
    const row = answerRows.find((item) => item.question_id === questionId);
    if (row) Object.assign(row, { status: "answered", value });
  };
  setAnswer("birth_year", 1980);
  setAnswer("height_cm", 165);
  setAnswer("weight_kg", 60);
  setAnswer("sex", language === "zh" ? "sex.option_02" : "sex.option_01");

  return {
    contract_version: "assessment-submission/1.1.0",
    questionnaire_version: answerManifest.questionnaire_version,
    consent_version: "consent/2026-08-05",
    answer_code_schema_version: answerManifest.schema_version,
    feature_schema_version: fieldManifest.feature_schema_version,
    mapping_version: fieldManifest.mapping_version,
    vnext_feature_schema_version: "feature-gap-candidates/2026-08-05",
    vnext_mapping_version: "answer-mapping-vnext/0.1.0",
    rule_input_schema_version: "high-risk-rules/19.5",
    rule_input_mapping_version: "rule-input-mapping/19.5-phase1",
    report_template_version: "email-report/2026-08-05",
    submitted_at: submittedAt,
    email: language === "zh" ? "zh-example@example.com" : "en-example@example.com",
    language,
    report_language: language === "zh" ? "zh-Hant" : "en",
    consent_record: {
      consent_version: "consent/2026-08-05",
      accepted_at: submittedAt,
      accepted_item_ids: ["data_use", "model_limitations", "non_medical_use"]
    },
    answer_code_rows: answerRows,
    rows: [{
      submitted_at: submittedAt,
      question_id: "birth_year",
      question_text: language === "zh" ? "您的出生年（西元）" : "Year of birth",
      answer: "1980"
    }],
    optimized_feature_columns: fieldManifest.optimized_feature_columns,
    optimized_feature_row: optimized,
    ai_api_feature_row: { ...optimized },
    symptom_feature_columns: fieldManifest.symptom_feature_columns,
    symptom_feature_row: symptoms,
    symptom_answers: Array.from({ length: 13 }, (_, index) => ({
      category_id: `category_${index + 1}`,
      category_zh: `症狀類別 ${index + 1}`,
      category_en: `Symptom category ${index + 1}`,
      answer_status: "answered_absent",
      selected_symptoms: []
    })),
    vnext_feature_columns: fieldManifest.vnext_feature_columns,
    vnext_feature_row: vnext,
    vnext_feature_metadata: Object.fromEntries(fieldManifest.vnext_feature_metadata_columns.map((column) => [column, null])),
    research_feature_columns: fieldManifest.research_feature_columns,
    research_feature_row: research,
    rule_input_columns: fieldManifest.rule_input_columns,
    rule_input_row: rules,
    excel_row: {
      ...optimized,
      ...symptoms,
      ...vnext,
      ...rules,
      research_processed_meat: 0,
      submitted_at: submittedAt,
      language,
      report_language: language === "zh" ? "zh-Hant" : "en"
    },
    contact_row: {
      record_id: recordId,
      email: language === "zh" ? "zh-example@example.com" : "en-example@example.com",
      submitted_at: submittedAt,
      language,
      report_language: language === "zh" ? "zh-Hant" : "en"
    },
    data_quality: { missing_columns: [], contradiction_warnings: [] }
  };
}

function buildReadme() {
  return `# EG BioMed 十癌風險平台：後端交接包

建立日期：2026-08-05

## 這包文件的用途

本交接包用於讓後端、模型與臨床審查人員共同確認 v19.4 問卷、答案代碼、feature mapping、新版模型輸入與 API 契約。

**這是審查與實作規格，不代表新版 API 或 Power Automate 已經切換。**

## 後端的閱讀順序

1. \`01_questionnaire/QUESTIONNAIRE_V19_4_SPEC.md\`：先理解前端問了什麼、題序與分流。
2. \`01_questionnaire/answer-code-manifest.json\`：確認語言中立的答案代碼。
3. \`02_mapping/answer-to-feature-mapping.json\`：確認答案如何轉成現行 71 個 features。
4. \`03_vnext/MODEL_VNEXT_HANDOFF.md\`：確認新版模型、症狀與 rule layer 的後端工作。
5. \`04_api/assessment-submission.proposed.schema.json\`：審查擬議中的前後端 payload。
6. \`05_signoff/BACKEND_SIGNOFF_CHECKLIST.md\`：逐項回覆最終決策。

## 重要界線

- 目前已部署模型仍只接收 \`ai_api_feature_row\` 的 71 欄 \`model-features/1.0.0\`。
- \`symptom_feature_row\`、\`vnext_feature_row\` 與 \`rule_input_row\` 目前是新版蒐集，不可未經確認就加入現行 \`/predict\`。
- 後端不可依中文或英文文字轉換 features，必須使用 \`question_id\` 與固定 \`code\`。
- \`unknown\` 與 \`not_applicable\` 必須與明確回答「無」分開。
- Email 只允許儲存在限制權限的聯絡資料，不得進入研究 feature row 或模型。

## 後端必須交回的成果

- 簽核後的模型輸入欄位清單與順序。
- 每個欄位的型別、合法值、單位與缺失值規則。
- 簽核後的 answer-to-feature mapping。
- 新版 API request/response JSON Schema 與範例。
- 模型、前處理、門檻與報告文案的版本號。
- 中文、英文、男性、女性、全無、不確定、條件追問與矛盾回答的測試案例。
- 新舊模型雙軌測試、切換與回退方案。
`;
}

function buildChecklist() {
  return `# 後端簽核清單

請後端或模型負責人對每項填寫「已確認／需修正／不適用」，並附上說明。

## A. 題庫與答案代碼

- [ ] 已確認 78 個題目定義與 76 個標準答案題。
- [ ] 已確認中英文共用同一組 \`question_id\` 與 \`code\`。
- [ ] 已確認性別、年齡、母題與追問的顯示條件。
- [ ] 已確認 \`unknown\`、\`not_applicable\` 與明確陰性的差異。

## B. Feature mapping

- [ ] 已逐欄確認現行 71 個 model features。
- [ ] 已決定舊有 \`-1\` 編碼是否保留或由 adapter 轉換。
- [ ] 已確認 84 個症狀欄位的 1/0/null 語意。
- [ ] 已確認 32 個 vNext 候選 features 的最終名稱與去留。
- [ ] 已確認 29 個 rule inputs 是模型輸入、rule layer 輸入或研究欄位。
- [ ] 已確認肝病成因、血尿、腹部症狀與腫塊類別的邊界。

## C. API 與模型版本

- [ ] 已提供最終有序 feature manifest。
- [ ] 已提供 request JSON Schema、response JSON Schema 與範例。
- [ ] API 會拒絕未知版本、缺欄、多欄、錯誤型別與不可能數值。
- [ ] response 包含 model、feature schema、mapping 與 threshold 版本。
- [ ] 已定義舊 \`/predict\` 與新 \`/predict/v2\` 的兼容和回退策略。

## D. 驗收與上線

- [ ] 後端可由 \`answer_code_rows\` 重建訓練時相同的 features。
- [ ] 男性、女性、全無、不確定、不適用與矛盾案例皆已通過。
- [ ] 新模型已完成 shadow mode，且不會先改變使用者報告。
- [ ] 已記錄每次 inference 的 feature snapshot、順序與版本。
- [ ] Email 未出現在研究表、feature snapshot 或 model request。

## 簽核

- 後端負責人：
- 模型負責人：
- 臨床審查人：
- 前端負責人：
- 簽核日期：
- 核定版本：
`;
}

fs.rmSync(outputRoot, { recursive: true, force: true });
ensureDir(outputRoot);

write("00_README.md", buildReadme());
write("VERSION.txt", `${packageName}\nStatus: backend review package; no production cutover`);
write("01_questionnaire/QUESTIONNAIRE_V19_4_SPEC.md", buildQuestionnaireSpec());
copy("contracts/v1/questionnaire-manifest.json", "01_questionnaire/questionnaire-manifest.json");
copy("contracts/v1/answer-code-manifest.json", "01_questionnaire/answer-code-manifest.json");
copy("QUESTIONNAIRE_VNEXT_PLAIN_TEXT_REPORT.txt", "01_questionnaire/QUESTIONNAIRE_VNEXT_PLAIN_TEXT_REPORT.txt");

copy("DATA_CONTRACT.md", "02_mapping/DATA_CONTRACT.md");
copy("contracts/v1/answer-to-feature-mapping.json", "02_mapping/answer-to-feature-mapping.json");
copy("contracts/v1/model-feature-manifest.json", "02_mapping/model-feature-manifest.json");
copy("contracts/power-automate/transitional-field-manifest.json", "02_mapping/transitional-field-manifest.json");

copy("MODEL_VNEXT_HANDOFF.md", "03_vnext/MODEL_VNEXT_HANDOFF.md");
copy("V19_4_BACKEND_ALIGNMENT_REPORT.md", "03_vnext/V19_4_BACKEND_ALIGNMENT_REPORT.md");
copy("contracts/vnext/questionnaire-manifest.json", "03_vnext/questionnaire-manifest.vnext.json");
copy("contracts/vnext/model-feature-extension-candidates.json", "03_vnext/model-feature-extension-candidates.json");
copy("contracts/vnext/high-risk-rule-input-v19.4.json", "03_vnext/high-risk-rule-input-v19.4.json");

copy("contracts/v1/assessment-submission.schema.json", "04_api/assessment-submission.proposed.schema.json");
copy("contracts/power-automate/transitional-submission.schema.json", "04_api/power-automate-transitional.proposed.schema.json");
write("04_api/sample-submission.zh.json", JSON.stringify(buildSample("zh"), null, 2));
write("04_api/sample-submission.en.json", JSON.stringify(buildSample("en"), null, 2));
copy("POWER_AUTOMATE_RUNBOOK.md", "04_api/POWER_AUTOMATE_RUNBOOK.md");

write("05_signoff/BACKEND_SIGNOFF_CHECKLIST.md", buildChecklist());

const sourceWorkbook = "/Users/hmz/Desktop/EG BioMed/十癌問卷平台/v19.4_新增問卷題目設計規格.xlsx";
if (fs.existsSync(sourceWorkbook)) {
  ensureDir(path.join(outputRoot, "06_source"));
  fs.copyFileSync(sourceWorkbook, path.join(outputRoot, "06_source", path.basename(sourceWorkbook)));
}

console.log(outputRoot);
