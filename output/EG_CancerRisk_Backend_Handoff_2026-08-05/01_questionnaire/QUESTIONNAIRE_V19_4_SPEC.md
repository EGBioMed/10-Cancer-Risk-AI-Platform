# v19.4 雙語題庫與分流規格

- 問卷版本：`questionnaire/2026-08-05-v19.4-phase1`
- 答案代碼版本：`question-answer-codes/1.0.0`
- 題目定義數：78
- 標準答案題數：76
- 中英文只是顯示文字；後端必須使用 `question_id` 與 `code`。
- `unknown` 與 `not_applicable` 不得自動轉成 0。

## 題庫總覽

| # | 段落 | question_id | 中文題目 | English | 題型 | 必填 | 顯示條件 |
|---:|---|---|---|---|---|---|---|
| 1 | 知情同意 / Consent | `consent_acknowledgement` | 在開始填寫前，請確認您已閱讀並同意以下事項 | Before starting, please confirm that you have read and agree to the following items | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 2 | 基本資料 / Basic information | `birth_year` | 您的出生年（西元） | Year of birth | `number` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 3 | 基本資料 / Basic information | `height_cm` | 身高（公分） | Height (cm) | `number` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 4 | 基本資料 / Basic information | `weight_kg` | 體重（公斤） | Weight (kg) | `number` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 5 | 基本資料 / Basic information | `weight_change` | 近半年內，您的體重是否有明顯增加或減少（超過體重 5%）？ | In the past six months, has your weight increased or decreased significantly (more than 5%)? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 6 | 基本資料 / Basic information | `exercise_time` | 每週運動時間 | Weekly exercise time | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 7 | 基本資料 / Basic information | `sex` | 您的性別？ | What is your sex? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 8 | 近期症狀 / Recent symptoms | `symptoms_general` | 全身性症狀 | General Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 9 | 近期症狀 / Recent symptoms | `symptoms_upper_digestive` | 上消化道症狀 | Upper Digestive Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 10 | 近期症狀 / Recent symptoms | `symptoms_bowel_abdominal` | 腸道與下腹部症狀 | Bowel and Lower Abdominal Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 11 | 近期症狀 / Recent symptoms | `symptoms_hepatobiliary` | 肝膽胰症狀 | Liver, Biliary, and Pancreatic Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 12 | 近期症狀 / Recent symptoms | `symptoms_respiratory` | 呼吸系統症狀 | Respiratory Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 13 | 近期症狀 / Recent symptoms | `symptoms_breast` | 乳房症狀 | Breast Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 14 | 近期症狀 / Recent symptoms | `symptoms_urinary` | 泌尿系統症狀 | Urinary Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 15 | 近期症狀 / Recent symptoms | `symptoms_male_reproductive` | 男性生殖系統症狀 | Male Reproductive Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 16 | 近期症狀 / Recent symptoms | `symptoms_gynecological` | 婦科相關症狀 | Gynecological Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 17 | 近期症狀 / Recent symptoms | `symptoms_oral_throat` | 口腔與喉嚨症狀 | Oral and Throat Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 18 | 近期症狀 / Recent symptoms | `symptoms_head_neck_nasal` | 頭頸與鼻部症狀 | Head, Neck, and Nasal Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 19 | 近期症狀 / Recent symptoms | `symptoms_neurological` | 神經系統症狀 | Neurological Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 20 | 近期症狀 / Recent symptoms | `symptoms_bone_hematologic` | 骨骼、血液與淋巴症狀 | Bone, Blood, and Lymphatic Symptoms | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 21 | 近期症狀 / Recent symptoms | `stool_loose_or_frequent` | 最近 6 個月內，排便習慣改變時，是否主要是大便變稀或排便次數變多？ | During the past 6 months, when your bowel habits changed, did you mainly have looser stools or more frequent bowel movements? | `code` | 是 / Yes | 僅在 symptom_bowel_habit_change=1 時顯示 / Show only when symptom_bowel_habit_change=1 |
| 22 | 近期症狀 / Recent symptoms | `mastalgia` | 最近 6 個月內，您的乳房是否曾有疼痛或脹痛？ | During the past 6 months, have you had breast pain or tenderness? | `code` | 是 / Yes | 僅女性 / Female only |
| 23 | 近期症狀 / Recent symptoms | `constipation` | 最近 6 個月內，您是否曾有便秘，例如排便困難或排便次數減少？ | During the past 6 months, have you had constipation, such as difficulty passing stool or fewer bowel movements? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 24 | 近期症狀 / Recent symptoms | `symptom_jaundice_repeat_count` | 最近 6 個月內，黃疸總共出現過幾次？ | During the past 6 months, how many times did you experience jaundice? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 25 | 近期症狀 / Recent symptoms | `symptom_mass_repeat_count` | 最近 6 個月內，原因不明的腫塊總共出現過幾次？ | During the past 6 months, how many times did you experience an unexplained lump? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 26 | 近期症狀 / Recent symptoms | `symptom_mass_interval_days` | 最近 6 個月內，兩次原因不明的腫塊之間最短相隔幾天？ | During the past 6 months, what was the shortest interval in days between two episodes of an unexplained lump? | `number` | 是 / Yes | 對應次數≥2 / Corresponding repeat count>=2 |
| 27 | 近期症狀 / Recent symptoms | `symptom_sore_throat_repeat_count` | 最近 6 個月內，喉嚨痛總共出現過幾次？ | During the past 6 months, how many times did you experience sore throat? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 28 | 近期症狀 / Recent symptoms | `symptom_shortness_of_breath_repeat_count` | 最近 6 個月內，呼吸喘或呼吸急促總共出現過幾次？ | During the past 6 months, how many times did you experience shortness of breath? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 29 | 近期症狀 / Recent symptoms | `symptom_dysphagia_repeat_count` | 最近 6 個月內，吞嚥困難、吞嚥疼痛或卡住感總共出現過幾次？ | During the past 6 months, how many times did you experience difficulty or pain when swallowing? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 30 | 近期症狀 / Recent symptoms | `symptom_hematochezia_repeat_count` | 最近 6 個月內，鮮紅色血便總共出現過幾次？ | During the past 6 months, how many times did you experience bright red blood in the stool? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 31 | 近期症狀 / Recent symptoms | `symptom_abdominal_pain_repeat_count` | 最近 6 個月內，腹部疼痛總共出現過幾次？ | During the past 6 months, how many times did you experience abdominal pain? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 32 | 近期症狀 / Recent symptoms | `symptom_back_pain_repeat_count` | 最近 6 個月內，背痛總共出現過幾次？ | During the past 6 months, how many times did you experience back pain? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 33 | 近期症狀 / Recent symptoms | `symptom_bowel_habit_change_repeat_count` | 最近 6 個月內，排便習慣改變總共出現過幾次？ | During the past 6 months, how many times did you experience a change in bowel habits? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 34 | 近期症狀 / Recent symptoms | `symptom_pelvic_discomfort_or_increased_girth_repeat_count` | 最近 6 個月內，骨盆腔不適或腹圍增加總共出現過幾次？ | During the past 6 months, how many times did you experience pelvic discomfort or increased abdominal girth? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 35 | 近期症狀 / Recent symptoms | `symptom_hematuria_visible_repeat_count` | 最近 6 個月內，肉眼可見血尿總共出現過幾次？ | During the past 6 months, how many times did you experience visible blood in the urine? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 36 | 近期症狀 / Recent symptoms | `symptom_nocturia_repeat_count` | 最近 6 個月內，夜尿增加總共出現過幾次？ | During the past 6 months, how many times did you experience increased nighttime urination? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 37 | 近期症狀 / Recent symptoms | `symptom_urinary_frequency_repeat_count` | 最近 6 個月內，頻尿總共出現過幾次？ | During the past 6 months, how many times did you experience frequent urination? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 38 | 近期症狀 / Recent symptoms | `symptom_oral_ulcer_repeat_count` | 最近 6 個月內，口腔潰瘍總共出現過幾次？ | During the past 6 months, how many times did you experience an oral ulcer? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 39 | 近期症狀 / Recent symptoms | `symptom_oral_ulcer_interval_days` | 最近 6 個月內，兩次口腔潰瘍之間最短相隔幾天？ | During the past 6 months, what was the shortest interval in days between two episodes of an oral ulcer? | `number` | 是 / Yes | 對應次數≥2 / Corresponding repeat count>=2 |
| 40 | 近期症狀 / Recent symptoms | `symptom_oral_white_red_patch_repeat_count` | 最近 6 個月內，口腔白斑或紅斑總共出現過幾次？ | During the past 6 months, how many times did you experience a white or red patch in the mouth? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 41 | 近期症狀 / Recent symptoms | `symptom_oral_white_red_patch_interval_days` | 最近 6 個月內，兩次口腔白斑或紅斑之間最短相隔幾天？ | During the past 6 months, what was the shortest interval in days between two episodes of a white or red patch in the mouth? | `number` | 是 / Yes | 對應次數≥2 / Corresponding repeat count>=2 |
| 42 | 近期症狀 / Recent symptoms | `symptom_mouth_symptoms_repeat_count` | 最近 6 個月內，上述口腔症狀總共出現過幾次？ | During the past 6 months, how many times did you experience the oral symptoms selected above? | `number` | 是 / Yes | 對應母症狀為陽性 / Corresponding parent symptom is positive |
| 43 | 近期症狀 / Recent symptoms | `symptom_mouth_symptoms_interval_days` | 最近 6 個月內，兩次上述口腔症狀之間最短相隔幾天？ | During the past 6 months, what was the shortest interval in days between two episodes of the oral symptoms selected above? | `number` | 是 / Yes | 對應次數≥2 / Corresponding repeat count>=2 |
| 44 | 近期症狀 / Recent symptoms | `testicular_pain_pattern` | 睪丸疼痛發生的情況 | Pattern of testicular pain | `code` | 是 / Yes | 僅男性且勾選睾丸疼痛 / Male and testicular pain selected |
| 45 | 女性健康 / Female health | `menarche_age` | 初經（第一次月經）來潮年齡 | Age at first menstruation | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 46 | 女性健康 / Female health | `menopause_status` | 目前停經（更年期）狀態 | Current menopause status | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 47 | 女性健康 / Female health | `first_pregnancy_age` | 第一胎懷孕年齡 | Age at first pregnancy | `code` | 否 / No | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 48 | 女性健康 / Female health | `breastfeeding` | 產後是否曾哺餵母乳？若有，哺乳時間多長？ | Have you breastfed after childbirth? If yes, for how long? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 49 | 女性健康 / Female health | `pap_smear` | 是否曾做過子宮頸抹片檢查？結果如何？ | Have you ever had a Pap smear? What was the result? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 50 | 女性健康 / Female health | `pap_smear_timing` | 您最近一次子宮頸抹片檢查是在什麼時候？ | When was your most recent Pap smear? | `code` | 是 / Yes | 女性且年齡≥18 / Female and age>=18 |
| 51 | 女性健康 / Female health | `hormone_medication` | 過去是否曾使用賀爾蒙藥物？ | Have you ever used hormone medication? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 52 | 女性健康 / Female health | `benign_gynae_disease` | 醫師是否曾診斷您有子宮肌瘤、卵巢囊腫、子宮內膜異位或其他婦科良性疾病？ | Has a clinician ever diagnosed you with uterine fibroids, an ovarian cyst, endometriosis, or another benign gynecological condition? | `code` | 是 / Yes | 僅女性 / Female only |
| 53 | 生活與環境暴露 / Lifestyle and environmental exposure | `smoking_ever` | 是否有抽菸習慣（現在或過去）？ | Have you ever had a smoking habit (currently or in the past)? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 54 | 生活與環境暴露 / Lifestyle and environmental exposure | `smoking_quit` | 若有抽菸習慣，是否已戒菸？ | If you have smoked, have you quit? | `code` | 否 / No | 僅抽菸經驗=是 / Show only when smoking_ever=yes |
| 55 | 生活與環境暴露 / Lifestyle and environmental exposure | `secondhand_smoke` | 是否長期處在二手菸的生活或工作環境？ | Have you been in a long-term secondhand smoke environment at home or work? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 56 | 生活與環境暴露 / Lifestyle and environmental exposure | `betel_nut` | 是否有嚼檳榔習慣（現在或過去）？ | Have you ever had a betel nut chewing habit (currently or in the past)? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 57 | 生活與環境暴露 / Lifestyle and environmental exposure | `cooking_fume` | 工作或生活環境是否經常接觸油煙？ | Are you often exposed to cooking fumes at work or in daily life? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 58 | 生活與環境暴露 / Lifestyle and environmental exposure | `cooking_frequency` | 每週平均烹調次數 | Average weekly cooking frequency | `code` | 否 / No | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 59 | 生活與環境暴露 / Lifestyle and environmental exposure | `air_pollution` | 工作或生活是否長期暴露在空氣污染環境？ | Are you chronically exposed to air pollution at work or in daily life? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 60 | 生活與環境暴露 / Lifestyle and environmental exposure | `radiation` | 工作或生活是否常接觸輻射？ | Are you often exposed to radiation at work or in daily life? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 61 | 心理健康 / Mental health | `stress` | 過去一個月，每週感到緊張或焦慮的頻率 | In the past month, how often did you feel tense or anxious each week? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 62 | 心理健康 / Mental health | `sleep_problem` | 過去一個月，每週睡不好或失眠的頻率 | In the past month, how often did you sleep poorly or have insomnia each week? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 63 | 心理健康 / Mental health | `low_mood` | 過去一個月，每週情緒低落或憂鬱的頻率 | In the past month, how often did you feel low or depressed each week? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 64 | 飲食習慣 / Diet | `diet_type` | 以下哪一項最接近您平常的飲食方式？ | Which option best describes your usual dietary pattern? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 65 | 飲食習慣 / Diet | `meat_processed_foods` | 肉類、加工及高溫烹調食物 | Meat, processed foods, and high-temperature cooking | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 66 | 飲食習慣 / Diet | `sugar_fat_foods` | 高糖與高脂食物 | High-sugar and high-fat foods | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 67 | 飲食習慣 / Diet | `plant_dairy_habits` | 蔬果、豆類與乳製品 | Fruit, vegetables, soy, and dairy | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 68 | 飲食習慣 / Diet | `beverage_habits` | 飲品習慣 | Beverage habits | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 69 | 病史與家族史 / Medical and family history | `personal_cancer` | 您目前是否正在罹患癌症，或過去曾被診斷為癌症？ | Are you currently living with cancer, or have you ever been diagnosed with cancer in the past? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 70 | 病史與家族史 / Medical and family history | `personal_cancer_types` | 目前或過去曾被診斷的癌別為何？ | What type of cancer are you currently living with, or have you been diagnosed with in the past? | `code_array` | 是 / Yes | 僅目前或過去曾罹癌 / Show only when personal_cancer is positive |
| 71 | 病史與家族史 / Medical and family history | `chronic_conditions` | 是否有以下慢性疾病？ | Do you have any of the following chronic diseases? | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 72 | 病史與家族史 / Medical and family history | `liver_disease_etiology` | 您曾被診斷的肝病種類為何？ | Which liver condition were you diagnosed with? | `code_array` | 是 / Yes | 僅勾選肝病 / Show only when liver disease is selected |
| 73 | 病史與家族史 / Medical and family history | `vnext_diagnosed_conditions` | 是否曾有以下經醫療人員確認的病史或事件？ | Have you had any of the following clinician-confirmed conditions or events? | `code_array` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 74 | 病史與家族史 / Medical and family history | `orchitis_epididymitis` | 醫師是否曾診斷您有睪丸炎或副睪炎？ | Has a clinician ever diagnosed you with orchitis or epididymitis? | `code` | 是 / Yes | 僅男性 / Male only |
| 75 | 病史與家族史 / Medical and family history | `psa_history` | 您過去是否做過 PSA（攝護腺特異抗原）檢查？結果是否曾被告知偏高？ | Have you previously had a PSA (prostate-specific antigen) test, and were you told that the result was elevated? | `code` | 是 / Yes | 男性且年齡≥50 / Male and age>=50 |
| 76 | 病史與家族史 / Medical and family history | `family_cancer` | 家族成員（一等親內）是否有癌症史？ | Has any first-degree family member had cancer? | `code` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |
| 77 | 病史與家族史 / Medical and family history | `family_self_types` | 承上題，若有家族成員（一等親內）癌症史，請列出是什麼癌症？ | If yes, what type of cancer did your first-degree family member have? | `code_array` | 否 / No | 僅一等親有癌症史 / Show only when family_cancer=yes |
| 78 | 報告聯絡 / Report contact | `email` | 請填寫您的 Email | Please enter your email | `string` | 是 / Yes | 無，或依所屬性別路徑 / Always, or according to the sex-specific path |

