const SUBMISSION_ENDPOINT = "/api/submit";
if (!globalThis.EGAnswerCodes || typeof globalThis.EGAnswerCodes.getOptionCode !== "function") {
  throw new Error("Answer-code module failed to load before app.js.");
}
const SUBMISSION_VERSIONS = Object.freeze({
  contract_version: "assessment-submission/1.1.0",
  questionnaire_version: "questionnaire/2026-08-05-v19.4-phase1",
  consent_version: "consent/2026-08-05",
  answer_code_schema_version: "question-answer-codes/1.0.0",
  feature_schema_version: "model-features/1.0.0",
  mapping_version: "answer-to-feature/1.0.0",
  vnext_feature_schema_version: "feature-gap-candidates/2026-08-05",
  vnext_mapping_version: "answer-mapping-vnext/0.1.0",
  rule_input_schema_version: "high-risk-rules/19.4",
  rule_input_mapping_version: "rule-input-mapping/19.4-phase1",
  report_template_version: "email-report/2026-08-05"
});

const zhShortServiceNote = "將您的生活習慣、病史與家族史整理成個人化癌症相關健康風險因子摘要。本服務不作為疾病診斷或篩檢。";
const enShortServiceNote = "Receive a personalized summary of cancer-related health risk factors based on your lifestyle, medical history, and family history. This service is not a medical diagnosis or screening test.";

const modules = [
  { id: "consent", title: "知情同意", summary: "先確認個資告知與非診斷性質。" },
  { id: "basic", title: "基本資料", summary: "收集年齡、身高體重、運動與性別等基本資訊。" },
  { id: "symptoms", title: "近期症狀", summary: "依身體系統整理近期症狀；一般題目回想最近三個月，v19.4 追問題目會明確標示最近六個月。" },
  { id: "female", title: "女性相關資訊", summary: "依性別條件詢問月經、生育、哺乳、子宮頸抹片與荷爾蒙用藥。" },
  { id: "exposure", title: "菸草與環境暴露", summary: "整理抽菸、二手菸、油煙、空污與輻射等暴露因子。" },
  { id: "mental", title: "心理健康", summary: "記錄近期壓力、睡眠與情緒困擾頻率。" },
  { id: "diet", title: "飲食習慣", summary: "分別整理主要飲食型態、肉類與加工食品、高糖高脂食物、蔬果乳豆類及飲品習慣。" },
  { id: "history", title: "病史與家族史", summary: "確認個人癌症、慢性疾病與家族癌症史。" },
  { id: "contact", title: "聯絡資料", summary: "填寫接收結果報告的 Email。" },
  { id: "confirm", title: "資料確認", summary: "送出前，請確認填答內容。" },
  { id: "result", title: "完成送出", summary: "感謝您的填答。" }
];

const consentOptions = [
  "我已閱讀並了解資料使用說明，同意愛立基生醫股份有限公司依上述目的，以去識別化方式處理我的問卷與健康資料，並使用我提供的 Email 寄送結果報告。",
  "我了解本評估結果的準確度受限於數據庫與演算法，若風險不高不代表沒有風險，若風險較高也不代表已罹病。",
  "我了解本服務僅提供癌症相關風險因子的個人化整理與健康教育資訊；結果不代表罹患癌症的機率，不用於癌症診斷、篩檢、早期偵測、疾病預測或治療決策，亦不能取代醫師評估或任何標準醫療檢查。"
];

const cancerOptions = ["乳癌", "攝護腺癌", "肺癌", "頭頸癌", "胰臟癌", "肝癌", "大腸直腸癌", "胃癌", "子宮內膜癌", "膀胱癌", "腎癌", "其他癌種"];

const symptomNoneOption = "以上皆無";
const symptomUnknownOption = "不確定";
const symptomReminderZh = "請回想最近 3 個月內的身體狀況。出血、腫塊或其他警示狀況即使只發生一次也請勾選；一般不適則請勾選持續、反覆或明顯新發生的情況。若個別選項或追問題目標示『最近 6 個月』，請以該題標示的時間範圍作答。";
const symptomReminderEn = "Please think about your health during the past 3 months. Select bleeding, a lump, or another warning sign even if it occurred once. For common symptoms, select those that were persistent, recurrent, or clearly new. If an option or follow-up question specifies the past 6 months, answer using that stated timeframe.";

const symptomGroups = [
  {
    id: "symptoms_general",
    title: "全身性症狀",
    titleEn: "General Symptoms",
    field: "symptoms.general",
    options: [
      ["不明原因體重下降（過去 6 個月超過體重 5%）", "Unexplained weight loss of more than 5% in the past 6 months", "symptom_unexplained_weight_loss_6m"],
      ["經常疲倦或體力明顯下降（非因工作或睡眠不足）", "Frequent fatigue or a marked decline in energy not explained by work or lack of sleep", "symptom_fatigue"],
      ["食慾降低或食量明顯減少", "Reduced appetite or a noticeable decrease in food intake", "symptom_appetite_loss"],
      ["曾被診斷貧血，或近期抽血發現血色素偏低", "Diagnosed anemia or a recent blood test showing low hemoglobin", "symptom_anemia"],
      ["夜間盜汗（非因環境過熱或更年期）", "Night sweats not explained by a hot environment or menopause", "symptom_night_sweats"],
      ["不明原因發燒（體溫超過 38°C，持續超過 1 週）", "Unexplained fever above 38°C lasting more than 1 week", "symptom_unexplained_fever"],
      ["最近 6 個月內，身體任何部位新出現原因不明的腫塊（包含腋下、腹股溝、四肢或其他部位）", "A new unexplained lump anywhere on the body during the past 6 months, including the armpit, groin, limbs, or another area", "symptom_mass"]
    ]
  },
  {
    id: "symptoms_upper_digestive",
    title: "上消化道症狀",
    titleEn: "Upper Digestive Symptoms",
    field: "symptoms.upper_digestive",
    note: "吐血即使只發生一次也請勾選；其他不適請勾選持續、反覆或明顯新發生的情況。",
    noteEn: "Select vomiting blood even if it occurred once. For other symptoms, select those that were persistent, recurrent, or clearly new.",
    options: [
      ["容易過早飽足（吃少量就飽）", "Early satiety after eating only a small amount", "symptom_early_satiety"],
      ["上腹部悶脹或不適", "Upper abdominal pressure or discomfort", "symptom_upper_abdominal_discomfort"],
      ["上腹部疼痛", "Pain localized to the upper abdomen", "symptom_epigastric_pain"],
      ["消化不良（餐後脹、噯氣或胃部不舒服）", "Indigestion, such as post-meal fullness, belching, or stomach discomfort", "symptom_dyspepsia"],
      ["噁心感（非懷孕或暈車引起）", "Nausea not caused by pregnancy or motion sickness", "symptom_nausea"],
      ["胃酸逆流到喉嚨或口中", "Stomach acid coming back into the throat or mouth", "symptom_reflux"],
      ["胸口或上腹有灼熱感（火燒心）", "A burning sensation in the chest or upper abdomen (heartburn)", "symptom_heartburn"],
      ["吞嚥困難、吞嚥疼痛或食物卡住感", "Difficulty or pain when swallowing, or a feeling that food is stuck", "symptom_dysphagia"],
      ["吐血或嘔吐物呈咖啡渣樣", "Vomiting blood or coffee-ground-like material", "symptom_hematemesis"]
    ]
  },
  {
    id: "symptoms_bowel_abdominal",
    title: "腸道與下腹部症狀",
    titleEn: "Bowel and Lower Abdominal Symptoms",
    field: "symptoms.bowel_abdominal",
    note: "血便或黑便即使只發生一次也請勾選；其他不適請勾選持續、反覆或明顯新發生的情況。",
    noteEn: "Select bloody or black stools even if they occurred once. For other symptoms, select those that were persistent, recurrent, or clearly new.",
    extraOptions: [
      ["便秘（排便困難或排便次數減少）", "Constipation (difficulty passing stool or fewer bowel movements)"]
    ],
    options: [
      ["經常腹脹", "Frequent abdominal bloating", "symptom_bloating"],
      ["持續腹痛", "Persistent abdominal pain", "symptom_persistent_abdominal_pain"],
      ["排便習慣改變（腹瀉與便秘交替，或糞便持續變細）", "Change in bowel habits, alternating diarrhea and constipation, or persistently narrow stools", "symptom_bowel_habit_change"],
      ["血便（鮮紅色血液）", "Bright red blood in the stool", "symptom_hematochezia"],
      ["黑便（柏油狀、黑色糞便）", "Black, tarry stools", "symptom_melena"],
      ["頻繁想排便但感覺排不乾淨（裡急後重）", "Frequent urge to have a bowel movement with incomplete emptying", "symptom_tenesmus"],
      ["糞便潛血檢查曾發現異常", "Previous abnormal fecal occult blood test", "symptom_abnormal_fobt"]
    ]
  },
  {
    id: "symptoms_hepatobiliary",
    title: "肝膽胰症狀",
    titleEn: "Liver, Biliary, and Pancreatic Symptoms",
    field: "symptoms.hepatobiliary",
    options: [
      ["黃疸（皮膚或眼白變黃）", "Jaundice, with yellowing of the skin or whites of the eyes", "symptom_jaundice"],
      ["皮膚搔癢（非皮膚疾病引起）", "Itchy skin not explained by a skin condition", "symptom_pruritus"],
      ["尿液顏色明顯變深（如濃茶色）", "Noticeably dark urine, such as tea-colored urine", "symptom_dark_urine"],
      ["糞便顏色變淺或呈灰白色", "Pale or grayish stools", "symptom_pale_stool"],
      ["右上腹不適或悶痛", "Discomfort or dull pain in the right upper abdomen", "symptom_right_upper_abdominal_discomfort"],
      ["過去 2 年內才被診斷糖尿病", "Diabetes newly diagnosed within the past 2 years", "symptom_recent_diabetes_diagnosis"],
      ["已有糖尿病，但血糖控制突然變差", "Sudden worsening of blood glucose control in existing diabetes", "symptom_worsening_diabetes_control"]
    ]
  },
  {
    id: "symptoms_respiratory",
    title: "呼吸系統症狀",
    titleEn: "Respiratory Symptoms",
    field: "symptoms.respiratory",
    options: [
      ["持續咳嗽超過 3 週（非感冒引起）", "Cough lasting more than 3 weeks and not caused by a cold", "symptom_persistent_cough"],
      ["咳血或痰中帶血", "Coughing up blood or blood-streaked sputum", "symptom_hemoptysis"],
      ["一年內反覆發生肺炎 2 次以上", "Pneumonia occurring 2 or more times within 1 year", "symptom_recurrent_pneumonia"],
      ["持續胸痛或胸悶", "Persistent chest pain or tightness", "symptom_chest_pain"],
      ["最近 6 個月內曾出現呼吸喘、呼吸急促或比平常更容易喘", "Shortness of breath, rapid breathing, or becoming breathless more easily than usual during the past 6 months", "symptom_shortness_of_breath"]
    ]
  },
  {
    id: "symptoms_breast",
    title: "乳房症狀",
    titleEn: "Breast Symptoms",
    field: "symptoms.breast",
    femaleOnly: true,
    options: [
      ["乳房腫塊或局部硬塊", "A breast lump or localized hard area", "symptom_breast_lump"],
      ["新發生的乳頭凹陷（非天生）", "New nipple retraction that was not present from birth", "symptom_nipple_retraction"],
      ["乳頭異常分泌物（尤其是血性分泌物）", "Abnormal nipple discharge, especially bloody discharge", "symptom_nipple_discharge"],
      ["乳房皮膚橘皮樣變化或局部凹陷", "Orange-peel-like breast skin changes or localized dimpling", "symptom_breast_skin_change"]
    ]
  },
  {
    id: "symptoms_urinary",
    title: "泌尿系統症狀",
    titleEn: "Urinary Symptoms",
    field: "symptoms.urinary",
    note: "肉眼看到血尿或發生尿滯留，即使只發生一次也請勾選；其他症狀請勾選持續、反覆或明顯新發生的情況。",
    noteEn: "Select visible blood in urine or urinary retention even if it occurred once. For other symptoms, select those that were persistent, recurrent, or clearly new.",
    options: [
      ["頻尿（白天排尿超過 8 次）", "Frequent urination, more than 8 times during the day", "symptom_urinary_frequency"],
      ["夜尿增加（晚上起床排尿超過 2 次）", "Increased nighttime urination, more than 2 times per night", "symptom_nocturia"],
      ["尿流變細或排尿無力", "Weak or narrowed urine stream", "symptom_weak_urine_stream"],
      ["排尿困難（需用力才能排出）", "Difficulty urinating or needing to strain", "symptom_urinary_hesitancy"],
      ["排尿中斷（排尿時尿流突然停止）", "Interrupted urine flow", "symptom_interrupted_urine_flow"],
      ["肉眼可見尿液呈紅色、粉紅色或帶血", "Visible red, pink, or blood-stained urine", "symptom_hematuria_visible"],
      ["尿液外觀看不出血，但尿液檢查曾發現潛血", "Blood found on a urine test without visible blood", "symptom_hematuria"],
      ["排尿疼痛或有灼熱感", "Pain or burning when urinating", "symptom_dysuria"]
    ]
  },
  {
    id: "symptoms_male_reproductive",
    title: "男性生殖系統症狀",
    titleEn: "Male Reproductive Symptoms",
    field: "symptoms.male_reproductive",
    maleOnly: true,
    note: "睪丸或陰囊腫塊、腫大及尿滯留，即使只發生一次也請勾選；疼痛或性功能改變請勾選持續、反覆或明顯新發生的情況。",
    noteEn: "Select a testicular or scrotal lump, swelling, or urinary retention even if it occurred once. For pain or sexual-function changes, select persistent, recurrent, or clearly new symptoms.",
    options: [
      ["睪丸摸到腫塊或硬塊", "A lump or hard area felt in a testicle", "symptom_testicular_lump"],
      ["單側或雙側睪丸明顯腫大", "Noticeable swelling of one or both testicles", "symptom_testicular_swelling"],
      ["陰囊明顯腫大", "Noticeable swelling of the scrotum", "symptom_scrotal_swelling"],
      ["睪丸疼痛或沉重感", "Testicular pain or a feeling of heaviness", "symptom_testicular_pain"],
      ["腹股溝持續或反覆疼痛", "Persistent or recurrent groin pain", "symptom_groin_pain"],
      ["曾突然完全無法排尿，需要就醫處理", "A sudden complete inability to urinate that required medical care", "symptom_urinary_retention"],
      ["新發生或明顯惡化的勃起功能障礙", "New or clearly worsened erectile dysfunction", "symptom_impotence"]
    ]
  },
  {
    id: "symptoms_gynecological",
    title: "婦科相關症狀",
    titleEn: "Gynecological Symptoms",
    field: "symptoms.gynecological",
    femaleOnly: true,
    note: "性交後、兩次月經之間或停經後出血，即使只發生一次也請勾選；其他不適請勾選持續、反覆或明顯新發生的情況。",
    noteEn: "Select bleeding after sex, between periods, or after menopause even if it occurred once. For other symptoms, select those that were persistent, recurrent, or clearly new.",
    options: [
      ["性交後出血", "Bleeding after sexual intercourse", "symptom_postcoital_bleeding"],
      ["兩次月經之間出血", "Bleeding between menstrual periods", "symptom_intermenstrual_bleeding"],
      ["其他月經以外的異常陰道出血", "Other abnormal vaginal bleeding outside menstruation", "symptom_abnormal_vaginal_bleeding"],
      ["停經後陰道出血", "Vaginal bleeding after menopause", "symptom_postmenopausal_bleeding"],
      ["月經異常增多或不規則出血", "Unusually heavy menstruation or irregular bleeding", "symptom_heavy_irregular_menstruation"],
      ["持續或反覆的異常陰道分泌物", "Persistent or recurrent abnormal vaginal discharge", "symptom_abnormal_vaginal_discharge"],
      ["持續或反覆的骨盆腔疼痛", "Persistent or recurrent pelvic pain", "symptom_pelvic_pain"],
      ["骨盆腔不適或腹圍明顯增加", "Pelvic discomfort or a noticeable increase in abdominal girth", "symptom_pelvic_discomfort_or_increased_girth"]
    ]
  },
  {
    id: "symptoms_oral_throat",
    title: "口腔與喉嚨症狀",
    titleEn: "Oral and Throat Symptoms",
    field: "symptoms.oral_throat",
    options: [
      ["口腔潰瘍超過 2 週未癒合", "An oral ulcer that has not healed after more than 2 weeks", "symptom_oral_ulcer"],
      ["持續聲音沙啞超過 3 週（非感冒引起）", "Hoarseness lasting more than 3 weeks and not caused by a cold", "symptom_hoarseness"],
      ["口腔白斑或紅斑", "A white or red patch in the mouth", "symptom_oral_white_red_patch"],
      ["持續或反覆喉嚨痛（非一般感冒）", "Persistent or recurrent sore throat not explained by a common cold", "symptom_sore_throat"],
      ["持續或反覆耳痛，且耳部檢查沒有明確原因", "Persistent or recurrent ear pain without a clear ear-related cause", "symptom_otalgia"]
    ]
  },
  {
    id: "symptoms_head_neck_nasal",
    title: "頭頸與鼻部症狀",
    titleEn: "Head, Neck, and Nasal Symptoms",
    field: "symptoms.head_neck_nasal",
    note: "新出現的腫塊即使只發現一次也請勾選；鼻塞或鼻漏請勾選持續、反覆或單側發生的情況。",
    noteEn: "Select a newly found mass even if noticed once. For nasal blockage or discharge, select persistent, recurrent, or one-sided symptoms.",
    options: [
      ["頸部摸得到腫塊或硬塊", "A palpable lump or hard mass in the neck", "symptom_neck_lump"],
      ["頭部、臉部或頸部出現新的腫塊", "A new mass in the head, face, or neck", "symptom_head_neck_mass"],
      ["鼻腔內或鼻部出現腫塊", "A mass in or around the nose", "symptom_nasal_mass"],
      ["持續、反覆或單側鼻塞／鼻漏", "Persistent, recurrent, or one-sided nasal blockage or discharge", "symptom_nasal_discharge"]
    ]
  },
  {
    id: "symptoms_neurological",
    title: "神經系統症狀",
    titleEn: "Neurological Symptoms",
    field: "symptoms.neurological",
    options: [
      ["新發生的持續頭痛（非過去的偏頭痛模式）", "A new persistent headache that differs from a previous migraine pattern", "symptom_new_headache"],
      ["新發生的癲癇或抽搐", "A new seizure or convulsion", "symptom_seizure"],
      ["視力模糊或視野缺損（非近視或老花）", "Blurred vision or visual field loss not explained by myopia or presbyopia", "symptom_visual_change"],
      ["肢體無力或麻木", "Weakness or numbness in an arm or leg", "symptom_limb_weakness_numbness"],
      ["人格改變或記憶力明顯衰退", "Personality change or a marked decline in memory", "symptom_personality_memory_change"]
    ]
  },
  {
    id: "symptoms_bone_hematologic",
    title: "骨骼、血液與淋巴症狀",
    titleEn: "Bone, Blood, and Lymphatic Symptoms",
    field: "symptoms.bone_hematologic",
    options: [
      ["持續背痛（非外傷或肌肉引起）", "Persistent back pain not explained by injury or muscle strain", "symptom_persistent_back_pain"],
      ["持續或反覆的肋骨疼痛", "Persistent or recurrent rib pain", "symptom_rib_pain"],
      ["其他部位持續或反覆的骨骼疼痛", "Persistent or recurrent bone pain elsewhere", "symptom_bone_pain_other"],
      ["持續或反覆的關節疼痛，且原因不明", "Persistent or recurrent unexplained joint pain", "symptom_joint_pain"],
      ["反覆或原因不明的鼻出血", "Recurrent or unexplained nosebleeds", "symptom_nosebleeds"],
      ["一年內反覆感染 3 次以上，或感染久久不癒", "Repeated infections 3 or more times within 1 year, or an infection that does not resolve", "symptom_recurrent_infection"],
      ["容易瘀青或異常出血（小傷口出血久不止）", "Easy bruising or unusual bleeding, including prolonged bleeding from a small wound", "symptom_easy_bruising_bleeding"],
      ["淋巴結腫大（頸部、腋下或鼠蹊部腫塊）", "Enlarged lymph nodes or lumps in the neck, armpit, or groin", "symptom_lymphadenopathy"]
    ]
  }
];

const symptomOptionTranslations = symptomGroups.reduce((translations, group) => {
  group.options.forEach(([label, english]) => {
    translations[label] = english;
  });
  (group.extraOptions || []).forEach(([label, english]) => {
    translations[label] = english;
  });
  return translations;
}, {});

