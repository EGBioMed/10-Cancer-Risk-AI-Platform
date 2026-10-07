# 「不知道」在送進模型之前變成了「沒有」

**日期：** 2026-10-07
**狀態：** 已查證，未修正。修正需要模型端的決定。
**查法：** 用對話 session 真實走完問卷（遵守 `appliesIf`），逐題把該題設成 `uncertain`，比對 `ai_api_feature_row`（真正送進模型的那份）。每一條結論都是跑出來的。

> 第一版用「無視適用條件、每題都填」的方式掃描，得到 25 題——其中四題是症狀題組，而那是假象：那種填法會製造出不可能的狀態（父題未知、追問卻有答案）。改用真實路徑後是 21 題，症狀題組全部正確。

---

## 一句話

受試者按「跳過」之後，**21 題**的答案會以具體數值送進模型，而不是以「未知」送進去。對其中 15 題，跳過產生的特徵列與「明確回答否／以上皆無」**完全相同**——不是相似，是逐欄一致。

抽菸、檳榔、家族癌症史、二手菸、輻射暴露都在這 21 題裡。

---

## 怎麼發生的

`app.js` 的「跳過」按鈕只排除三題：

```js
skipBtn.addEventListener("click", () => {
  const question = getCurrentQuestion();
  if (question?.id === "consent_acknowledgement" || ["name", "email"].includes(question?.type)) return;
  if (question?.isComposite) {
    getCompositeRows(question).forEach((row) => {
      answers[row.field] = makeAnswerEntry(row, "不確定", "uncertain");
    });
    ...
  }
  saveAnswer("不確定", "uncertain");
});
```

其餘每一題都寫得進 `uncertain`，**複合題一次寫四列或三列**。

特徵列的建構器大多沒有讀 `source === "uncertain"`，而是直接從值推導：

```js
smoking: boolFromYesNo(getAnswerValue(answers, "exposure.smoking_ever")),   // "不確定" → 0
red_meat: foodList.some((item) => item.includes("紅肉")) ? 1 : 0,            // 不在清單裡 → 0
anxiety_freq: mapFrequency(anxiety),                                        // ?? 0 → 0
```

`boolFromYesNo("不確定")` 回 0。`foodList` 只收陣列，而 uncertain 的值是字串 `"不確定"`，所以整列不計入。`mapFrequency` 的 `?? 0` 把未知變成 0。

**三者都不是錯誤處理，都是預設值。** 沒有任何地方會報錯。

---

## 分不出來的 15 題

跳過之後的特徵列，與明確回答「否」或「以上皆無」**逐欄相同**：

| 題目 | 跳過 ≡ 明確回答 |
|---|---|
| `smoking_ever` 是否有抽菸習慣 | 否 |
| `betel_nut` 是否嚼檳榔 | 否 |
| `secondhand_smoke` 長期二手菸環境 | 否 |
| `radiation` 常接觸輻射 | 否 |
| `cooking_fume` 經常接觸油煙 | 否 |
| `air_pollution` 長期空污暴露 | 否 |
| `weight_change` 半年內體重明顯下降 | 否 |
| `personal_cancer` 現在或曾經罹癌 | 否 |
| `family_cancer` 一等親癌症史 | 否 |
| `meat_processed_foods` 肉類與加工食物 | 以上皆未達每週 3 次 |
| `sugar_fat_foods` 高糖高脂食物 | 以上皆未達每週 3 次 |
| `plant_dairy_habits` 蔬果豆類乳製品 | 以上皆無 |
| `beverage_habits` 飲品習慣 | 以上皆無 |

（另兩題 `smoking_quit`、`chronic_conditions` 行為相同但沒有對應的「否」選項可比。）

---

## 全部 21 題

欄位值是相對於「每題選第一個選項」這個基準的差異。複選題實際被歸零的欄位更多——例如 `chronic_conditions` 跳過時**所有** `chronic_*` 欄位都是 0，表中只列出與基準不同的那一個。

| 題目 | 標題 | 跳過時送出的值 |
|---|---|---|
| `height_cm` | 身高（公分） | `height_cm=0` |
| `weight_kg` | 體重（公斤） | `weight_kg=0` |
| `weight_change` | 近半年體重是否明顯下降 | `weight_change_6m=0` |
| `smoking_ever` | 是否有抽菸習慣 | `smoking=0` |
| `smoking_quit` | 是否已戒菸 | `quit_smoking=0` |
| `secondhand_smoke` | 長期二手菸環境 | `secondhand_smoke=0` |
| `betel_nut` | 是否嚼檳榔 | `betel_nut=0` |
| `cooking_fume` | 經常接觸油煙 | `cooking_fumes=0` |
| `air_pollution` | 長期空污暴露 | `air_pollution=0` |
| `radiation` | 常接觸輻射 | `radiation_exposure=0` |
| `stress` | 每週緊張焦慮頻率 | `anxiety_freq_missing=0` |
| `sleep_problem` | 每週睡不好頻率 | `insomnia_freq_missing=0` |
| `low_mood` | 每週情緒低落頻率 | `depression_freq_missing=0` |
| `meat_processed_foods` | 肉類與加工食物 | `red_meat=0` |
| `sugar_fat_foods` | 高糖高脂食物 | `sweets_junk=0` |
| `plant_dairy_habits` | 蔬果豆類乳製品 | `vegetables_fruits=0` |
| `beverage_habits` | 飲品習慣 | `alcohol=0` |
| `personal_cancer` | 現在或曾經罹癌 | `is_cancer_patient=0`、`prev_cancer=0` |
| `personal_cancer_types` | 曾診斷的癌別 | `personal_cancer_types="不確定"` |
| `chronic_conditions` | 慢性疾病 | `chronic_hypertension=0`、`chronic_disease_count=0` |
| `family_cancer` | 一等親癌症史 | `family_cancer_history=0`、`first_degree_relative_cancer=0` |

