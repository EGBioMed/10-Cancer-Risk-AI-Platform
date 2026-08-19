# 問卷題目設計與追問機制說明文件

本文件整理 `app.js` 目前實際運作中的問卷題目設計，以及追問（follow-up）題目
的觸發與呈現機制。內容以程式碼為準（`app.js` 的 `questions` 陣列與相關函式），
非規格文件的理想狀態。

## 版本資訊

| 項目 | 目前值 |
|---|---|
| `questionnaire_version` | `questionnaire/2026-08-19-v19.5-phase1` |
| `contract_version`（內部，瀏覽器→Render） | `assessment-submission/1.1.0` |
| `rule_input_schema_version` | `high-risk-rules/19.5` |
| `rule_input_mapping_version` | `rule-input-mapping/19.5-phase1` |
| `questions` 陣列總筆數 | 79 |
| 排除知情同意／Email 後的標準化答案題目數（`answer_code_rows`） | 77 |
| `rule_input_columns` 欄位數 | 30 |

來源檔案：`app.js`（題目定義）、`contracts/v1/answer-code-manifest.json`
（自動產生的題目與選項代碼目錄）、`DATA_CONTRACT.md`（完整資料契約細節，
本文件不重複列出）。

---

## 一、題目模組總覽

問卷依 `module` 分為以下區塊，畫面上會依序呈現：

| 模組 id | 名稱 | 內容概要 |
|---|---|---|
| `consent` | 知情同意 | 閱讀說明並勾選 3 項確認聲明 |
| `basic` | 基本資料 | 出生年、身高、體重、體重變化、運動、性別、人種 |
| `symptoms` | 近期症狀 | 13 個身體系統症狀題組 + 對應追問題目 |
| `female` | 女性相關資訊 | 僅性別為「女性」時出現：初經、停經、初次懷孕、哺乳、抹片、賀爾蒙藥物、婦科良性疾病 |
| `exposure` | 菸草與環境暴露 | 吸菸、戒菸、二手菸、檳榔、油煙、烹調頻率、空污、輻射 |
| `mental` | 心理健康 | 過去一個月焦慮／睡眠／情緒低落頻率（矩陣題） |
| `diet` | 飲食習慣 | 飲食型態 + 過去三個月飲食頻率矩陣（肉類加工、高糖高脂、蔬果豆奶、飲品） |
| `history` | 病史與家族史 | 個人癌症史、慢性病、肝病種類、其他病史事件、男性睪丸炎／PSA、家族癌症史 |
| `contact` | 聯絡資料 | Email |
| `confirm` / `result` | 資料確認／完成送出 | 非題目，屬流程頁面 |

---

## 二、各模組題目清單

### 2.1 知情同意（consent）

- `consent_acknowledgement`：複選，須勾滿 3 項確認聲明（資料使用說明、結果限制、非診斷用途），`minSelected: 3`。不列入 `answer_code_rows`（排除項目之一）。

### 2.2 基本資料（basic）

| id | 題目 | 型態 | 備註 |
|---|---|---|---|
| `birth_year` | 您的出生年（西元） | 數字 | 1906–2026，用於年齡判斷 |
| `height_cm` | 身高（公分） | 數字 | 100–250 |
| `weight_kg` | 體重（公斤） | 數字 | 20–300 |
| `weight_change` | 近半年體重是否明顯下降（超過5%） | 單選 | 是／否／不確定 |
| `exercise_time` | 每週運動時間 | 單選 | 4 個時段選項 |
| `sex` | 您的性別 | 單選 | 男性／女性，**決定後續 female/male-only 題目是否出現** |
| `race` | 人種 | 單選 | `excludeFromCanonicalContract: true`，不列入 `answer_code_rows` |

### 2.3 近期症狀（symptoms）— 13 個身體系統題組

每個題組皆為複選，選項固定包含「以上皆無」與「不確定」兩個互斥選項。以下列出
每組的觸發用選項（英文為對應 `rule_input`/feature column 名稱，非全部都直接進
rule engine，僅供辨識）：

