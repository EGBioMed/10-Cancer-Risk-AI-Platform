# 動送件管線之前，先讀這一份

最後實地驗證：**2026-09-16**

這份文件的對象是「準備修改問卷送出 → API → 報告」這條路徑的人，包含 AI 助手。
不是架構總覽（那在 [DATA_CONTRACT.md](DATA_CONTRACT.md)），是一張**動手前的安全檢查表**，
外加一次真實事故的完整紀錄。

> **一句話重點**：這條管線有一段不在版本控制裡——Power Automate 的 flow。
> 版本控制裡的程式碼和文件，都可能與線上實際行為不符。動手前必須實地看一眼。

---

## 1. 為什麼有這份文件：2026-09-08 ～ 09-16 的事故

### 發生了什麼

使用者發現報告上永遠印著「本次問卷未觸發任何硬規則」，要求修正。

我（Claude）依據 `POWER_AUTOMATE_FLOW_AUDIT_2026-08-05.md` 推斷：flow 把
`ai_api_feature_row` 原樣當成 `/predict` 的 body，而該物件不含 `symptoms`，
所以 `SurveyInput.symptoms` 落在預設 `None`，40 條硬規則裡只有 A-36 有可能觸發。

據此做了完整的修正：新增 `api-symptoms.js` 作為翻譯正本、串進
`ai_api_feature_row`、更新兩處白名單與合約 schema、寫了 11 項前端測試與 19 項
API 測試、做了四項變異測試、`npm test` 98 → 100 全綠。全部通過，推上線。

**然後線上每一筆送件都失敗了。**

```
The template language function 'addProperty' expects the property to not exist
in the object. Unable to add property 'symptoms' to '{...}' as it already exists.
```

### 真正的原因

flow 的 HTTP 動作 body 根本不是稽核文件寫的那樣。它實際是三層 `addProperty`，
**其中一層自己就在塞 `symptoms`**：

```
addProperty(addProperty(addProperty(
  coalesce(body('剖析_JSON')?['ai_api_feature_row'], body('剖析_JSON')?['excel_row']),
  'symptoms', body('剖析_JSON')?['symptom_feature_row']),
  'lang', if(equals(triggerBody()?['report_language'], 'en'), 'en', 'zh-TW')),
  'name', coalesce(body('剖析_JSON')?['full_name'], triggerBody()?['full_name'], ''))
```

也就是說：**規則層一直都收得到症狀資料**，來源是 `symptom_feature_row` 那 84 欄，
鍵名本來就是 `symptom_jaundice` 這類規則層欄位名。我那句「每一份報告都印未觸發
任何硬規則，不論受檢者答了什麼」是錯的，那句話還寫進了 commit message
（`21adc47`）、合約 schema 的 description、`questionnaire-manifest.json` 的 note，
以及 `test_symptoms_wiring.py` 的檔頭。

真正的缺口比我說的窄得多：flow 只送了症狀勾選題那 84 欄，缺的是
`rule_input_row` 那 30 欄（各 `_repeat_count`、pap／psa 篩檢代碼、病程與持續時間），
而且沒有任何選項代碼翻譯。引用這些欄位的規則確實不會觸發——但不是全部 40 條。

### 為什麼所有測試都沒抓到

每一支測試都守住了自己那一段，但沒有任何一支看得到 flow：

| 測試 | 守住的範圍 | 看不到的 |
|---|---|---|
| `test_high_risk_rules.py` | 規則 logic 本身 | 資料怎麼來的 |
| `test_symptoms_wiring.py` | `SurveyInput` → `to_rule_dict` → `evaluate` | body 是誰組的 |
| `test-submission-e2e.js` | 平台送出物件的形狀 | flow 拿去之後做了什麼 |
| 變異測試 | 上面這些測試是否 load-bearing | 同上 |

**斷點正好落在所有測試的交界處，而那一段不在版本控制裡。**

### 修正方式

把 flow 那層 `addProperty('symptoms', ...)` 拿掉，改由平台端提供
（平台端那份有翻譯表、有排除清單、有測試）。`lang` 與 `name` 兩層必須保留。

---

## 2. 同一類錯誤的第二個案例（2026-09-09）

