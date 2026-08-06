# 問卷逐題審核文字與邏輯規格

問卷版本：`questionnaire/2026-08-05-v19.4-phase1`  
答案代碼版本：`question-answer-codes/1.0.0`  
審核範圍：排除知情同意後的 77 個題目定義。

## 共通規則

1. 題序依本文件排列；條件題不符合時會從畫面題序移除，因此使用者實際題數會動態變動。
2. 單選題點選後直接前往下一題；複選與數字題需按「儲存並繼續」。
3. 複選題的「以上皆無」與「不確定」會排除其他選項，兩者也不可同時選擇。
4. 除 Email 外，使用者可使用「不確定怎麼回答」；該題記為 unknown/null，不得當成「否」或 0。
5. 因條件不符合而未顯示的題目記為 not_applicable/null，不得當成「否」或 0。
6. 返回修改前題後，系統會重新計算後續題目是否適用。
7. 最後會顯示全部已作答題目與答案；必須按「我已確認所有答案，現在送出」才會傳送資料。

## 逐題審核

## 1. 您的出生年（西元）

- **原始總題序**：2（含知情同意）
- **段落**：基本資料
- **question_id**：`birth_year`
- **資料欄位**：`demographics.birth_year`
- **中文題目**：您的出生年（西元）
- **English**：Year of birth
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：輸入 4 位數西元年；合法範圍為今年往前 120 年至今年。
- **後續追問／影響**：用於計算年齡，並決定是否顯示女性抹片時間與男性 PSA 題。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1906、maximum=2026、integer=true、review=Update the upper and lower year bounds at runtime from the receipt year.

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 2. 身高（公分）

- **原始總題序**：3（含知情同意）
- **段落**：基本資料
- **question_id**：`height_cm`
- **資料欄位**：`demographics.height_cm`
- **中文題目**：身高（公分）
- **English**：Height (cm)
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：輸入目前身高，100–250 公分，可含 1 位小數。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=100、maximum=250、unit=cm

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 3. 體重（公斤）

- **原始總題序**：4（含知情同意）
- **段落**：基本資料
- **question_id**：`weight_kg`
- **資料欄位**：`demographics.weight_kg`
- **中文題目**：體重（公斤）
- **English**：Weight (kg)
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：輸入目前體重，20–300 公斤，可含 1 位小數。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=20、maximum=300、unit=kg

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 4. 近半年內，您的體重是否有明顯增加或減少（超過體重 5%）？

- **原始總題序**：5（含知情同意）
- **段落**：基本資料
- **question_id**：`weight_change`
- **資料欄位**：`demographics.weight_change_over_5_percent`
- **中文題目**：近半年內，您的體重是否有明顯增加或減少（超過體重 5%）？
- **English**：In the past six months, has your weight increased or decreased significantly (more than 5%)?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想最近 6 個月，變化門檻為超過原體重 5%。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 5. 每週運動時間

- **原始總題序**：6（含知情同意）
- **段落**：基本資料
- **question_id**：`exercise_time`
- **資料欄位**：`lifestyle.weekly_exercise_time`
- **中文題目**：每週運動時間
- **English**：Weekly exercise time
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：以一般每週總運動時間作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `exercise_time.option_01` | 幾乎不運動 | Almost no exercise |
| `exercise_time.option_02` | 30-60 分鐘 | 30-60 minutes |
| `exercise_time.option_03` | 1-2 小時 | 1-2 hours |
| `exercise_time.option_04` | 多於 2 小時 | More than 2 hours |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 6. 您的性別？

- **原始總題序**：7（含知情同意）
- **段落**：基本資料
- **question_id**：`sex`
- **資料欄位**：`demographics.sex`
- **中文題目**：您的性別？
- **English**：What is your sex?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：用於顯示生理性別適用的題目與模型欄位。
- **後續追問／影響**：決定乳房、婦科、男性生殖系統、女性健康、睾丸病史與 PSA 題的顯示。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `sex.option_01` | 男性 | Male |
| `sex.option_02` | 女性 | Female |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 7. 全身性症狀

- **原始總題序**：8（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_general`
- **資料欄位**：`symptoms.general`
- **中文題目**：全身性症狀
- **English**：General Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：一般以最近 3 個月為主；體重下降與原因不明腫塊選項明確指定最近 6 個月。
- **後續追問／影響**：若勾選原因不明腫塊，追問發生次數；若至少 2 次，再追問最短間隔天數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 8. 上消化道症狀

- **原始總題序**：9（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_upper_digestive`
- **資料欄位**：`symptoms.upper_digestive`
- **中文題目**：上消化道症狀
- **English**：Upper Digestive Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：最近 3 個月。吐血即使僅發生 1 次也勾選；其餘需持續、反覆或明顯新發。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 9. 腸道與下腹部症狀

- **原始總題序**：10（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_bowel_abdominal`
- **資料欄位**：`symptoms.bowel_abdominal`
- **中文題目**：腸道與下腹部症狀
- **English**：Bowel and Lower Abdominal Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：最近 3 個月。血便或黑便即使僅發生 1 次也勾選；其餘需持續、反覆或明顯新發。
- **後續追問／影響**：若勾選排便習慣改變，追問稀便／頻率增加與最近 6 個月發生次數；若勾選血便或腹痛，追問發生次數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 10. 肝膽胰症狀

- **原始總題序**：11（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_hepatobiliary`
- **資料欄位**：`symptoms.hepatobiliary`
- **中文題目**：肝膽胰症狀
- **English**：Liver, Biliary, and Pancreatic Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：一般以最近 3 個月為主；新發糖尿病選項另以過去 2 年為範圍。
- **後續追問／影響**：若勾選黃疸，追問最近 6 個月發生次數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 11. 呼吸系統症狀