const symptomQuestions = symptomGroups.map((group) => ({
  id: group.id,
  module: "symptoms",
  type: "multi",
  required: true,
  title: group.title,
  titleEn: group.titleEn,
  note: group.note || "請勾選符合的症狀；若都沒有請選「以上皆無」，無法判斷請選「不確定」。",
  noteEn: group.noteEn || "Select every symptom that applies. Select “None of the above” if none apply, or “Not sure” if you cannot determine the answer.",
  field: group.field,
  options: [...group.options.map(([label]) => label), ...(group.extraOptions || []).map(([label]) => label), symptomNoneOption, symptomUnknownOption],
  symptomDefinitions: group.options,
  femaleOnly: group.femaleOnly === true,
  maleOnly: group.maleOnly === true,
  noneOption: symptomNoneOption,
  unknownOption: symptomUnknownOption,
  isSymptomGroup: true,
  appliesIf: group.femaleOnly
    ? (answers) => getAnswerValue(answers, "demographics.sex") === "女性"
    : group.maleOnly
      ? (answers) => getAnswerValue(answers, "demographics.sex") === "男性"
      : undefined
}));

const vnextHistoryFeatureDefinitions = [
  ["過去 12 個月內曾發生骨折", "A fracture during the past 12 months", "symptom_fracture"],
  ["曾由醫師診斷深層靜脈栓塞或肺栓塞（DVT／PE）", "A clinician-diagnosed deep vein thrombosis or pulmonary embolism (DVT/PE)", "symptom_vte"],
  ["曾由牙醫或醫師診斷口腔黏膜下纖維化", "Oral submucous fibrosis diagnosed by a dentist or physician", "symptom_oral_submucous_fibrosis"],
  ["曾由醫師診斷慢性胰臟炎", "Chronic pancreatitis diagnosed by a clinician", "hx_chronic_pancreatitis"]
];

const liverEtiologyOptions = [
  "B 型肝炎",
  "C 型肝炎",
  "肝硬化",
  "代謝功能障礙相關脂肪性肝病（MASLD）",
  "酒精性肝病",
  "其他肝病",
  "不確定肝病種類"
];

const ruleRepeatDefinitions = [
  ["symptom_jaundice", "黃疸", "jaundice", "symptom_jaundice_repeat_count"],
  ["symptom_mass", "原因不明的腫塊", "an unexplained lump", "symptom_mass_repeat_count", "symptom_mass_interval_days"],
  ["symptom_sore_throat", "喉嚨痛", "sore throat", "symptom_sore_throat_repeat_count"],
  ["symptom_shortness_of_breath", "呼吸喘或呼吸急促", "shortness of breath", "symptom_shortness_of_breath_repeat_count"],
  ["symptom_dysphagia", "吞嚥困難、吞嚥疼痛或卡住感", "difficulty or pain when swallowing", "symptom_dysphagia_repeat_count"],
  ["symptom_hematochezia", "鮮紅色血便", "bright red blood in the stool", "symptom_hematochezia_repeat_count"],
  ["symptom_abdominal_pain", "腹部疼痛", "abdominal pain", "symptom_abdominal_pain_repeat_count"],
  ["symptom_back_pain", "背痛", "back pain", "symptom_back_pain_repeat_count"],
  ["symptom_bowel_habit_change", "排便習慣改變", "a change in bowel habits", "symptom_bowel_habit_change_repeat_count"],
  ["symptom_pelvic_discomfort_or_increased_girth", "骨盆腔不適或腹圍增加", "pelvic discomfort or increased abdominal girth", "symptom_pelvic_discomfort_or_increased_girth_repeat_count"],
  ["symptom_hematuria_visible", "肉眼可見血尿", "visible blood in the urine", "symptom_hematuria_visible_repeat_count"],
  ["symptom_nocturia", "夜尿增加", "increased nighttime urination", "symptom_nocturia_repeat_count"],
  ["symptom_urinary_frequency", "頻尿", "frequent urination", "symptom_urinary_frequency_repeat_count"],
  ["symptom_oral_ulcer", "口腔潰瘍", "an oral ulcer", "symptom_oral_ulcer_repeat_count", "symptom_oral_ulcer_interval_days"],
  ["symptom_oral_white_red_patch", "口腔白斑或紅斑", "a white or red patch in the mouth", "symptom_oral_white_red_patch_repeat_count", "symptom_oral_white_red_patch_interval_days"],
  ["symptom_mouth_symptoms", "上述口腔症狀", "the oral symptoms selected above", "symptom_mouth_symptoms_repeat_count", "symptom_mouth_symptoms_interval_days"]
];

const ruleRepeatQuestions = ruleRepeatDefinitions.flatMap(([parent, labelZh, labelEn, countField, intervalField]) => {
  const questionsForField = [{
    id: countField,
    module: "symptoms",
    type: "number",
    required: true,
    repeatCount: true,
    title: `最近 6 個月內，${labelZh}總共出現過幾次？`,
    titleEn: `During the past 6 months, how many times did you experience ${labelEn}?`,
    note: "請填寫 1 至 9；若出現 9 次以上請填 9。若無法確認次數，可選「不確定怎麼回答」。",
    noteEn: "Enter a number from 1 to 9. Enter 9 if it occurred 9 or more times. If you cannot determine the count, select “Not sure how to answer.”",
    field: `rule_inputs.${countField}`,
    ruleField: countField,
    placeholder: "1-9",
    appliesIf: () => isRuleParentPositive(parent)
  }];
  if (intervalField) {
    questionsForField.push({
      id: intervalField,
      module: "symptoms",
      type: "number",
      required: true,
      intervalDays: true,
      title: `最近 6 個月內，兩次${labelZh}之間最短相隔幾天？`,
      titleEn: `During the past 6 months, what was the shortest interval in days between two episodes of ${labelEn}?`,
      note: "僅計算兩次可分開辨識的發生情況，請輸入最短間隔天數。若無法確認，可選「不確定怎麼回答」。",
      noteEn: "Count only episodes that could be identified separately and enter the shortest interval in days. If unsure, select “Not sure how to answer.”",
      field: `rule_inputs.${intervalField}`,
      ruleField: intervalField,
      placeholder: "天數",
      appliesIf: () => normalizeNumber(getAnswerValue(answers, `rule_inputs.${countField}`)) >= 2
    });
  }
  return questionsForField;
});

Object.assign(symptomOptionTranslations, Object.fromEntries(
  vnextHistoryFeatureDefinitions.map(([label, english]) => [label, english])
), {
  "僅發生 1 次": "Occurred once",
  "反覆發生 2 次以上": "Occurred 2 or more times",
  "持續存在": "Persisted continuously",
  "少於 6 週": "Less than 6 weeks",
  "持續或間隔至少 6 週後再次出現": "Persisted or recurred at least 6 weeks apart",
  "B 型肝炎": "Hepatitis B",
  "C 型肝炎": "Hepatitis C",
  "肝硬化": "Cirrhosis",
  "代謝功能障礙相關脂肪性肝病（MASLD）": "Metabolic dysfunction-associated steatotic liver disease (MASLD)",
  "酒精性肝病": "Alcohol-related liver disease",
  "其他肝病": "Other liver disease",
  "不確定肝病種類": "Not sure of the liver disease type",
  "是，曾由醫師診斷": "Yes, diagnosed by a clinician",
  "3 年內": "Within the past 3 years",
  "3 年以上": "More than 3 years ago",
  "從未做過": "Never",
  "不記得": "I do not remember",
  "做過且曾被告知偏高": "Tested and was told the result was elevated",
  "做過且結果正常": "Tested and the result was normal",
  "沒做過": "Never tested"
});

const questions = [
  {
    id: "consent_acknowledgement",
    module: "consent",
    type: "multi",
    required: true,
    title: "在開始填寫前，請確認您已閱讀並同意以下事項",
    note: "請先閱讀個人資料告知與服務說明，再完成下方三項確認。",
    field: "consent.acknowledgement",
    options: consentOptions,
    minSelected: 3
  },
  { id: "birth_year", module: "basic", type: "number", required: true, title: "您的出生年（西元）", note: "請輸入 4 位數西元年，例如 1980。", field: "demographics.birth_year", placeholder: "輸入您的答案" },
  { id: "height_cm", module: "basic", type: "number", required: true, title: "身高（公分）", note: "請輸入目前身高。", field: "demographics.height_cm", placeholder: "例如 165" },
  { id: "weight_kg", module: "basic", type: "number", required: true, title: "體重（公斤）", note: "請輸入目前體重。", field: "demographics.weight_kg", placeholder: "例如 60" },
  { id: "weight_change", module: "basic", type: "single", required: true, title: "近半年內，您的體重是否有明顯增加或減少（超過體重 5%）？", note: "若不確定，請選不確定。", field: "demographics.weight_change_over_5_percent", options: ["是", "否", "不確定"] },
  { id: "exercise_time", module: "basic", type: "single", required: true, title: "每週運動時間", note: "請選擇最接近您一般狀況的選項。", field: "lifestyle.weekly_exercise_time", options: ["幾乎不運動", "30-60 分鐘", "1-2 小時", "多於 2 小時"] },
  { id: "sex", module: "basic", type: "single", required: true, title: "您的性別？", note: "系統會依您的選擇顯示適用題目。", field: "demographics.sex", options: ["男性", "女性"] },
  { id: "race", module: "basic", type: "single", required: true, title: "您認為自己屬於哪一個人種？", note: "請選擇最符合您的選項；若不希望提供，可選擇不回答。", field: "demographics.race", options: ["亞洲裔", "白人", "黑人或非洲裔", "其他族群", "選擇不回答"] },

  ...symptomQuestions,

  { id: "stool_loose_or_frequent", module: "symptoms", type: "single", required: true, title: "最近 6 個月內，排便習慣改變時，是否主要是大便變稀或排便次數變多？", titleEn: "During the past 6 months, when your bowel habits changed, did you mainly have looser stools or more frequent bowel movements?", note: "此題只在您勾選排便習慣改變後出現。", noteEn: "This question appears only after you report a change in bowel habits.", field: "rule_inputs.symptom_stool_loose_or_frequent", ruleField: "symptom_stool_loose_or_frequent", options: ["是", "否", "不確定"], appliesIf: () => isRuleParentPositive("symptom_bowel_habit_change") },
  { id: "mastalgia", module: "symptoms", type: "single", required: true, title: "最近 6 個月內，您的乳房是否曾有疼痛或脹痛？", titleEn: "During the past 6 months, have you had breast pain or tenderness?", note: "請依實際情況回答；乳房疼痛本身不代表癌症。", noteEn: "Answer based on your experience. Breast pain by itself does not mean cancer.", field: "rule_inputs.symptom_mastalgia", ruleField: "symptom_mastalgia", options: ["是", "否", "不確定"], appliesIf: () => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "constipation", module: "symptoms", type: "single", required: true, displayInComposite: true, title: "最近 6 個月內，您是否曾有便秘，例如排便困難或排便次數減少？", titleEn: "During the past 6 months, have you had constipation, such as difficulty passing stool or fewer bowel movements?", note: "已併入腸道與下腹部症狀題組。", noteEn: "This item is included in the bowel and lower abdominal symptom group.", field: "rule_inputs.symptom_constipation", ruleField: "symptom_constipation", options: ["是", "否", "不確定"] },

  ...ruleRepeatQuestions,

  { id: "testicular_pain_pattern", module: "symptoms", type: "single", required: true, title: "睪丸疼痛發生的情況", titleEn: "Pattern of testicular pain", note: "此追問會另外保存頻率；主要症狀欄位仍只記錄是否曾出現。", noteEn: "This follow-up stores the pattern separately. The main symptom field remains a yes/no indicator.", field: "symptoms.follow_up.testicular_pain_pattern", options: ["僅發生 1 次", "反覆發生 2 次以上", "持續存在", "不確定"], appliesIf: () => hasSelected("symptoms.male_reproductive", "睪丸疼痛") },

  { id: "menarche_age", module: "female", type: "single", required: true, title: "初經（第一次月經）來潮年齡", note: "若不確定，可使用下方不確定選項。", field: "female_health.menarche_age", options: ["12 歲以前（含 12 歲）", "13 歲以後（含 13 歲）"], appliesIf: (answers) => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "menopause_status", module: "female", type: "single", required: true, title: "目前停經（更年期）狀態", note: "請選擇最接近目前狀況的選項。", field: "female_health.menopause_status", options: ["尚未停經（仍有月經）", "已停經（55 歲或以前停經）", "已停經（55 歲或以後停經）", "已切除子宮或卵巢"], appliesIf: (answers) => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "first_pregnancy_age", module: "female", type: "single", required: false, title: "第一胎懷孕年齡", note: "若未曾懷孕可選從未懷孕。", field: "female_health.first_pregnancy_age", options: ["從未懷孕", "20 歲以下", "20-30 歲", "31-35 歲", "36 歲以上"], appliesIf: (answers) => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "breastfeeding", module: "female", type: "single", required: true, title: "產後是否曾哺餵母乳？若有，哺乳時間多長？", note: "若尚未生產，此題請選不適用。", field: "female_health.breastfeeding_history", options: ["從未哺乳", "有哺乳，但少於 6 個月", "有哺乳，超過 6 個月（含 6 個月）", "尚未生產，此題不適用"], appliesIf: (answers) => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "pap_smear", module: "female", type: "single", required: true, title: "是否曾做過子宮頸抹片檢查？結果如何？", note: "此題用於子宮頸相關風險因子整理。", field: "female_health.pap_smear_history", options: ["是，歷次結果均正常", "是，曾有異常報告（如 CIN、HPV 陽性等）", "否，從未做過"], appliesIf: (answers) => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "pap_smear_timing", module: "female", type: "single", required: true, title: "您最近一次子宮頸抹片檢查是在什麼時候？", titleEn: "When was your most recent Pap smear?", note: "請選擇最接近的時間；若不記得可直接選不記得。", noteEn: "Choose the closest timeframe. Select “I do not remember” if you are unsure.", field: "rule_inputs.screen_pap_overdue_or_out_of_range", ruleField: "screen_pap_overdue_or_out_of_range", options: ["3 年內", "3 年以上", "從未做過", "不記得"], appliesIf: () => getAnswerValue(answers, "demographics.sex") === "女性" && calculateAge() >= 18 },
  { id: "hormone_medication", module: "female", type: "single", required: true, title: "過去是否曾使用賀爾蒙藥物？", note: "包含避孕藥、更年期賀爾蒙補充療法 HRT 等。", field: "female_health.hormone_medication", options: ["是，使用超過 1 年", "是，使用不到 1 年", "否，從未使用"], appliesIf: (answers) => getAnswerValue(answers, "demographics.sex") === "女性" },
  { id: "benign_gynae_disease", module: "female", type: "single", required: true, title: "醫師是否曾診斷您有子宮肌瘤、卵巢囊腫、子宮內膜異位或其他婦科良性疾病？", titleEn: "Has a clinician ever diagnosed you with uterine fibroids, an ovarian cyst, endometriosis, or another benign gynecological condition?", note: "請依醫療人員曾告知的診斷回答。", noteEn: "Answer based on a diagnosis previously given by a healthcare professional.", field: "rule_inputs.hx_benign_gynae_disease", ruleField: "hx_benign_gynae_disease", options: ["是，曾由醫師診斷", "否", "不確定"], appliesIf: () => getAnswerValue(answers, "demographics.sex") === "女性" },

  { id: "smoking_ever", module: "exposure", type: "single", required: true, title: "是否有抽菸習慣（現在或過去）？", note: "請選擇最接近您狀況的選項。", field: "exposure.smoking_ever", options: ["是", "否"] },
  { id: "smoking_quit", module: "exposure", type: "single", required: false, title: "若有抽菸習慣，是否已戒菸？", note: "承上題，若選是請補充目前狀態。", field: "exposure.smoking_quit_status", options: ["是，已戒菸", "否，仍在抽菸"], appliesIf: (answers) => getAnswerValue(answers, "exposure.smoking_ever") === "是" },
  { id: "secondhand_smoke", module: "exposure", type: "single", required: true, title: "是否長期處在二手菸的生活或工作環境？", note: "例如同住者、工作場域或長期固定暴露。", field: "exposure.secondhand_smoke", options: ["是", "否"] },
  { id: "betel_nut", module: "exposure", type: "single", required: true, title: "是否有嚼檳榔習慣（現在或過去）？", note: "此題用於頭頸癌等相關風險因子。", field: "exposure.betel_nut_ever", options: ["是", "否"] },
  { id: "cooking_fume", module: "exposure", type: "single", required: true, title: "工作或生活環境是否經常接觸油煙？", note: "例如廚師、長期在廚房烹飪。", field: "exposure.cooking_fume", options: ["是", "否"] },
  { id: "cooking_frequency", module: "exposure", type: "single", required: false, title: "每週平均烹調次數", note: "若很少烹調，請選少於一次。", field: "exposure.weekly_cooking_frequency", options: ["少於一次", "每週 1-3 次", "每週 4-6 次", "每週 6 次以上"] },
  { id: "air_pollution", module: "exposure", type: "single", required: true, title: "工作或生活是否長期暴露在空氣污染環境？", note: "例如工廠、交通繁忙區域。", field: "exposure.air_pollution", options: ["是", "否"] },
  { id: "radiation", module: "exposure", type: "single", required: true, title: "工作或生活是否常接觸輻射？", note: "例如放射科人員。", field: "exposure.radiation_exposure", options: ["是", "否"] },

  { id: "mental_frequency_matrix", module: "mental", type: "matrix", required: true, isComposite: true, title: "過去一個月的情緒與睡眠頻率", titleEn: "Emotional wellbeing and sleep frequency in the past month", note: "請為每一列選擇每週最接近的頻率；本題僅作為健康風險因子整理，不是心理診斷。", noteEn: "Select the closest weekly frequency for every row. This is used only to organize health risk factors and is not a mental health diagnosis.", rowQuestionIds: ["stress", "sleep_problem", "low_mood"] },
  { id: "stress", module: "mental", type: "single", required: true, displayInComposite: true, matrixLabel: "感到緊張或焦慮", matrixLabelEn: "Feeling tense or anxious", title: "過去一個月，每週感到緊張或焦慮的頻率", note: "請以最近一個月的一般狀況回答。", field: "mental_health.weekly_stress_frequency", options: ["不到 1 天", "2-3 天", "4-5 天", "幾乎每天"] },
  { id: "sleep_problem", module: "mental", type: "single", required: true, displayInComposite: true, matrixLabel: "睡不好或失眠", matrixLabelEn: "Poor sleep or insomnia", title: "過去一個月，每週睡不好或失眠的頻率", note: "請以最近一個月的一般狀況回答。", field: "mental_health.weekly_sleep_problem_frequency", options: ["不到 1 天", "2-3 天", "4-5 天", "幾乎每天"] },
  { id: "low_mood", module: "mental", type: "single", required: true, displayInComposite: true, matrixLabel: "情緒低落或憂鬱", matrixLabelEn: "Feeling low or depressed", title: "過去一個月，每週情緒低落或憂鬱的頻率", note: "此題僅作為健康風險因子整理，不是心理診斷。", field: "mental_health.weekly_low_mood_frequency", options: ["不到 1 天", "2-3 天", "4-5 天", "幾乎每天"] },

  { id: "diet_type", module: "diet", type: "single", required: true, title: "以下哪一項最接近您平常的飲食方式？", note: "請依長期飲食型態選擇一項。若主要吃蔬食但仍會吃肉類或海鮮，請選「蔬食為主」。", field: "diet.current_diet_type", options: ["一般飲食（平常會吃肉類或海鮮）", "蔬食為主（主要吃植物性食物，但仍會吃肉類或海鮮）", "魚素（不吃肉類，但會吃魚類或海鮮）", "蛋奶素（不吃肉類及海鮮，但會吃蛋或乳製品）", "全素（不吃肉類、海鮮、蛋及乳製品）"] },
  { id: "diet_frequency_matrix", module: "diet", type: "diet-matrix", required: true, isComposite: true, title: "過去三個月的飲食頻率", titleEn: "Diet frequency during the past three months", note: "各項目預設為未達標示頻率；請將符合日常狀況的項目改選為「達到頻率」，再儲存並繼續。", noteEn: "Items default to below the stated frequency. Change the items that match your usual habits to “Meets frequency,” then save and continue.", rowQuestionIds: ["meat_processed_foods", "sugar_fat_foods", "plant_dairy_habits", "beverage_habits"] },
  { id: "meat_processed_foods", module: "diet", type: "multi", required: true, displayInComposite: true, title: "肉類、加工及高溫烹調食物", note: "請依過去三個月的一般飲食狀況作答。", field: "diet.meat_processed_foods", noneOption: "以上皆未達每週 3 次", options: ["紅肉（牛、羊、豬等；平均每週至少 3 次）", "燒烤或油炸食品（平均每週至少 3 次）", "醃漬或鹽漬食品（例如泡菜、鹹魚；平均每週至少 3 次）", "加工肉品（例如香腸、火腿、培根；平均每週至少 3 次）", "以上皆未達每週 3 次"] },
  { id: "sugar_fat_foods", module: "diet", type: "multi", required: true, displayInComposite: true, title: "高糖與高脂食物", note: "請依過去三個月的一般飲食狀況作答。", field: "diet.sugar_fat_foods", noneOption: "以上皆未達每週 3 次", options: ["甜食或高糖零食（平均每週至少 3 次）", "含糖飲料（平均每週至少 3 次）", "高脂肪食物（例如速食、肥肉；平均每週至少 3 次）", "以上皆未達每週 3 次"] },
  { id: "plant_dairy_habits", module: "diet", type: "multi", required: true, displayInComposite: true, title: "蔬果、豆類與乳製品", note: "請依過去三個月的一般飲食狀況作答。", field: "diet.plant_dairy_habits", noneOption: "以上皆無", options: ["每天攝取蔬菜或水果", "豆類或豆製品每週至少 3 次", "每天飲用至少一杯 240 ml 牛奶", "其他乳製品每週至少 3 次（例如優格、起司）", "益生菌食品或補充品每週至少 3 次（例如標示含活菌的優格、發酵乳或乳酸菌飲品，以及益生菌粉包、膠囊）", "以上皆無"] },
  { id: "beverage_habits", module: "diet", type: "multi", required: true, displayInComposite: true, title: "飲品習慣", note: "請依過去三個月的一般飲食狀況作答。", field: "diet.beverage_habits", noneOption: "以上皆無", options: ["飲酒（每週至少一次）", "咖啡（每週至少 3 次）", "茶（每週至少 3 次）", "以上皆無"] },

  { id: "personal_cancer", module: "history", type: "single", required: true, title: "您目前是否正在罹患癌症，或過去曾被診斷為癌症？", note: "請依照目前或過去是否曾被醫療人員診斷為癌症回答。", field: "medical_history.personal_cancer_history", options: ["是，目前正在治療或追蹤中", "是，過去曾被診斷，目前已完成治療或追蹤", "否，未曾被診斷為癌症"] },
  { id: "personal_cancer_types", module: "history", type: "multi", required: true, title: "目前或過去曾被診斷的癌別為何？", note: "可複選；若不確定癌別，請選其他癌種。", field: "medical_history.personal_cancer_types", options: cancerOptions, appliesIf: (answers) => isPersonalCancerYes(getAnswerValue(answers, "medical_history.personal_cancer_history")) },
  { id: "chronic_conditions", module: "history", type: "multi", required: true, title: "是否有以下慢性疾病？", note: "可複選；若無相關病史可選以上皆無。", field: "medical_history.chronic_conditions", options: ["高血壓", "糖尿病／高血糖", "高血脂／高膽固醇", "肝病（B 型肝炎／C 型肝炎／肝硬化）", "胃食道逆流", "心臟病／心律不整", "甲狀腺疾病", "氣喘／慢性肺阻塞（COPD）", "痛風／高尿酸", "關節炎（含類風濕性）", "憂鬱症／焦慮症", "中風病史", "腎臟病／洗腎", "自體免疫疾病（乾燥症、紅斑性狼瘡等）", "以上皆無", "其他慢性疾病"] },
  { id: "liver_disease_etiology", module: "history", type: "multi", required: true, title: "您曾被診斷的肝病種類為何？", titleEn: "Which liver condition were you diagnosed with?", note: "可複選；請依醫療人員告知的診斷回答。", noteEn: "Select all that apply based on diagnoses given by a healthcare professional.", field: "medical_history.liver_disease_etiology", noneOption: "不確定肝病種類", options: liverEtiologyOptions, appliesIf: () => hasSelected("medical_history.chronic_conditions", "肝病") },
  { id: "vnext_diagnosed_conditions", module: "history", type: "multi", required: true, title: "是否曾有以下經醫療人員確認的病史或事件？", titleEn: "Have you had any of the following clinician-confirmed conditions or events?", note: "可複選。骨折依最近 12 個月回答，其餘依是否曾被醫療人員診斷回答。", noteEn: "Select all that apply. For fracture, consider the past 12 months; for the others, report whether a clinician has ever diagnosed the condition.", field: "medical_history.vnext_diagnosed_conditions", noneOption: symptomNoneOption, unknownOption: symptomUnknownOption, options: [...vnextHistoryFeatureDefinitions.map(([label]) => label), symptomNoneOption, symptomUnknownOption] },
  { id: "orchitis_epididymitis", module: "history", type: "single", required: true, title: "醫師是否曾診斷您有睪丸炎或副睪炎？", titleEn: "Has a clinician ever diagnosed you with orchitis or epididymitis?", note: "請依醫療人員曾告知的診斷回答。", noteEn: "Answer based on a diagnosis previously given by a healthcare professional.", field: "rule_inputs.dx_orchitis_epididymitis", ruleField: "dx_orchitis_epididymitis", options: ["是，曾由醫師診斷", "否", "不確定"], appliesIf: () => getAnswerValue(answers, "demographics.sex") === "男性" },
  { id: "psa_history", module: "history", type: "single", required: true, title: "您過去是否做過 PSA（攝護腺特異抗原）檢查？結果是否曾被告知偏高？", titleEn: "Have you previously had a PSA (prostate-specific antigen) test, and were you told that the result was elevated?", note: "本題只詢問既往檢查紀錄，不要求您另外接受抽血檢查。", noteEn: "This asks only about a previous test result and does not ask you to undergo a new blood test.", field: "rule_inputs.screen_psa_elevated", ruleField: "screen_psa_elevated", options: ["做過且曾被告知偏高", "做過且結果正常", "沒做過", "不記得"], appliesIf: () => getAnswerValue(answers, "demographics.sex") === "男性" && calculateAge() >= 50 },
  { id: "family_cancer", module: "history", type: "single", required: true, title: "家族成員（一等親內）是否有癌症史？", note: "一等親包含父母、兄弟姊妹、子女。", field: "family_history.has_cancer_history", options: ["是", "否", "不清楚"] },
  { id: "family_self_types", module: "history", type: "multi", required: false, title: "承上題，若有家族成員（一等親內）癌症史，請列出是什麼癌症？", note: "可複選。", field: "family_history.cancer_types_self_side", options: cancerOptions, appliesIf: (answers) => getAnswerValue(answers, "family_history.has_cancer_history") === "是" },

  { id: "email", module: "contact", type: "email", required: true, title: "請填寫您的 Email", note: "結果報告將寄送至此 Email。", field: "contact.email", placeholder: "name@example.com" }
];