1. **全身性症狀**（`symptoms_general`）：體重下降、疲倦、食慾降低、貧血、夜間盜汗、不明原因發燒、**原因不明腫塊**（`symptom_mass`，跨組匯合觸發點之一，見 3.4）。
2. **上消化道症狀**（`symptoms_upper_digestive`）：早飽、上腹悶脹、上腹痛、消化不良、噁心、胃酸逆流、火燒心、吞嚥困難、吐血。
3. **腸道與下腹部症狀**（`symptoms_bowel_abdominal`）：腹脹、持續腹痛、**排便習慣改變**（觸發 `stool_loose_or_frequent` 追問）、**血便**（觸發次數追問）、黑便、裡急後重、潛血檢查異常；`extraOptions` 含便秘（併入 `constipation` 題）。
4. **肝膽胰症狀**（`symptoms_hepatobiliary`）：**黃疸**（觸發次數追問）、皮膚搔癢、尿液變深、糞便變淺、右上腹不適、新診斷糖尿病、糖尿病控制惡化。
5. **呼吸系統症狀**（`symptoms_respiratory`）：持續咳嗽、咳血、反覆肺炎、胸痛胸悶、**呼吸喘或急促**（觸發次數追問）。
6. **乳房症狀**（`symptoms_breast`，僅女性）：**乳房腫塊**（觸發乳房腫塊病程／持續時間追問，見 3.3c）、乳頭凹陷、乳頭異常分泌物、乳房皮膚變化。
7. **泌尿系統症狀**（`symptoms_urinary`）：頻尿、夜尿、尿流變細、排尿困難、排尿中斷、肉眼血尿、潛血尿、排尿疼痛。
8. **男性生殖系統症狀**（`symptoms_male_reproductive`，僅男性）：**睪丸腫塊**（觸發睪丸腫塊病程／持續時間追問）、睪丸腫大、陰囊腫大、**睪丸疼痛**（觸發疼痛型態追問）、腹股溝疼痛、尿滯留、勃起功能障礙。
9. **婦科相關症狀**（`symptoms_gynecological`，僅女性）：性交後出血、經間出血、其他異常出血、停經後出血、月經異常、異常分泌物、骨盆腔疼痛、**骨盆腔不適或腹圍增加**（觸發次數追問）。
10. **口腔與喉嚨症狀**（`symptoms_oral_throat`）：**口腔潰瘍**（觸發次數／間隔追問）、聲音沙啞、口腔白斑紅斑、**喉嚨痛**（觸發次數追問）、耳痛。
11. **頭頸與鼻部症狀**（`symptoms_head_neck_nasal`）：**頸部腫塊**、**頭臉頸腫塊**、**鼻部腫塊**（三者為 OR 觸發，見 3.3d 部位辨別追問）、鼻塞／鼻漏（不參與此追問）。
12. **神經系統症狀**（`symptoms_neurological`）：新發持續頭痛、癲癇、視力改變、肢體無力麻木、人格記憶改變。
13. **骨骼、血液與淋巴症狀**（`symptoms_bone_hematologic`）：**持續背痛**（觸發次數追問）、肋骨疼痛、其他骨骼疼痛、關節疼痛、鼻出血、反覆感染、易瘀青出血、**淋巴結腫大**（觸發淋巴結病程／持續時間追問）。

另有 `constipation`（單選，`displayInComposite: true`，實際併入第 3 組畫面呈現，
但仍計入 `answer_code_rows` 與 `rule_input_row`）。

### 2.4 女性相關資訊（female，僅性別為女性時出現）

`menarche_age`、`menopause_status`、`first_pregnancy_age`（非必填）、
`breastfeeding`、`pap_smear`、`pap_smear_timing`（年齡 ≥18 才出現）、
`hormone_medication`、`benign_gynae_disease`。

### 2.5 菸草與環境暴露（exposure）

`smoking_ever` → 若「是」才出現 `smoking_quit`；`secondhand_smoke`、
`betel_nut`、`cooking_fume`、`cooking_frequency`（非必填）、`air_pollution`、
`radiation`。

### 2.6 心理健康（mental）