- **原始總題序**：12（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_respiratory`
- **資料欄位**：`symptoms.respiratory`
- **中文題目**：呼吸系統症狀
- **English**：Respiratory Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：一般以最近 3 個月為主；呼吸喘選項指定最近 6 個月，反覆肺炎選項指定過去 1 年。
- **後續追問／影響**：若勾選呼吸喘，追問最近 6 個月發生次數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `symptom_persistent_cough` | 持續咳嗽超過 3 週（非感冒引起） | Cough lasting more than 3 weeks and not caused by a cold |
| `symptom_hemoptysis` | 咳血或痰中帶血 | Coughing up blood or blood-streaked sputum |
| `symptom_recurrent_pneumonia` | 一年內反覆發生肺炎 2 次以上 | Pneumonia occurring 2 or more times within 1 year |
| `symptom_chest_pain` | 持續胸痛或胸悶 | Persistent chest pain or tightness |
| `symptom_shortness_of_breath` | 最近 6 個月內曾出現呼吸喘、呼吸急促或比平常更容易喘 | Shortness of breath, rapid breathing, or becoming breathless more easily than usual during the past 6 months |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 12. 乳房症狀

- **原始總題序**：13（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_breast`
- **資料欄位**：`symptoms.breast`
- **中文題目**：乳房症狀
- **English**：Breast Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：僅女性；以最近 3 個月內曾出現的警示狀況作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `symptom_breast_lump` | 乳房腫塊或局部硬塊 | A breast lump or localized hard area |
| `symptom_nipple_retraction` | 新發生的乳頭凹陷（非天生） | New nipple retraction that was not present from birth |
| `symptom_nipple_discharge` | 乳頭異常分泌物（尤其是血性分泌物） | Abnormal nipple discharge, especially bloody discharge |
| `symptom_breast_skin_change` | 乳房皮膚橘皮樣變化或局部凹陷 | Orange-peel-like breast skin changes or localized dimpling |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 13. 泌尿系統症狀

- **原始總題序**：14（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_urinary`
- **資料欄位**：`symptoms.urinary`
- **中文題目**：泌尿系統症狀
- **English**：Urinary Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：最近 3 個月。肉眼血尿或尿滯留即使 1 次也勾選；其餘需持續、反覆或明顯新發。
- **後續追問／影響**：勾選肉眼血尿、夜尿或頻尿時，分別追問最近 6 個月發生次數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 14. 男性生殖系統症狀

- **原始總題序**：15（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_male_reproductive`
- **資料欄位**：`symptoms.male_reproductive`
- **中文題目**：男性生殖系統症狀
- **English**：Male Reproductive Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「男性」時顯示。
- **作答文字規則**：僅男性；一般回想最近 3 個月。腫塊、腫大與尿滯留即使 1 次也勾選。
- **後續追問／影響**：勾選睾丸疼痛後追問發生型態；勾選睾丸腫塊也可觸發廣義腫塊次數追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 15. 婦科相關症狀

- **原始總題序**：16（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_gynecological`
- **資料欄位**：`symptoms.gynecological`
- **中文題目**：婦科相關症狀
- **English**：Gynecological Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：僅女性；最近 3 個月。性交後、月經間或停經後出血即使 1 次也勾選。
- **後續追問／影響**：勾選骨盆腔不適或腹圍增加時，追問發生次數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 16. 口腔與喉嚨症狀

- **原始總題序**：17（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_oral_throat`
- **資料欄位**：`symptoms.oral_throat`
- **中文題目**：口腔與喉嚨症狀
- **English**：Oral and Throat Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：最近 3 個月；個別選項已設 2 週或 3 週的持續門檻。
- **後續追問／影響**：勾選喉嚨痛、口腔潰痑或白／紅斑時，追問發生次數；口腔兩類症狀至少 2 次時再追問最短間隔。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `symptom_oral_ulcer` | 口腔潰瘍超過 2 週未癒合 | An oral ulcer that has not healed after more than 2 weeks |
| `symptom_hoarseness` | 持續聲音沙啞超過 3 週（非感冒引起） | Hoarseness lasting more than 3 weeks and not caused by a cold |
| `symptom_oral_white_red_patch` | 口腔白斑或紅斑 | A white or red patch in the mouth |
| `symptom_sore_throat` | 持續或反覆喉嚨痛（非一般感冒） | Persistent or recurrent sore throat not explained by a common cold |
| `symptom_otalgia` | 持續或反覆耳痛，且耳部檢查沒有明確原因 | Persistent or recurrent ear pain without a clear ear-related cause |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 17. 頭頸與鼻部症狀

- **原始總題序**：18（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_head_neck_nasal`
- **資料欄位**：`symptoms.head_neck_nasal`
- **中文題目**：頭頸與鼻部症狀
- **English**：Head, Neck, and Nasal Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：最近 3 個月。新腫塊即使只發現 1 次也勾選；鼻部症狀需持續、反覆或單側。
- **後續追問／影響**：勾選任一頭頸、頸部或鼻部腫塊可觸發廣義腫塊次數追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `symptom_neck_lump` | 頸部摸得到腫塊或硬塊 | A palpable lump or hard mass in the neck |
| `symptom_head_neck_mass` | 頭部、臉部或頸部出現新的腫塊 | A new mass in the head, face, or neck |
| `symptom_nasal_mass` | 鼻腔內或鼻部出現腫塊 | A mass in or around the nose |
| `symptom_nasal_discharge` | 持續、反覆或單側鼻塞／鼻漏 | Persistent, recurrent, or one-sided nasal blockage or discharge |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 18. 神經系統症狀

- **原始總題序**：19（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_neurological`
- **資料欄位**：`symptoms.neurological`
- **中文題目**：神經系統症狀
- **English**：Neurological Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：最近 3 個月；勾選新發、持續或明顯異於過去狀況的症狀。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `symptom_new_headache` | 新發生的持續頭痛（非過去的偏頭痛模式） | A new persistent headache that differs from a previous migraine pattern |
| `symptom_seizure` | 新發生的癲癇或抽搐 | A new seizure or convulsion |
| `symptom_visual_change` | 視力模糊或視野缺損（非近視或老花） | Blurred vision or visual field loss not explained by myopia or presbyopia |
| `symptom_limb_weakness_numbness` | 肢體無力或麻木 | Weakness or numbness in an arm or leg |
| `symptom_personality_memory_change` | 人格改變或記憶力明顯衰退 | Personality change or a marked decline in memory |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 19. 骨骼、血液與淋巴症狀

