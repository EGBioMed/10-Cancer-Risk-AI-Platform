const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = require(path.join(root, "contracts/v1/answer-code-manifest.json"));
const outputPath = path.join(root, "QUESTIONNAIRE_ITEM_BY_ITEM_REVIEW.md");

const moduleNames = {
  basic: "基本資料",
  symptoms: "近期症狀",
  female: "女性相關資訊",
  exposure: "菸草與環境暴露",
  mental: "心理健康",
  diet: "飲食習慣",
  history: "病史與家族史",
  contact: "聯絡資料"
};

const conditionByQuestion = {
  symptoms_breast: "僅性別選擇「女性」時顯示。",
  symptoms_male_reproductive: "僅性別選擇「男性」時顯示。",
  symptoms_gynecological: "僅性別選擇「女性」時顯示。",
  stool_loose_or_frequent: "僅在「腸道與下腹部症狀」勾選「排便習慣改變」時顯示。",
  mastalgia: "僅性別選擇「女性」時顯示，不以是否勾選其他乳房症狀為條件。",
  testicular_pain_pattern: "僅性別為男性，且在「男性生殖系統症狀」勾選「睾丸疼痛或沉重感」時顯示。",
  menarche_age: "僅性別選擇「女性」時顯示。",
  menopause_status: "僅性別選擇「女性」時顯示。",
  first_pregnancy_age: "僅性別選擇「女性」時顯示。",
  breastfeeding: "僅性別選擇「女性」時顯示。",
  pap_smear: "僅性別選擇「女性」時顯示。",
  pap_smear_timing: "僅性別為女性，且由出生年推算年齡滿 18 歲時顯示。",
  hormone_medication: "僅性別選擇「女性」時顯示。",
  benign_gynae_disease: "僅性別選擇「女性」時顯示。",
  smoking_quit: "僅前題「是否有抽菸習慣」回答「是」時顯示。",
  personal_cancer_types: "僅「目前正在治療或追蹤」或「過去曾被診斷」時顯示。",
  liver_disease_etiology: "僅「慢性疾病」勾選肝病時顯示。",
  orchitis_epididymitis: "僅性別選擇「男性」時顯示。",
  psa_history: "僅性別為男性，且由出生年推算年齡滿 50 歲時顯示。",
  family_self_types: "僅「一等親內是否有癌症史」回答「是」時顯示。"
};

const repeatParentByQuestion = {
  symptom_jaundice_repeat_count: "勾選「黃疸」",
  symptom_mass_repeat_count: "任一腫塊母項為陽性：全身不明腫塊、頸部腫塊、頭臉頸腫塊、鼻部腫塊、乳房腫塊或睾丸腫塊",
  symptom_sore_throat_repeat_count: "勾選「持續或反覆喉嚨痛」",
  symptom_shortness_of_breath_repeat_count: "勾選「呼吸喘、呼吸急促或更容易喘」",
  symptom_dysphagia_repeat_count: "勾選「吞嚥困難、吞嚥疼痛或食物卡住感」",
  symptom_hematochezia_repeat_count: "勾選「鮮紅色血便」",
  symptom_abdominal_pain_repeat_count: "任一腹痛母項為陽性：持續腹痛、上腹痛、上腹不適或右上腹不適",
  symptom_back_pain_repeat_count: "勾選「持續背痛」",
  symptom_bowel_habit_change_repeat_count: "勾選「排便習慣改變」",
  symptom_pelvic_discomfort_or_increased_girth_repeat_count: "勾選「骨盆腔不適或腹圍明顯增加」",
  symptom_hematuria_visible_repeat_count: "勾選「肉眼可見血尿」",
  symptom_nocturia_repeat_count: "勾選「夜尿增加」",
  symptom_urinary_frequency_repeat_count: "勾選「頻尿」",
  symptom_oral_ulcer_repeat_count: "勾選「口腔潰痑超過 2 週未癒合」",
  symptom_oral_white_red_patch_repeat_count: "勾選「口腔白斑或紅斑」",
  symptom_mouth_symptoms_repeat_count: "勾選「口腔潰痑」或「口腔白斑／紅斑」任一項"
};