const i18n = {
  en: {
    ui: {
      appTitle: "AI Ten-Cancer Health Risk Factor Assessment",
      heroTitle: "AI Ten-Cancer Health Risk Factor Assessment",
      heroSubtitle: "Complete an 8-12 minute guided health exploration to understand your cancer-related risk factor profile.",
      trust1: "Personalized factor summary",
      trust2: "Submit only after review",
      trust3: "Bilingual email report",
      start: "Start Assessment",
      disclaimer: enShortServiceNote,
      serviceInfo: "View full service information",
      validationBadge: "Internal research validation",
      validationTitle: "How was the model evaluated?",
      validationIntro: "The summary below presents the current model's internal research validation and assessment framework.",
      validationPerformanceLabel: "Research performance",
      validationEvidenceLabel: "Research foundation",
      validationScopeLabel: "Assessment framework",
      metricAucNote: "Risk ranking and discrimination ability",
      metricSensitivity: "Sensitivity",
      metricSensitivityNote: "Ability to reduce missed cases under the selected setting",
      trainingDatasetLabel: "training records",
      trainingDatasetNote: "Covering ten cancer types and healthy controls",
      modelTrainingLabel: "validation runs",
      modelTrainingNote: "Repeated evaluation of model performance and stability",
      modelValidationLabel: "random forest models",
      modelValidationNote: "1 Pan-Cancer plus 10 cancer-specific models",
      assessmentItemLabel: "Assessment items",
      modelFeatureLabel: "Model features",
      imbalanceCorrectionLabel: "Class imbalance correction",
      validationNote: "This is a summary of model development and validation using internal research data. It is not an individual's probability of developing cancer or the accuracy of each personal report.",
      validationInfo: "Learn about model validation",
      currentSection: "Current Section",
      quick: "Quick Options",
      text: "Text Answer",
      voice: "Voice Answer (In progress)",
      back: "Back",
      uncertain: "Not sure how to answer",
      guideIntro: "I will guide you through a few simple questions to organize lifestyle habits, family history, and health status related to cancer risk.",
      guideDefault: "Previous question completed. Please answer based on your closest everyday situation.",
      lifestyle: "Lifestyle",
      familyHistory: "Family History",
      bodyStatus: "Body Status",
      progress: "Health exploration progress",
      questionCount: "Question",
      of: "of",
      saveContinue: "Save and Continue",
      submitReview: "Confirm and Submit",
      voiceUnavailable: "Voice answer is in progress. Please use text answer for now.",
      aiTypePrompt: "After you type, I will immediately organize the key points of your physical symptoms and ask one follow-up question if needed.",
      aiSummaryReady: "I have organized your information",
      aiSummaryDraft: "I am organizing your current information",
      aiShortText: "The text is still brief. Please add the main discomfort if applicable.",
      aiDisclaimer: "This only helps organize what you entered. It is not a medical diagnosis.",
      confirmTitle: "Please Review Your Answers",
      confirmSection: "Data Review",
      confirmSummary: "Your answers have not been submitted yet. Please review all answers and press the final submit button.",
      confirmGuide: "This is the final review step. Your information will be submitted only after you confirm all answers and press the button below.",
      confirmPendingTitle: "Not submitted yet",
      confirmPendingBody: "Please review every answer on this page. After you confirm the content is correct, press the button at the bottom to submit your information.",
      submitFinal: "I have reviewed all answers. Submit now",
      completedSection: "Completed",
      completedSummary: "Thank you for your response.",
      completedGuide: "Your answers have been submitted. Please check the email address you provided.",
      completedTitle: "Thank you for completing the assessment",
      completedNote: "This health exploration is complete. Your results have been sent to",
      completedInbox: "Please check your inbox and spam folder.",
      completedServiceInfo: "About the report and service limitations",
      required: "Please enter your answer. If you have had no physical discomfort in the past three months, please enter \"None\".",
      invalidEmail: "Please enter a valid email address.",
      numberRequired: "Please enter a number, or use \"Not sure how to answer\".",
      multiRequired: "Please select at least one option, or use \"Not sure how to answer\".",
      consentRequired: "Please select all three confirmation statements before continuing.",
      consentStepsTitle: "How to complete this page",
      consentStep1: "Scroll through the complete notice below",
      consentStep2: "After reaching the bottom, press the unlocked button",
      consentStep3: "Select all three confirmation items, then continue",
      consentOptionsLocked: "The three confirmation items are locked. Scroll through the notice and press the floating button when it becomes available.",
      consentOptionsReady: "Now select all three confirmation items below.",
      consentScrollPrompt: "Scroll to the bottom to finish reading and unlock this button.",
      consentScrollReady: "You have reached the end. Press the button to continue.",
      consentUnlock: "I have read this notice. Let me select the consent items",
      consentUnlocked: "Consent items are now available",
      consentContinue: "All three items are selected. Continue",
      none: "None",
      notFilled: "Not answered"
    },
    modules: {
      consent: ["Informed Consent", "Review privacy notice and non-diagnostic nature."],
      basic: ["Basic Information", "Collect age, height, weight, exercise, sex, and race."],
      symptoms: ["Recent Symptoms", "Review symptoms by body system. General questions use the past 3 months, while v19.4 follow-ups explicitly use the past 6 months."],
      female: ["Female Health Information", "Questions on menstruation, pregnancy, breastfeeding, Pap smear, and hormone use."],
      exposure: ["Tobacco and Environmental Exposure", "Record smoking, secondhand smoke, cooking fumes, air pollution, and radiation exposure."],
      mental: ["Mental Health", "Record recent stress, sleep, and low mood frequency."],
      diet: ["Dietary Habits", "Review dietary pattern, meat and processed foods, high-sugar and high-fat foods, plant foods, dairy, and beverages."],
      history: ["Medical and Family History", "Confirm personal cancer history, chronic diseases, and family cancer history."],
      contact: ["Contact Information", "Enter the email address for receiving the report."],
      confirm: ["Data Review", "Please review your answers before submission."],
      result: ["Completed", "Thank you for your response."]
    },
    feedback: {
      consent: "Informed consent completed. Next, we will organize basic information.",
      basic: "Basic information completed. Next, we will review your recent physical symptoms.",
      symptoms: "Recent symptom review completed. Next, we will continue with other health information.",
      female: "Female health information completed. Next, we will ask about tobacco and environmental exposure.",
      exposure: "Tobacco and environmental exposure completed. Next, we will ask about stress, sleep, and mood.",
      mental: "Mental health completed. Next, we will ask about dietary habits.",
      diet: "Dietary habits completed. Next, we will ask about personal and family medical history.",
      history: "Medical and family history completed. Next, please enter the email address for receiving your report.",
      contact: "Contact information completed. Finally, please review your answers."
    },
    symptom: {
      "最近三個月：無明顯身體不適": "Past three months: no obvious physical discomfort",
      "部位": "Area",
      "狀況": "Symptom",
      "持續時間": "Duration",
      "影響程度": "Impact level",
      "就醫狀態": "Care status",
      "尚未就醫": "Not yet seen a clinician",
      "已就醫或已安排檢查": "Seen a clinician or arranged examination",
      "明顯影響日常": "Clearly affects daily life",
      "輕微或偶發": "Mild or occasional",
      "影響程度未明": "Impact level unclear",
      "頭頸部": "Head or neck",
      "胸部或呼吸道": "Chest or respiratory tract",
      "腹部或腸胃": "Abdomen or gastrointestinal tract",
      "泌尿系統": "Urinary system",
      "乳房": "Breast",
      "皮膚或淋巴": "Skin or lymph nodes",
      "全身狀況": "General condition",
      "疼痛": "Pain",
      "腫塊或硬塊": "Lump or hard mass",
      "出血": "Bleeding",
      "咳嗽或呼吸不適": "Cough or breathing discomfort",
      "腸胃不適": "Gastrointestinal discomfort",
      "體重或食慾改變": "Weight or appetite change",
      "疲倦或睡眠受影響": "Fatigue or sleep affected"
    },
    questions: {
      consent_acknowledgement: ["Before starting, please confirm that you have read and agree to the following items", "Please read the personal data notice and service information before completing the three confirmations below."],
      birth_year: ["Year of birth", "Please enter a 4-digit year, for example 1980.", "Enter your answer"],
      height_cm: ["Height (cm)", "Please enter your current height.", "For example, 165"],
      weight_kg: ["Weight (kg)", "Please enter your current weight.", "For example, 60"],
      weight_change: ["In the past six months, has your weight increased or decreased significantly (more than 5%)?", "If you are unsure, please select not sure."],
      exercise_time: ["Weekly exercise time", "Please select the option closest to your usual situation."],
      sex: ["What is your sex?", "Applicable questions will be shown based on your selection."],
      race: ["Which racial group do you identify with?", "Select the option that best describes you. You may choose not to answer."],
      menarche_age: ["Age at first menstruation", "If unsure, you may use the not sure option."],
      menopause_status: ["Current menopause status", "Please select the option closest to your current situation."],
      first_pregnancy_age: ["Age at first pregnancy", "If you have never been pregnant, select never pregnant."],
      breastfeeding: ["Have you breastfed after childbirth? If yes, for how long?", "If you have not given birth, select not applicable."],
      pap_smear: ["Have you ever had a Pap smear? What was the result?", "This is used to organize cervical cancer-related risk factors."],
      hormone_medication: ["Have you ever used hormone medication?", "Includes contraceptive pills and menopausal hormone replacement therapy (HRT)."],
      smoking_ever: ["Have you ever had a smoking habit (currently or in the past)?", "Please select the option closest to your situation."],
      smoking_quit: ["If you have smoked, have you quit?", "If yes to the previous question, please add your current status."],
      secondhand_smoke: ["Have you been in a long-term secondhand smoke environment at home or work?", "For example, household members, workplace, or regular long-term exposure."],
      betel_nut: ["Have you ever had a betel nut chewing habit (currently or in the past)?", "This is used for head and neck cancer-related risk factors."],
      cooking_fume: ["Are you often exposed to cooking fumes at work or in daily life?", "For example, chefs or long-term cooking in the kitchen."],
      cooking_frequency: ["Average weekly cooking frequency", "If you rarely cook, select less than once."],
      air_pollution: ["Are you chronically exposed to air pollution at work or in daily life?", "For example, factory areas or heavy traffic areas."],
      radiation: ["Are you often exposed to radiation at work or in daily life?", "For example, radiology staff."],
      stress: ["In the past month, how often did you feel tense or anxious each week?", "Please answer based on your general situation in the past month."],
      sleep_problem: ["In the past month, how often did you sleep poorly or have insomnia each week?", "Please answer based on your general situation in the past month."],
      low_mood: ["In the past month, how often did you feel low or depressed each week?", "This is only for health risk factor organization and is not a mental health diagnosis."],
      mental_frequency_matrix: ["Emotional wellbeing and sleep frequency in the past month", "Select the closest weekly frequency for every row. This is used only to organize health risk factors and is not a mental health diagnosis."],
      diet_type: ["Which option best describes your usual dietary pattern?", "Choose one long-term pattern. If you mainly eat plant-based foods but still consume meat or seafood, select Mostly plant-based."],
      meat_processed_foods: ["Meat, processed foods, and high-temperature cooking", "Answer based on your usual diet during the past 3 months. In this question, “frequent consumption” means an average of at least 3 times per week; each eating occasion counts as one time. You may select multiple."],
      sugar_fat_foods: ["High-sugar and high-fat foods", "Answer based on your usual diet during the past 3 months. In this question, “frequent consumption” means an average of at least 3 times per week; each eating occasion counts as one time. You may select multiple."],
      plant_dairy_habits: ["Fruit, vegetables, soy, and dairy", "Based on your usual diet during the past 3 months, select every item that meets the stated frequency. You may select multiple."],
      beverage_habits: ["Beverage habits", "Select every item that matches your usual habits. You may select multiple."],
      diet_frequency_matrix: ["Diet frequency during the past three months", "Items default to below the stated frequency. Change the items that match your usual habits to “Meets frequency,” then save and continue."],
      personal_cancer: ["Are you currently living with cancer, or have you ever been diagnosed with cancer in the past?", "Please answer based on whether a healthcare professional has diagnosed you with cancer, either currently or in the past."],
      personal_cancer_types: ["What type of cancer are you currently living with, or have you been diagnosed with in the past?", "You may select multiple. If you are unsure of the exact type, please select other cancer type."],
      chronic_conditions: ["Do you have any of the following chronic diseases?", "You may select multiple. If none apply, select none of the above."],
      family_cancer: ["Has any first-degree family member had cancer?", "First-degree relatives include parents, siblings, and children."],
      family_self_types: ["If yes, what type of cancer did your first-degree family member have?", "You may select multiple."],
      email: ["Please enter your email", "The result report will be sent to this email.", "name@example.com"]
    },
    options: {
      "我已閱讀並了解資料使用說明，同意愛立基生醫股份有限公司依上述目的，以去識別化方式處理我的問卷與健康資料，並使用我提供的 Email 寄送結果報告。": "I have read and understood the data use notice. I consent to EG BioMed Co. Ltd. processing my questionnaire and health data in de-identified form for the purposes stated above and using my email address to send my result report.",
      "我了解本評估結果的準確度受限於數據庫與演算法，若風險不高不代表沒有風險，若風險較高也不代表已罹病。": "I understand that the accuracy of this assessment is limited by the database and algorithm. A lower risk does not mean no risk, and a higher risk does not mean I have cancer.",
      "我了解本服務僅提供癌症相關風險因子的個人化整理與健康教育資訊；結果不代表罹患癌症的機率，不用於癌症診斷、篩檢、早期偵測、疾病預測或治療決策，亦不能取代醫師評估或任何標準醫療檢查。": "I understand that this service only provides personalized organization of cancer-related risk factors and health education information. The result does not represent the probability of developing cancer, is not used for cancer diagnosis, screening, early detection, disease prediction, or treatment decision-making, and cannot replace a physician’s evaluation or any standard medical examination.",
      "是": "Yes", "否": "No", "不確定": "Not sure", "不清楚": "Not sure",
      "男性": "Male", "女性": "Female",
      "亞洲裔": "Asian", "白人": "White", "黑人或非洲裔": "Black or of African descent", "其他族群": "Another racial group", "選擇不回答": "Prefer not to answer",
      "幾乎不運動": "Almost no exercise", "30-60 分鐘": "30-60 minutes", "1-2 小時": "1-2 hours", "多於 2 小時": "More than 2 hours",
      "12 歲以前（含 12 歲）": "Age 12 or younger", "13 歲以後（含 13 歲）": "Age 13 or older",
      "尚未停經（仍有月經）": "Not menopausal (still menstruating)", "已停經（55 歲或以前停經）": "Menopause at age 55 or earlier", "已停經（55 歲或以後停經）": "Menopause after age 55", "已切除子宮或卵巢": "Uterus or ovaries removed",
      "從未懷孕": "Never pregnant", "20 歲以下": "Age 20 or younger", "20-30 歲": "Age 20-30", "31-35 歲": "Age 31-35", "36 歲以上": "Age 36 or older",
      "從未哺乳": "Never breastfed", "有哺乳，但少於 6 個月": "Breastfed, less than 6 months", "有哺乳，超過 6 個月（含 6 個月）": "Breastfed, 6 months or longer", "尚未生產，此題不適用": "Not applicable, have not given birth",
      "是，歷次結果均正常": "Yes, all previous results were normal", "是，曾有異常報告（如 CIN、HPV 陽性等）": "Yes, had an abnormal report (such as CIN or HPV positive)", "否，從未做過": "No, never had one",
      "是，使用超過 1 年": "Yes, used for more than 1 year", "是，使用不到 1 年": "Yes, used for less than 1 year", "否，從未使用": "No, never used",
      "是，已戒菸": "Yes, quit smoking", "否，仍在抽菸": "No, still smoking",
      "少於一次": "Less than once", "每週 1-3 次": "1-3 times per week", "每週 4-6 次": "4-6 times per week", "每週 6 次以上": "6 or more times per week",
      "不到 1 天": "Less than 1 day", "2-3 天": "2-3 days", "4-5 天": "4-5 days", "幾乎每天": "Almost every day",
      "一般飲食（平常會吃肉類或海鮮）": "General diet (usually includes meat or seafood)", "蔬食為主（主要吃植物性食物，但仍會吃肉類或海鮮）": "Mostly plant-based (still includes meat or seafood)", "魚素（不吃肉類，但會吃魚類或海鮮）": "Pescatarian (no meat, but includes fish or seafood)", "蛋奶素（不吃肉類及海鮮，但會吃蛋或乳製品）": "Ovo-lacto vegetarian (no meat or seafood, but includes eggs or dairy)", "全素（不吃肉類、海鮮、蛋及乳製品）": "Vegan (no meat, seafood, eggs, or dairy)",
      "葷食（會食用肉類或海鮮，無特別飲食限制）": "Omnivorous diet (includes meat or seafood; no specific dietary restriction)", "全素": "Vegan", "蛋奶素": "Ovo-lacto vegetarian", "蛋素": "Ovo vegetarian", "奶素": "Lacto vegetarian", "植物五辛素": "Vegetarian including five pungent vegetables",
      "地中海飲食（以蔬果、全穀、豆類、橄欖油、堅果為主，適量魚類）": "Mediterranean diet", "彈性蔬食（以植物性食物為主，但仍會食用肉類、魚類或海鮮）": "Flexitarian diet (mostly plant-based but still includes meat, fish, or seafood)", "健康蔬食／全植物飲食（以天然植物性食物為主，少加工食品）": "Whole-food plant-based diet", "高蔬果、低鹽飲食（以蔬菜、水果、全穀類、低脂乳品為主，減少鹽分及加工食品）": "High fruit/vegetable, low-salt diet", "生酮飲食（大幅減少澱粉與糖分，以肉類、蛋類、油脂及高脂肪食物為主）": "Ketogenic diet", "低醣飲食（減少飯、麵、麵包及含糖飲料攝取）": "Low-carbohydrate diet", "間歇性斷食（限制進食時間，例如每天只在固定時段進食）": "Intermittent fasting",
      "飲酒（每週至少一次）": "Alcohol (at least once per week)", "燒烤或油炸食品": "Grilled or fried foods", "紅肉（牛、羊、豬等）": "Red meat (beef, lamb, pork, etc.)", "紅肉（牛、羊、豬等；平均每週至少 3 次）": "Red meat (beef, lamb, pork, etc.; at least 3 times per week on average)", "燒烤或油炸食品（平均每週至少 3 次）": "Grilled or fried foods (at least 3 times per week on average)", "醃漬類食品（泡菜、鹹魚等）": "Pickled foods", "醃漬或鹽漬食品（例如泡菜、鹹魚）": "Pickled or salted foods (such as kimchi or salted fish)", "醃漬或鹽漬食品（例如泡菜、鹹魚；平均每週至少 3 次）": "Pickled or salted foods (such as kimchi or salted fish; at least 3 times per week on average)", "加工肉品（例如香腸、火腿、培根）": "Processed meat (such as sausage, ham, or bacon)", "加工肉品（例如香腸、火腿、培根；平均每週至少 3 次）": "Processed meat (such as sausage, ham, or bacon; at least 3 times per week on average)", "甜食或高糖零食": "Sweets or high-sugar snacks", "甜食或高糖零食（平均每週至少 3 次）": "Sweets or high-sugar snacks (at least 3 times per week on average)", "含糖飲料": "Sugary drinks", "含糖飲料（平均每週至少 3 次）": "Sugary drinks (at least 3 times per week on average)", "高脂肪食物（速食、肥肉等）": "High-fat foods", "高脂肪食物（例如速食、肥肉）": "High-fat foods (such as fast food or fatty meat)", "高脂肪食物（例如速食、肥肉；平均每週至少 3 次）": "High-fat foods (such as fast food or fatty meat; at least 3 times per week on average)", "乳製品（起司、優格等）": "Dairy products", "蔬菜水果（每日攝取）": "Vegetables and fruits (daily)", "每天攝取蔬菜或水果": "Eat vegetables or fruit every day", "豆類或豆製品每週至少 3 次": "Soybeans or soy products at least 3 times per week", "每天飲用至少一杯 240 ml 牛奶": "At least one 240 ml cup of milk every day", "其他乳製品每週至少 3 次（例如優格、起司）": "Other dairy products at least 3 times per week (such as yogurt or cheese)", "益生菌食品或補充品每週至少 3 次": "Probiotic foods or supplements at least 3 times per week", "益生菌食品或補充品每週至少 3 次（例如標示含活菌的優格、發酵乳或乳酸菌飲品，以及益生菌粉包、膠囊）": "Probiotic foods or supplements at least 3 times per week (such as yogurt labeled with live cultures, fermented milk or probiotic drinks, and probiotic powder sachets or capsules)", "咖啡（每週至少 3 次）": "Coffee (at least 3 times per week)", "茶（每週至少 3 次）": "Tea (at least 3 times per week)", "素食飲食（不吃肉類與海鮮；含全素、蛋奶素、蛋素、奶素或植物五辛素）": "Vegetarian diet (no meat or seafood; includes vegan, ovo-lacto, ovo, lacto, or five-pungent vegetarian diets)", "無固定或少量": "No fixed pattern or small amount", "以上皆無或很少食用": "None of the above or rarely eaten", "以上皆無或很少攝取": "None of the above or rarely consumed", "以上皆未達每週 3 次": "None of the above reached 3 times per week",
      "是，每天飲用": "Yes, daily", "否，偶爾或不飲用": "No, occasional or none", "是，每週 3 次以上": "Yes, at least 3 times per week", "否，較少食用": "No, rarely", "否，較少補充": "No, rarely",
      "是，目前正在治療或追蹤中": "Yes, currently under treatment or follow-up",
      "是，過去曾被診斷，目前已完成治療或追蹤": "Yes, diagnosed in the past; treatment or follow-up has been completed",
      "否，未曾被診斷為癌症": "No, never diagnosed with cancer",
      "高血壓": "Hypertension", "糖尿病／高血糖": "Diabetes / high blood glucose", "高血脂／高膽固醇": "Hyperlipidemia / high cholesterol", "肝病（B 型肝炎／C 型肝炎／肝硬化）": "Liver disease (HBV / HCV / cirrhosis)", "胃食道逆流": "Gastroesophageal reflux disease", "心臟病／心律不整": "Heart disease / arrhythmia", "甲狀腺疾病": "Thyroid disease", "氣喘／慢性肺阻塞（COPD）": "Asthma / COPD", "痛風／高尿酸": "Gout / high uric acid", "關節炎（含類風濕性）": "Arthritis (including rheumatoid arthritis)", "憂鬱症／焦慮症": "Depression / anxiety", "中風病史": "History of stroke", "腎臟病／洗腎": "Kidney disease / dialysis", "自體免疫疾病（乾燥症、紅斑性狼瘡等）": "Autoimmune disease", "以上皆無": "None of the above", "其他慢性疾病": "Other chronic disease",
      "乳癌": "Breast cancer", "攝護腺癌": "Prostate cancer", "肺癌": "Lung cancer", "頭頸癌": "Head and neck cancer", "胰臟癌": "Pancreatic cancer", "肝癌": "Liver cancer", "大腸直腸癌": "Colorectal cancer", "胃癌": "Stomach cancer", "子宮內膜癌": "Endometrial cancer", "膀胱癌": "Bladder cancer", "腎癌": "Kidney cancer", "其他癌種": "Other cancer type"
    }
  }
};