## 選項與穩定代碼

### consent_acknowledgement

- 在開始填寫前，請確認您已閱讀並同意以下事項
- Before starting, please confirm that you have read and agree to the following items

| code | 中文 | English |
|---|---|---|
| `data_use` | 我已閱讀並了解資料使用說明，同意愛立基生醫股份有限公司依上述目的，以去識別化方式處理我的問卷與健康資料，並使用我提供的 Email 寄送結果報告。 | I have read and understood the data use notice. I consent to EG BioMed Co. Ltd. processing my questionnaire and health data in de-identified form for the purposes stated above and using my email address to send my result report. |
| `model_limitations` | 我了解本評估結果的準確度受限於數據庫與演算法，若風險不高不代表沒有風險，若風險較高也不代表已罹病。 | I understand that the accuracy of this assessment is limited by the database and algorithm. A lower risk does not mean no risk, and a higher risk does not mean I have cancer. |
| `non_medical_use` | 我了解本服務僅提供癌症相關風險因子的個人化整理與健康教育資訊；結果不代表罹患癌症的機率，不用於癌症診斷、篩檢、早期偵測、疾病預測或治療決策，亦不能取代醫師評估或任何標準醫療檢查。 | I understand that this service only provides personalized organization of cancer-related risk factors and health education information. The result does not represent the probability of developing cancer, is not used for cancer diagnosis, screening, early detection, disease prediction, or treatment decision-making, and cannot replace a physician’s evaluation or any standard medical examination. |