for (const [questionId, parent] of Object.entries(repeatParentByQuestion)) {
  conditionByQuestion[questionId] = `僅在${parent}時顯示。`;
}

const intervalParent = {
  symptom_mass_interval_days: "symptom_mass_repeat_count",
  symptom_oral_ulcer_interval_days: "symptom_oral_ulcer_repeat_count",
  symptom_oral_white_red_patch_interval_days: "symptom_oral_white_red_patch_repeat_count",
  symptom_mouth_symptoms_interval_days: "symptom_mouth_symptoms_repeat_count"
};
for (const [questionId, countId] of Object.entries(intervalParent)) {
  conditionByQuestion[questionId] = `僅對應次數題 \`${countId}\` 為 2 次以上時顯示。`;
}

const followUpsByQuestion = {
  birth_year: "用於計算年齡，並決定是否顯示女性抹片時間與男性 PSA 題。",
  sex: "決定乳房、婦科、男性生殖系統、女性健康、睾丸病史與 PSA 題的顯示。",
  symptoms_bowel_abdominal: "若勾選排便習慣改變，追問稀便／頻率增加與最近 6 個月發生次數；若勾選血便或腹痛，追問發生次數。",
  symptoms_general: "若勾選原因不明腫塊，追問發生次數；若至少 2 次，再追問最短間隔天數。",
  symptoms_hepatobiliary: "若勾選黃疸，追問最近 6 個月發生次數。",
  symptoms_respiratory: "若勾選呼吸喘，追問最近 6 個月發生次數。",
  symptoms_urinary: "勾選肉眼血尿、夜尿或頻尿時，分別追問最近 6 個月發生次數。",
  symptoms_male_reproductive: "勾選睾丸疼痛後追問發生型態；勾選睾丸腫塊也可觸發廣義腫塊次數追問。",
  symptoms_gynecological: "勾選骨盆腔不適或腹圍增加時，追問發生次數。",
  symptoms_oral_throat: "勾選喉嚨痛、口腔潰痑或白／紅斑時，追問發生次數；口腔兩類症狀至少 2 次時再追問最短間隔。",
  symptoms_head_neck_nasal: "勾選任一頭頸、頸部或鼻部腫塊可觸發廣義腫塊次數追問。",
  symptoms_bone_hematologic: "勾選持續背痛時，追問最近 6 個月發生次數。",
  symptom_mass_repeat_count: "若回答 2 次以上，追問兩次之間最短間隔天數。",
  symptom_oral_ulcer_repeat_count: "若回答 2 次以上，追問最短間隔天數。",
  symptom_oral_white_red_patch_repeat_count: "若回答 2 次以上，追問最短間隔天數。",
  symptom_mouth_symptoms_repeat_count: "若回答 2 次以上，追問口腔症狀組合的最短間隔天數。",
  smoking_ever: "回答「是」時追問是否已戒菸。",
  personal_cancer: "回答目前或過去曾被診斷時，追問癌別。",
  chronic_conditions: "勾選肝病時，追問肝病種類。",
  family_cancer: "回答「是」時，追問一等親癌別。"
};