複合矩陣題 `mental_frequency_matrix`，內含三列子題：`stress`、
`sleep_problem`、`low_mood`，皆為過去一個月每週頻率（4 個頻率選項）。

### 2.7 飲食習慣（diet）

`diet_type`（飲食型態）＋複合矩陣題 `diet_frequency_matrix`，內含四組子題：
`meat_processed_foods`、`sugar_fat_foods`、`plant_dairy_habits`、
`beverage_habits`，每組多個項目分別標示「達到頻率／未達頻率」。

### 2.8 病史與家族史（history）

`personal_cancer` → 若曾/現診斷才出現 `personal_cancer_types`；
`chronic_conditions` → 若含「肝病」才出現 `liver_disease_etiology`；
`vnext_diagnosed_conditions`；`orchitis_epididymitis`（僅男性）；
`psa_history`（僅男性且年齡 ≥50）；`family_cancer` → 若「是」才出現
`family_self_types`。

### 2.9 聯絡資料（contact）

`email`。不列入 `answer_code_rows`（排除項目之一）。

---

## 三、追問機制設計

### 3.1 設計原則：扁平陣列 + `appliesIf`，沒有獨立的「追問引擎」

問卷所有題目（含追問題）都放在同一個扁平陣列 `questions` 中。畫面實際顯示
的題目清單由 `getActiveQuestions()` 即時計算：

```js
questions.filter((q) => !q.displayInComposite && (!q.appliesIf || q.appliesIf(answers)))
```

`currentIndex` 只是這個過濾後陣列的整數位移。換言之：**追問題目是否出現、
何時出現，完全取決於它在 `questions` 陣列中的「位置」加上它自己的
`appliesIf` 判斷**，沒有任何額外的分支流程控制或狀態機。上一題／下一題／
跳題邏輯完全不需要因為新增追問題目而修改。

### 3.2 追問題目的插入位置：`followUpsAfterSymptomGroup`

13 個症狀題組本身依固定順序排列（`symptomGroups`）。每組觸發的追問題目，
透過一個顯式的對照表插入在該題組**緊接之後**：

```js
const followUpsAfterSymptomGroup = {
  symptoms_bowel_abdominal: [...],
  symptoms_hepatobiliary: [...],
  symptoms_respiratory: [...],
  symptoms_breast: [...],
  symptoms_male_reproductive: [...],
  symptoms_gynecological: [...],
  symptoms_oral_throat: [...],
  symptoms_head_neck_nasal: [...],
  symptoms_bone_hematologic: [...]
};

const symptomQuestionsWithInlineFollowUps = symptomQuestions.flatMap((q) => [
  q,
  ...(followUpsAfterSymptomGroup[q.id] || [])
]);
```

排序慣例：同一組內若有多個追問，依「該追問對應的勾選項在題組選項中出現的
順序」排列；若追問是跨組匯合（fan-in，見 3.4），則放在該組追問清單的**最
後**，確保使用者在被問到之前，所有可能觸發它的來源都已經問完。

歷史演進：追問題目最初是全部集中在 13 組症狀題問完之後統一詢問；
2026-08-19 前的一次改版將既有追問改為緊接觸發題組之後出現（使用者剛回答完
就能立刻看到相關追問，避免脈絡中斷）；本文件所述的病程／持續時間／部位
追問（3.3c、3.3d）是在同一機制上新增的內容，非另一套設計。

### 3.3 追問題目的四種型態

**a. 次數／間隔追問**（`ruleRepeatDefinitions` → `ruleRepeatQuestions`）

針對特定單一症狀，詢問「最近 6 個月內出現幾次」（1–9，9 代表 9 次以上），
部分症狀再追問「兩次最短間隔幾天」（僅次數 ≥2 才問）。目前適用：黃疸、
原因不明腫塊（`symptom_mass`）、喉嚨痛、呼吸喘或急促、血便、背痛、骨盆腔
不適或腹圍增加、口腔潰瘍、口腔症狀合併觸發。

**b. 獨立追問**（固定物件，非批量生成）