const optimizedFeatureColumns = [
  "record_id", "sex", "age", "height_cm", "weight_kg", "bmi", "diagnosis", "is_cancer_patient",
  "prev_cancer", "family_cancer_history", "first_degree_relative_cancer", "chronic_hypertension",
  "chronic_diabetes", "chronic_hyperlipidemia", "chronic_liver_disease", "chronic_gerd",
  "chronic_heart_disease", "chronic_thyroid", "chronic_asthma_copd", "chronic_gout",
  "chronic_arthritis", "chronic_mental", "chronic_stroke", "chronic_kidney", "chronic_autoimmune",
  "chronic_other_unclassified", "chronic_disease_count", "smoking", "quit_smoking",
  "secondhand_smoke", "betel_nut", "radiation_exposure", "cooking_fumes", "air_pollution",
  "cooking_freq_missing", "cooking_freq_per_week", "weight_change_6m", "exercise_per_week",
  "anxiety_freq_missing", "anxiety_freq", "insomnia_freq_missing", "insomnia_freq",
  "depression_freq_missing", "depression_freq", "alcohol", "vegetarian", "grilled_fried_food",
  "pickled_food", "red_meat", "sweets_junk", "sugary_drinks", "vegetables_fruits",
  "high_fat_food_missing", "high_fat_food", "dairy_missing", "dairy", "coffee_habit_missing",
  "tea_habit_missing", "coffee_habit", "tea_habit", "menarche_early", "menopause_ordinal",
  "first_pregnancy_age_ordinal", "num_pregnancies", "num_births", "breastfed", "pap_smear_done",
  "pap_smear_abnormal", "hormone_drug", "score", "data_source"
];

const symptomFeatureColumns = symptomGroups.flatMap((group) => group.options.map(([, , column]) => column));
const vnextHistoryFeatureColumns = vnextHistoryFeatureDefinitions.map(([, , column]) => column);
const vnextSymptomCandidateColumns = [
  "symptom_testicular_lump", "symptom_testicular_swelling", "symptom_scrotal_swelling",
  "symptom_testicular_pain", "symptom_groin_pain", "symptom_postcoital_bleeding",
  "symptom_intermenstrual_bleeding", "symptom_abnormal_vaginal_discharge", "symptom_pelvic_pain",
  "symptom_epigastric_pain", "symptom_dyspepsia", "symptom_reflux", "symptom_heartburn",
  "symptom_hematemesis", "symptom_rib_pain", "symptom_bone_pain_other", "symptom_joint_pain",
  "symptom_nosebleeds", "symptom_urinary_retention", "symptom_impotence", "symptom_sore_throat",
  "symptom_otalgia", "symptom_nasal_mass", "symptom_nasal_discharge", "symptom_head_neck_mass",
  "symptom_hematuria_visible", "symptom_dysuria"
];
const vnextFeatureColumns = [...vnextSymptomCandidateColumns, ...vnextHistoryFeatureColumns, "hx_liver_disease_etiology"];
const researchFeatureColumns = ["processed_meat"];
const ruleDirectFeatureColumns = [
  "symptom_stool_loose_or_frequent", "symptom_mastalgia", "symptom_constipation",
  "dx_orchitis_epididymitis", "hx_benign_gynae_disease",
  "screen_pap_overdue_or_out_of_range", "screen_psa_elevated",
  "symptom_mass", "symptom_shortness_of_breath"
];
const ruleRepeatFeatureColumns = ruleRepeatDefinitions.map(([, , , countField]) => countField);
const ruleIntervalFeatureColumns = ruleRepeatDefinitions.flatMap(([, , , , intervalField]) => intervalField ? [intervalField] : []);
const ruleInputColumns = [...ruleDirectFeatureColumns, ...ruleRepeatFeatureColumns, ...ruleIntervalFeatureColumns];
const frozenSubmissionVectorCounts = Object.freeze({
  optimized_feature_columns: 71,
  symptom_feature_columns: 84,
  vnext_feature_columns: 32,
  research_feature_columns: 1,
  rule_input_columns: 29
});
const canonicalAnswerQuestions = questions.filter(
  (question) => !question.isComposite && !["consent_acknowledgement", "email"].includes(question.id)
);

const answers = {};
let currentIndex = 0;
let activeMode = "quick";
let multiSelection = new Set();
let moduleFeedback = "";
let llmDraft = null;
let consentNoticeRead = false;
let consentNoticeReachedEnd = false;
const savedLang = localStorage.getItem("egbiomed_lang");
let currentLang = savedLang || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");

const startBtn = document.querySelector("#startBtn");
const assessment = document.querySelector("#assessment");
const moduleList = document.querySelector("#moduleList");
const sectionTitle = document.querySelector("#sectionTitle");
const sectionSummary = document.querySelector("#sectionSummary");
const guideMessage = document.querySelector("#guideMessage");
const questionArea = document.querySelector("#questionArea");
const quickOptions = document.querySelector("#quickOptions");
const freeAnswer = document.querySelector("#freeAnswer");
const voiceAnswer = document.querySelector("#voiceAnswer");
const freeText = document.querySelector("#freeText");
const parseCard = document.querySelector("#parseCard");
const backBtn = document.querySelector("#backBtn");
const skipBtn = document.querySelector("#skipBtn");
const parseTextBtn = document.querySelector("#parseTextBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const inputZone = document.querySelector("#inputZone");
const panelFooter = document.querySelector(".panel-footer");
const guideStage = document.querySelector("#guideStage");
const languageButtons = document.querySelectorAll(".language-switcher__button");
const serviceDetails = document.querySelector("#serviceDetails");

const zhUi = {
  guideIntro: "接下來我會用幾個簡單問題，幫你整理和癌症風險相關的生活習慣、家族史與健康狀況。",
  guideDefault: "已完成前一題。請依照最接近日常狀況的答案填寫。",
  progress: "健康探索進度",
  questionCount: "第",
  of: "題 / 共",
  voice: "語音回答（建立中）",
  saveContinue: "儲存並繼續",
  consentUnlock: "我已閱讀上述告知事項",
  consentUnlocked: "已可勾選同意事項",
  consentScrollPrompt: "請向下滑動閱讀完整內容，即可開啟此按鈕。",
  consentScrollReady: "已閱讀至最後，請按下按鈕繼續。",
  submitReview: "確認並送出",
  notFilled: "未填寫"
};

function ui(key) {
  return currentLang === "en" ? i18n.en.ui[key] || key : zhUi[key] || key;
}

function tx(value) {
  if (currentLang !== "en") return value;
  return symptomOptionTranslations[value] || i18n.en.options[value] || i18n.en.symptom[value] || value;
}

function getModuleCopy(module) {
  if (currentLang !== "en") return [module.title, module.summary];
  return i18n.en.modules[module.id] || [module.title, module.summary];
}

function getQuestionCopy(question) {
  if (currentLang !== "en") return {
    title: question.title,
    note: question.note,
    placeholder: question.placeholder
  };
  const copy = i18n.en.questions[question.id] || [];
  return {
    title: copy[0] || question.titleEn || question.title,
    note: copy[1] || question.noteEn || question.note,
    placeholder: copy[2] || question.placeholder
  };
}

function formatDisplayValue(value) {
  if (Array.isArray(value)) return value.map((item) => tx(item)).join(currentLang === "en" ? ", " : "、");
  return value ? tx(value) : ui("notFilled");
}

function getEntryDisplayLabel(entry) {
  const question = questions.find((item) => item.id === entry.question_id);
  return question ? getQuestionCopy(question).title : currentLang === "en" ? entry.display_label || entry.label : entry.label;
}

function applyStaticText() {
  document.documentElement.lang = currentLang === "en" ? "en" : "zh-Hant";
  document.title = currentLang === "en" ? i18n.en.ui.appTitle : "AI十大癌症健康風險因子評估";
  document.querySelector("#hero-title").textContent = currentLang === "en" ? i18n.en.ui.heroTitle : "AI十大癌症健康風險因子評估";
  document.querySelector(".hero__subtitle").textContent = currentLang === "en" ? i18n.en.ui.heroSubtitle : "透過 8-12 分鐘的互動問答，了解與你相關的癌症風險因子組合。";
  const trustItems = document.querySelectorAll(".trust-strip span");
  const trustCopy = currentLang === "en" ? [i18n.en.ui.trust1, i18n.en.ui.trust2, i18n.en.ui.trust3] : ["個人化因子整理", "資料確認後才送出", "中英文 Email 報告"];
  trustItems.forEach((item, index) => { item.textContent = trustCopy[index]; });
  startBtn.textContent = currentLang === "en" ? i18n.en.ui.start : "開始互動評估";
  document.querySelector(".disclaimer").textContent = currentLang === "en" ? i18n.en.ui.disclaimer : zhShortServiceNote;
  document.querySelector("#heroServiceInfoBtn").textContent = currentLang === "en" ? i18n.en.ui.serviceInfo : "查看完整服務說明";
  document.querySelector("#validationBadge").textContent = currentLang === "en" ? i18n.en.ui.validationBadge : "內部研究驗證";
  document.querySelector("#validationTitle").textContent = currentLang === "en" ? i18n.en.ui.validationTitle : "模型如何被評估？";
  document.querySelector("#validationIntro").textContent = currentLang === "en" ? i18n.en.ui.validationIntro : "以下為目前模型的內部研究驗證與評估架構摘要。";
  document.querySelector("#validationPerformanceLabel").textContent = currentLang === "en" ? i18n.en.ui.validationPerformanceLabel : "研究表現";
  document.querySelector("#validationEvidenceLabel").textContent = currentLang === "en" ? i18n.en.ui.validationEvidenceLabel : "研究基礎";
  document.querySelector("#validationScopeLabel").textContent = currentLang === "en" ? i18n.en.ui.validationScopeLabel : "評估架構";
  document.querySelector("#metricAucNote").textContent = currentLang === "en" ? i18n.en.ui.metricAucNote : "風險排序與區分能力";
  document.querySelector("#metricSensitivity").textContent = currentLang === "en" ? i18n.en.ui.metricSensitivity : "敏感度";
  document.querySelector("#metricSensitivityNote").textContent = currentLang === "en" ? i18n.en.ui.metricSensitivityNote : "在既定設定下降低遺漏個案的能力";
  document.querySelector("#trainingDatasetLabel").textContent = currentLang === "en" ? i18n.en.ui.trainingDatasetLabel : "筆訓練資料";
  document.querySelector("#trainingDatasetNote").textContent = currentLang === "en" ? i18n.en.ui.trainingDatasetNote : "涵蓋十種癌症與健康對照";
  document.querySelector("#modelTrainingLabel").textContent = currentLang === "en" ? i18n.en.ui.modelTrainingLabel : "次驗證";
  document.querySelector("#modelTrainingNote").textContent = currentLang === "en" ? i18n.en.ui.modelTrainingNote : "重複評估模型表現與穩定性";
  document.querySelector("#modelValidationLabel").textContent = currentLang === "en" ? i18n.en.ui.modelValidationLabel : "個隨機森林模型";
  document.querySelector("#modelValidationNote").textContent = currentLang === "en" ? i18n.en.ui.modelValidationNote : "1 個 Pan-Cancer 加 10 個癌別模型";
  document.querySelector("#assessmentItemLabel").textContent = currentLang === "en" ? i18n.en.ui.assessmentItemLabel : "評估項目";
  document.querySelector("#modelFeatureLabel").textContent = currentLang === "en" ? i18n.en.ui.modelFeatureLabel : "模型特徵";
  document.querySelector("#imbalanceCorrectionLabel").textContent = currentLang === "en" ? i18n.en.ui.imbalanceCorrectionLabel : "類別不平衡校正";
  document.querySelector("#validationNote").textContent = currentLang === "en" ? i18n.en.ui.validationNote : "以上為模型於內部研究資料中的驗證與建置摘要，不是個人罹癌機率，也不代表每份個人報告的準確率。";
  document.querySelector("#validationInfoBtn").textContent = currentLang === "en" ? i18n.en.ui.validationInfo : "了解模型驗證方式";
  document.querySelector("#footerSummary").textContent = currentLang === "en"
    ? "Personalized organization of cancer-related health risk factors and health education information."
    : "個人化癌症相關健康風險因子整理與健康教育資訊。";
  document.querySelector("#serviceDetailsSummary").textContent = currentLang === "en" ? "Service information and limitations" : "服務說明與使用限制";
  document.querySelectorAll("[data-service-copy]").forEach((copy) => {
    copy.hidden = copy.dataset.serviceCopy !== currentLang;
  });
  document.querySelector(".progress-panel .eyebrow").textContent = currentLang === "en" ? i18n.en.ui.currentSection : "目前章節";
  document.querySelector('[data-mode="quick"]').textContent = currentLang === "en" ? i18n.en.ui.quick : "快速選項";
  document.querySelector('[data-mode="text"]').textContent = currentLang === "en" ? i18n.en.ui.text : "文字回答";
  document.querySelector('[data-mode="voice"]').textContent = currentLang === "en" ? i18n.en.ui.voice : "語音回答（建立中）";
  voiceBtn.lastChild.textContent = currentLang === "en" ? i18n.en.ui.voice : "語音回答（建立中）";
  document.querySelector(".voice-answer p").textContent = currentLang === "en" ? i18n.en.ui.voiceUnavailable : "語音回答功能（建立中），請先使用文字回答。";
  backBtn.textContent = currentLang === "en" ? i18n.en.ui.back : "上一題";
  skipBtn.textContent = currentLang === "en" ? i18n.en.ui.uncertain : "不確定怎麼回答";
  document.querySelector(".guide-stage__chip--one").textContent = currentLang === "en" ? i18n.en.ui.lifestyle : "生活習慣";
  document.querySelector(".guide-stage__chip--two").textContent = currentLang === "en" ? i18n.en.ui.familyHistory : "家族史";
  document.querySelector(".guide-stage__chip--three").textContent = currentLang === "en" ? i18n.en.ui.bodyStatus : "身體狀況";
  languageButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.lang === currentLang));
}