const noteByQuestion = {
  birth_year: "輸入 4 位數西元年；合法範圍為今年往前 120 年至今年。",
  height_cm: "輸入目前身高，100–250 公分，可含 1 位小數。",
  weight_kg: "輸入目前體重，20–300 公斤，可含 1 位小數。",
  weight_change: "回想最近 6 個月，變化門檻為超過原體重 5%。",
  exercise_time: "以一般每週總運動時間作答。",
  sex: "用於顯示生理性別適用的題目與模型欄位。",
  symptoms_general: "一般以最近 3 個月為主；體重下降與原因不明腫塊選項明確指定最近 6 個月。",
  symptoms_upper_digestive: "最近 3 個月。吐血即使僅發生 1 次也勾選；其餘需持續、反覆或明顯新發。",
  symptoms_bowel_abdominal: "最近 3 個月。血便或黑便即使僅發生 1 次也勾選；其餘需持續、反覆或明顯新發。",
  symptoms_hepatobiliary: "一般以最近 3 個月為主；新發糖尿病選項另以過去 2 年為範圍。",
  symptoms_respiratory: "一般以最近 3 個月為主；呼吸喘選項指定最近 6 個月，反覆肺炎選項指定過去 1 年。",
  symptoms_breast: "僅女性；以最近 3 個月內曾出現的警示狀況作答。",
  symptoms_urinary: "最近 3 個月。肉眼血尿或尿滯留即使 1 次也勾選；其餘需持續、反覆或明顯新發。",
  symptoms_male_reproductive: "僅男性；一般回想最近 3 個月。腫塊、腫大與尿滯留即使 1 次也勾選。",
  symptoms_gynecological: "僅女性；最近 3 個月。性交後、月經間或停經後出血即使 1 次也勾選。",
  symptoms_oral_throat: "最近 3 個月；個別選項已設 2 週或 3 週的持續門檻。",
  symptoms_head_neck_nasal: "最近 3 個月。新腫塊即使只發現 1 次也勾選；鼻部症狀需持續、反覆或單側。",
  symptoms_neurological: "最近 3 個月；勾選新發、持續或明顯異於過去狀況的症狀。",
  symptoms_bone_hematologic: "一般以最近 3 個月為主；反覆感染選項指定過去 1 年。",
  stool_loose_or_frequent: "回想最近 6 個月。",
  mastalgia: "回想最近 6 個月；乳房疼痛本身不代表癌症。",
  constipation: "回想最近 6 個月；包含排便困難或次數減少。",
  testicular_pain_pattern: "另存發生型態，主症狀欄位仍僅記錄有／無。",
  first_pregnancy_age: "非必填；未曾懷孕可選「從未懷孕」。",
  breastfeeding: "尚未生產者選「尚未生產，此題不適用」。",
  cooking_frequency: "以平均每週烹調次數作答；目前無論油煙題回答為何都會顯示。",
  stress: "回想過去 1 個月，回答每週發生天數。",
  sleep_problem: "回想過去 1 個月，回答每週發生天數。",
  low_mood: "回想過去 1 個月，回答每週發生天數；不是心理診斷。",
  diet_type: "以長期主要飲食型態選擇 1 項。",
  meat_processed_foods: "回想過去 3 個月；「經常」為平均每週至少 3 次；可複選。加工肉品目前為研究欄位。",
  sugar_fat_foods: "回想過去 3 個月；平均每週至少 3 次；可複選。",
  plant_dairy_habits: "回想過去 3 個月；依各選項的每日或每週門檻勾選。",
  beverage_habits: "飲酒門檻為每週至少 1 次；咖啡與茶為每週至少 3 次。",
  personal_cancer: "依醫療人員曾給予的癌症診斷作答。",
  liver_disease_etiology: "可複選；依醫療人員告知的診斷作答。",
  vnext_diagnosed_conditions: "骨折以最近 12 個月作答；其餘為過去是否曾由醫療人員診斷。",
  email: "必須符合 Email 格式；不提供「不確定」。用於寄送報告，不應作為模型 feature。"
};

function defaultNote(question) {
  if (question.question_id.endsWith("_repeat_count")) {
    return "回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。";
  }
  if (question.question_id.endsWith("_interval_days")) {
    return "回想最近 6 個月；輸入兩次可分開辨識的發生狀況之間最短間隔，範圍 1–180 天。";
  }
  if (question.answer_type === "code_array" && question.module === "symptoms") {
    return "一般回想最近 3 個月；警示狀況即使 1 次也勾選，一般不適需持續、反覆或明顯新發。";
  }
  return "依題目文字與選項作答。";
}