### 兩個特別的

**心理三題的方向是反的。**

| 情況 | `anxiety_freq` | `anxiety_freq_missing` |
|---|---|---|
| 真的答「不到 1 天」 | 0 | **1** |
| 跳過 | 0 | **0** |

`anxiety_freq_missing` 的名字會誤導——它的定義是 `anxiety === "不到 1 天" ? 1 : 0`，意思是「頻率低於一天」，不是「缺值」。結果是**跳過看起來比真實的最低答案更確定**。`insomnia_*`、`depression_*` 相同。

---

## 有一條路做對了

症狀題組本身是正確的。未知時 `symptom_feature_row` 的那些欄位是 `null`，而且 `ai_api_feature_row.symptoms` 會把它們**整個拿掉**（`undefined`，不是 0）：

```
跳過「全身性症狀」之後
  symptom_feature_row          7 個 null
  ai_api_feature_row.symptoms  那 7 個欄位不存在
```

所以「表達未知」的機制已經存在、已經在用——**13 個症狀題組全部正確**，只是沒有套用到這 21 題。這也代表模型端**已經要面對缺欄位**，不是全新的情況。

---

## 既有資料追溯不回來

線上 `submission_mode` 是 `power-automate`：送件經流程進資料 API，而 `research_submissions` 在 2026-10-07 之前**只有 `excel_row_json`** 一個資料欄，裡面是衍生後的 0/1。`answer_code_rows`（帶 `status: "unknown"`）從來沒有被保存。

**對任何一筆既有送件，無法分辨「跳過」和「真的沒有」。** 資訊在寫入之前就丟了。

這與 2026-09-18 那個 `excel_row` 空欄位的問題同一類：都不是儲存出錯，是從未被儲存。

### 已經做的事

資料 API 新增了 `research_submissions.answer_code_rows_json`（`JSON NULL`），`/api/research-rows` 的 schema 接受選用的 `answer_code_rows`。

- **可選、可為 NULL**，所以流程還沒改之前一切照舊，沒有部署順序問題
- 重試用 `COALESCE` 而非 `VALUES()`，所以一次沒帶該欄位的重試不會抹掉先前存下的
- `answer_code_rows` 不含自由文字、姓名或 Email，只有題號、狀態與答案碼——所以放在研究資料表是安全的

**還需要人手動做一件事：** 流程 B／C 送往 `/api/research-rows` 的 HTTP body 要加上
`"answer_code_rows": @{triggerBody()?['answer_code_rows']}`。
在那之前，新送件的這個欄位是 NULL，而 NULL 的意思是「這筆早於本次變更」，與「沒有人跳過」是不同的事。

---

## 三個選項

### 1. 讓未知不送該欄位（照症狀題組的做法）

把這 21 題的未知改成從 `ai_api_feature_row` 省略該欄位，而不是填 0。

- **優點：** 模型拿到的是真相。機制已經存在且在用。
- **代價：** 改變送給模型的 body 形狀。模型端必須確認缺欄位的處理方式——**這不是平台端能決定的**。
- **誰：** 需要 linruokai 確認後，平台端實作。

### 2. 拿掉這些題的「跳過」

讓受試者必須回答。多數題目本來就有「不確定」選項可選（而那是**有效答案碼**，與跳過不同）。

- **優點：** 不動契約、不動模型。
- **代價：** 強迫回答抽菸、癌症史這類問題，是產品與 IRB 的決定，不是工程決定。
- **誰：** 產品。

### 3. 什麼都不做，但知道影響有多大

`answer_code_rows_json` 存下來之後，這個查詢就有答案了：

```sql
SELECT COUNT(*) AS n
FROM research_submissions
WHERE answer_code_rows_json IS NOT NULL
  AND JSON_SEARCH(answer_code_rows_json, 'one', 'unknown', NULL, '$[*].status') IS NOT NULL;
```

在累積足夠筆數之前，1 和 2 都缺少判斷依據。

---

## 相關檔案

| 檔案 | 相關處 |
|---|---|
| `app.js` | `skipBtn` 事件處理、`buildOptimizedFeatureRow`、`buildSymptomFeatureRow`、`mapFrequency`、`boolFromYesNo` |
| `api-symptoms.js` | `buildApiSymptoms`——唯一做對的那條路 |
| `answer-intake.js` | 對話版的 `UNCERTAIN_SOURCE`，走的是同一條下游 |
| `egbiomed-ai-data-api/create-schema.js` | `research_submissions_answer_code_rows` 升級項目 |

對話版（`chat.html`）會產生完全相同的狀態，走的是同一批建構器。這份稽核不是對話版帶來的問題——是做對話版時才注意到的既有問題。