- **原始總題序**：20（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptoms_bone_hematologic`
- **資料欄位**：`symptoms.bone_hematologic`
- **中文題目**：骨骼、血液與淋巴症狀
- **English**：Bone, Blood, and Lymphatic Symptoms
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：一般以最近 3 個月為主；反覆感染選項指定過去 1 年。
- **後續追問／影響**：勾選持續背痛時，追問最近 6 個月發生次數。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 20. 最近 6 個月內，排便習慣改變時，是否主要是大便變稀或排便次數變多？

- **原始總題序**：21（含知情同意）
- **段落**：近期症狀
- **question_id**：`stool_loose_or_frequent`
- **資料欄位**：`rule_inputs.symptom_stool_loose_or_frequent`
- **中文題目**：最近 6 個月內，排便習慣改變時，是否主要是大便變稀或排便次數變多？
- **English**：During the past 6 months, when your bowel habits changed, did you mainly have looser stools or more frequent bowel movements?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在「腸道與下腹部症狀」勾選「排便習慣改變」時顯示。
- **作答文字規則**：回想最近 6 個月。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 21. 最近 6 個月內，您的乳房是否曾有疼痛或脹痛？

- **原始總題序**：22（含知情同意）
- **段落**：近期症狀
- **question_id**：`mastalgia`
- **資料欄位**：`rule_inputs.symptom_mastalgia`
- **中文題目**：最近 6 個月內，您的乳房是否曾有疼痛或脹痛？
- **English**：During the past 6 months, have you had breast pain or tenderness?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示，不以是否勾選其他乳房症狀為條件。
- **作答文字規則**：回想最近 6 個月；乳房疼痛本身不代表癌症。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 22. 最近 6 個月內，您是否曾有便秘，例如排便困難或排便次數減少？

- **原始總題序**：23（含知情同意）
- **段落**：近期症狀
- **question_id**：`constipation`
- **資料欄位**：`rule_inputs.symptom_constipation`
- **中文題目**：最近 6 個月內，您是否曾有便秘，例如排便困難或排便次數減少？
- **English**：During the past 6 months, have you had constipation, such as difficulty passing stool or fewer bowel movements?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想最近 6 個月；包含排便困難或次數減少。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 23. 最近 6 個月內，黃疸總共出現過幾次？

- **原始總題序**：24（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_jaundice_repeat_count`
- **資料欄位**：`rule_inputs.symptom_jaundice_repeat_count`
- **中文題目**：最近 6 個月內，黃疸總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience jaundice?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「黃疸」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 24. 最近 6 個月內，原因不明的腫塊總共出現過幾次？

- **原始總題序**：25（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_mass_repeat_count`
- **資料欄位**：`rule_inputs.symptom_mass_repeat_count`
- **中文題目**：最近 6 個月內，原因不明的腫塊總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience an unexplained lump?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在任一腫塊母項為陽性：全身不明腫塊、頸部腫塊、頭臉頸腫塊、鼻部腫塊、乳房腫塊或睾丸腫塊時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：若回答 2 次以上，追問兩次之間最短間隔天數。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 25. 最近 6 個月內，兩次原因不明的腫塊之間最短相隔幾天？

- **原始總題序**：26（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_mass_interval_days`
- **資料欄位**：`rule_inputs.symptom_mass_interval_days`
- **中文題目**：最近 6 個月內，兩次原因不明的腫塊之間最短相隔幾天？
- **English**：During the past 6 months, what was the shortest interval in days between two episodes of an unexplained lump?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅對應次數題 `symptom_mass_repeat_count` 為 2 次以上時顯示。
- **作答文字規則**：回想最近 6 個月；輸入兩次可分開辨識的發生狀況之間最短間隔，範圍 1–180 天。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=180、integer=true、unit=days

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 26. 最近 6 個月內，喉嚨痛總共出現過幾次？

- **原始總題序**：27（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_sore_throat_repeat_count`
- **資料欄位**：`rule_inputs.symptom_sore_throat_repeat_count`
- **中文題目**：最近 6 個月內，喉嚨痛總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience sore throat?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「持續或反覆喉嚨痛」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 27. 最近 6 個月內，呼吸喘或呼吸急促總共出現過幾次？

- **原始總題序**：28（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_shortness_of_breath_repeat_count`
- **資料欄位**：`rule_inputs.symptom_shortness_of_breath_repeat_count`
- **中文題目**：最近 6 個月內，呼吸喘或呼吸急促總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience shortness of breath?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「呼吸喘、呼吸急促或更容易喘」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 28. 最近 6 個月內，吞嚥困難、吞嚥疼痛或卡住感總共出現過幾次？

- **原始總題序**：29（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_dysphagia_repeat_count`
- **資料欄位**：`rule_inputs.symptom_dysphagia_repeat_count`
- **中文題目**：最近 6 個月內，吞嚥困難、吞嚥疼痛或卡住感總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience difficulty or pain when swallowing?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「吞嚥困難、吞嚥疼痛或食物卡住感」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 29. 最近 6 個月內，鮮紅色血便總共出現過幾次？

- **原始總題序**：30（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_hematochezia_repeat_count`
- **資料欄位**：`rule_inputs.symptom_hematochezia_repeat_count`
- **中文題目**：最近 6 個月內，鮮紅色血便總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience bright red blood in the stool?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「鮮紅色血便」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 30. 最近 6 個月內，腹部疼痛總共出現過幾次？

- **原始總題序**：31（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_abdominal_pain_repeat_count`
- **資料欄位**：`rule_inputs.symptom_abdominal_pain_repeat_count`
- **中文題目**：最近 6 個月內，腹部疼痛總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience abdominal pain?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在任一腹痛母項為陽性：持續腹痛、上腹痛、上腹不適或右上腹不適時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 31. 最近 6 個月內，背痛總共出現過幾次？

- **原始總題序**：32（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_back_pain_repeat_count`
- **資料欄位**：`rule_inputs.symptom_back_pain_repeat_count`
- **中文題目**：最近 6 個月內，背痛總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience back pain?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「持續背痛」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 32. 最近 6 個月內，排便習慣改變總共出現過幾次？