function getAnswerValue(answerStore, field) {
  return answerStore[field]?.value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function getActiveQuestions() {
  return questions.filter((question) => !question.displayInComposite && (!question.appliesIf || question.appliesIf(answers)));
}

function getCurrentQuestion() {
  return getActiveQuestions()[currentIndex];
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join("、");
  return value ?? "未填寫";
}

function normalizeNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function normalizeSingleChoice(value) {
  if (value == null || value === "") return { value: null, missing: true };
  const text = String(value);
  const yesNoMap = {
    是: 1,
    否: 0,
    不清楚: null,
    不確定: null
  };
  if (Object.prototype.hasOwnProperty.call(yesNoMap, text)) {
    return { value: yesNoMap[text], label: text, missing: yesNoMap[text] === null };
  }
  return { value: text, label: text, missing: false };
}

function encodeMultiChoice(value, options = []) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return {
    selected,
    encoded: options.reduce((acc, option) => {
      acc[option] = selected.includes(option) ? 1 : 0;
      return acc;
    }, {}),
    missing: selected.length === 0
  };
}

function getQuestionByField(field) {
  return questions.find((question) => question.field === field);
}

function detectDuration(text) {
  const durationMatch = text.match(/(一|二|兩|三|四|五|六|七|八|九|十|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(天|週|周|個月|月|年|day|days|week|weeks|month|months|year|years)/i);
  return durationMatch ? durationMatch[0] : "";
}

function parseSymptomText(text) {
  const normalized = text.trim();
  const noSymptom = /^(無|沒有|無不適|沒有不舒服|目前沒有|none|no|no symptoms|no discomfort)$/iu.test(normalized);
  const bodyPartMap = [
    ["頭頸部", /頭|喉|喉嚨|脖|頸|口腔|牙齦|head|neck|throat|mouth|gum/i],
    ["胸部或呼吸道", /胸|咳|喘|呼吸|痰|肺|chest|cough|breath|breathing|lung|phlegm/i],
    ["腹部或腸胃", /胃|腹|肚|腸|便|排便|脹|噁心|嘔吐|stomach|abdomen|abdominal|bowel|bloating|nausea|vomit|diarrhea|constipation/i],
    ["泌尿系統", /尿|膀胱|腎|血尿|urine|urinary|bladder|kidney/i],
    ["乳房", /乳|胸部硬塊|breast/i],
    ["皮膚或淋巴", /皮膚|痣|淋巴|腫塊|硬塊|skin|mole|lymph|lump|mass/i],
    ["全身狀況", /體重|疲倦|發燒|夜汗|食慾|weight|fatigue|fever|night sweat|appetite/i]
  ];
  const symptomMap = [
    ["疼痛", /痛|疼|刺痛|悶痛|pain|ache|sore/i],
    ["腫塊或硬塊", /腫塊|硬塊|摸到|lump|mass|hard/i],
    ["出血", /血|出血|血便|血尿|blood|bleeding/i],
    ["咳嗽或呼吸不適", /咳|喘|呼吸|cough|breath|breathing|wheez/i],
    ["腸胃不適", /脹|腹瀉|便秘|噁心|嘔吐|胃酸|bloating|diarrhea|constipation|nausea|vomit|reflux/i],
    ["體重或食慾改變", /體重|變瘦|變胖|食慾|weight|appetite/i],
    ["疲倦或睡眠受影響", /疲倦|累|睡|fatigue|tired|sleep/i]
  ];
  const bodyParts = bodyPartMap.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label);
  const symptoms = symptomMap.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label);
  const duration = detectDuration(normalized);
  const careSeeking = /未就醫|沒看醫生|尚未就醫|沒有就醫|not yet|have not seen|haven't seen|no doctor|not seen/i.test(normalized)
      ? "尚未就醫"
      : /就醫|看醫生|看診|檢查|門診|急診|doctor|clinic|exam|examination|checked|hospital/i.test(normalized)
        ? "已就醫或已安排檢查"
        : "";
  const severity = /嚴重|很痛|劇痛|影響生活|睡不著|severe|very painful|affect.*daily|cannot sleep/i.test(normalized)
      ? "明顯影響日常"
    : /偶爾|輕微|一點|occasional|mild|slight/i.test(normalized)
      ? "輕微或偶發"
      : "";
  const missing = [];
  if (!noSymptom && !duration) missing.push("持續多久");
  if (!noSymptom && !careSeeking) missing.push("是否已就醫或檢查");
  if (!noSymptom && bodyParts.length === 0 && symptoms.length === 0) missing.push("主要不適內容");
  const followUp = noSymptom
    ? "了解，目前先記錄為最近三個月無明顯身體不適。"
    : missing.length > 0
      ? `我想再確認${missing.join("、")}，可以補充一句嗎？`
      : "我已整理好這段身體狀況補充，接下來可以進行聯絡資料填寫。";

  return {
    raw_text: normalized,
    no_symptom: noSymptom,
    body_parts: bodyParts,
    symptoms,
    duration,
    severity,
    care_seeking: careSeeking,
    missing,
    follow_up: followUp,
    ready_to_close: noSymptom || missing.length === 0
  };
}

function translateFollowUp(parsed) {
  if (parsed.no_symptom) return "Thank you. I have recorded that you have had no obvious physical discomfort in the past three months.";
  if (!parsed.body_parts.length && !parsed.symptoms.length) return "Could you add the main area of discomfort and what it feels like?";
  if (!parsed.duration) return "Could you add approximately how long this has lasted?";
  if (!parsed.care_seeking) return "I would like to confirm whether you have already seen a clinician or had any examination. Could you add one sentence?";
  return "I have enough information for this section. You can save and continue.";
}

function getCurrentModuleIndex() {
  const question = getCurrentQuestion();
  if (!question) return modules.findIndex((item) => item.id === "confirm");
  return modules.findIndex((item) => item.id === question.module);
}

function getModuleFeedback(fromModuleId, toModuleId) {
  const feedback = {
    consent: "已完成知情同意確認。接下來會整理基本資料。",
    basic: "已完成基本資料。接下來會依身體系統詢問最近三個月的症狀。",
    symptoms: "已完成近期症狀整理。接下來會繼續詢問其他健康資訊。",
    female: "已完成女性相關資訊。接下來會詢問菸草與環境暴露。",
    exposure: "已完成菸草與環境暴露評估。接下來會詢問近期壓力、睡眠與情緒狀況。",
    mental: "已完成心理健康評估。接下來會詢問飲食習慣。",
    diet: "已完成飲食習慣評估。接下來會詢問個人病史與家族史。",
    history: "已完成病史與家族史評估。接下來請填寫接收報告的 Email。",
    contact: "已完成聯絡資料。最後請確認本次填答內容。"
  };
  if (!fromModuleId || fromModuleId === toModuleId) return "";
  return currentLang === "en" ? i18n.en.feedback[fromModuleId] || "" : feedback[fromModuleId] || "";
}

function renderConsentNotice() {
  if (currentLang === "en") {
    return `
      <section class="consent-notice" aria-labelledby="consentNoticeTitle">
        <div class="consent-scroll-panel" id="consentScrollPanel" tabindex="0" aria-label="Consent notice. Scroll to the bottom to continue.">
        <div class="consent-step-guide" aria-label="${i18n.en.ui.consentStepsTitle}">
          <strong>${i18n.en.ui.consentStepsTitle}</strong>
          <ol>
            <li>${i18n.en.ui.consentStep1}</li>
            <li>${i18n.en.ui.consentStep2}</li>
            <li>${i18n.en.ui.consentStep3}</li>
          </ol>
        </div>
        <div class="consent-notice__section">
          <h3 id="consentNoticeTitle">Data Use and Privacy Notice</h3>
          <dl>
            <div><dt>Who handles the data</dt><dd>EG BioMed Co. Ltd.</dd></div>
            <div><dt>Why we collect it</dt><dd>To organize personalized cancer-related health risk factors, produce your health information report, and support model training and validation.</dd></div>
            <div><dt>What we collect</dt><dd>Basic information such as age, sex, height, and weight; self-reported health information such as recent symptoms, medical history, family history, and lifestyle habits; and an email address for report delivery.</dd></div>
            <div><dt>How we protect your identity</dt><dd>All questionnaire and health data are de-identified, with a coded record ID used in place of your email address. The email and code mapping is stored separately in a restricted contact record. Your email is used only to deliver the report and is not used as a model feature or included in research analysis.</dd></div>
            <div><dt>Where it is stored</dt><dd>Microsoft cloud servers in the United States, which meet GDPR and SOC 2 Type II security standards.</dd></div>
            <div><dt>How long it is kept</dt><dd>Research and contact records are kept separately for 5 years from the date of completion. At the end of this period, the contact record and the mapping between your identity and coded record ID will be deleted. The research record will either be destroyed or retained only in a form that can no longer be linked back to you.</dd></div>
            <div><dt>Who may use it</dt><dd>Only authorized EG BioMed staff responsible for research and model validation may use the de-identified data. We will not sell your data or provide it to other companies for advertising, marketing, or unrelated commercial use.</dd></div>
            <div><dt>Overseas processing</dt><dd>Your data are transmitted to and processed on Microsoft servers in the United States.</dd></div>
            <div><dt>Questions and your rights</dt><dd>During the 5-year retention period, authorized privacy staff can use the separately stored code mapping to locate your record and assist with a request to access, correct, or delete it. Contact egbiomedai@eg-bio.com; we aim to respond within 15 business days. After the retention period ends and the code mapping has been deleted, we will no longer be able to identify a specific record as yours.</dd></div>
          </dl>
        </div>
        <div class="consent-notice__section consent-notice__section--warning">
          <h3>Model and response information</h3>
          <p>Please answer according to your actual situation. Incomplete or inaccurate self-reported information may affect the personalized summary.</p>
          <p>This service uses models at an internal proof-of-concept stage. Results may be affected by research data and methodological limitations and require continued validation. The report provides health risk factor organization and health education information, not a diagnosis or screening result.</p>
          <button class="text-link inline-info-link" type="button" data-open-service-info>View full service information and limitations</button>
        </div>
        </div>
        <div class="consent-read-dock">
          <span class="consent-scroll-status" id="consentScrollStatus" aria-live="polite">${ui("consentScrollPrompt")}</span>
          <button class="secondary-action consent-read-action" id="unlockConsentBtn" type="button" disabled>${i18n.en.ui.consentUnlock}</button>
        </div>
      </section>
    `;
  }
  return `
    <section class="consent-notice" aria-labelledby="consentNoticeTitle">
      <div class="consent-scroll-panel" id="consentScrollPanel" tabindex="0" aria-label="知情同意告知事項，請滑動至最後以繼續">
      <div class="consent-step-guide" aria-label="本頁操作方式">
        <strong>請依照以下 3 個步驟完成知情同意</strong>
        <ol>
            <li>在區塊內向下滑動，完整閱讀告知事項</li>
            <li>滑到最後後，按下已開啟的大型按鈕</li>
          <li>勾選三個確認項目，再繼續填寫</li>
        </ol>
      </div>
      <div class="consent-notice__section">
        <h3 id="consentNoticeTitle">資料使用與隱私告知事項</h3>
        <dl>
          <div><dt>由誰處理資料</dt><dd>愛立基生醫股份有限公司（EG BioMed Co. Ltd.）。</dd></div>
          <div><dt>為什麼收集</dt><dd>用來整理個人化癌症相關健康風險因子、製作您的健康資訊報告，以及進行模型訓練與驗證。</dd></div>
          <div><dt>會收集哪些資料</dt><dd>年齡、性別、身高、體重等基本資料；近期症狀、病史、家族史與生活習慣等自行填寫的健康資料；以及寄送報告所需的 Email。</dd></div>
          <div><dt>如何保護您的身分</dt><dd>問卷與健康資料皆已去識別化處理，並以代碼編號取代 Email。Email 與代碼的對應資料會另外存放在限制權限的聯絡資料表中。Email 只用來寄送結果報告，不會作為模型特徵，也不會納入研究分析。</dd></div>
          <div><dt>資料存放在哪裡</dt><dd>Microsoft 位於美國的雲端伺服器，符合 GDPR 與 SOC 2 Type II 安全標準。</dd></div>
          <div><dt>保存多久</dt><dd>研究資料與聯絡資料會分開保存，自填寫日起保存 5 年。期滿後會刪除聯絡資料及可將代碼連回個人的對應關係；研究資料則會銷毀，或僅以無法再連回您的形式保留。</dd></div>
          <div><dt>誰可以使用</dt><dd>只有愛立基生醫內部經授權、負責研究與模型驗證的工作人員可以使用去識別化資料。我們不會販售您的資料，也不會提供其他公司作廣告、行銷或與本服務無關的商業用途。</dd></div>
          <div><dt>資料會傳到國外嗎</dt><dd>資料會傳送至 Microsoft 位於美國的伺服器儲存及處理。</dd></div>
          <div><dt>有問題或想行使權利</dt><dd>在 5 年保存期間內，經授權的個資管理人員可透過分開保存的代碼對應資料找到您的紀錄，並協助辦理查閱、更正或刪除。請聯繫 egbiomedai@eg-bio.com，我們預計於 15 個工作日內回覆。保存期滿並刪除代碼對應關係後，我們將無法再確認哪一筆研究資料屬於您。</dd></div>
        </dl>
      </div>
      <div class="consent-notice__section consent-notice__section--warning">
        <h3>模型與填答說明</h3>
        <p>請依照實際狀況填答。自行填寫的資料若不完整或不正確，可能影響個人化整理結果。</p>
        <p>本服務使用內部概念驗證階段的模型，結果會受研究資料與方法限制影響，並仍需持續驗證。報告提供健康風險因子整理與健康教育資訊，不是診斷或篩檢結果。</p>
        <button class="text-link inline-info-link" type="button" data-open-service-info>查看完整服務說明與限制</button>
      </div>
      </div>
      <div class="consent-read-dock">
        <span class="consent-scroll-status" id="consentScrollStatus" aria-live="polite">${ui("consentScrollPrompt")}</span>
        <button class="secondary-action consent-read-action" id="unlockConsentBtn" type="button" disabled>我已閱讀上述告知事項</button>
      </div>
    </section>
  `;
}

function renderModules() {
  const activeModuleIndex = getCurrentModuleIndex();
  moduleList.innerHTML = modules.map((module, index) => {
    const state = index < activeModuleIndex ? "is-done" : index === activeModuleIndex ? "is-active" : "";
    const [moduleTitle] = getModuleCopy(module);
    return `
      <li class="${state}">
        <span class="module-index">${index < activeModuleIndex ? "✓" : index + 1}</span>
        <span>${moduleTitle}</span>
      </li>
    `;
  }).join("");

  const activeModule = modules[activeModuleIndex] || modules.at(-1);
  const [title, summary] = getModuleCopy(activeModule);
  sectionTitle.textContent = title;
  sectionSummary.textContent = summary;
}

function renderQuestion() {
  const question = getCurrentQuestion();
  parseCard.hidden = true;
  const savedValue = question ? answers[question.field]?.value : null;
  multiSelection = new Set(Array.isArray(savedValue) ? savedValue : []);

  if (!question) {
    renderConfirmation();
    return;
  }

  renderModules();
  inputZone.hidden = false;
  inputZone.classList.toggle("input-zone--consent", question.id === "consent_acknowledgement");
  panelFooter.hidden = false;
  const cannotSkip = question.id === "consent_acknowledgement" || question.type === "email";
  skipBtn.hidden = !question.required || cannotSkip;
  skipBtn.disabled = cannotSkip;
  guideMessage.textContent = question.module === "symptoms"
    ? (currentLang === "en"
      ? "I will help you review recent symptoms by body system. Select all symptoms that match your situation."
      : "接下來會依身體系統整理近期症狀，請勾選所有符合您狀況的項目。")
    : currentIndex === 0 ? ui("guideIntro") : ui("guideDefault");

  const activeQuestions = getActiveQuestions();
  const progress = Math.round(((currentIndex + 1) / activeQuestions.length) * 100);
  const questionCopy = getQuestionCopy(question);
  questionArea.innerHTML = `
    <div class="exploration-progress" aria-label="${currentLang === "en" ? ui("progress") : "健康探索進度"} ${progress}%">
      <div class="exploration-progress__track">
        <span class="exploration-progress__bar" style="--progress:${progress}%"></span>
      </div>
    </div>
    ${moduleFeedback ? `<p class="module-feedback">${moduleFeedback}</p>` : ""}
    <p class="question-meta">${currentLang === "en" ? `${ui("questionCount")} ${currentIndex + 1} ${ui("of")} ${activeQuestions.length}` : `第 ${currentIndex + 1} 題 / 共 ${activeQuestions.length} 題`}</p>
    <h2 class="question-title">${questionCopy.title}${question.required ? '<span class="required-mark"> *</span>' : ""}</h2>
    ${question.isSymptomGroup ? `
      <div class="symptom-reminder" role="note">
        <strong>${currentLang === "en" ? "How to answer" : "填答提醒"}</strong>
        <p>${currentLang === "en" ? symptomReminderEn : symptomReminderZh}</p>
        <p>${currentLang === "en"
          ? "On this page, select the symptom items directly. If none apply, select “None of the above.”"
          : "本頁以症狀項目呈現，請直接勾選符合的項目；若都沒有，請選「以上皆無」。"}</p>
      </div>
    ` : ""}
    <p class="question-note">${questionCopy.note}</p>
    ${question.id === "consent_acknowledgement" ? renderConsentNotice() : ""}
  `;
  moduleFeedback = "";

  configureAnswerModes(question);
  renderQuickInput(question);
  setupConsentGate(question);
  freeText.value = "";
  backBtn.disabled = currentIndex === 0;
}