同一週，Render 上的網站整個掛掉：

```
Error: ACCESS_GATE_SESSION_SECRET must be set when ACCESS_GATE_MODE=enforced.
```

原因是 `render.yaml` 沒有宣告這兩個環境變數，而 Render 的 Blueprint 同步會清掉
Blueprint 未列出的 dashboard 變數。變數消失的當下不會壞，要等下一次部署重啟才炸，
所以因與果差了一段時間。

**同樣的教訓**：真相不在版控裡。`render.yaml` 看起來完整，實際行為取決於 dashboard。

---

## 3. 實際的資料路徑（2026-09-16 實地確認）

```
問卷（瀏覽器）
  └ app.js  storeSubmissionForIntegration()
      └ 組出送件物件：ai_api_feature_row / symptom_feature_row / rule_input_row
        / excel_row / contact_row / vnext_* / 各 *_columns / data_quality
  ↓ POST
server.js（Render）或直接送 Power Automate webhook
  ↓
Power Automate flow「EGAI - 癌症風險評估自動化」   ← 不在版控裡
  ├ 剖析 JSON
  ├ 執行指令碼（寫研究用 Excel）
  ├ 條件 1（2 案例）
  ├ HTTP    → POST https://cancer-risk-api.onrender.com/predict
  └ HTTP 1  → POST https://cancer-risk-api.onrender.com/generate_report
       ↓
     寄送報告 email（中文／英文分支）
```

> 條件 1 的兩個案例各自做什麼、HTTP 1 確切掛在哪一段，**尚未實地確認**。
> 需要時請自己看過再寫，不要沿用這段描述。

### 兩個 HTTP 動作的 Body（2026-09-16 修正後，兩者相同）

```
addProperty(addProperty(
  coalesce(body('剖析_JSON')?['ai_api_feature_row'], body('剖析_JSON')?['excel_row']),
  'lang', if(equals(triggerBody()?['report_language'], 'en'), 'en', 'zh-TW')),
  'name', coalesce(body('剖析_JSON')?['full_name'], triggerBody()?['full_name'], ''))
```

推論出來的三件事：

1. **`ai_api_feature_row` 是 API body 的主體**，原樣送出。想讓 API 收到某個東西，
   最省事的作法就是放進這個物件——flow 不必改。這是 `country`（2026-09-07）與
   `symptoms`（2026-09-08）都放在這裡的原因。
2. **`lang` 與 `name` 由 flow 補上，不在 `ai_api_feature_row` 裡。** 動 body 運算式
   時若把這兩層一起刪掉，報告語言與姓名會靜默落回預設值。
3. **`excel_row` 是 fallback。** `ai_api_feature_row` 缺席時整包會換成另一種形狀。

---

## 4. 動手前的檢查表

改任何會影響「送到 API 的內容」的東西之前，逐項確認：

- [ ] **實地看過 flow 的 HTTP 動作 Body 運算式**，而不是讀稽核文件。
      文件會過期，而且過期時不會有任何徵兆。本次事故就是這樣來的。
- [ ] 確認有**幾個** HTTP 動作，各自打哪個端點。至少有兩個（`/predict`、
      `/generate_report`），名稱是 `HTTP` 與 `HTTP 1`，長得很像，很容易改錯。
- [ ] 確認 flow 有沒有自己在組／覆寫你要動的欄位（`addProperty`、`setProperty`、
      「執行指令碼」動作都可能）。
- [ ] 新增欄位到 `ai_api_feature_row` 時，**兩處** `AI_API_REPORT_ONLY_FIELDS` 白名單
      都要加（`app.js` 與 `lib/transitional-contract.js`）。漏一處會重現 2026-09-07
      的 71 欄對 72 鍵 `row_shape_mismatch`，每一筆送件在瀏覽器端就被自己擋掉。
- [ ] 新增瀏覽器端 script 時，要進 `lib/asset-version.js` 的 `VERSIONED_SCRIPTS`，
      否則會被服務舊版最多一小時。`index.html` 的 `<script>` 順序也要對。