### weight_change

- 近半年內，您的體重是否有明顯增加或減少（超過體重 5%）？
- In the past six months, has your weight increased or decreased significantly (more than 5%)?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

### exercise_time

- 每週運動時間
- Weekly exercise time

| code | 中文 | English |
|---|---|---|
| `exercise_time.option_01` | 幾乎不運動 | Almost no exercise |
| `exercise_time.option_02` | 30-60 分鐘 | 30-60 minutes |
| `exercise_time.option_03` | 1-2 小時 | 1-2 hours |
| `exercise_time.option_04` | 多於 2 小時 | More than 2 hours |

### sex

- 您的性別？
- What is your sex?

| code | 中文 | English |
|---|---|---|
| `sex.option_01` | 男性 | Male |
| `sex.option_02` | 女性 | Female |

### symptoms_general

- 全身性症狀
- General Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_unexplained_weight_loss_6m` | 不明原因體重下降（過去 6 個月超過體重 5%） | Unexplained weight loss of more than 5% in the past 6 months |
| `symptom_fatigue` | 經常疲倦或體力明顯下降（非因工作或睡眠不足） | Frequent fatigue or a marked decline in energy not explained by work or lack of sleep |
| `symptom_appetite_loss` | 食慾降低或食量明顯減少 | Reduced appetite or a noticeable decrease in food intake |
| `symptom_anemia` | 曾被診斷貧血，或近期抽血發現血色素偏低 | Diagnosed anemia or a recent blood test showing low hemoglobin |
| `symptom_night_sweats` | 夜間盜汗（非因環境過熱或更年期） | Night sweats not explained by a hot environment or menopause |
| `symptom_unexplained_fever` | 不明原因發燒（體溫超過 38°C，持續超過 1 週） | Unexplained fever above 38°C lasting more than 1 week |
| `symptom_mass` | 最近 6 個月內，身體任何部位新出現原因不明的腫塊（包含腋下、腹股溝、四肢或其他部位） | A new unexplained lump anywhere on the body during the past 6 months, including the armpit, groin, limbs, or another area |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_upper_digestive

- 上消化道症狀
- Upper Digestive Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_early_satiety` | 容易過早飽足（吃少量就飽） | Early satiety after eating only a small amount |
| `symptom_upper_abdominal_discomfort` | 上腹部悶脹或不適 | Upper abdominal pressure or discomfort |
| `symptom_epigastric_pain` | 上腹部疼痛 | Pain localized to the upper abdomen |
| `symptom_dyspepsia` | 消化不良（餐後脹、噯氣或胃部不舒服） | Indigestion, such as post-meal fullness, belching, or stomach discomfort |
| `symptom_nausea` | 噁心感（非懷孕或暈車引起） | Nausea not caused by pregnancy or motion sickness |
| `symptom_reflux` | 胃酸逆流到喉嚨或口中 | Stomach acid coming back into the throat or mouth |
| `symptom_heartburn` | 胸口或上腹有灼熱感（火燒心） | A burning sensation in the chest or upper abdomen (heartburn) |
| `symptom_dysphagia` | 吞嚥困難、吞嚥疼痛或食物卡住感 | Difficulty or pain when swallowing, or a feeling that food is stuck |
| `symptom_hematemesis` | 吐血或嘔吐物呈咖啡渣樣 | Vomiting blood or coffee-ground-like material |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_bowel_abdominal