- **原始總題序**：33（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_bowel_habit_change_repeat_count`
- **資料欄位**：`rule_inputs.symptom_bowel_habit_change_repeat_count`
- **中文題目**：最近 6 個月內，排便習慣改變總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience a change in bowel habits?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「排便習慣改變」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 33. 最近 6 個月內，骨盆腔不適或腹圍增加總共出現過幾次？

- **原始總題序**：34（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_pelvic_discomfort_or_increased_girth_repeat_count`
- **資料欄位**：`rule_inputs.symptom_pelvic_discomfort_or_increased_girth_repeat_count`
- **中文題目**：最近 6 個月內，骨盆腔不適或腹圍增加總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience pelvic discomfort or increased abdominal girth?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「骨盆腔不適或腹圍明顯增加」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 34. 最近 6 個月內，肉眼可見血尿總共出現過幾次？

- **原始總題序**：35（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_hematuria_visible_repeat_count`
- **資料欄位**：`rule_inputs.symptom_hematuria_visible_repeat_count`
- **中文題目**：最近 6 個月內，肉眼可見血尿總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience visible blood in the urine?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「肉眼可見血尿」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 35. 最近 6 個月內，夜尿增加總共出現過幾次？

- **原始總題序**：36（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_nocturia_repeat_count`
- **資料欄位**：`rule_inputs.symptom_nocturia_repeat_count`
- **中文題目**：最近 6 個月內，夜尿增加總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience increased nighttime urination?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「夜尿增加」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 36. 最近 6 個月內，頻尿總共出現過幾次？

- **原始總題序**：37（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_urinary_frequency_repeat_count`
- **資料欄位**：`rule_inputs.symptom_urinary_frequency_repeat_count`
- **中文題目**：最近 6 個月內，頻尿總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience frequent urination?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「頻尿」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 37. 最近 6 個月內，口腔潰瘍總共出現過幾次？

- **原始總題序**：38（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_oral_ulcer_repeat_count`
- **資料欄位**：`rule_inputs.symptom_oral_ulcer_repeat_count`
- **中文題目**：最近 6 個月內，口腔潰瘍總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience an oral ulcer?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「口腔潰痑超過 2 週未癒合」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：若回答 2 次以上，追問最短間隔天數。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 38. 最近 6 個月內，兩次口腔潰瘍之間最短相隔幾天？

- **原始總題序**：39（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_oral_ulcer_interval_days`
- **資料欄位**：`rule_inputs.symptom_oral_ulcer_interval_days`
- **中文題目**：最近 6 個月內，兩次口腔潰瘍之間最短相隔幾天？
- **English**：During the past 6 months, what was the shortest interval in days between two episodes of an oral ulcer?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅對應次數題 `symptom_oral_ulcer_repeat_count` 為 2 次以上時顯示。
- **作答文字規則**：回想最近 6 個月；輸入兩次可分開辨識的發生狀況之間最短間隔，範圍 1–180 天。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=180、integer=true、unit=days

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 39. 最近 6 個月內，口腔白斑或紅斑總共出現過幾次？

- **原始總題序**：40（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_oral_white_red_patch_repeat_count`
- **資料欄位**：`rule_inputs.symptom_oral_white_red_patch_repeat_count`
- **中文題目**：最近 6 個月內，口腔白斑或紅斑總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience a white or red patch in the mouth?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「口腔白斑或紅斑」時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：若回答 2 次以上，追問最短間隔天數。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 40. 最近 6 個月內，兩次口腔白斑或紅斑之間最短相隔幾天？

- **原始總題序**：41（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_oral_white_red_patch_interval_days`
- **資料欄位**：`rule_inputs.symptom_oral_white_red_patch_interval_days`
- **中文題目**：最近 6 個月內，兩次口腔白斑或紅斑之間最短相隔幾天？
- **English**：During the past 6 months, what was the shortest interval in days between two episodes of a white or red patch in the mouth?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅對應次數題 `symptom_oral_white_red_patch_repeat_count` 為 2 次以上時顯示。
- **作答文字規則**：回想最近 6 個月；輸入兩次可分開辨識的發生狀況之間最短間隔，範圍 1–180 天。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=180、integer=true、unit=days

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 41. 最近 6 個月內，上述口腔症狀總共出現過幾次？

- **原始總題序**：42（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_mouth_symptoms_repeat_count`
- **資料欄位**：`rule_inputs.symptom_mouth_symptoms_repeat_count`
- **中文題目**：最近 6 個月內，上述口腔症狀總共出現過幾次？
- **English**：During the past 6 months, how many times did you experience the oral symptoms selected above?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅在勾選「口腔潰痑」或「口腔白斑／紅斑」任一項時顯示。
- **作答文字規則**：回想最近 6 個月；輸入 1–9 的整數，9 代表 9 次以上；無法確認可使用「不確定怎麼回答」。
- **後續追問／影響**：若回答 2 次以上，追問口腔症狀組合的最短間隔天數。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=9、integer=true

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 42. 最近 6 個月內，兩次上述口腔症狀之間最短相隔幾天？

- **原始總題序**：43（含知情同意）
- **段落**：近期症狀
- **question_id**：`symptom_mouth_symptoms_interval_days`
- **資料欄位**：`rule_inputs.symptom_mouth_symptoms_interval_days`
- **中文題目**：最近 6 個月內，兩次上述口腔症狀之間最短相隔幾天？
- **English**：During the past 6 months, what was the shortest interval in days between two episodes of the oral symptoms selected above?
- **題型**：數字輸入
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅對應次數題 `symptom_mouth_symptoms_repeat_count` 為 2 次以上時顯示。
- **作答文字規則**：回想最近 6 個月；輸入兩次可分開辨識的發生狀況之間最短間隔，範圍 1–180 天。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：有回答時儲存為數值；不確定為 null；條件不適用為 null。
- **數值限制**：minimum=1、maximum=180、integer=true、unit=days

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 43. 睪丸疼痛發生的情況

- **原始總題序**：44（含知情同意）
- **段落**：近期症狀
- **question_id**：`testicular_pain_pattern`
- **資料欄位**：`symptoms.follow_up.testicular_pain_pattern`
- **中文題目**：睪丸疼痛發生的情況
- **English**：Pattern of testicular pain
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別為男性，且在「男性生殖系統症狀」勾選「睾丸疼痛或沉重感」時顯示。
- **作答文字規則**：另存發生型態，主症狀欄位仍僅記錄有／無。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `testicular_pain_pattern.option_01` | 僅發生 1 次 | Occurred once |
| `testicular_pain_pattern.option_02` | 反覆發生 2 次以上 | Occurred 2 or more times |
| `testicular_pain_pattern.option_03` | 持續存在 | Persisted continuously |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 44. 初經（第一次月經）來潮年齡