function typeLabel(answerType) {
  return {
    code: "單選",
    code_array: "複選",
    number: "數字輸入",
    string: "文字格式輸入"
  }[answerType] || answerType;
}

function storageRule(question) {
  if (question.question_id === "email") return "保存於受限權限聯絡資料，不應進入模型或研究 feature row。";
  if (question.answer_type === "code_array") return "已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。";
  if (question.answer_type === "number") return "有回答時儲存為數值；不確定為 null；條件不適用為 null。";
  return "以固定答案代碼儲存；不確定為 null；條件不適用為 null。";
}

const reviewQuestions = manifest.questions.filter((question) => question.question_id !== "consent_acknowledgement");
const lines = [
  "# 問卷逐題審核文字與邏輯規格",
  "",
  `問卷版本：\`${manifest.questionnaire_version}\`  `,
  `答案代碼版本：\`${manifest.schema_version}\`  `,
  `審核範圍：排除知情同意後的 ${reviewQuestions.length} 個題目定義。`,
  "",
  "## 共通規則",
  "",
  "1. 題序依本文件排列；條件題不符合時會從畫面題序移除，因此使用者實際題數會動態變動。",
  "2. 單選題點選後直接前往下一題；複選與數字題需按「儲存並繼續」。",
  "3. 複選題的「以上皆無」與「不確定」會排除其他選項，兩者也不可同時選擇。",
  "4. 除 Email 外，使用者可使用「不確定怎麼回答」；該題記為 unknown/null，不得當成「否」或 0。",
  "5. 因條件不符合而未顯示的題目記為 not_applicable/null，不得當成「否」或 0。",
  "6. 返回修改前題後，系統會重新計算後續題目是否適用。",
  "7. 最後會顯示全部已作答題目與答案；必須按「我已確認所有答案，現在送出」才會傳送資料。",
  "",
  "## 逐題審核",
  ""
];

reviewQuestions.forEach((question, index) => {
  const number = index + 1;
  lines.push(
    `## ${number}. ${question.title_zh}`,
    "",
    `- **原始總題序**：${manifest.questions.indexOf(question) + 1}（含知情同意）`,
    `- **段落**：${moduleNames[question.module] || question.module}`,
    `- **question_id**：\`${question.question_id}\``,
    `- **資料欄位**：\`${question.field}\``,
    `- **中文題目**：${question.title_zh}`,
    `- **English**：${question.title_en}`,
    `- **題型**：${typeLabel(question.answer_type)}`,
    `- **必填性**：${question.question_id === "email"
      ? "必填，且不可使用「不確定怎麼回答」"
      : question.required_when_applicable
        ? "適用時必填，但可使用「不確定怎麼回答」"
        : "選填"}`,
    `- **出現條件**：${conditionByQuestion[question.question_id] || "無額外條件，依題序顯示。"}`,
    `- **作答文字規則**：${noteByQuestion[question.question_id] || defaultNote(question)}`,
    `- **後續追問／影響**：${followUpsByQuestion[question.question_id] || "無直接觸發的額外畫面追問。"}`,
    `- **儲存規則**：${storageRule(question)}`
  );

  if (question.number_constraints) {
    const constraints = Object.entries(question.number_constraints)
      .map(([key, value]) => `${key}=${value}`)
      .join("、");
    lines.push(`- **數值限制**：${constraints}`);
  }

  if (question.options?.length) {
    lines.push("", "**選項與固定代碼**", "", "| code | 中文選項 | English |", "|---|---|---|");
    question.options.forEach((option) => {
      lines.push(`| \`${option.code}\` | ${option.label_zh.replaceAll("|", "\\|")} | ${option.label_en.replaceAll("|", "\\|")} |`);
    });
  }

  lines.push(
    "",
    "**審核結果**",
    "",
    "- [ ] 保留",
    "- [ ] 修改",
    "- [ ] 刪除",
    "- [ ] 待臨床／模型／法規確認",
    "- 修改說明：",
    "",
    "---",
    ""
  );
});

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
console.log(outputPath);