- 腸道與下腹部症狀
- Bowel and Lower Abdominal Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_bloating` | 經常腹脹 | Frequent abdominal bloating |
| `symptom_persistent_abdominal_pain` | 持續腹痛 | Persistent abdominal pain |
| `symptom_bowel_habit_change` | 排便習慣改變（腹瀉與便秘交替，或糞便持續變細） | Change in bowel habits, alternating diarrhea and constipation, or persistently narrow stools |
| `symptom_hematochezia` | 血便（鮮紅色血液） | Bright red blood in the stool |
| `symptom_melena` | 黑便（柏油狀、黑色糞便） | Black, tarry stools |
| `symptom_tenesmus` | 頻繁想排便但感覺排不乾淨（裡急後重） | Frequent urge to have a bowel movement with incomplete emptying |
| `symptom_abnormal_fobt` | 糞便潛血檢查曾發現異常 | Previous abnormal fecal occult blood test |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_hepatobiliary

- 肝膽胰症狀
- Liver, Biliary, and Pancreatic Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_jaundice` | 黃疸（皮膚或眼白變黃） | Jaundice, with yellowing of the skin or whites of the eyes |
| `symptom_pruritus` | 皮膚搔癢（非皮膚疾病引起） | Itchy skin not explained by a skin condition |
| `symptom_dark_urine` | 尿液顏色明顯變深（如濃茶色） | Noticeably dark urine, such as tea-colored urine |
| `symptom_pale_stool` | 糞便顏色變淺或呈灰白色 | Pale or grayish stools |
| `symptom_right_upper_abdominal_discomfort` | 右上腹不適或悶痛 | Discomfort or dull pain in the right upper abdomen |
| `symptom_recent_diabetes_diagnosis` | 過去 2 年內才被診斷糖尿病 | Diabetes newly diagnosed within the past 2 years |
| `symptom_worsening_diabetes_control` | 已有糖尿病，但血糖控制突然變差 | Sudden worsening of blood glucose control in existing diabetes |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_respiratory

- 呼吸系統症狀
- Respiratory Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_persistent_cough` | 持續咳嗽超過 3 週（非感冒引起） | Cough lasting more than 3 weeks and not caused by a cold |
| `symptom_hemoptysis` | 咳血或痰中帶血 | Coughing up blood or blood-streaked sputum |
| `symptom_recurrent_pneumonia` | 一年內反覆發生肺炎 2 次以上 | Pneumonia occurring 2 or more times within 1 year |
| `symptom_chest_pain` | 持續胸痛或胸悶 | Persistent chest pain or tightness |
| `symptom_shortness_of_breath` | 最近 6 個月內曾出現呼吸喘、呼吸急促或比平常更容易喘 | Shortness of breath, rapid breathing, or becoming breathless more easily than usual during the past 6 months |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_breast

- 乳房症狀
- Breast Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_breast_lump` | 乳房腫塊或局部硬塊 | A breast lump or localized hard area |
| `symptom_nipple_retraction` | 新發生的乳頭凹陷（非天生） | New nipple retraction that was not present from birth |
| `symptom_nipple_discharge` | 乳頭異常分泌物（尤其是血性分泌物） | Abnormal nipple discharge, especially bloody discharge |
| `symptom_breast_skin_change` | 乳房皮膚橘皮樣變化或局部凹陷 | Orange-peel-like breast skin changes or localized dimpling |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_urinary