- **原始總題序**：45（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`menarche_age`
- **資料欄位**：`female_health.menarche_age`
- **中文題目**：初經（第一次月經）來潮年齡
- **English**：Age at first menstruation
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `menarche_age.option_01` | 12 歲以前（含 12 歲） | Age 12 or younger |
| `menarche_age.option_02` | 13 歲以後（含 13 歲） | Age 13 or older |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 45. 目前停經（更年期）狀態

- **原始總題序**：46（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`menopause_status`
- **資料欄位**：`female_health.menopause_status`
- **中文題目**：目前停經（更年期）狀態
- **English**：Current menopause status
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `menopause_status.option_01` | 尚未停經（仍有月經） | Not menopausal (still menstruating) |
| `menopause_status.option_02` | 已停經（55 歲或以前停經） | Menopause at age 55 or earlier |
| `menopause_status.option_03` | 已停經（55 歲或以後停經） | Menopause after age 55 |
| `menopause_status.option_04` | 已切除子宮或卵巢 | Uterus or ovaries removed |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 46. 第一胎懷孕年齡

- **原始總題序**：47（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`first_pregnancy_age`
- **資料欄位**：`female_health.first_pregnancy_age`
- **中文題目**：第一胎懷孕年齡
- **English**：Age at first pregnancy
- **題型**：單選
- **必填性**：選填
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：非必填；未曾懷孕可選「從未懷孕」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `first_pregnancy_age.option_01` | 從未懷孕 | Never pregnant |
| `first_pregnancy_age.option_02` | 20 歲以下 | Age 20 or younger |
| `first_pregnancy_age.option_03` | 20-30 歲 | Age 20-30 |
| `first_pregnancy_age.option_04` | 31-35 歲 | Age 31-35 |
| `first_pregnancy_age.option_05` | 36 歲以上 | Age 36 or older |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 47. 產後是否曾哺餵母乳？若有，哺乳時間多長？

- **原始總題序**：48（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`breastfeeding`
- **資料欄位**：`female_health.breastfeeding_history`
- **中文題目**：產後是否曾哺餵母乳？若有，哺乳時間多長？
- **English**：Have you breastfed after childbirth? If yes, for how long?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：尚未生產者選「尚未生產，此題不適用」。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `breastfeeding.option_01` | 從未哺乳 | Never breastfed |
| `breastfeeding.option_02` | 有哺乳，但少於 6 個月 | Breastfed, less than 6 months |
| `breastfeeding.option_03` | 有哺乳，超過 6 個月（含 6 個月） | Breastfed, 6 months or longer |
| `breastfeeding.option_04` | 尚未生產，此題不適用 | Not applicable, have not given birth |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 48. 是否曾做過子宮頸抹片檢查？結果如何？

- **原始總題序**：49（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`pap_smear`
- **資料欄位**：`female_health.pap_smear_history`
- **中文題目**：是否曾做過子宮頸抹片檢查？結果如何？
- **English**：Have you ever had a Pap smear? What was the result?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `pap_smear.option_01` | 是，歷次結果均正常 | Yes, all previous results were normal |
| `pap_smear.option_02` | 是，曾有異常報告（如 CIN、HPV 陽性等） | Yes, had an abnormal report (such as CIN or HPV positive) |
| `pap_smear.option_03` | 否，從未做過 | No, never had one |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 49. 您最近一次子宮頸抹片檢查是在什麼時候？

- **原始總題序**：50（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`pap_smear_timing`
- **資料欄位**：`rule_inputs.screen_pap_overdue_or_out_of_range`
- **中文題目**：您最近一次子宮頸抹片檢查是在什麼時候？
- **English**：When was your most recent Pap smear?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別為女性，且由出生年推算年齡滿 18 歲時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `pap_smear_timing.option_01` | 3 年內 | Within the past 3 years |
| `pap_smear_timing.option_02` | 3 年以上 | More than 3 years ago |
| `pap_smear_timing.option_03` | 從未做過 | Never |
| `unknown` | 不記得 | I do not remember |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 50. 過去是否曾使用賀爾蒙藥物？

- **原始總題序**：51（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`hormone_medication`
- **資料欄位**：`female_health.hormone_medication`
- **中文題目**：過去是否曾使用賀爾蒙藥物？
- **English**：Have you ever used hormone medication?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `hormone_medication.option_01` | 是，使用超過 1 年 | Yes, used for more than 1 year |
| `hormone_medication.option_02` | 是，使用不到 1 年 | Yes, used for less than 1 year |
| `hormone_medication.option_03` | 否，從未使用 | No, never used |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 51. 醫師是否曾診斷您有子宮肌瘤、卵巢囊腫、子宮內膜異位或其他婦科良性疾病？

- **原始總題序**：52（含知情同意）
- **段落**：女性相關資訊
- **question_id**：`benign_gynae_disease`
- **資料欄位**：`rule_inputs.hx_benign_gynae_disease`
- **中文題目**：醫師是否曾診斷您有子宮肌瘤、卵巢囊腫、子宮內膜異位或其他婦科良性疾病？
- **English**：Has a clinician ever diagnosed you with uterine fibroids, an ovarian cyst, endometriosis, or another benign gynecological condition?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「女性」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `benign_gynae_disease.option_01` | 是，曾由醫師診斷 | Yes, diagnosed by a clinician |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 52. 是否有抽菸習慣（現在或過去）？

- **原始總題序**：53（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`smoking_ever`
- **資料欄位**：`exposure.smoking_ever`
- **中文題目**：是否有抽菸習慣（現在或過去）？
- **English**：Have you ever had a smoking habit (currently or in the past)?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：回答「是」時追問是否已戒菸。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 53. 若有抽菸習慣，是否已戒菸？