function setupConsentGate(question) {
  if (question.id !== "consent_acknowledgement") return;
  const unlockButton = document.querySelector("#unlockConsentBtn");
  const optionHint = document.querySelector("#consentOptionHint");
  const scrollPanel = document.querySelector("#consentScrollPanel");
  const scrollStatus = document.querySelector("#consentScrollStatus");
  consentNoticeReachedEnd = consentNoticeReachedEnd || consentNoticeRead;
  const updateConsentControls = () => {
    document.querySelectorAll(".option-button").forEach((button) => {
      button.disabled = !consentNoticeRead;
      button.classList.toggle("is-disabled", !consentNoticeRead);
    });
    const saveButton = document.querySelector("#saveMultiBtn");
    if (saveButton) saveButton.disabled = !consentNoticeRead || multiSelection.size < 3;
    if (optionHint) {
      optionHint.textContent = consentNoticeRead
        ? (currentLang === "en" ? i18n.en.ui.consentOptionsReady : "現在請勾選下方三個確認項目。三項都勾選後，再按「三項都已勾選，繼續填寫」。")
        : (currentLang === "en" ? i18n.en.ui.consentOptionsLocked : "下方三個確認項目目前尚未開啟。請在上方閱讀區向下滑到最後，再按下懸浮按鈕。");
      optionHint.classList.toggle("is-ready", consentNoticeRead);
    }
    if (unlockButton) {
      unlockButton.disabled = consentNoticeRead || !consentNoticeReachedEnd;
      unlockButton.classList.toggle("is-ready", consentNoticeReachedEnd && !consentNoticeRead);
      unlockButton.textContent = consentNoticeRead
        ? ui("consentUnlocked")
        : (currentLang === "en" ? ui("consentUnlock") : "我已閱讀，開始勾選同意事項");
    }
    if (scrollStatus) {
      scrollStatus.textContent = consentNoticeRead
        ? (currentLang === "en" ? i18n.en.ui.consentOptionsReady : "已完成閱讀，請勾選下方三個確認項目。")
        : ui(consentNoticeReachedEnd ? "consentScrollReady" : "consentScrollPrompt");
    }
  };
  updateConsentControls();
  const checkScrollProgress = () => {
    if (!scrollPanel || consentNoticeReachedEnd) return;
    const remaining = scrollPanel.scrollHeight - scrollPanel.scrollTop - scrollPanel.clientHeight;
    if (remaining <= 12) {
      consentNoticeReachedEnd = true;
      updateConsentControls();
    }
  };
  scrollPanel?.addEventListener("scroll", checkScrollProgress, { passive: true });
  requestAnimationFrame(checkScrollProgress);
  unlockButton?.addEventListener("click", () => {
    if (!consentNoticeReachedEnd) return;
    consentNoticeRead = true;
    updateConsentControls();
    document.querySelector("#consentOptionHint")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function configureAnswerModes(question) {
  const modeTabs = document.querySelector(".mode-tabs");
  const quickTab = document.querySelector('[data-mode="quick"]');
  const textTab = document.querySelector('[data-mode="text"]');
  const voiceTab = document.querySelector('[data-mode="voice"]');
  const textAvailable = question.type === "text";

  modeTabs.hidden = !textAvailable;
  quickTab.hidden = textAvailable;
  textTab.hidden = !textAvailable;
  voiceTab.hidden = !textAvailable;
  voiceTab.textContent = currentLang === "en" ? ui("voice") : "語音回答（建立中）";

  activeMode = textAvailable ? "text" : "quick";
  document.querySelectorAll(".mode-tab").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.mode === activeMode);
  });

  quickOptions.hidden = textAvailable;
  freeAnswer.hidden = !textAvailable;
  voiceAnswer.hidden = true;
  parseTextBtn.textContent = currentLang === "en" ? ui("saveContinue") : "儲存並繼續";
}

function renderLlmPanel(parsed) {
  if (!parsed || !parsed.raw_text) {
    parseCard.innerHTML = `
      <div class="llm-chat">
        <div class="llm-chat-row llm-chat-row--guide">
          <div class="llm-chat-avatar" aria-hidden="true">
            <img src="assets/ai-health-guide-character.png" alt="" />
          </div>
          <div class="llm-chat-bubble">
            <p class="eyebrow">AI Health Guide</p>
            <p>${currentLang === "en" ? i18n.en.ui.aiTypePrompt : "你輸入後，我會即時整理身體不適的重點，必要時再提出一個追問。"}</p>
          </div>
        </div>
      </div>
    `;
    parseCard.hidden = false;
    return;
  }

  const joiner = currentLang === "en" ? ", " : "、";
  const fieldLabel = (label) => currentLang === "en" ? i18n.en.symptom[label] || label : label;
  const summaryItems = parsed.no_symptom
    ? [tx("最近三個月：無明顯身體不適")]
    : [
      parsed.body_parts.length ? `${fieldLabel("部位")}：${parsed.body_parts.map(tx).join(joiner)}` : "",
      parsed.symptoms.length ? `${fieldLabel("狀況")}：${parsed.symptoms.map(tx).join(joiner)}` : "",
      parsed.duration ? `${fieldLabel("持續時間")}：${parsed.duration}` : "",
      parsed.severity ? `${fieldLabel("影響程度")}：${tx(parsed.severity)}` : "",
      parsed.care_seeking ? `${fieldLabel("就醫狀態")}：${tx(parsed.care_seeking)}` : ""
    ].filter(Boolean);

  parseCard.innerHTML = `
    <div class="llm-chat">
      <div class="llm-chat-row llm-chat-row--user">
        <div class="llm-chat-bubble llm-chat-bubble--user">${escapeHtml(parsed.raw_text)}</div>
      </div>
      <div class="llm-chat-row llm-chat-row--guide">
        <div class="llm-chat-avatar" aria-hidden="true">
          <img src="assets/ai-health-guide-character.png" alt="" />
        </div>
        <div class="llm-chat-bubble">
          <p class="eyebrow">AI Health Guide</p>
          <h3>${parsed.ready_to_close ? (currentLang === "en" ? i18n.en.ui.aiSummaryReady : "我先幫你整理好了") : (currentLang === "en" ? i18n.en.ui.aiSummaryDraft : "我先幫你整理目前資訊")}</h3>
          <ul class="llm-summary-list">
            ${summaryItems.length ? summaryItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : `<li>${currentLang === "en" ? i18n.en.ui.aiShortText : "目前文字較簡短，尚需要補充主要不適內容。"}</li>`}
          </ul>
        </div>
      </div>
      <div class="llm-chat-row llm-chat-row--guide">
        <div class="llm-chat-avatar llm-chat-avatar--small" aria-hidden="true">
          <img src="assets/ai-health-guide-character.png" alt="" />
        </div>
        <div class="llm-chat-bubble llm-chat-bubble--follow">${escapeHtml(currentLang === "en" ? translateFollowUp(parsed) : parsed.follow_up)}</div>
      </div>
      <p class="helper-text">${currentLang === "en" ? i18n.en.ui.aiDisclaimer : "這只是協助整理你輸入的內容，不代表醫療診斷。"}</p>
    </div>
  `;
  parseCard.hidden = false;
}

function renderQuickInput(question) {
  quickOptions.innerHTML = "";
  const questionCopy = getQuestionCopy(question);

  if (question.type === "email") {
    quickOptions.innerHTML = `
      <div class="number-entry">
        <input id="emailInput" type="email" inputmode="email" autocomplete="email" placeholder="${questionCopy.placeholder || "name@example.com"}" />
        <button class="secondary-action" id="saveEmailBtn" type="button">${ui("saveContinue")}</button>
      </div>
    `;
    document.querySelector("#saveEmailBtn").addEventListener("click", () => {
      const value = document.querySelector("#emailInput").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        showInlineNotice(currentLang === "en" ? i18n.en.ui.invalidEmail : "請輸入有效的 Email。");
        return;
      }
      saveAnswer(value, "email_input");
    });
    return;
  }

  if (question.type === "text") {
    freeText.placeholder = questionCopy.placeholder || (currentLang === "en" ? "Please enter your answer" : "請輸入您的回答");
    llmDraft = null;
    renderLlmPanel(null);
    return;
  }

  if (question.type === "number") {
    const bounds = getNumberBounds(question);
    quickOptions.innerHTML = `
      <div class="number-entry">
        <input id="numberInput" type="number" inputmode="numeric"${bounds ? ` min="${bounds.min}" max="${bounds.max}" step="${bounds.step}"` : ""} placeholder="${questionCopy.placeholder || (currentLang === "en" ? "Enter a number" : "輸入數字")}" />
        <button class="secondary-action" id="saveNumberBtn" type="button">${ui("saveContinue")}</button>
      </div>
    `;
    document.querySelector("#saveNumberBtn").addEventListener("click", () => {
      const value = document.querySelector("#numberInput").value.trim();
      if (!value) {
        showInlineNotice(currentLang === "en" ? i18n.en.ui.numberRequired : "請先輸入數字，或使用「不確定怎麼回答」。");
        return;
      }
      const validationMessage = getNumberValidationMessage(question, value);
      if (validationMessage) {
        showInlineNotice(validationMessage);
        return;
      }
      saveAnswer(value, "number_input");
    });
    return;
  }

  if (question.type === "matrix") {
    renderFrequencyMatrix(question);
    return;
  }

  if (question.type === "diet-matrix") {
    renderDietMatrix(question);
    return;
  }

  if (question.type === "multi") {
    const isConsentQuestion = question.id === "consent_acknowledgement";
    const isSymptomQuestion = question.isSymptomGroup === true;
    const hasExclusiveNoneOption = Boolean(question.noneOption);
    const exclusiveOptions = new Set([question.noneOption, question.unknownOption].filter(Boolean));
    const visibleOptions = question.options.filter((option) => {
      if (!isSymptomQuestion || getAnswerValue(answers, "demographics.sex") === "女性") return true;
      const definition = question.symptomDefinitions?.find(([label]) => label === option);
      return !definition?.[3];
    });
    quickOptions.innerHTML = `
      ${isConsentQuestion ? `<div class="consent-option-hint" id="consentOptionHint"></div>` : ""}
      <div class="multi-options${isSymptomQuestion ? " multi-options--symptoms" : ""}">
        ${visibleOptions.map((option) => `
          <button class="option-button option-button--multi${isConsentQuestion ? " option-button--consent" : ""}${isSymptomQuestion ? " option-button--symptom" : ""}${option === question.noneOption ? " option-button--none" : ""}" type="button" data-value="${option}" aria-pressed="false">${tx(option)}</button>
        `).join("")}
      </div>
      <button class="secondary-action" id="saveMultiBtn" type="button">${isConsentQuestion ? (currentLang === "en" ? i18n.en.ui.consentContinue : "三項都已勾選，繼續填寫") : ui("saveContinue")}</button>
    `;

    const updateMultiButtons = () => {
      quickOptions.querySelectorAll(".option-button--multi").forEach((button) => {
        const selected = multiSelection.has(button.dataset.value);
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    };

    quickOptions.querySelectorAll(".option-button--multi").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value;
        if (multiSelection.has(value)) {
          multiSelection.delete(value);
        } else if (exclusiveOptions.has(value)) {
          multiSelection.clear();
          multiSelection.add(value);
        } else {
          exclusiveOptions.forEach((exclusiveOption) => multiSelection.delete(exclusiveOption));
          multiSelection.add(value);
        }
        updateMultiButtons();
        if (isConsentQuestion) {
          const saveButton = document.querySelector("#saveMultiBtn");
          if (saveButton) saveButton.disabled = !consentNoticeRead || multiSelection.size < (question.minSelected || 1);
        }
      });
    });
    updateMultiButtons();

    document.querySelector("#saveMultiBtn").addEventListener("click", () => {
      const selected = [...multiSelection];
      const minSelected = question.minSelected || 1;
      if (selected.length < minSelected) {
        showInlineNotice(question.minSelected
          ? (currentLang === "en" ? i18n.en.ui.consentRequired : "請完整勾選三項確認聲明後再繼續。")
          : (currentLang === "en" ? i18n.en.ui.multiRequired : "請至少選擇一項，或使用「不確定怎麼回答」。"));
        return;
      }
      saveAnswer(selected, "multi_choice");
    });
    return;
  }

  quickOptions.innerHTML = question.options.map((option) => `
    <button class="option-button" type="button" data-value="${option}">${tx(option)}</button>
  `).join("");

  quickOptions.querySelectorAll(".option-button").forEach((button) => {
    button.addEventListener("click", () => saveAnswer(button.dataset.value, "single_choice"));
  });
}

function getCompositeRows(question) {
  return question.rowQuestionIds.map((id) => questions.find((item) => item.id === id)).filter(Boolean);
}

function makeAnswerEntry(question, value, source) {
  return {
    question_id: question.id,
    label: question.title,
    display_label: getQuestionCopy(question).title,
    value,
    source,
    confirmed: true
  };
}

function finishCompositeQuestion(question) {
  currentIndex += 1;
  const nextQuestion = getCurrentQuestion();
  moduleFeedback = getModuleFeedback(question.module, nextQuestion?.module || "confirm");
  renderQuestion();
}

function renderFrequencyMatrix(question) {
  const rows = getCompositeRows(question);
  const options = rows[0]?.options || [];
  quickOptions.innerHTML = `
    <div class="frequency-matrix" role="group" aria-label="${escapeHtml(getQuestionCopy(question).title)}">
      <div class="frequency-matrix__header" aria-hidden="true">
        <span></span>
        ${options.map((option) => `<span>${escapeHtml(tx(option))}</span>`).join("")}
      </div>
      ${rows.map((row) => `
        <div class="frequency-matrix__row" data-matrix-row="${row.id}" role="radiogroup" aria-labelledby="matrix-label-${row.id}">
          <span class="matrix-row-label" id="matrix-label-${row.id}">${escapeHtml(currentLang === "en" ? row.matrixLabelEn : row.matrixLabel)}</span>
          ${row.options.map((option) => {
            const checked = getAnswerValue(answers, row.field) === option;
            return `<label class="matrix-choice"><input type="radio" name="matrix-${row.id}" value="${escapeHtml(option)}"${checked ? " checked" : ""}><span>${escapeHtml(tx(option))}</span></label>`;
          }).join("")}
        </div>
      `).join("")}
    </div>
    <button class="secondary-action matrix-save" id="saveMatrixBtn" type="button">${ui("saveContinue")}</button>
  `;
  document.querySelector("#saveMatrixBtn").addEventListener("click", () => {
    const selections = rows.map((row) => quickOptions.querySelector(`input[name="matrix-${row.id}"]:checked`)?.value);
    if (selections.some((value) => !value)) {
      showInlineNotice(currentLang === "en" ? "Please answer every row before continuing." : "請完成每一列後再繼續。");
      return;
    }
    rows.forEach((row, index) => { answers[row.field] = makeAnswerEntry(row, selections[index], "matrix_choice"); });
    finishCompositeQuestion(question);
  });
}

function renderDietMatrix(question) {
  const groups = getCompositeRows(question);
  quickOptions.innerHTML = `
    <div class="diet-frequency-matrix" role="group" aria-label="${escapeHtml(getQuestionCopy(question).title)}">
      <div class="diet-frequency-matrix__header" aria-hidden="true"><span>${currentLang === "en" ? "Item" : "飲食項目"}</span><span>${currentLang === "en" ? "Meets frequency" : "達到頻率"}</span><span>${currentLang === "en" ? "Below frequency" : "未達頻率"}</span></div>
      ${groups.map((group) => {
        const selected = getAnswerValue(answers, group.field);
        const selectedItems = Array.isArray(selected) ? selected : [];
        return `<section class="diet-frequency-group" aria-labelledby="diet-group-${group.id}">
          <h3 id="diet-group-${group.id}">${escapeHtml(getQuestionCopy(group).title)}</h3>
          ${group.options.filter((option) => option !== group.noneOption).map((option, optionIndex) => {
            const isMet = selectedItems.includes(option);
            return `<div class="diet-frequency-row" role="radiogroup" aria-labelledby="diet-label-${group.id}-${optionIndex}">
              <span class="matrix-row-label" id="diet-label-${group.id}-${optionIndex}">${escapeHtml(tx(option))}</span>
              <label class="matrix-choice"><input type="radio" name="diet-${group.id}-${optionIndex}" value="met"${isMet ? " checked" : ""}><span>${currentLang === "en" ? "Meets" : "達到"}</span></label>
              <label class="matrix-choice"><input type="radio" name="diet-${group.id}-${optionIndex}" value="below"${!isMet ? " checked" : ""}><span>${currentLang === "en" ? "Below" : "未達"}</span></label>
            </div>`;
          }).join("")}
        </section>`;
      }).join("")}
    </div>
    <button class="secondary-action matrix-save" id="saveDietMatrixBtn" type="button">${ui("saveContinue")}</button>
  `;
  document.querySelector("#saveDietMatrixBtn").addEventListener("click", () => {
    const incomplete = groups.some((group) => group.options.filter((option) => option !== group.noneOption).some((_, optionIndex) => !quickOptions.querySelector(`input[name="diet-${group.id}-${optionIndex}"]:checked`)));
    if (incomplete) {
      showInlineNotice(currentLang === "en" ? "Please answer every row before continuing." : "請完成每一列後再繼續。");
      return;
    }
    groups.forEach((group) => {
      const itemOptions = group.options.filter((option) => option !== group.noneOption);
      const selected = itemOptions.filter((_, optionIndex) => quickOptions.querySelector(`input[name="diet-${group.id}-${optionIndex}"]:checked`)?.value === "met");
      answers[group.field] = makeAnswerEntry(group, selected.length ? selected : [group.noneOption], "diet_matrix_choice");
    });
    finishCompositeQuestion(question);
  });
}

function showInlineNotice(message) {
  parseCard.innerHTML = `<p class="helper-text">${message}</p>`;
  parseCard.hidden = false;
}

function getNumberBounds(question) {
  const currentYear = new Date().getFullYear();
  if (question.repeatCount) return { min: 1, max: 9, step: 1 };
  if (question.intervalDays) return { min: 1, max: 180, step: 1 };
  const bounds = {
    birth_year: { min: currentYear - 120, max: currentYear, step: 1 },
    height_cm: { min: 100, max: 250, step: 0.1 },
    weight_kg: { min: 20, max: 300, step: 0.1 },
  };
  return bounds[question.id] || null;
}

function getNumberValidationMessage(question, rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return currentLang === "en" ? "Please enter a valid number." : "請輸入有效的數字。";
  }

  const bounds = getNumberBounds(question);
  if (!bounds) return "";

  if (bounds.step === 1 && !Number.isInteger(value)) {
    return currentLang === "en" ? "Please enter a whole number." : "請輸入整數。";
  }

  if (value < bounds.min || value > bounds.max) {
    if (question.id === "birth_year") {
      return currentLang === "en"
        ? `Please enter a four-digit year between ${bounds.min} and ${bounds.max}.`
        : `請輸入 ${bounds.min} 至 ${bounds.max} 之間的四位數西元出生年。`;
    }
    if (question.id === "height_cm") {
      return currentLang === "en"
        ? "Please enter a height between 100 and 250 cm."
        : "請確認身高，應輸入 100 至 250 公分之間的數值。";
    }
    if (question.id === "weight_kg") {
      return currentLang === "en"
        ? "Please enter a weight between 20 and 300 kg."
        : "請確認體重，應輸入 20 至 300 公斤之間的數值。";
    }
    return currentLang === "en"
      ? `Please enter a value between ${bounds.min} and ${bounds.max}.`
      : `請輸入 ${bounds.min} 至 ${bounds.max} 之間的數值。`;
  }

  return "";
}

function saveAnswer(value, source, structured = null) {
  const question = getCurrentQuestion();
  const fromModuleId = question.module;
  const questionCopy = getQuestionCopy(question);
  const entry = {
    question_id: question.id,
    label: question.title,
    display_label: questionCopy.title,
    value,
    source,
    confirmed: true
  };
  if (question.id === "consent_acknowledgement") entry.accepted_at = new Date().toISOString();
  if (structured) entry.structured = structured;
  answers[question.field] = entry;
  if (question.id === "symptoms_bowel_abdominal") {
    const constipationQuestion = questions.find((item) => item.id === "constipation");
    const selected = Array.isArray(value) ? value : [];
    const constipationValue = source === "uncertain" || selected.includes(symptomUnknownOption)
      ? "不確定"
      : selected.includes("便秘（排便困難或排便次數減少）") ? "是" : "否";
    answers[constipationQuestion.field] = makeAnswerEntry(constipationQuestion, constipationValue, source === "uncertain" ? "uncertain" : "symptom_group_choice");
  }
  currentIndex += 1;
  const nextQuestion = getCurrentQuestion();
  moduleFeedback = getModuleFeedback(fromModuleId, nextQuestion?.module || "confirm");
  renderQuestion();
}