- 泌尿系統症狀
- Urinary Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_urinary_frequency` | 頻尿（白天排尿超過 8 次） | Frequent urination, more than 8 times during the day |
| `symptom_nocturia` | 夜尿增加（晚上起床排尿超過 2 次） | Increased nighttime urination, more than 2 times per night |
| `symptom_weak_urine_stream` | 尿流變細或排尿無力 | Weak or narrowed urine stream |
| `symptom_urinary_hesitancy` | 排尿困難（需用力才能排出） | Difficulty urinating or needing to strain |
| `symptom_interrupted_urine_flow` | 排尿中斷（排尿時尿流突然停止） | Interrupted urine flow |
| `symptom_hematuria_visible` | 肉眼可見尿液呈紅色、粉紅色或帶血 | Visible red, pink, or blood-stained urine |
| `symptom_hematuria` | 尿液外觀看不出血，但尿液檢查曾發現潛血 | Blood found on a urine test without visible blood |
| `symptom_dysuria` | 排尿疼痛或有灼熱感 | Pain or burning when urinating |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_male_reproductive

- 男性生殖系統症狀
- Male Reproductive Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_testicular_lump` | 睪丸摸到腫塊或硬塊 | A lump or hard area felt in a testicle |
| `symptom_testicular_swelling` | 單側或雙側睪丸明顯腫大 | Noticeable swelling of one or both testicles |
| `symptom_scrotal_swelling` | 陰囊明顯腫大 | Noticeable swelling of the scrotum |
| `symptom_testicular_pain` | 睪丸疼痛或沉重感 | Testicular pain or a feeling of heaviness |
| `symptom_groin_pain` | 腹股溝持續或反覆疼痛 | Persistent or recurrent groin pain |
| `symptom_urinary_retention` | 曾突然完全無法排尿，需要就醫處理 | A sudden complete inability to urinate that required medical care |
| `symptom_impotence` | 新發生或明顯惡化的勃起功能障礙 | New or clearly worsened erectile dysfunction |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_gynecological

- 婦科相關症狀
- Gynecological Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_postcoital_bleeding` | 性交後出血 | Bleeding after sexual intercourse |
| `symptom_intermenstrual_bleeding` | 兩次月經之間出血 | Bleeding between menstrual periods |
| `symptom_abnormal_vaginal_bleeding` | 其他月經以外的異常陰道出血 | Other abnormal vaginal bleeding outside menstruation |
| `symptom_postmenopausal_bleeding` | 停經後陰道出血 | Vaginal bleeding after menopause |
| `symptom_heavy_irregular_menstruation` | 月經異常增多或不規則出血 | Unusually heavy menstruation or irregular bleeding |
| `symptom_abnormal_vaginal_discharge` | 持續或反覆的異常陰道分泌物 | Persistent or recurrent abnormal vaginal discharge |
| `symptom_pelvic_pain` | 持續或反覆的骨盆腔疼痛 | Persistent or recurrent pelvic pain |
| `symptom_pelvic_discomfort_or_increased_girth` | 骨盆腔不適或腹圍明顯增加 | Pelvic discomfort or a noticeable increase in abdominal girth |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_oral_throat

- 口腔與喉嚨症狀
- Oral and Throat Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_oral_ulcer` | 口腔潰瘍超過 2 週未癒合 | An oral ulcer that has not healed after more than 2 weeks |
| `symptom_hoarseness` | 持續聲音沙啞超過 3 週（非感冒引起） | Hoarseness lasting more than 3 weeks and not caused by a cold |
| `symptom_oral_white_red_patch` | 口腔白斑或紅斑 | A white or red patch in the mouth |
| `symptom_sore_throat` | 持續或反覆喉嚨痛（非一般感冒） | Persistent or recurrent sore throat not explained by a common cold |
| `symptom_otalgia` | 持續或反覆耳痛，且耳部檢查沒有明確原因 | Persistent or recurrent ear pain without a clear ear-related cause |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_head_neck_nasal

- 頭頸與鼻部症狀
- Head, Neck, and Nasal Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_neck_lump` | 頸部摸得到腫塊或硬塊 | A palpable lump or hard mass in the neck |
| `symptom_head_neck_mass` | 頭部、臉部或頸部出現新的腫塊 | A new mass in the head, face, or neck |
| `symptom_nasal_mass` | 鼻腔內或鼻部出現腫塊 | A mass in or around the nose |
| `symptom_nasal_discharge` | 持續、反覆或單側鼻塞／鼻漏 | Persistent, recurrent, or one-sided nasal blockage or discharge |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_neurological

- 神經系統症狀
- Neurological Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_new_headache` | 新發生的持續頭痛（非過去的偏頭痛模式） | A new persistent headache that differs from a previous migraine pattern |
| `symptom_seizure` | 新發生的癲癇或抽搐 | A new seizure or convulsion |
| `symptom_visual_change` | 視力模糊或視野缺損（非近視或老花） | Blurred vision or visual field loss not explained by myopia or presbyopia |
| `symptom_limb_weakness_numbness` | 肢體無力或麻木 | Weakness or numbness in an arm or leg |
| `symptom_personality_memory_change` | 人格改變或記憶力明顯衰退 | Personality change or a marked decline in memory |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### symptoms_bone_hematologic

- 骨骼、血液與淋巴症狀
- Bone, Blood, and Lymphatic Symptoms

| code | 中文 | English |
|---|---|---|
| `symptom_persistent_back_pain` | 持續背痛（非外傷或肌肉引起） | Persistent back pain not explained by injury or muscle strain |
| `symptom_rib_pain` | 持續或反覆的肋骨疼痛 | Persistent or recurrent rib pain |
| `symptom_bone_pain_other` | 其他部位持續或反覆的骨骼疼痛 | Persistent or recurrent bone pain elsewhere |
| `symptom_joint_pain` | 持續或反覆的關節疼痛，且原因不明 | Persistent or recurrent unexplained joint pain |
| `symptom_nosebleeds` | 反覆或原因不明的鼻出血 | Recurrent or unexplained nosebleeds |
| `symptom_recurrent_infection` | 一年內反覆感染 3 次以上，或感染久久不癒 | Repeated infections 3 or more times within 1 year, or an infection that does not resolve |
| `symptom_easy_bruising_bleeding` | 容易瘀青或異常出血（小傷口出血久不止） | Easy bruising or unusual bleeding, including prolonged bleeding from a small wound |
| `symptom_lymphadenopathy` | 淋巴結腫大（頸部、腋下或鼠蹊部腫塊） | Enlarged lymph nodes or lumps in the neck, armpit, or groin |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### stool_loose_or_frequent

- 最近 6 個月內，排便習慣改變時，是否主要是大便變稀或排便次數變多？
- During the past 6 months, when your bowel habits changed, did you mainly have looser stools or more frequent bowel movements?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

### mastalgia

- 最近 6 個月內，您的乳房是否曾有疼痛或脹痛？
- During the past 6 months, have you had breast pain or tenderness?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

### constipation

- 最近 6 個月內，您是否曾有便秘，例如排便困難或排便次數減少？
- During the past 6 months, have you had constipation, such as difficulty passing stool or fewer bowel movements?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

### testicular_pain_pattern

- 睪丸疼痛發生的情況
- Pattern of testicular pain

| code | 中文 | English |
|---|---|---|
| `testicular_pain_pattern.option_01` | 僅發生 1 次 | Occurred once |
| `testicular_pain_pattern.option_02` | 反覆發生 2 次以上 | Occurred 2 or more times |
| `testicular_pain_pattern.option_03` | 持續存在 | Persisted continuously |
| `unknown` | 不確定 | Not sure |