- **原始總題序**：54（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`smoking_quit`
- **資料欄位**：`exposure.smoking_quit_status`
- **中文題目**：若有抽菸習慣，是否已戒菸？
- **English**：If you have smoked, have you quit?
- **題型**：單選
- **必填性**：選填
- **出現條件**：僅前題「是否有抽菸習慣」回答「是」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `smoking_quit.option_01` | 是，已戒菸 | Yes, quit smoking |
| `smoking_quit.option_02` | 否，仍在抽菸 | No, still smoking |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 54. 是否長期處在二手菸的生活或工作環境？

- **原始總題序**：55（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`secondhand_smoke`
- **資料欄位**：`exposure.secondhand_smoke`
- **中文題目**：是否長期處在二手菸的生活或工作環境？
- **English**：Have you been in a long-term secondhand smoke environment at home or work?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 55. 是否有嚼檳榔習慣（現在或過去）？

- **原始總題序**：56（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`betel_nut`
- **資料欄位**：`exposure.betel_nut_ever`
- **中文題目**：是否有嚼檳榔習慣（現在或過去）？
- **English**：Have you ever had a betel nut chewing habit (currently or in the past)?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 56. 工作或生活環境是否經常接觸油煙？

- **原始總題序**：57（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`cooking_fume`
- **資料欄位**：`exposure.cooking_fume`
- **中文題目**：工作或生活環境是否經常接觸油煙？
- **English**：Are you often exposed to cooking fumes at work or in daily life?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 57. 每週平均烹調次數

- **原始總題序**：58（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`cooking_frequency`
- **資料欄位**：`exposure.weekly_cooking_frequency`
- **中文題目**：每週平均烹調次數
- **English**：Average weekly cooking frequency
- **題型**：單選
- **必填性**：選填
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：以平均每週烹調次數作答；目前無論油煙題回答為何都會顯示。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `cooking_frequency.option_01` | 少於一次 | Less than once |
| `cooking_frequency.option_02` | 每週 1-3 次 | 1-3 times per week |
| `cooking_frequency.option_03` | 每週 4-6 次 | 4-6 times per week |
| `cooking_frequency.option_04` | 每週 6 次以上 | 6 or more times per week |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 58. 工作或生活是否長期暴露在空氣污染環境？

- **原始總題序**：59（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`air_pollution`
- **資料欄位**：`exposure.air_pollution`
- **中文題目**：工作或生活是否長期暴露在空氣污染環境？
- **English**：Are you chronically exposed to air pollution at work or in daily life?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 59. 工作或生活是否常接觸輻射？

- **原始總題序**：60（含知情同意）
- **段落**：菸草與環境暴露
- **question_id**：`radiation`
- **資料欄位**：`exposure.radiation_exposure`
- **中文題目**：工作或生活是否常接觸輻射？
- **English**：Are you often exposed to radiation at work or in daily life?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 60. 過去一個月，每週感到緊張或焦慮的頻率

- **原始總題序**：61（含知情同意）
- **段落**：心理健康
- **question_id**：`stress`
- **資料欄位**：`mental_health.weekly_stress_frequency`
- **中文題目**：過去一個月，每週感到緊張或焦慮的頻率
- **English**：In the past month, how often did you feel tense or anxious each week?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想過去 1 個月，回答每週發生天數。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `stress.option_01` | 不到 1 天 | Less than 1 day |
| `stress.option_02` | 2-3 天 | 2-3 days |
| `stress.option_03` | 4-5 天 | 4-5 days |
| `stress.option_04` | 幾乎每天 | Almost every day |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 61. 過去一個月，每週睡不好或失眠的頻率

- **原始總題序**：62（含知情同意）
- **段落**：心理健康
- **question_id**：`sleep_problem`
- **資料欄位**：`mental_health.weekly_sleep_problem_frequency`
- **中文題目**：過去一個月，每週睡不好或失眠的頻率
- **English**：In the past month, how often did you sleep poorly or have insomnia each week?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想過去 1 個月，回答每週發生天數。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `sleep_problem.option_01` | 不到 1 天 | Less than 1 day |
| `sleep_problem.option_02` | 2-3 天 | 2-3 days |
| `sleep_problem.option_03` | 4-5 天 | 4-5 days |
| `sleep_problem.option_04` | 幾乎每天 | Almost every day |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 62. 過去一個月，每週情緒低落或憂鬱的頻率

- **原始總題序**：63（含知情同意）
- **段落**：心理健康
- **question_id**：`low_mood`
- **資料欄位**：`mental_health.weekly_low_mood_frequency`
- **中文題目**：過去一個月，每週情緒低落或憂鬱的頻率
- **English**：In the past month, how often did you feel low or depressed each week?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想過去 1 個月，回答每週發生天數；不是心理診斷。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `low_mood.option_01` | 不到 1 天 | Less than 1 day |
| `low_mood.option_02` | 2-3 天 | 2-3 days |
| `low_mood.option_03` | 4-5 天 | 4-5 days |
| `low_mood.option_04` | 幾乎每天 | Almost every day |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 63. 以下哪一項最接近您平常的飲食方式？

- **原始總題序**：64（含知情同意）
- **段落**：飲食習慣
- **question_id**：`diet_type`
- **資料欄位**：`diet.current_diet_type`
- **中文題目**：以下哪一項最接近您平常的飲食方式？
- **English**：Which option best describes your usual dietary pattern?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：以長期主要飲食型態選擇 1 項。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `diet_type.option_01` | 一般飲食（平常會吃肉類或海鮮） | General diet (usually includes meat or seafood) |
| `diet_type.option_02` | 蔬食為主（主要吃植物性食物，但仍會吃肉類或海鮮） | Mostly plant-based (still includes meat or seafood) |
| `diet_type.option_03` | 魚素（不吃肉類，但會吃魚類或海鮮） | Pescatarian (no meat, but includes fish or seafood) |
| `diet_type.option_04` | 蛋奶素（不吃肉類及海鮮，但會吃蛋或乳製品） | Ovo-lacto vegetarian (no meat or seafood, but includes eggs or dairy) |
| `diet_type.option_05` | 全素（不吃肉類、海鮮、蛋及乳製品） | Vegan (no meat, seafood, eggs, or dairy) |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 64. 肉類、加工及高溫烹調食物