- [ ] 合約 schema 改**來源** `contracts/power-automate/transitional-submission.schema.json`，
      再跑 `node scripts/generate-power-automate-trigger-schema.js`。
      `deployed-flow-trigger.schema.json` 是產生出來的，直接改會被
      `test-contract.js` 的同步檢查擋下。
- [ ] 環境變數：程式讀得到的每一個 env var，都要在 `render.yaml` 宣告 key
      （`sync: false`，值留在 dashboard），否則 Blueprint 同步會把它清掉。

---

## 5. 改完之後的驗證順序

程式碼測試全綠**不等於**線上會動。依序做：

1. `npm test`（平台端）與 API 端的 python 測試。
2. **實際送一筆問卷**，不要只按 flow 的「測試」或「重新提交」。
3. 到執行紀錄點開 HTTP 動作，看**「輸入」**——那才是真正送出去的 body。
4. 把那段 body 存成檔案，餵給覆蓋率檢查工具：

   ```bash
   cd ../cancer-risk-api && python3 check_payload_coverage.py body.json
   ```

   它會列出規則層要讀的每個欄位有沒有到齊、缺的會讓哪些規則永遠沉默，並自動
   排除「規則自己標了 field_status 非 ok」「性別不適用」「documented_gaps」三類。
   特別注意輸出裡標「⚠ 名稱相近但對不上」的項目——那是問卷有問、只是欄位名不同，
   規則永遠讀到 0，而且不會有任何錯誤訊息。
5. 確認真的收到報告 email，且內容正確。

---

## 6. 已知未解的問題

### 三個欄位命名對不上（尚未修）

問卷有問這些症狀，但送出的欄位名跟規則引擎讀的不同，所以那些規則一直沒作用：

| 規則讀的欄位 | 平台送的欄位 | 受影響的規則 |
|---|---|---|
| `symptom_nausea_vomiting` | `symptom_nausea` | A-08、A-18、B-20、B-21、B-64 |
| `symptom_back_pain` | `symptom_persistent_back_pain` | A-04、B-12、B-57 |
| `symptom_infection` | `symptom_recurrent_infection` | A-34 |

修正處在 `api-symptoms.js` 的對應。會改變規則觸發行為，需要單獨驗證，
並確認中文報告基線（`report_golden_zh.json`）的變化是預期的。

### 已知不送的欄位

- `screen_pap_up_to_date_and_in_range`（E-05 的 −5 分）：問卷只問得出「三年內」，
  問不出 E-05 需要的「且在建議年齡範圍內」，故刻意不送。
- `lab_*` 系列：需要抽血，設計上排除。
- `EXCLUDED_RULE_INPUTS` 那九個病程／持續時間／部位欄位：API 端沒有對應宣告，
  要放行必須先在 API 端宣告，不能只是拿掉排除。

### 文件債

- `POWER_AUTOMATE_FLOW_AUDIT_2026-08-05.md` 內容已與線上不符，是本次事故的近因。
  **不要引用它**，除非先實地核對過。
- `21adc47` 的 commit message、`transitional-submission.schema.json` 的 `symptoms`
  description、`questionnaire-manifest.json` 的 `ai_api_feature_row_symptoms_note`、
  `test_symptoms_wiring.py` 的檔頭，都還寫著「規則層原本收不到任何症狀」這個
  錯誤敘述，待更正。
- `contracts/vnext/questionnaire-manifest.json` 的題數統計（78／76）與程式碼不符。

---

## 7. 給 AI 助手的三條規則

1. **不要用文件推斷線上行為。** 這個專案有一段在 Power Automate、一段在 Render
   dashboard，兩段都不在版控裡，兩段都出過事。要下「線上現在是這樣」的結論之前，
   先請使用者實地看一眼；看不到就明說看不到，不要用文件代替。

2. **根因要有直接證據，不是只有「合理」。** 本次的推論每一步都合理，三個獨立佐證
   全都指向同一個結論，唯獨那個結論是錯的——因為三個佐證共用同一份過期文件。
   合理不等於正確。

3. **上線後的驗收看實際 body，不看測試結果。** 測試守的是各段內部，事故發生在
   段與段的交界。`check_payload_coverage.py` 就是為此而寫的。