### menarche_age

- 初經（第一次月經）來潮年齡
- Age at first menstruation

| code | 中文 | English |
|---|---|---|
| `menarche_age.option_01` | 12 歲以前（含 12 歲） | Age 12 or younger |
| `menarche_age.option_02` | 13 歲以後（含 13 歲） | Age 13 or older |

### menopause_status

- 目前停經（更年期）狀態
- Current menopause status

| code | 中文 | English |
|---|---|---|
| `menopause_status.option_01` | 尚未停經（仍有月經） | Not menopausal (still menstruating) |
| `menopause_status.option_02` | 已停經（55 歲或以前停經） | Menopause at age 55 or earlier |
| `menopause_status.option_03` | 已停經（55 歲或以後停經） | Menopause after age 55 |
| `menopause_status.option_04` | 已切除子宮或卵巢 | Uterus or ovaries removed |

### first_pregnancy_age

- 第一胎懷孕年齡
- Age at first pregnancy

| code | 中文 | English |
|---|---|---|
| `first_pregnancy_age.option_01` | 從未懷孕 | Never pregnant |
| `first_pregnancy_age.option_02` | 20 歲以下 | Age 20 or younger |
| `first_pregnancy_age.option_03` | 20-30 歲 | Age 20-30 |
| `first_pregnancy_age.option_04` | 31-35 歲 | Age 31-35 |
| `first_pregnancy_age.option_05` | 36 歲以上 | Age 36 or older |

### breastfeeding

- 產後是否曾哺餵母乳？若有，哺乳時間多長？
- Have you breastfed after childbirth? If yes, for how long?

| code | 中文 | English |
|---|---|---|
| `breastfeeding.option_01` | 從未哺乳 | Never breastfed |
| `breastfeeding.option_02` | 有哺乳，但少於 6 個月 | Breastfed, less than 6 months |
| `breastfeeding.option_03` | 有哺乳，超過 6 個月（含 6 個月） | Breastfed, 6 months or longer |
| `breastfeeding.option_04` | 尚未生產，此題不適用 | Not applicable, have not given birth |

### pap_smear

- 是否曾做過子宮頸抹片檢查？結果如何？
- Have you ever had a Pap smear? What was the result?

| code | 中文 | English |
|---|---|---|
| `pap_smear.option_01` | 是，歷次結果均正常 | Yes, all previous results were normal |
| `pap_smear.option_02` | 是，曾有異常報告（如 CIN、HPV 陽性等） | Yes, had an abnormal report (such as CIN or HPV positive) |
| `pap_smear.option_03` | 否，從未做過 | No, never had one |

### pap_smear_timing

- 您最近一次子宮頸抹片檢查是在什麼時候？
- When was your most recent Pap smear?

| code | 中文 | English |
|---|---|---|
| `pap_smear_timing.option_01` | 3 年內 | Within the past 3 years |
| `pap_smear_timing.option_02` | 3 年以上 | More than 3 years ago |
| `pap_smear_timing.option_03` | 從未做過 | Never |
| `unknown` | 不記得 | I do not remember |

### hormone_medication

- 過去是否曾使用賀爾蒙藥物？
- Have you ever used hormone medication?

| code | 中文 | English |
|---|---|---|
| `hormone_medication.option_01` | 是，使用超過 1 年 | Yes, used for more than 1 year |
| `hormone_medication.option_02` | 是，使用不到 1 年 | Yes, used for less than 1 year |
| `hormone_medication.option_03` | 否，從未使用 | No, never used |

### benign_gynae_disease

- 醫師是否曾診斷您有子宮肌瘤、卵巢囊腫、子宮內膜異位或其他婦科良性疾病？
- Has a clinician ever diagnosed you with uterine fibroids, an ovarian cyst, endometriosis, or another benign gynecological condition?

| code | 中文 | English |
|---|---|---|
| `benign_gynae_disease.option_01` | 是，曾由醫師診斷 | Yes, diagnosed by a clinician |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

### smoking_ever

- 是否有抽菸習慣（現在或過去）？
- Have you ever had a smoking habit (currently or in the past)?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

### smoking_quit

- 若有抽菸習慣，是否已戒菸？
- If you have smoked, have you quit?

| code | 中文 | English |
|---|---|---|
| `smoking_quit.option_01` | 是，已戒菸 | Yes, quit smoking |
| `smoking_quit.option_02` | 否，仍在抽菸 | No, still smoking |

### secondhand_smoke

- 是否長期處在二手菸的生活或工作環境？
- Have you been in a long-term secondhand smoke environment at home or work?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

### betel_nut

- 是否有嚼檳榔習慣（現在或過去）？
- Have you ever had a betel nut chewing habit (currently or in the past)?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

### cooking_fume

- 工作或生活環境是否經常接觸油煙？
- Are you often exposed to cooking fumes at work or in daily life?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

### cooking_frequency

- 每週平均烹調次數
- Average weekly cooking frequency

| code | 中文 | English |
|---|---|---|
| `cooking_frequency.option_01` | 少於一次 | Less than once |
| `cooking_frequency.option_02` | 每週 1-3 次 | 1-3 times per week |
| `cooking_frequency.option_03` | 每週 4-6 次 | 4-6 times per week |
| `cooking_frequency.option_04` | 每週 6 次以上 | 6 or more times per week |

### air_pollution

- 工作或生活是否長期暴露在空氣污染環境？
- Are you chronically exposed to air pollution at work or in daily life?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

### radiation

- 工作或生活是否常接觸輻射？
- Are you often exposed to radiation at work or in daily life?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

### stress

- 過去一個月，每週感到緊張或焦慮的頻率
- In the past month, how often did you feel tense or anxious each week?

| code | 中文 | English |
|---|---|---|
| `stress.option_01` | 不到 1 天 | Less than 1 day |
| `stress.option_02` | 2-3 天 | 2-3 days |
| `stress.option_03` | 4-5 天 | 4-5 days |
| `stress.option_04` | 幾乎每天 | Almost every day |

### sleep_problem

- 過去一個月，每週睡不好或失眠的頻率
- In the past month, how often did you sleep poorly or have insomnia each week?

| code | 中文 | English |
|---|---|---|
| `sleep_problem.option_01` | 不到 1 天 | Less than 1 day |
| `sleep_problem.option_02` | 2-3 天 | 2-3 days |
| `sleep_problem.option_03` | 4-5 天 | 4-5 days |
| `sleep_problem.option_04` | 幾乎每天 | Almost every day |