`stool_loose_or_frequent`（排便習慣改變時，主要是變稀還是變頻繁）、
`mastalgia`（女性乳房是否疼痛，非依賴勾選特定選項，只要是女性就問）、
`testicular_pain_pattern`（睪丸疼痛的型態：僅一次／反覆／持續）。

**c. 病程與持續時間追問（course / duration_band）—— 2026-08-19 新增**

針對淋巴結腫大、頭頸鼻部腫塊、乳房腫塊、睪丸腫塊四種「腫塊／腫大」症狀，
各自新增一組兩題的追問：

1. **course（病程）**：單選，「一直都在，沒有消掉過」／「消掉過，但後來又
   出現」／「消掉之後就沒有再出現」／「不確定怎麼回答」。對應
   `rule_inputs.*_course`，代碼 1／2／3／null。
2. **duration_band（持續時間區間）**：僅在 course 回答 1 或 2 時才出現（回答
   3 或不確定則直接跳過，不問）。選項「不到2週」／「2週到不滿6週」／
   「6週到不滿6個月」／「6個月以上」／「不確定怎麼回答」，代碼 1–4／null。
   **題目文字會依 course 的答案動態變化**：course=1（一直都在）時問「到現
   在大概已經多久」；course=2（消掉過又出現）時問「第一次和最近一次相隔
   多久」。此為新增的 `question.dynamicTitle`/`dynamicTitleEn` 能力（詳見
   3.6），僅影響畫面呈現文字，不影響資料契約中的靜態 `title`（用於封存
   `label`／manifest 目錄）。

四組分別為：
- `symptom_lymphadenopathy_course` / `_duration_band`（緊接骨骼血液淋巴組的
  背痛次數追問之後）
- `symptom_hn_lump_course` / `_duration_band`（見 3.3d，與部位辨別追問同組）
- `symptom_breast_lump_course` / `_duration_band`（緊接乳房組，在乳房疼痛追
  問之前）
- `symptom_testicular_lump_course` / `_duration_band`（緊接男性生殖組，在睪
  丸疼痛型態追問之前）

**d. 部位辨別追問（site disambiguation）—— 僅頭頸鼻部腫塊適用**

頭頸與鼻部症狀題組中，「頸部腫塊」「頭臉頸腫塊」「鼻部腫塊」三個選項各自
代表不同部位的腫塊，但病程／持續時間追問只能針對「一個」部位詢問。處理
規則：

- 若使用者只勾選其中 **1 項**：系統自動以該項為對象，**不會顯示**額外的
  部位選擇題，直接進入 `symptom_hn_lump_course`。
- 若勾選 **2 項或以上**：先顯示 `symptom_hn_lump_site`（單選），題目為
  「你剛才提到不只一處腫塊，接下來想請你針對其中一個回答，請問是哪一
  個？」，**選項只列出使用者實際勾選的部位**（透過新增的
  `question.filterOptions` 能力動態過濾，見 3.6），使用者選定後，
  `symptom_hn_lump_course`／`_duration_band` 才視為針對該部位回答。
- 儲存代碼：1＝頸部腫塊、2＝頭臉頸腫塊、3＝鼻部腫塊（對應
  `rule_inputs.symptom_hn_lump_site`，僅接受整數，符合 `rule_input_row`
  schema 的數值限制）。單一勾選時由程式自動推算，不經由此題作答。
- 「鼻塞／鼻漏」（`symptom_nasal_discharge`）**不參與**此組任何追問。

### 3.4 觸發判斷：`getRuleParentState` / `derivedParents`

單一症狀觸發（如淋巴結腫大、乳房腫塊、睪丸腫塊）直接讀取該症狀勾選狀態即
可判斷是否「陽性」（勾選=1，明確排除=0，不確定/未答=null）。

跨多個症狀來源的「匯合」（fan-in）觸發，透過 `derivedParents` 對照表定義
OR 邏輯：