- **原始總題序**：65（含知情同意）
- **段落**：飲食習慣
- **question_id**：`meat_processed_foods`
- **資料欄位**：`diet.meat_processed_foods`
- **中文題目**：肉類、加工及高溫烹調食物
- **English**：Meat, processed foods, and high-temperature cooking
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想過去 3 個月；「經常」為平均每週至少 3 次；可複選。加工肉品目前為研究欄位。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `meat_processed_foods.option_01` | 紅肉（牛、羊、豬等；平均每週至少 3 次） | Red meat (beef, lamb, pork, etc.; at least 3 times per week on average) |
| `meat_processed_foods.option_02` | 燒烤或油炸食品（平均每週至少 3 次） | Grilled or fried foods (at least 3 times per week on average) |
| `meat_processed_foods.option_03` | 醃漬或鹽漬食品（例如泡菜、鹹魚；平均每週至少 3 次） | Pickled or salted foods (such as kimchi or salted fish; at least 3 times per week on average) |
| `meat_processed_foods.option_04` | 加工肉品（例如香腸、火腿、培根；平均每週至少 3 次） | Processed meat (such as sausage, ham, or bacon; at least 3 times per week on average) |
| `none` | 以上皆未達每週 3 次 | None of the above reached 3 times per week |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 65. 高糖與高脂食物

- **原始總題序**：66（含知情同意）
- **段落**：飲食習慣
- **question_id**：`sugar_fat_foods`
- **資料欄位**：`diet.sugar_fat_foods`
- **中文題目**：高糖與高脂食物
- **English**：High-sugar and high-fat foods
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想過去 3 個月；平均每週至少 3 次；可複選。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `sugar_fat_foods.option_01` | 甜食或高糖零食（平均每週至少 3 次） | Sweets or high-sugar snacks (at least 3 times per week on average) |
| `sugar_fat_foods.option_02` | 含糖飲料（平均每週至少 3 次） | Sugary drinks (at least 3 times per week on average) |
| `sugar_fat_foods.option_03` | 高脂肪食物（例如速食、肥肉；平均每週至少 3 次） | High-fat foods (such as fast food or fatty meat; at least 3 times per week on average) |
| `none` | 以上皆未達每週 3 次 | None of the above reached 3 times per week |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 66. 蔬果、豆類與乳製品

- **原始總題序**：67（含知情同意）
- **段落**：飲食習慣
- **question_id**：`plant_dairy_habits`
- **資料欄位**：`diet.plant_dairy_habits`
- **中文題目**：蔬果、豆類與乳製品
- **English**：Fruit, vegetables, soy, and dairy
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：回想過去 3 個月；依各選項的每日或每週門檻勾選。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `plant_dairy_habits.option_01` | 每天攝取蔬菜或水果 | Eat vegetables or fruit every day |
| `plant_dairy_habits.option_02` | 豆類或豆製品每週至少 3 次 | Soybeans or soy products at least 3 times per week |
| `plant_dairy_habits.option_03` | 每天飲用至少一杯 240 ml 牛奶 | At least one 240 ml cup of milk every day |
| `plant_dairy_habits.option_04` | 其他乳製品每週至少 3 次（例如優格、起司） | Other dairy products at least 3 times per week (such as yogurt or cheese) |
| `plant_dairy_habits.option_05` | 益生菌食品或補充品每週至少 3 次（例如標示含活菌的優格、發酵乳或乳酸菌飲品，以及益生菌粉包、膠囊） | Probiotic foods or supplements at least 3 times per week (such as yogurt labeled with live cultures, fermented milk or probiotic drinks, and probiotic powder sachets or capsules) |
| `none` | 以上皆無 | None of the above |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 67. 飲品習慣

- **原始總題序**：68（含知情同意）
- **段落**：飲食習慣
- **question_id**：`beverage_habits`
- **資料欄位**：`diet.beverage_habits`
- **中文題目**：飲品習慣
- **English**：Beverage habits
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：飲酒門檻為每週至少 1 次；咖啡與茶為每週至少 3 次。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `beverage_habits.option_01` | 飲酒（每週至少一次） | Alcohol (at least once per week) |
| `beverage_habits.option_02` | 咖啡（每週至少 3 次） | Coffee (at least 3 times per week) |
| `beverage_habits.option_03` | 茶（每週至少 3 次） | Tea (at least 3 times per week) |
| `none` | 以上皆無 | None of the above |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 68. 您目前是否正在罹患癌症，或過去曾被診斷為癌症？

- **原始總題序**：69（含知情同意）
- **段落**：病史與家族史
- **question_id**：`personal_cancer`
- **資料欄位**：`medical_history.personal_cancer_history`
- **中文題目**：您目前是否正在罹患癌症，或過去曾被診斷為癌症？
- **English**：Are you currently living with cancer, or have you ever been diagnosed with cancer in the past?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依醫療人員曾給予的癌症診斷作答。
- **後續追問／影響**：回答目前或過去曾被診斷時，追問癌別。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `personal_cancer.option_01` | 是，目前正在治療或追蹤中 | Yes, currently under treatment or follow-up |
| `personal_cancer.option_02` | 是，過去曾被診斷，目前已完成治療或追蹤 | Yes, diagnosed in the past; treatment or follow-up has been completed |
| `personal_cancer.option_03` | 否，未曾被診斷為癌症 | No, never diagnosed with cancer |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 69. 目前或過去曾被診斷的癌別為何？

- **原始總題序**：70（含知情同意）
- **段落**：病史與家族史
- **question_id**：`personal_cancer_types`
- **資料欄位**：`medical_history.personal_cancer_types`
- **中文題目**：目前或過去曾被診斷的癌別為何？
- **English**：What type of cancer are you currently living with, or have you been diagnosed with in the past?
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅「目前正在治療或追蹤」或「過去曾被診斷」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 70. 是否有以下慢性疾病？

- **原始總題序**：71（含知情同意）
- **段落**：病史與家族史
- **question_id**：`chronic_conditions`
- **資料欄位**：`medical_history.chronic_conditions`
- **中文題目**：是否有以下慢性疾病？
- **English**：Do you have any of the following chronic diseases?
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：勾選肝病時，追問肝病種類。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 71. 您曾被診斷的肝病種類為何？