### low_mood

- 過去一個月，每週情緒低落或憂鬱的頻率
- In the past month, how often did you feel low or depressed each week?

| code | 中文 | English |
|---|---|---|
| `low_mood.option_01` | 不到 1 天 | Less than 1 day |
| `low_mood.option_02` | 2-3 天 | 2-3 days |
| `low_mood.option_03` | 4-5 天 | 4-5 days |
| `low_mood.option_04` | 幾乎每天 | Almost every day |

### diet_type

- 以下哪一項最接近您平常的飲食方式？
- Which option best describes your usual dietary pattern?

| code | 中文 | English |
|---|---|---|
| `diet_type.option_01` | 一般飲食（平常會吃肉類或海鮮） | General diet (usually includes meat or seafood) |
| `diet_type.option_02` | 蔬食為主（主要吃植物性食物，但仍會吃肉類或海鮮） | Mostly plant-based (still includes meat or seafood) |
| `diet_type.option_03` | 魚素（不吃肉類，但會吃魚類或海鮮） | Pescatarian (no meat, but includes fish or seafood) |
| `diet_type.option_04` | 蛋奶素（不吃肉類及海鮮，但會吃蛋或乳製品） | Ovo-lacto vegetarian (no meat or seafood, but includes eggs or dairy) |
| `diet_type.option_05` | 全素（不吃肉類、海鮮、蛋及乳製品） | Vegan (no meat, seafood, eggs, or dairy) |

### meat_processed_foods

- 肉類、加工及高溫烹調食物
- Meat, processed foods, and high-temperature cooking

| code | 中文 | English |
|---|---|---|
| `meat_processed_foods.option_01` | 紅肉（牛、羊、豬等；平均每週至少 3 次） | Red meat (beef, lamb, pork, etc.; at least 3 times per week on average) |
| `meat_processed_foods.option_02` | 燒烤或油炸食品（平均每週至少 3 次） | Grilled or fried foods (at least 3 times per week on average) |
| `meat_processed_foods.option_03` | 醃漬或鹽漬食品（例如泡菜、鹹魚；平均每週至少 3 次） | Pickled or salted foods (such as kimchi or salted fish; at least 3 times per week on average) |
| `meat_processed_foods.option_04` | 加工肉品（例如香腸、火腿、培根；平均每週至少 3 次） | Processed meat (such as sausage, ham, or bacon; at least 3 times per week on average) |
| `none` | 以上皆未達每週 3 次 | None of the above reached 3 times per week |

### sugar_fat_foods

- 高糖與高脂食物
- High-sugar and high-fat foods

| code | 中文 | English |
|---|---|---|
| `sugar_fat_foods.option_01` | 甜食或高糖零食（平均每週至少 3 次） | Sweets or high-sugar snacks (at least 3 times per week on average) |
| `sugar_fat_foods.option_02` | 含糖飲料（平均每週至少 3 次） | Sugary drinks (at least 3 times per week on average) |
| `sugar_fat_foods.option_03` | 高脂肪食物（例如速食、肥肉；平均每週至少 3 次） | High-fat foods (such as fast food or fatty meat; at least 3 times per week on average) |
| `none` | 以上皆未達每週 3 次 | None of the above reached 3 times per week |

### plant_dairy_habits

- 蔬果、豆類與乳製品
- Fruit, vegetables, soy, and dairy

| code | 中文 | English |
|---|---|---|
| `plant_dairy_habits.option_01` | 每天攝取蔬菜或水果 | Eat vegetables or fruit every day |
| `plant_dairy_habits.option_02` | 豆類或豆製品每週至少 3 次 | Soybeans or soy products at least 3 times per week |
| `plant_dairy_habits.option_03` | 每天飲用至少一杯 240 ml 牛奶 | At least one 240 ml cup of milk every day |
| `plant_dairy_habits.option_04` | 其他乳製品每週至少 3 次（例如優格、起司） | Other dairy products at least 3 times per week (such as yogurt or cheese) |
| `plant_dairy_habits.option_05` | 益生菌食品或補充品每週至少 3 次（例如標示含活菌的優格、發酵乳或乳酸菌飲品，以及益生菌粉包、膠囊） | Probiotic foods or supplements at least 3 times per week (such as yogurt labeled with live cultures, fermented milk or probiotic drinks, and probiotic powder sachets or capsules) |
| `none` | 以上皆無 | None of the above |

### beverage_habits

- 飲品習慣
- Beverage habits

| code | 中文 | English |
|---|---|---|
| `beverage_habits.option_01` | 飲酒（每週至少一次） | Alcohol (at least once per week) |
| `beverage_habits.option_02` | 咖啡（每週至少 3 次） | Coffee (at least 3 times per week) |
| `beverage_habits.option_03` | 茶（每週至少 3 次） | Tea (at least 3 times per week) |
| `none` | 以上皆無 | None of the above |

### personal_cancer

- 您目前是否正在罹患癌症，或過去曾被診斷為癌症？
- Are you currently living with cancer, or have you ever been diagnosed with cancer in the past?

| code | 中文 | English |
|---|---|---|
| `personal_cancer.option_01` | 是，目前正在治療或追蹤中 | Yes, currently under treatment or follow-up |
| `personal_cancer.option_02` | 是，過去曾被診斷，目前已完成治療或追蹤 | Yes, diagnosed in the past; treatment or follow-up has been completed |
| `personal_cancer.option_03` | 否，未曾被診斷為癌症 | No, never diagnosed with cancer |

### personal_cancer_types

- 目前或過去曾被診斷的癌別為何？
- What type of cancer are you currently living with, or have you been diagnosed with in the past?

| code | 中文 | English |
|---|---|---|
| `personal_cancer_types.option_01` | 乳癌 | Breast cancer |
| `personal_cancer_types.option_02` | 攝護腺癌 | Prostate cancer |
| `personal_cancer_types.option_03` | 肺癌 | Lung cancer |
| `personal_cancer_types.option_04` | 頭頸癌 | Head and neck cancer |
| `personal_cancer_types.option_05` | 胰臟癌 | Pancreatic cancer |
| `personal_cancer_types.option_06` | 肝癌 | Liver cancer |
| `personal_cancer_types.option_07` | 大腸直腸癌 | Colorectal cancer |
| `personal_cancer_types.option_08` | 胃癌 | Stomach cancer |
| `personal_cancer_types.option_09` | 子宮內膜癌 | Endometrial cancer |
| `personal_cancer_types.option_10` | 膀胱癌 | Bladder cancer |
| `personal_cancer_types.option_11` | 腎癌 | Kidney cancer |
| `personal_cancer_types.option_12` | 其他癌種 | Other cancer type |