function renderConfirmation() {
  const moduleIndex = modules.findIndex((item) => item.id === "confirm");
  moduleList.innerHTML = modules.map((module, index) => `
    <li class="${index < moduleIndex ? "is-done" : index === moduleIndex ? "is-active" : ""}">
      <span class="module-index">${index < moduleIndex ? "✓" : index + 1}</span>
      <span>${getModuleCopy(module)[0]}</span>
    </li>
  `).join("");
  sectionTitle.textContent = currentLang === "en" ? i18n.en.ui.confirmSection : "資料確認";
  sectionSummary.textContent = currentLang === "en" ? i18n.en.ui.confirmSummary : "目前資料尚未送出。請確認所有填答答案後，按下頁面下方按鈕才會完成送出。";
  guideMessage.textContent = currentLang === "en" ? i18n.en.ui.confirmGuide : "這是最後確認步驟。請逐項檢查本次填寫的題目與答案，確認無誤後按下送出按鈕，資料才會送出。";

  questionArea.innerHTML = `
    <div class="confirm-panel">
      ${moduleFeedback ? `<p class="module-feedback">${moduleFeedback}</p>` : ""}
      <h2 class="question-title">${currentLang === "en" ? i18n.en.ui.confirmTitle : "請確認您的填答內容"}</h2>
      <div class="confirm-submit-notice" role="status">
        <strong>${currentLang === "en" ? i18n.en.ui.confirmPendingTitle : "目前尚未送出"}</strong>
        <p>${currentLang === "en" ? i18n.en.ui.confirmPendingBody : "請先逐項確認本頁所有答案。確認內容正確後，請按最下方「我已確認所有答案，送出資料」按鈕，系統才會正式送出您的資料。"}</p>
      </div>
      <div class="analysis-use-note">
        <strong>${currentLang === "en" ? "How your information will be used" : "送出後如何整理資料"}</strong>
        <p>${currentLang === "en"
          ? "After submission, the information listed on this page will be converted into structured health risk factors and used to create a personalized summary with the ten-cancer models. The service does not use this information to determine whether you have cancer."
          : "送出後，系統會將本頁資料轉換為結構化健康風險因子，並使用十大癌症模型產生個人化摘要。本服務不會依據這些資料判斷您是否罹患癌症。"}</p>
      </div>
      <div class="answer-review-list">
        ${Object.values(answers).map((entry) => `
          <div class="answer-review-item">
            <b>${getEntryDisplayLabel(entry)}</b>
            <span>${formatDisplayValue(entry.value)}</span>
          </div>
        `).join("")}
      </div>
      <div class="result-actions">
        <button class="secondary-action" id="runModelBtn" type="button">${currentLang === "en" ? i18n.en.ui.submitFinal : "我已確認所有答案，送出資料"}</button>
      </div>
    </div>
  `;
  moduleFeedback = "";
  inputZone.hidden = true;
  parseCard.hidden = true;
  backBtn.disabled = false;
  skipBtn.hidden = true;
  document.querySelector("#runModelBtn").addEventListener("click", renderResult);
}

function calculateBmi() {
  const height = Number(getAnswerValue(answers, "demographics.height_cm"));
  const weight = Number(getAnswerValue(answers, "demographics.weight_kg"));
  if (height >= 100 && height <= 250 && weight >= 20 && weight <= 300) {
    return Number((weight / ((height / 100) ** 2)).toFixed(1));
  }
  return "";
}

function calculateAge() {
  const birthYear = normalizeNumber(getAnswerValue(answers, "demographics.birth_year"));
  if (!birthYear) return "";
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  return Number.isInteger(birthYear) && age >= 0 && age <= 120 ? age : "";
}

function validateContactEmail() {
  const email = String(getAnswerValue(answers, "contact.email") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return currentLang === "en"
      ? "Please go back and enter a valid email address. The report cannot be sent without one."
      : "請返回修改 Email 並輸入有效的電子郵件地址，否則系統無法寄送報告。";
  }
  return "";
}

function validateCoreMeasurements() {
  const currentYear = new Date().getFullYear();
  const birthYear = normalizeNumber(getAnswerValue(answers, "demographics.birth_year"));
  const height = normalizeNumber(getAnswerValue(answers, "demographics.height_cm"));
  const weight = normalizeNumber(getAnswerValue(answers, "demographics.weight_kg"));
  const bmi = calculateBmi();

  if (!Number.isInteger(birthYear) || birthYear < currentYear - 120 || birthYear > currentYear) {
    return currentLang === "en"
      ? `Please go back and enter a valid four-digit birth year between ${currentYear - 120} and ${currentYear}.`
      : `請返回修改出生年，並輸入 ${currentYear - 120} 至 ${currentYear} 之間的四位數西元年份。`;
  }
  if (height == null || height < 100 || height > 250) {
    return currentLang === "en"
      ? "Please go back and enter a height between 100 and 250 cm."
      : "請返回修改身高，並輸入 100 至 250 公分之間的數值。";
  }
  if (weight == null || weight < 20 || weight > 300) {
    return currentLang === "en"
      ? "Please go back and enter a weight between 20 and 300 kg."
      : "請返回修改體重，並輸入 20 至 300 公斤之間的數值。";
  }
  if (bmi === "" || bmi < 10 || bmi > 100) {
    return currentLang === "en"
      ? "The calculated BMI is outside the supported range. Please go back and verify your height and weight."
      : "依身高與體重計算的 BMI 超出可接受範圍，請返回確認身高與體重是否正確。";
  }
  return "";
}

function boolFromYesNo(value) {
  if (value === "是" || String(value || "").startsWith("是，")) return 1;
  if (value === "否" || String(value || "").startsWith("否，")) return 0;
  return 0;
}

function isPersonalCancerYes(value) {
  return String(value || "").startsWith("是，");
}

function isCurrentCancerPatient(value) {
  return String(value || "").includes("目前正在");
}

function hasSelected(field, keyword) {
  const value = getAnswerValue(answers, field);
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.some((item) => String(item).includes(keyword));
}

function getSymptomColumnState(column) {
  for (const group of symptomGroups) {
    const definition = group.options.find(([, , featureColumn]) => featureColumn === column);
    if (!definition) continue;
    const entry = answers[group.field];
    const selected = Array.isArray(entry?.value) ? entry.value : [];
    if (!entry || entry.source === "uncertain" || selected.includes(symptomUnknownOption)) return null;
    return selected.includes(definition[0]) ? 1 : 0;
  }
  return null;
}

function combineSymptomStates(columns) {
  const states = columns.map(getSymptomColumnState);
  if (states.includes(1)) return 1;
  if (states.every((state) => state === 0)) return 0;
  return null;
}

function getRuleParentState(parent) {
  const derivedParents = {
    symptom_mass: ["symptom_mass", "symptom_neck_lump", "symptom_head_neck_mass", "symptom_nasal_mass", "symptom_breast_lump", "symptom_testicular_lump"],
    symptom_abdominal_pain: ["symptom_persistent_abdominal_pain", "symptom_epigastric_pain", "symptom_upper_abdominal_discomfort", "symptom_right_upper_abdominal_discomfort"],
    symptom_back_pain: ["symptom_persistent_back_pain"],
    symptom_mouth_symptoms: ["symptom_oral_ulcer", "symptom_oral_white_red_patch"]
  };
  return combineSymptomStates(derivedParents[parent] || [parent]);
}

function isRuleParentPositive(parent) {
  return getRuleParentState(parent) === 1;
}

function mapExercise(value) {
  return {
    "幾乎不運動": 0,
    "30-60 分鐘": 1,
    "1-2 小時": 2,
    "多於 2 小時": 3
  }[value] ?? 0;
}

function mapFrequency(value) {
  return {
    "不到 1 天": 0,
    "2-3 天": 2,
    "4-5 天": 4,
    "幾乎每天": 6
  }[value] ?? 0;
}

function mapCookingFrequency(value) {
  return {
    "少於一次": 0,
    "每週 1-3 次": 2,
    "每週 4-6 次": 5,
    "每週 6 次以上": 7
  }[value] ?? 0;
}

function mapFemaleValue(valueMap, field) {
  const sex = getAnswerValue(answers, "demographics.sex");
  if (sex !== "女性") return -1;
  const value = getAnswerValue(answers, field);
  return valueMap[value] ?? 0;
}

function buildOptimizedFeatureRow() {
  const sex = getAnswerValue(answers, "demographics.sex");
  const dietType = getAnswerValue(answers, "diet.current_diet_type");
  const legacyFrequentFoods = getAnswerValue(answers, "diet.frequent_foods");
  const meatProcessedFoods = getAnswerValue(answers, "diet.meat_processed_foods");
  const sugarFatFoods = getAnswerValue(answers, "diet.sugar_fat_foods");
  const plantDairyHabits = getAnswerValue(answers, "diet.plant_dairy_habits");
  const beverageHabits = getAnswerValue(answers, "diet.beverage_habits");
  const foodList = [
    ...(Array.isArray(legacyFrequentFoods) ? legacyFrequentFoods : []),
    ...(Array.isArray(meatProcessedFoods) ? meatProcessedFoods : []),
    ...(Array.isArray(sugarFatFoods) ? sugarFatFoods : []),
    ...(Array.isArray(plantDairyHabits) ? plantDairyHabits : []),
    ...(Array.isArray(beverageHabits) ? beverageHabits : [])
  ];
  const cookingFrequency = getAnswerValue(answers, "exposure.weekly_cooking_frequency");
  const anxiety = getAnswerValue(answers, "mental_health.weekly_stress_frequency");
  const insomnia = getAnswerValue(answers, "mental_health.weekly_sleep_problem_frequency");
  const depression = getAnswerValue(answers, "mental_health.weekly_low_mood_frequency");
  const firstPregnancyAge = getAnswerValue(answers, "female_health.first_pregnancy_age");
  const breastfeedingHistory = getAnswerValue(answers, "female_health.breastfeeding_history");
  const vegetarianDietTypes = [
    "全素",
    "蛋奶素",
    "蛋素",
    "奶素",
    "植物五辛素",
    "蛋奶素（不吃肉類及海鮮，但會吃蛋或乳製品）",
    "全素（不吃肉類、海鮮、蛋及乳製品）"
  ];
  const explicitlyVegetarian = vegetarianDietTypes.includes(dietType) || dietType?.startsWith("健康蔬食／全植物飲食");
  const plantDairyAnswered = Boolean(answers["diet.plant_dairy_habits"] || answers["diet.daily_milk"]);
  const personalCancerHistory = getAnswerValue(answers, "medical_history.personal_cancer_history");
  const row = {
    record_id: `WEB-${Date.now()}`,
    sex: sex === "女性" ? 1 : 0,
    age: calculateAge(),
    height_cm: normalizeNumber(getAnswerValue(answers, "demographics.height_cm")),
    weight_kg: normalizeNumber(getAnswerValue(answers, "demographics.weight_kg")),
    bmi: calculateBmi(),
    diagnosis: "尚未診斷",
    is_cancer_patient: isCurrentCancerPatient(personalCancerHistory) ? 1 : 0,
    prev_cancer: isPersonalCancerYes(personalCancerHistory) ? 1 : 0,
    family_cancer_history: boolFromYesNo(getAnswerValue(answers, "family_history.has_cancer_history")),
    first_degree_relative_cancer: boolFromYesNo(getAnswerValue(answers, "family_history.has_cancer_history")),
    chronic_hypertension: hasSelected("medical_history.chronic_conditions", "高血壓") ? 1 : 0,
    chronic_diabetes: hasSelected("medical_history.chronic_conditions", "糖尿病") ? 1 : 0,
    chronic_hyperlipidemia: hasSelected("medical_history.chronic_conditions", "高血脂") ? 1 : 0,
    chronic_liver_disease: hasSelected("medical_history.chronic_conditions", "肝病") ? 1 : 0,
    chronic_gerd: hasSelected("medical_history.chronic_conditions", "胃食道逆流") ? 1 : 0,
    chronic_heart_disease: hasSelected("medical_history.chronic_conditions", "心臟病") ? 1 : 0,
    chronic_thyroid: hasSelected("medical_history.chronic_conditions", "甲狀腺") ? 1 : 0,
    chronic_asthma_copd: hasSelected("medical_history.chronic_conditions", "氣喘") ? 1 : 0,
    chronic_gout: hasSelected("medical_history.chronic_conditions", "痛風") ? 1 : 0,
    chronic_arthritis: hasSelected("medical_history.chronic_conditions", "關節炎") ? 1 : 0,
    chronic_mental: hasSelected("medical_history.chronic_conditions", "憂鬱症") ? 1 : 0,
    chronic_stroke: hasSelected("medical_history.chronic_conditions", "中風") ? 1 : 0,
    chronic_kidney: hasSelected("medical_history.chronic_conditions", "腎臟病") ? 1 : 0,
    chronic_autoimmune: hasSelected("medical_history.chronic_conditions", "自體免疫") ? 1 : 0,
    chronic_other_unclassified: hasSelected("medical_history.chronic_conditions", "其他慢性疾病") ? 1 : 0,
    chronic_disease_count: 0,
    smoking: boolFromYesNo(getAnswerValue(answers, "exposure.smoking_ever")),
    quit_smoking: getAnswerValue(answers, "exposure.smoking_quit_status") === "是，已戒菸" ? 1 : 0,
    secondhand_smoke: boolFromYesNo(getAnswerValue(answers, "exposure.secondhand_smoke")),
    betel_nut: boolFromYesNo(getAnswerValue(answers, "exposure.betel_nut_ever")),
    radiation_exposure: boolFromYesNo(getAnswerValue(answers, "exposure.radiation_exposure")),
    cooking_fumes: boolFromYesNo(getAnswerValue(answers, "exposure.cooking_fume")),
    air_pollution: boolFromYesNo(getAnswerValue(answers, "exposure.air_pollution")),
    cooking_freq_missing: cookingFrequency ? 0 : 1,
    cooking_freq_per_week: mapCookingFrequency(cookingFrequency),
    weight_change_6m: boolFromYesNo(getAnswerValue(answers, "demographics.weight_change_over_5_percent")),
    exercise_per_week: mapExercise(getAnswerValue(answers, "lifestyle.weekly_exercise_time")),
    anxiety_freq_missing: anxiety === "不到 1 天" ? 1 : 0,
    anxiety_freq: mapFrequency(anxiety),
    insomnia_freq_missing: insomnia === "不到 1 天" ? 1 : 0,
    insomnia_freq: mapFrequency(insomnia),
    depression_freq_missing: depression === "不到 1 天" ? 1 : 0,
    depression_freq: mapFrequency(depression),
    alcohol: foodList.some((item) => item.includes("飲酒")) ? 1 : 0,
    vegetarian: explicitlyVegetarian || foodList.some((item) => item.startsWith("素食飲食")) ? 1 : 0,
    grilled_fried_food: foodList.some((item) => item.includes("燒烤") || item.includes("油炸")) ? 1 : 0,
    pickled_food: foodList.some((item) => item.includes("醃漬")) ? 1 : 0,
    red_meat: foodList.some((item) => item.includes("紅肉")) ? 1 : 0,
    sweets_junk: foodList.some((item) => item.includes("甜食")) ? 1 : 0,
    sugary_drinks: foodList.some((item) => item.includes("含糖飲料")) ? 1 : 0,
    vegetables_fruits: foodList.some((item) => item.includes("蔬菜水果") || item.includes("蔬菜或水果")) ? 1 : 0,
    high_fat_food_missing: foodList.some((item) => item.includes("高脂肪")) ? 0 : 1,
    high_fat_food: foodList.some((item) => item.includes("高脂肪")) ? 1 : 0,
    dairy_missing: plantDairyAnswered ? 0 : 1,
    dairy: getAnswerValue(answers, "diet.daily_milk") === "是，每天飲用"
      || foodList.some((item) => item.includes("牛奶") || item.includes("乳製品")) ? 1 : 0,
    coffee_habit_missing: foodList.some((item) => item.includes("咖啡")) ? 0 : 1,
    tea_habit_missing: foodList.some((item) => item.includes("茶")) ? 0 : 1,
    coffee_habit: foodList.some((item) => item.includes("咖啡")) ? 1 : 0,
    tea_habit: foodList.some((item) => item.includes("茶")) ? 1 : 0,
    menarche_early: mapFemaleValue({ "12 歲以前（含 12 歲）": 1, "13 歲以後（含 13 歲）": 0 }, "female_health.menarche_age"),
    menopause_ordinal: mapFemaleValue({ "尚未停經（仍有月經）": 0, "已停經（55 歲或以前停經）": 1, "已停經（55 歲或以後停經）": 2, "已切除子宮或卵巢": 3 }, "female_health.menopause_status"),
    first_pregnancy_age_ordinal: mapFemaleValue({ "從未懷孕": 0, "20 歲以下": 1, "20-30 歲": 2, "31-35 歲": 3, "36 歲以上": 4 }, "female_health.first_pregnancy_age"),
    num_pregnancies: sex !== "女性" ? -1 : firstPregnancyAge === "從未懷孕" ? 0 : -1,
    num_births: sex !== "女性" ? -1 : firstPregnancyAge === "從未懷孕" || breastfeedingHistory === "尚未生產，此題不適用" ? 0 : -1,
    breastfed: mapFemaleValue({ "從未哺乳": 0, "有哺乳，但少於 6 個月": 1, "有哺乳，超過 6 個月（含 6 個月）": 1, "尚未生產，此題不適用": 0 }, "female_health.breastfeeding_history"),
    pap_smear_done: mapFemaleValue({ "是，歷次結果均正常": 1, "是，曾有異常報告（如 CIN、HPV 陽性等）": 1, "否，從未做過": 0 }, "female_health.pap_smear_history"),
    pap_smear_abnormal: mapFemaleValue({ "是，歷次結果均正常": 0, "是，曾有異常報告（如 CIN、HPV 陽性等）": 1, "否，從未做過": 0 }, "female_health.pap_smear_history"),
    hormone_drug: mapFemaleValue({ "是，使用超過 1 年": 1, "是，使用不到 1 年": 1, "否，從未使用": 0 }, "female_health.hormone_medication"),
    score: "",
    data_source: "interactive_mvp"
  };
  row.chronic_disease_count = [
    row.chronic_hypertension, row.chronic_diabetes, row.chronic_hyperlipidemia, row.chronic_liver_disease,
    row.chronic_gerd, row.chronic_heart_disease, row.chronic_thyroid, row.chronic_asthma_copd,
    row.chronic_gout, row.chronic_arthritis, row.chronic_mental, row.chronic_stroke,
    row.chronic_kidney, row.chronic_autoimmune, row.chronic_other_unclassified
  ].reduce((sum, value) => sum + value, 0);
  return optimizedFeatureColumns.reduce((ordered, column) => {
    ordered[column] = row[column] ?? "";
    return ordered;
  }, {});
}

function checkOptimizedFeatureRow(row) {
  const messages = [];
  const sex = getAnswerValue(answers, "demographics.sex");
  const smokingEver = getAnswerValue(answers, "exposure.smoking_ever");
  const smokingQuit = getAnswerValue(answers, "exposure.smoking_quit_status");

  if (sex === "男性" && optimizedFeatureColumns.slice(60, 69).some((column) => row[column] !== -1)) {
    messages.push("男性路徑中不應出現女性相關題組答案。");
  }
  if (smokingEver === "否" && smokingQuit) {
    messages.push("抽菸習慣填否，但仍出現戒菸狀態。");
  }
  return messages;
}

function buildSubmissionRows() {
  const submittedAt = new Date().toISOString();
  return Object.values(answers)
    .filter((entry) => entry.field !== "contact.email")
    .map((entry) => ({
    submitted_at: submittedAt,
    question_id: entry.question_id,
    question_text: entry.label,
    answer: Array.isArray(entry.value) ? entry.value.join("; ") : String(entry.value)
  })).concat([
    {
      submitted_at: submittedAt,
      question_id: "derived_bmi",
      question_text: "BMI",
      answer: String(calculateBmi())
    }
  ]);
}

function getStableOptionCode(question, option) {
  return EGAnswerCodes.getOptionCode(question, option);
}

function buildConsentRecord(submittedAt) {
  const entry = answers["consent.acknowledgement"];
  const selected = Array.isArray(entry?.value) ? entry.value : [];
  const acceptedItemIds = ["data_use", "model_limitations", "non_medical_use"];
  return {
    consent_version: SUBMISSION_VERSIONS.consent_version,
    accepted_at: entry?.accepted_at || submittedAt,
    accepted_item_ids: acceptedItemIds.filter((code) => selected.some(
      (option) => getStableOptionCode(questions[0], option) === code
    ))
  };
}

function buildAnswerCodeRows() {
  return canonicalAnswerQuestions
    .map((question) => {
      const applicable = !question.appliesIf || question.appliesIf(answers);
      if (!applicable) return { question_id: question.id, status: "not_applicable", value: null };

      const entry = answers[question.field];
      if (!entry || entry.source === "uncertain") {
        return { question_id: question.id, status: "unknown", value: null };
      }
      if (question.type === "number") {
        return { question_id: question.id, status: "answered", value: normalizeNumber(entry.value) };
      }
      if (question.type === "multi") {
        const selected = Array.isArray(entry.value) ? entry.value : [];
        if (selected.some((option) => getStableOptionCode(question, option) === "unknown")) {
          return { question_id: question.id, status: "unknown", value: null };
        }
        return {
          question_id: question.id,
          status: "answered",
          value: selected.map((option) => getStableOptionCode(question, option)).filter(Boolean)
        };
      }
      if (question.type === "single") {
        const code = getStableOptionCode(question, entry.value);
        return code === "unknown"
          ? { question_id: question.id, status: "unknown", value: null }
          : { question_id: question.id, status: "answered", value: code };
      }
      return { question_id: question.id, status: "answered", value: String(entry.value ?? "") };
    });
}