- **原始總題序**：72（含知情同意）
- **段落**：病史與家族史
- **question_id**：`liver_disease_etiology`
- **資料欄位**：`medical_history.liver_disease_etiology`
- **中文題目**：您曾被診斷的肝病種類為何？
- **English**：Which liver condition were you diagnosed with?
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅「慢性疾病」勾選肝病時顯示。
- **作答文字規則**：可複選；依醫療人員告知的診斷作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `liver_disease_etiology.option_01` | B 型肝炎 | Hepatitis B |
| `liver_disease_etiology.option_02` | C 型肝炎 | Hepatitis C |
| `liver_disease_etiology.option_03` | 肝硬化 | Cirrhosis |
| `liver_disease_etiology.option_04` | 代謝功能障礙相關脂肪性肝病（MASLD） | Metabolic dysfunction-associated steatotic liver disease (MASLD) |
| `liver_disease_etiology.option_05` | 酒精性肝病 | Alcohol-related liver disease |
| `liver_disease_etiology.option_06` | 其他肝病 | Other liver disease |
| `none` | 不確定肝病種類 | Not sure of the liver disease type |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 72. 是否曾有以下經醫療人員確認的病史或事件？

- **原始總題序**：73（含知情同意）
- **段落**：病史與家族史
- **question_id**：`vnext_diagnosed_conditions`
- **資料欄位**：`medical_history.vnext_diagnosed_conditions`
- **中文題目**：是否曾有以下經醫療人員確認的病史或事件？
- **English**：Have you had any of the following clinician-confirmed conditions or events?
- **題型**：複選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：骨折以最近 12 個月作答；其餘為過去是否曾由醫療人員診斷。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `vnext_diagnosed_conditions.option_01` | 過去 12 個月內曾發生骨折 | A fracture during the past 12 months |
| `vnext_diagnosed_conditions.option_02` | 曾由醫師診斷深層靜脈栓塞或肺栓塞（DVT／PE） | A clinician-diagnosed deep vein thrombosis or pulmonary embolism (DVT/PE) |
| `vnext_diagnosed_conditions.option_03` | 曾由牙醫或醫師診斷口腔黏膜下纖維化 | Oral submucous fibrosis diagnosed by a dentist or physician |
| `vnext_diagnosed_conditions.option_04` | 曾由醫師診斷慢性胰臟炎 | Chronic pancreatitis diagnosed by a clinician |
| `none` | 以上皆無 | None of the above |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 73. 醫師是否曾診斷您有睪丸炎或副睪炎？

- **原始總題序**：74（含知情同意）
- **段落**：病史與家族史
- **question_id**：`orchitis_epididymitis`
- **資料欄位**：`rule_inputs.dx_orchitis_epididymitis`
- **中文題目**：醫師是否曾診斷您有睪丸炎或副睪炎？
- **English**：Has a clinician ever diagnosed you with orchitis or epididymitis?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別選擇「男性」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `orchitis_epididymitis.option_01` | 是，曾由醫師診斷 | Yes, diagnosed by a clinician |
| `no` | 否 | No |
| `unknown` | 不確定 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 74. 您過去是否做過 PSA（攝護腺特異抗原）檢查？結果是否曾被告知偏高？

- **原始總題序**：75（含知情同意）
- **段落**：病史與家族史
- **question_id**：`psa_history`
- **資料欄位**：`rule_inputs.screen_psa_elevated`
- **中文題目**：您過去是否做過 PSA（攝護腺特異抗原）檢查？結果是否曾被告知偏高？
- **English**：Have you previously had a PSA (prostate-specific antigen) test, and were you told that the result was elevated?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：僅性別為男性，且由出生年推算年齡滿 50 歲時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `psa_history.option_01` | 做過且曾被告知偏高 | Tested and was told the result was elevated |
| `psa_history.option_02` | 做過且結果正常 | Tested and the result was normal |
| `psa_history.option_03` | 沒做過 | Never tested |
| `unknown` | 不記得 | I do not remember |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 75. 家族成員（一等親內）是否有癌症史？

- **原始總題序**：76（含知情同意）
- **段落**：病史與家族史
- **question_id**：`family_cancer`
- **資料欄位**：`family_history.has_cancer_history`
- **中文題目**：家族成員（一等親內）是否有癌症史？
- **English**：Has any first-degree family member had cancer?
- **題型**：單選
- **必填性**：適用時必填，但可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：回答「是」時，追問一等親癌別。
- **儲存規則**：以固定答案代碼儲存；不確定為 null；條件不適用為 null。

**選項與固定代碼**

| code | 中文選項 | English |
|---|---|---|
| `yes` | 是 | Yes |
| `no` | 否 | No |
| `unknown` | 不清楚 | Not sure |

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 76. 承上題，若有家族成員（一等親內）癌症史，請列出是什麼癌症？

- **原始總題序**：77（含知情同意）
- **段落**：病史與家族史
- **question_id**：`family_self_types`
- **資料欄位**：`family_history.cancer_types_self_side`
- **中文題目**：承上題，若有家族成員（一等親內）癌症史，請列出是什麼癌症？
- **English**：If yes, what type of cancer did your first-degree family member have?
- **題型**：複選
- **必填性**：選填
- **出現條件**：僅「一等親內是否有癌症史」回答「是」時顯示。
- **作答文字規則**：依題目文字與選項作答。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：已回答時：勾選選項=1、未勾選選項=0；整題不確定或不適用時保留 null。

**選項與固定代碼**

| code | 中文選項 | English |
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

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

## 77. 請填寫您的 Email

- **原始總題序**：78（含知情同意）
- **段落**：聯絡資料
- **question_id**：`email`
- **資料欄位**：`contact.email`
- **中文題目**：請填寫您的 Email
- **English**：Please enter your email
- **題型**：文字格式輸入
- **必填性**：必填，且不可使用「不確定怎麼回答」
- **出現條件**：無額外條件，依題序顯示。
- **作答文字規則**：必須符合 Email 格式；不提供「不確定」。用於寄送報告，不應作為模型 feature。
- **後續追問／影響**：無直接觸發的額外畫面追問。
- **儲存規則**：保存於受限權限聯絡資料，不應進入模型或研究 feature row。

**審核結果**

- [ ] 保留
- [ ] 修改
- [ ] 刪除
- [ ] 待臨床／模型／法規確認
- 修改說明：

---