### chronic_conditions

- 是否有以下慢性疾病？
- Do you have any of the following chronic diseases?

| code | 中文 | English |
|---|---|---|
| `chronic_conditions.option_01` | 高血壓 | Hypertension |
| `chronic_conditions.option_02` | 糖尿病／高血糖 | Diabetes / high blood glucose |
| `chronic_conditions.option_03` | 高血脂／高膽固醇 | Hyperlipidemia / high cholesterol |
| `chronic_conditions.option_04` | 肝病（B 型肝炎／C 型肝炎／肝硬化） | Liver disease (HBV / HCV / cirrhosis) |
| `chronic_conditions.option_05` | 胃食道逆流 | Gastroesophageal reflux disease |
| `chronic_conditions.option_06` | 心臟病／心律不整 | Heart disease / arrhythmia |
| `chronic_conditions.option_07` | 甲狀腺疾病 | Thyroid disease |
| `chronic_conditions.option_08` | 氣喘／慢性肺阻塞（COPD） | Asthma / COPD |
| `chronic_conditions.option_09` | 痛風／高尿酸 | Gout / high uric acid |
| `chronic_conditions.option_10` | 關節炎（含類風濕性） | Arthritis (including rheumatoid arthritis) |
| `chronic_conditions.option_11` | 憂鬱症／焦慮症 | Depression / anxiety |
| `chronic_conditions.option_12` | 中風病史 | History of stroke |
| `chronic_conditions.option_13` | 腎臟病／洗腎 | Kidney disease / dialysis |
| `chronic_conditions.option_14` | 自體免疫疾病（乾燥症、紅斑性狼瘡等） | Autoimmune disease |
| `none` | 以上皆無 | None of the above |
| `chronic_conditions.option_16` | 其他慢性疾病 | Other chronic disease |

### liver_disease_etiology

- 您曾被診斷的肝病種類為何？
- Which liver condition were you diagnosed with?

| code | 中文 | English |
|---|---|---|
| `liver_disease_etiology.option_01` | B 型肝炎 | Hepatitis B |
| `liver_disease_etiology.option_02` | C 型肝炎 | Hepatitis C |
| `liver_disease_etiology.option_03` | 肝硬化 | Cirrhosis |
| `liver_disease_etiology.option_04` | 代謝功能障礙相關脂肪性肝病（MASLD） | Metabolic dysfunction-associated steatotic liver disease (MASLD) |
| `liver_disease_etiology.option_05` | 酒精性肝病 | Alcohol-related liver disease |
| `liver_disease_etiology.option_06` | 其他肝病 | Other liver disease |
| `none` | 不確定肝病種類 | Not sure of the liver disease type |

### vnext_diagnosed_conditions

- 是否曾有以下經醫療人員確認的病史或事件？
- Have you had any of the following clinician-confirmed conditions or events?

| code | 中文 | English |
|---|---|---|
| `vnext_diagnosed_conditions.option_01` | 過去 12 個月內曾發生骨折 | A fracture during the past 12 months |
| `vnext_diagnosed_conditions.option_02` | 曾由醫師診斷深層靜脈栓塞或肺栓塞（DVT／PE） | A clinician-diagnosed deep vein thrombosis or pulmonary embolism (DVT/PE) |
| `vnext_diagnosed_conditions.option_03` | 曾由牙醫或醫師診斷口腔黏膜下纖維化 | Oral submucous fibrosis diagnosed by a dentist or physician |
| `vnext_diagnosed_conditions.option_04` | 曾由醫師診斷慢性胰臟炎 | Chronic pancreatitis diagnosed by a clinician |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

### orchitis_epididymitis

- 醫師是否曾診斷您有睪丸炎或副睪炎？
- Has a clinician ever diagnosed you with orchitis or epididymitis?

| code | 中文 | English |
|---|---|---|
| `orchitis_epididymitis.option_01` | 是，曾由醫師診斷 | Yes, diagnosed by a clinician |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

### psa_history

- 您過去是否做過 PSA（攝護腺特異抗原）檢查？結果是否曾被告知偏高？
- Have you previously had a PSA (prostate-specific antigen) test, and were you told that the result was elevated?

| code | 中文 | English |
|---|---|---|
| `psa_history.option_01` | 做過且曾被告知偏高 | Tested and was told the result was elevated |
| `psa_history.option_02` | 做過且結果正常 | Tested and the result was normal |
| `psa_history.option_03` | 沒做過 | Never tested |
| `unknown` | 不記得 | I do not remember |

### family_cancer

- 家族成員（一等親內）是否有癌症史？
- Has any first-degree family member had cancer?

| code | 中文 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不清楚 | Not sure |

### family_self_types

- 承上題，若有家族成員（一等親內）癌症史，請列出是什麼癌症？
- If yes, what type of cancer did your first-degree family member have?

| code | 中文 | English |
|---|---|---|
| `family_self_types.option_01` | 乳癌 | Breast cancer |
| `family_self_types.option_02` | 攝護腺癌 | Prostate cancer |
| `family_self_types.option_03` | 肺癌 | Lung cancer |
| `family_self_types.option_04` | 頭頸癌 | Head and neck cancer |
| `family_self_types.option_05` | 胰臟癌 | Pancreatic cancer |
| `family_self_types.option_06` | 肝癌 | Liver cancer |
| `family_self_types.option_07` | 大腸直腸癌 | Colorectal cancer |
| `family_self_types.option_08` | 胃癌 | Stomach cancer |
| `family_self_types.option_09` | 子宮內膜癌 | Endometrial cancer |
| `family_self_types.option_10` | 膀胱癌 | Bladder cancer |
| `family_self_types.option_11` | 腎癌 | Kidney cancer |
| `family_self_types.option_12` | 其他癌種 | Other cancer type |

## 分流與缺失值規則

1. 未顯示的條件題：`status=not_applicable`, `value=null`。
2. 使用者明確選擇不確定：`status=unknown`, `value=null`。
3. 複選題已回答但未選某項：該選項 feature 可記為 0。
4. 整題未知或不適用：所屬 features 保留 null，不可當成 0。
5. 症狀題的一般回想期為最近 3 個月；v19.4 新增與重複次數追問為最近 6 個月。
6. 腹部壓痛與肛門指診屬醫師檢查，不放入公開自填問卷。