function buildSymptomFeatureRow() {
  const row = symptomGroups.reduce((featureRow, group) => {
    const answerEntry = answers[group.field];
    const selected = Array.isArray(answerEntry?.value) ? answerEntry.value : [];
    const isUnknown = !answerEntry || answerEntry.source === "uncertain" || selected.includes(symptomUnknownOption);
    group.options.forEach(([label, , column]) => {
      featureRow[column] = isUnknown ? null : selected.includes(label) ? 1 : 0;
    });
    return featureRow;
  }, {});

  if (row.symptom_hematuria_visible === 1) row.symptom_hematuria = 1;
  return row;
}

function buildSymptomAnswers() {
  return symptomGroups.map((group) => {
    const entry = answers[group.field];
    const selected = Array.isArray(entry?.value) ? entry.value : [];
    return {
      category_id: group.id,
      category_zh: group.title,
      category_en: group.titleEn,
      answer_status: !entry || entry.source === "uncertain"
        ? "unknown"
        : selected.includes(symptomUnknownOption) ? "unknown"
          : selected.includes(symptomNoneOption) ? "none" : "reported",
      selected_symptoms: selected.filter((value) => value !== symptomNoneOption && value !== symptomUnknownOption)
    };
  });
}

function buildVnextFeatureRow(symptomFeatureRow) {
  const historyEntry = answers["medical_history.vnext_diagnosed_conditions"];
  const historySelected = Array.isArray(historyEntry?.value) ? historyEntry.value : [];
  const historyUnknown = !historyEntry || historyEntry.source === "uncertain" || historySelected.includes(symptomUnknownOption);
  const row = Object.fromEntries(
    vnextSymptomCandidateColumns.map((column) => [column, symptomFeatureRow[column] ?? null])
  );

  vnextHistoryFeatureDefinitions.forEach(([label, , column]) => {
    row[column] = historyUnknown ? null : historySelected.includes(label) ? 1 : 0;
  });

  const liverEntry = answers["medical_history.liver_disease_etiology"];
  const liverSelected = Array.isArray(liverEntry?.value) ? liverEntry.value : [];
  row.hx_liver_disease_etiology = !liverEntry || liverSelected.includes("不確定肝病種類")
    ? null
    : liverSelected.join("|");

  return row;
}

function buildVnextFeatureMetadata() {
  const soreThroatCount = normalizeNumber(getAnswerValue(answers, "rule_inputs.symptom_sore_throat_repeat_count"));
  const visibleHematuriaCount = normalizeNumber(getAnswerValue(answers, "rule_inputs.symptom_hematuria_visible_repeat_count"));
  const massCount = normalizeNumber(getAnswerValue(answers, "rule_inputs.symptom_mass_repeat_count"));
  const massInterval = normalizeNumber(getAnswerValue(answers, "rule_inputs.symptom_mass_interval_days"));
  return {
    testicular_pain_pattern: getAnswerValue(answers, "symptoms.follow_up.testicular_pain_pattern") || null,
    sore_throat_pattern: soreThroatCount === 1 ? "僅發生 1 次" : soreThroatCount >= 2 ? "反覆發生 2 次以上" : null,
    head_neck_mass_pattern: massCount >= 2 && massInterval >= 42 ? "持續或間隔至少 6 週後再次出現" : massCount === 1 ? "少於 6 週" : null,
    visible_hematuria_pattern: visibleHematuriaCount === 1 ? "僅發生 1 次" : visibleHematuriaCount >= 2 ? "反覆發生 2 次以上" : null
  };
}

function mapRuleBinary(field) {
  const entry = answers[field];
  if (!entry || entry.source === "uncertain" || ["不確定", "不記得"].includes(entry.value)) return null;
  if (entry.value === "是" || String(entry.value).startsWith("是，")) return 1;
  if (entry.value === "否" || String(entry.value).startsWith("否，")) return 0;
  return null;
}

function mapRuleNumber(field) {
  const entry = answers[field];
  if (!entry || entry.source === "uncertain") return null;
  return normalizeNumber(entry.value);
}

function buildRuleInputRow(symptomFeatureRow) {
  const papTiming = getAnswerValue(answers, "rule_inputs.screen_pap_overdue_or_out_of_range");
  const psaHistory = getAnswerValue(answers, "rule_inputs.screen_psa_elevated");
  const row = {
    symptom_stool_loose_or_frequent: getRuleParentState("symptom_bowel_habit_change") === 0
      ? 9
      : mapRuleBinary("rule_inputs.symptom_stool_loose_or_frequent"),
    symptom_mastalgia: mapRuleBinary("rule_inputs.symptom_mastalgia"),
    symptom_constipation: mapRuleBinary("rule_inputs.symptom_constipation"),
    dx_orchitis_epididymitis: mapRuleBinary("rule_inputs.dx_orchitis_epididymitis"),
    hx_benign_gynae_disease: mapRuleBinary("rule_inputs.hx_benign_gynae_disease"),
    screen_pap_overdue_or_out_of_range: ({ "3 年內": 1, "3 年以上": 2, "從未做過": 3 }[papTiming] ?? null),
    screen_psa_elevated: ({ "做過且曾被告知偏高": 1, "做過且結果正常": 2, "沒做過": 0 }[psaHistory] ?? null),
    symptom_mass: getRuleParentState("symptom_mass"),
    symptom_shortness_of_breath: symptomFeatureRow.symptom_shortness_of_breath ?? null
  };

  ruleRepeatDefinitions.forEach(([parent, , , countField, intervalField]) => {
    const parentState = getRuleParentState(parent);
    row[countField] = parentState === 0 ? 0 : mapRuleNumber(`rule_inputs.${countField}`);
    if (intervalField) {
      const count = row[countField];
      row[intervalField] = count >= 2 ? mapRuleNumber(`rule_inputs.${intervalField}`) : null;
    }
  });

  return ruleInputColumns.reduce((ordered, column) => {
    ordered[column] = row[column] ?? null;
    return ordered;
  }, {});
}

function buildResearchFeatureRow() {
  const selected = getAnswerValue(answers, "diet.meat_processed_foods");
  const foodList = Array.isArray(selected) ? selected : [];
  return {
    processed_meat: foodList.some((item) => item.includes("加工肉品")) ? 1 : 0
  };
}

function buildExcelRow(optimizedFeatureRow, submittedAt, symptomFeatureRow, symptomAnswers, vnextFeatureRow, vnextFeatureMetadata, researchFeatureRow, ruleInputRow) {
  const symptomEntry = Object.values(answers).find((entry) => entry.field === "recent_health.recent_discomfort");
  const personalCancerTypeEntry = Object.values(answers).find((entry) => entry.field === "medical_history.personal_cancer_types");
  const structured = symptomEntry?.structured || {};
  const join = (value) => Array.isArray(value) ? value.join("; ") : "";
  const personalCancerTypes = personalCancerTypeEntry?.value
    ? (Array.isArray(personalCancerTypeEntry.value) ? personalCancerTypeEntry.value.join("; ") : String(personalCancerTypeEntry.value))
    : "";
  const researchExcelFields = Object.fromEntries(
    Object.entries(researchFeatureRow).map(([column, value]) => [`research_${column}`, value])
  );

  return {
    ...optimizedFeatureRow,
    ...symptomFeatureRow,
    ...vnextFeatureRow,
    ...ruleInputRow,
    ...Object.fromEntries(Object.entries(vnextFeatureMetadata).map(([key, value]) => [`research_${key}`, value])),
    ...researchExcelFields,
    submitted_at: submittedAt,
    language: currentLang,
    report_language: currentLang === "en" ? "en" : "zh-Hant",
    personal_cancer_types: personalCancerTypes,
    symptom_positive_count: Object.values(symptomFeatureRow).filter((value) => value === 1).length,
    symptom_answers_json: JSON.stringify(symptomAnswers),
    recent_discomfort_text: symptomEntry?.value ? String(symptomEntry.value) : "",
    recent_discomfort_no_symptom: structured.no_symptom === true ? 1 : 0,
    recent_discomfort_body_parts: join(structured.body_parts),
    recent_discomfort_symptoms: join(structured.symptoms),
    recent_discomfort_duration: structured.duration || "",
    recent_discomfort_severity: structured.severity || "",
    recent_discomfort_care_seeking: structured.care_seeking || "",
    recent_discomfort_follow_up: structured.follow_up || "",
    recent_discomfort_ready_to_close: structured.ready_to_close === true ? 1 : 0
  };
}

function buildAiApiFeatureRow(optimizedFeatureRow) {
  return {
    ...optimizedFeatureRow,
    // AI API schema currently rejects negative quit_smoking values.
    // Keep raw modeling/storage features in optimized_feature_row and excel_row.
    quit_smoking: Math.max(0, normalizeNumber(optimizedFeatureRow.quit_smoking) ?? 0)
  };
}

function buildContactRow(optimizedFeatureRow, submittedAt) {
  return {
    record_id: optimizedFeatureRow.record_id,
    email: getAnswerValue(answers, "contact.email") || "",
    submitted_at: submittedAt,
    language: currentLang,
    report_language: currentLang === "en" ? "en" : "zh-Hant"
  };
}

function storeSubmissionForIntegration() {
  const submittedAt = new Date().toISOString();
  const rows = buildSubmissionRows();
  const consentRecord = buildConsentRecord(submittedAt);
  const answerCodeRows = buildAnswerCodeRows();
  const optimizedFeatureRow = buildOptimizedFeatureRow();
  const aiApiFeatureRow = buildAiApiFeatureRow(optimizedFeatureRow);
  const symptomFeatureRow = buildSymptomFeatureRow();
  const symptomAnswers = buildSymptomAnswers();
  const vnextFeatureRow = buildVnextFeatureRow(symptomFeatureRow);
  const vnextFeatureMetadata = buildVnextFeatureMetadata();
  const researchFeatureRow = buildResearchFeatureRow();
  const ruleInputRow = buildRuleInputRow(symptomFeatureRow);
  const missingColumns = optimizedFeatureColumns.filter((column) => optimizedFeatureRow[column] === "" && column !== "score");
  const submission = {
    ...SUBMISSION_VERSIONS,
    submitted_at: submittedAt,
    email: getAnswerValue(answers, "contact.email") || "",
    language: currentLang,
    report_language: currentLang === "en" ? "en" : "zh-Hant",
    consent_record: consentRecord,
    answer_code_rows: answerCodeRows,
    rows,
    optimized_feature_columns: optimizedFeatureColumns,
    optimized_feature_row: optimizedFeatureRow,
    ai_api_feature_row: aiApiFeatureRow,
    symptom_feature_columns: symptomFeatureColumns,
    symptom_feature_row: symptomFeatureRow,
    symptom_answers: symptomAnswers,
    vnext_feature_columns: vnextFeatureColumns,
    vnext_feature_row: vnextFeatureRow,
    vnext_feature_metadata: vnextFeatureMetadata,
    research_feature_columns: researchFeatureColumns,
    research_feature_row: researchFeatureRow,
    rule_input_columns: ruleInputColumns,
    rule_input_row: ruleInputRow,
    excel_row: buildExcelRow(optimizedFeatureRow, submittedAt, symptomFeatureRow, symptomAnswers, vnextFeatureRow, vnextFeatureMetadata, researchFeatureRow, ruleInputRow),
    contact_row: buildContactRow(optimizedFeatureRow, submittedAt),
    data_quality: {
      missing_columns: missingColumns,
      contradiction_warnings: checkOptimizedFeatureRow(optimizedFeatureRow)
    }
  };
  window.latestSubmission = submission;
  return submission;
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function validateSubmissionBeforeSend(submission) {
  const vectorPairs = [
    ["optimized_feature_columns", "optimized_feature_row"],
    ["optimized_feature_columns", "ai_api_feature_row"],
    ["symptom_feature_columns", "symptom_feature_row"],
    ["vnext_feature_columns", "vnext_feature_row"],
    ["research_feature_columns", "research_feature_row"],
    ["rule_input_columns", "rule_input_row"]
  ];
  const errors = [];

  Object.entries(SUBMISSION_VERSIONS).forEach(([key, value]) => {
    if (submission[key] !== value) errors.push(`${key} version mismatch`);
  });
  const expectedAnswerQuestionIds = new Set(canonicalAnswerQuestions.map((question) => question.id));
  const submittedAnswerQuestionIds = new Set(
    Array.isArray(submission.answer_code_rows)
      ? submission.answer_code_rows.map((row) => row.question_id)
      : []
  );
  if (!Array.isArray(submission.answer_code_rows)
      || submission.answer_code_rows.length !== expectedAnswerQuestionIds.size
      || submittedAnswerQuestionIds.size !== expectedAnswerQuestionIds.size
      || [...expectedAnswerQuestionIds].some((id) => !submittedAnswerQuestionIds.has(id))) {
    errors.push(`answer_code_rows must contain ${expectedAnswerQuestionIds.size} canonical question IDs`);
  }
  if (!submission.consent_record
      || submission.consent_record.accepted_item_ids?.length !== 3) {
    errors.push("consent_record must contain all three consent items");
  }
  Object.entries(frozenSubmissionVectorCounts).forEach(([columnsName, expectedCount]) => {
    const columns = submission[columnsName];
    if (!Array.isArray(columns) || columns.length !== expectedCount || new Set(columns).size !== expectedCount) {
      errors.push(`${columnsName} must contain ${expectedCount} unique fields`);
    }
  });
  vectorPairs.forEach(([columnsName, rowName]) => {
    const columns = submission[columnsName] || [];
    const row = submission[rowName];
    const rowKeys = row && typeof row === "object" ? Object.keys(row) : [];
    if (rowKeys.length !== columns.length || columns.some((column) => !(column in (row || {})))) {
      errors.push(`${rowName} does not match ${columnsName}`);
    }
  });
  if (submission.excel_row && "email" in submission.excel_row) {
    errors.push("email must not appear in excel_row");
  }
  if (submission.contact_row?.email !== submission.email) {
    errors.push("contact_row email mismatch");
  }
  if (errors.length > 0) {
    throw new Error(`Submission contract validation failed: ${errors.join("; ")}`);
  }
}

async function submitToPowerAutomate(submission) {
  validateSubmissionBeforeSend(submission);
  const response = await fetch(SUBMISSION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(submission)
  });

  if (!response.ok) {
    throw new Error(`Submission failed: ${response.status}`);
  }

  window.latestPowerAutomateSubmit = {
    ok: true,
    submitted_at: new Date().toISOString()
  };
  return { ok: true };
}

function showSubmitError(message) {
  const panel = document.querySelector(".confirm-panel");
  if (!panel) return;
  const existing = panel.querySelector(".submit-error");
  if (existing) existing.remove();
  const error = document.createElement("p");
  error.className = "submit-error";
  error.textContent = message;
  panel.querySelector(".result-actions")?.before(error);
}

async function renderResult() {
  const emailError = validateContactEmail();
  if (emailError) {
    showSubmitError(emailError);
    return;
  }
  const measurementError = validateCoreMeasurements();
  if (measurementError) {
    showSubmitError(measurementError);
    return;
  }
  const submission = storeSubmissionForIntegration();
  const runButton = document.querySelector("#runModelBtn");
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = currentLang === "en" ? "Submitting..." : "送出中...";
  }

  try {
    await submitToPowerAutomate(submission);
  } catch (error) {
    window.latestPowerAutomateSubmit = {
      ok: false,
      error: error.message
    };
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = currentLang === "en" ? i18n.en.ui.submitReview : "確認並送出";
    }
    showSubmitError(currentLang === "en"
      ? "Submission failed. Please try again later or contact support."
      : "資料送出失敗，請稍後再試或聯繫服務人員。");
    return;
  }

  const moduleIndex = modules.findIndex((item) => item.id === "result");
  moduleList.innerHTML = modules.map((module, index) => `
    <li class="${index < moduleIndex ? "is-done" : index === moduleIndex ? "is-active" : ""}">
      <span class="module-index">${index < moduleIndex ? "✓" : index + 1}</span>
      <span>${getModuleCopy(module)[0]}</span>
    </li>
  `).join("");
  sectionTitle.textContent = currentLang === "en" ? i18n.en.ui.completedSection : "完成送出";
  sectionSummary.textContent = currentLang === "en" ? i18n.en.ui.completedSummary : "感謝您的填答。";
  guideMessage.textContent = currentLang === "en" ? i18n.en.ui.completedGuide : "您的填答已完成送出。請留意您填寫的 Email 信箱。";

  questionArea.innerHTML = `
    <div class="result-panel">
      <p class="eyebrow">${currentLang === "en" ? i18n.en.ui.completedSection : "已完成"}</p>
      <h2 class="question-title">${currentLang === "en" ? i18n.en.ui.completedTitle : "感謝您的填答"}</h2>
      <p class="question-note">${currentLang === "en" ? `${i18n.en.ui.completedNote} ${submission.email}.` : `本次健康探索已完成，您的結果已寄送至 ${submission.email}。`}</p>
      <p class="question-note">${currentLang === "en" ? i18n.en.ui.completedInbox : "請留意信箱收件匣與垃圾郵件匣。"}</p>
      <button class="text-link result-info-link" type="button" data-open-service-info>${currentLang === "en" ? i18n.en.ui.completedServiceInfo : "了解報告內容與服務限制"}</button>
      <script type="application/json" id="submissionRowsJson">${safeJsonForHtml(submission.rows)}</script>
      <script type="application/json" id="structuredFeaturesJson">${safeJsonForHtml({
        schema_version: "10Cancer_AI_structure_data_v1_compatible",
        columns: submission.optimized_feature_columns,
        row: submission.optimized_feature_row,
        ai_api_row: submission.ai_api_feature_row,
        symptom_columns: submission.symptom_feature_columns,
        symptom_row: submission.symptom_feature_row,
        symptom_answers: submission.symptom_answers,
        research_columns: submission.research_feature_columns,
        research_row: submission.research_feature_row,
        data_quality: submission.data_quality
      })}</script>
    </div>
  `;
  inputZone.hidden = true;
  panelFooter.hidden = true;
}

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.hidden) return;
    activeMode = tab.dataset.mode;
    document.querySelectorAll(".mode-tab").forEach((item) => item.classList.toggle("is-active", item === tab));
    quickOptions.hidden = activeMode !== "quick";
    freeAnswer.hidden = activeMode !== "text";
    voiceAnswer.hidden = activeMode !== "voice";
    parseCard.hidden = true;
  });
});

freeText.addEventListener("input", () => {
  const question = getCurrentQuestion();
  if (question?.type !== "text") return;
  freeText.dataset.followupShown = "";
  llmDraft = parseSymptomText(freeText.value);
  renderLlmPanel(llmDraft);
});

parseTextBtn.addEventListener("click", () => {
  const question = getCurrentQuestion();
  if (question?.type === "text") {
    const value = freeText.value.trim();
    if (!value) {
      showInlineNotice(currentLang === "en" ? i18n.en.ui.required : "請輸入您的回答。若最近三個月沒有身體不適，請填寫「無」。");
      return;
    }
    const parsed = parseSymptomText(value);
    llmDraft = parsed;
    renderLlmPanel(parsed);
    if (!parsed.ready_to_close && !freeText.dataset.followupShown) {
      freeText.dataset.followupShown = "true";
      return;
    }
    freeText.dataset.followupShown = "";
    saveAnswer(value, "free_text_llm_assisted", parsed);
    return;
  }
});

voiceBtn.addEventListener("click", () => {
  const question = getCurrentQuestion();
  if (question?.type === "text") showInlineNotice(currentLang === "en" ? i18n.en.ui.voiceUnavailable : "語音回答功能（建立中），請先使用文字回答。");
});

if (guideStage) {
  guideStage.addEventListener("pointermove", (event) => {
    const rect = guideStage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    guideStage.style.setProperty("--tilt-y", `${x * 7}deg`);
    guideStage.style.setProperty("--tilt-x", `${y * -6}deg`);
  });

  guideStage.addEventListener("pointerleave", () => {
    guideStage.style.setProperty("--tilt-y", "0deg");
    guideStage.style.setProperty("--tilt-x", "0deg");
  });
}

backBtn.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex -= 1;
    inputZone.hidden = false;
    skipBtn.hidden = false;
    panelFooter.hidden = false;
    renderQuestion();
  }
});

skipBtn.addEventListener("click", () => {
  const question = getCurrentQuestion();
  if (question?.id === "consent_acknowledgement" || question?.type === "email") return;
  if (question?.isComposite) {
    getCompositeRows(question).forEach((row) => {
      answers[row.field] = makeAnswerEntry(row, "不確定", "uncertain");
    });
    finishCompositeQuestion(question);
    return;
  }
  saveAnswer("不確定", "uncertain");
});

startBtn.addEventListener("click", () => {
  assessment.scrollIntoView({ behavior: "smooth", block: "start" });
});

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLang = button.dataset.lang;
    localStorage.setItem("egbiomed_lang", currentLang);
    applyStaticText();
    renderQuestion();
  });
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open-service-info]");
  if (!trigger || !serviceDetails) return;
  serviceDetails.open = true;
  serviceDetails.scrollIntoView({ behavior: "smooth", block: "start" });
});

applyStaticText();
renderModules();
renderQuestion();