```js
const derivedParents = {
  symptom_mass: ["symptom_mass", "symptom_neck_lump", "symptom_head_neck_mass",
                 "symptom_nasal_mass", "symptom_breast_lump", "symptom_testicular_lump"],
  symptom_abdominal_pain: [...],
  symptom_back_pain: ["symptom_persistent_back_pain"],
  symptom_mouth_symptoms: ["symptom_oral_ulcer", "symptom_oral_white_red_patch"],
  symptom_hn_lump: ["symptom_neck_lump", "symptom_head_neck_mass", "symptom_nasal_mass"]
};
```

目前唯二的「多來源匯合」案例：
- `symptom_mass`：橫跨全身性、頭頸鼻部、乳房、男性生殖 4 個題組（任一勾選
  即觸發原因不明腫塊的次數／間隔追問）。
- `symptom_hn_lump`：僅限頭頸鼻部題組內 3 個腫塊選項的 OR（用於觸發
  3.3c／3.3d 的病程、持續時間、部位追問），範圍比 `symptom_mass` 窄。

### 3.5 條件顯示：性別與年齡

- 性別限定：`femaleOnly`/`maleOnly` 標記於症狀題組與部分病史題（`sex` 答案
  決定）。
- 年齡限定：`pap_smear_timing`（女性且 ≥18 歲）、`psa_history`（男性且
  ≥50 歲），依 `birth_year` 計算年齡。

### 3.6 新增的兩個畫面呈現能力（2026-08-19）

在追問機制既有的「陣列位置 + `appliesIf`」設計基礎上，為支援 3.3c／3.3d 兩
種新追問，新增兩個**選填、不影響既有題目**的屬性：

1. `question.filterOptions(option, answers)`：僅在單選題渲染時套用，用於
   從固定選項中篩選出「目前應該顯示」的子集合（目前唯一用途：部位辨別
   追問，依已勾選的部位動態過濾）。不影響 `answer-code-manifest.json` 的
   選項代碼目錄——目錄仍列出全部可能選項（與既有「條件題但仍列入目錄」
   的慣例一致，例如女性限定的乳房疼痛追問也一樣列在目錄中）。
2. `question.dynamicTitle(answers)` / `question.dynamicTitleEn(answers)`：
   僅在取得畫面顯示文字（`getQuestionCopy`）時優先套用，用於依前一題答案
   切換題目文字（目前唯一用途：四組 duration_band 追問依 course 答案切換
   問法）。資料契約中的封存 `title`／`titleEn`（manifest 目錄、答案紀錄的
   `label`）維持固定字串，不受此影響。

---

## 四、資料流向對應（簡述）

- 一般症狀勾選 → `symptom_feature_columns`／`symptom_feature_row`（84 欄，
  研究用途，非目前 `/predict` 模型輸入）。
- 病程／持續時間／部位、次數、間隔等追問 → `rule_input_columns`／
  `rule_input_row`（30 欄，供規則引擎與研究彙整，非目前 `/predict` 模型
  輸入）。
- 完整欄位順序、數量與版本規則見 `DATA_CONTRACT.md`；欄位與選項代碼對照見
  `contracts/v1/answer-code-manifest.json`（`npm run generate:answer-codes`
  自動產生，不可手動修改）。

---

## 五、本文件對應的程式碼位置（供追蹤異動）

| 內容 | 檔案／位置 |
|---|---|
| 題組定義（symptomGroups） | `app.js`，`symptomGroups` |
| 追問插入對照表 | `app.js`，`followUpsAfterSymptomGroup` |
| 次數／間隔追問生成 | `app.js`，`ruleRepeatDefinitions` |
| 病程／持續時間追問（新增） | `app.js`，`symptomLymphadenopathyCourseQuestion` 等 9 個常數 |
| 部位辨別追問（新增） | `app.js`，`symptomHnLumpSiteQuestion`、`hnLumpSiteDefinitions` |
| 觸發判斷 | `app.js`，`getRuleParentState`／`isRuleParentPositive` |
| 動態文字／動態選項能力（新增） | `app.js`，`getQuestionCopy`（dynamicTitle）、單選題渲染處（filterOptions） |
| 答案→規則欄位對應 | `app.js`，`buildRuleInputRow` |
