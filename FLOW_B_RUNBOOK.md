# 流程 B（免費版）改寫操作手冊

| 項目 | 內容 |
|---|---|
| 對象 | 實際在 Power Automate 編輯器裡操作的人 |
| 前置閱讀 | [`PIPELINE_READ_FIRST.md`](PIPELINE_READ_FIRST.md)，特別是第 4 節的檢查表 |
| 設計依據 | [`FREEMIUM_SPEC.md`](FREEMIUM_SPEC.md) 第 7 節 |
| 撰寫日期 | 2026-09-17 |

---

## 0. 三條規則，先讀

**一、流程 A 絕對不要打開。** 不是「不要存檔」，是連編輯器都不要進。Power Automate 沒有草稿狀態，誤觸一個欄位再按儲存就直接對線上生效，而流程 A 服務的是華康、Numia、Myrostar、Garmin 全部的付費客戶。

**二、流程 B 全程保持關閉**，直到最後一步驗證完才開。

**三、先改名，再動手。** 兩條流程現在長得一模一樣，混淆的代價極高。進 Power Automate 把名稱改成能一眼分辨的：

| 原本 | 改成 |
|---|---|
| EGAI - 癌症風險評估自動化 | `EGAI-A 廠商推廣版（勿動）` |
| （複製出來那條） | `EGAI-B 免費版` |

改名不影響觸發 URL。

---

## 1. 記下流程 B 的觸發 URL

打開流程 B → 點第一個動作（HTTP 觸發程序）→ 複製「HTTP POST URL」。

**這條 URL 與流程 A 的不同**，是整個分流的關鍵。之後要填進 Render 的 `POWER_AUTOMATE_WEBHOOK_URL_PUBLIC`。

先存到你的密碼 txt，標註 `POWER_AUTOMATE_WEBHOOK_URL_PUBLIC`。

> ⚠️ **現在還不要填進 Render。** 填了之後公開代碼的送件就會進到還沒改完的流程 B。留到第 6 步。

---

## 2. 貼上流程 B 的觸發 schema

流程 B 要多收三個欄位（`delivery_mode` / `report_ticket` / `grant_id`），而流程 A 的 schema 是 `additionalProperties: false`，多一個欄位就會整批拒收——所以兩條線用兩份 schema。

檔案已經產好：

```
contracts/power-automate/deployed-flow-trigger-public.schema.json
```

**貼進流程 B 的兩個地方**（與既有的手動同步流程相同）：

1. HTTP 觸發程序的「要求本文 JSON 結構描述」
2. 「剖析 JSON」動作的「結構描述」

> 流程 A 的 schema **不要動**。它收到的 payload 逐位元組沒變，所以完全不需要重貼。

---

## 3. 新增「儲存模型結果」動作

### 3.1 位置

插在呼叫 `/predict` 的那個 HTTP 動作**之後**，`/generate_report` 那個之前。

> `PIPELINE_READ_FIRST` 第 3 節：兩個 HTTP 動作分別叫 `HTTP`（`/predict`）與 `HTTP 1`（`/generate_report`），**名稱極像、很容易改錯**。動手前先各點開一次確認端點。

### 3.2 動作設定

新增一個 HTTP 動作，**命名為 `HTTP - 儲存模型結果`**（不要留 `HTTP 2` 這種預設名）。

| 欄位 | 值 |
|---|---|
| 方法 | `POST` |
| URI | `https://egbiomed-ai-data-api.azurewebsites.net/api/reports/result` |
| 標頭 1 | `Content-Type` : `application/json` |
| 標頭 2 | `x-egbiomed-report-result-key` : （你設在 Azure 的 `REPORT_RESULT_API_KEY`） |

### 3.3 本文

每一個欄位都有實測依據（見 3.4），直接用這份：

```json
{
  "record_id": "@{body('剖析_JSON')?['contact_row']?['record_id']}",
  "model_version": "rules-@{body('HTTP')?['rule_engine_version']}/features-@{triggerBody()?['feature_schema_version']}",
  "risk_score": @{body('HTTP')?['risk_score_pct']},
  "risk_band": "@{body('HTTP')?['final_risk_level']}",
  "top_cancer_label": "@{first(body('HTTP')?['cancer_risks'])?['cancer']}",
  "prediction": @{body('HTTP')}
}
```

逐欄說明：

- **`record_id`** — `contact_row.record_id` 由平台在覆寫過 `record_id` 之後才組出來，所以它就是那筆評估的正式 UUID（`server.js` 的 `buildContactRow`）。實測確認格式如 `327385fd-423b-4e23-a936-e46bcca1962e`。`ai_api_feature_row` 與 `excel_row` 裡是同一個值。
- **`model_version`** — 複合值，誠實記錄「規則層版本」與「特徵合約版本」這兩個真的拿得到的東西。不寫成單一 `v19.12`，因為那是規則層版本，會讓人誤以為是模型版本。等模型 API 回傳真正的版本號後再簡化（見 3.4）。
- **`risk_score`** — 用 `risk_score_pct`（`55.6`），**不要**用 `risk_score`（`0.556`）。存的必須是使用者在信裡看到的那個數字，否則客服比對時會對不上。**這一行不加引號**（是數字）。
- **`risk_band`** — 見 3.4 末尾的已知不一致，那一項要先決定。
- **`top_cancer_label`** — 從結構化陣列取第一筆，**不必解析文字**。
- **`prediction`** — 整包回應原樣存入，不挑欄位。資料庫那一欄是 JSON blob，形狀隨模型版本變動，整包存下來最不會漏。**這一行不加引號**（是物件）；加了會存成字串。

### 3.4 `/predict` 實際回傳什麼（2026-09-17 實測）

實測方式：以**合成資料**（無任何真人資訊）直接 `POST https://cancer-risk-api.onrender.com/predict`。流程的執行紀錄開了「安全輸出」，看不到回應——那是 `REPORT_SPEC.md` 第 17 節要求的設定，**不要為了查看而把它關掉**。

回應頂層欄位：

| 欄位 | 型別 | 範例 | 用途 |
|---|---|---|---|
| `risk_score` | number | `0.556` | 0～1 |
| `risk_score_pct` | number | `55.6` | **已是 ×100 形式，直接用，不必再乘** |
| `risk_level` / `risk_label_zh` / `risk_level_display` / `model_risk_level` / `final_risk_level` | string | `中度風險` | 分級（五個欄位同值） |
| `risk_ratio_vs_healthy` | number | `5.5` | 與同齡健康者的倍數 |
| `cancer_risks` | **array** | 見下 | **已依 pct 由高到低排序的結構化陣列** |
| `cancer_risks_text` | string | `🟤 大腸直腸癌：41.8 / 100…` | 信件用的預先排版文字（含 `<br>`） |
| `recommendation_zh` / `risk_factors_zh` / `all_risk_factors_zh` / `disclaimer_zh` | string | | 信件各段落 |
| `rule_hard_rule_hits` | array | `[]` | 規則命中（付費內容） |
| `rule_detail` / `rule_report_text` / `rule_bonus_score` | | | 同上 |
| `rule_engine_version` | string | `v19.12` | **規則層**版本 |

`cancer_risks` 每個元素：`{cancer, pct, ratio, level, level_display, reliable, n, factors}`。

**因此第一名癌別不需要解析文字**，直接 `first(body('HTTP')?['cancer_risks'])?['cancer']`。

#### 沒有模型版本欄位

回應裡唯一的版本是 `rule_engine_version`，那是**規則層**的版本，不是模型權重的版本。模型重新訓練而規則層沒動時，這個字串不會變。

待辦：請模型 API 端加上真正的模型版本。在那之前，`model_version` 存一個由管線自己產生的複合值（見 3.3），比人手打字串好——至少它會隨合約或規則改版而變。

#### ⚠️ 已知不一致：信件的分級與 API 的分級不同

信件樣板**沒有**使用 API 的 `final_risk_level`，而是自己拿 `risk_score` 比 `0.5` / `0.25` 兩個門檻算出「較高／中度／低相對風險」。

實測 `risk_score = 0.556` 時：

| 來源 | 說法 |
|---|---|
| 信件樣板自算 | **較高**相對風險 |
| API `final_risk_level` | **中度**風險 |

這是現行線上就存在的落差，與免費版無關。但它直接威脅免費版的核心保證（免費信與付費 PDF 必須一致），**應在免費線上線前決定以哪一邊為準**。在決定之前，`risk_band` 存 API 的 `final_risk_level`（那是模型端的權威值），並在比對時留意這個差異。

---

## 4. 刪掉產 PDF 的三個動作

免費信不附 PDF，這幾步在流程 B 裡是多餘的，而且會白白消耗 API 額度與 SharePoint 空間。

依序刪除：

- [ ] `HTTP 1`（`/generate_report`）
- [ ] `建立檔案 - SharePoint`（或 OneDrive）
- [ ] `取得檔案內容`

**保留**：`剖析 JSON`、`執行指令碼`（寫研究用 Excel）、`HTTP`（`/predict`）。

> 研究用 Excel 那步務必保留：免費線的資料同樣要進研究資料庫，這是 IRB 補件裡會寫到的。

---

## 5. 改寫寄信動作

### 5.1 移除附件

在「傳送電子郵件 (V2)」動作裡，把「附件」整個區塊刪掉。（`取得檔案內容` 已經刪了，留著附件欄位會直接讓動作失敗。）

### 5.2 換信件內容

樣板已經做好，中英各一：

```
power-automate-email-free-zh.html
power-automate-email-free-en.html
```

把對應語言的**整份內容**貼進「傳送電子郵件 (V2)」的本文（HTML 檢視）。流程 A 原本就有中英分支，流程 B 沿用同一個判斷即可。

與付費版的差異只有兩處：

| 區塊 | 免費信 |
|---|---|
| **模型驗證摘要**（AUC、敏感度、543 筆測試資料那整段） | **整段移除** |
| **付款區塊** | **新增**，就接在移除的位置 |
| 其餘全部（標題、風險指數、分級、等級說明、各癌別完整排序、個人化建議、免責聲明） | **與付費版逐位元組相同** |

也就是說，收信的人看到的內容跟今天幾乎一樣，只是少了那張技術數據表、多了一個付款區塊。

### 5.3 付款連結裡的商品 ID

樣板裡的連結長這樣：

```
https://mdi.eg-bio.com/?add-to-cart=REPLACE_WITH_PRODUCT_ID&egbio_ticket=@{triggerBody()?['report_ticket']}
```

`REPLACE_WITH_PRODUCT_ID` 要等 WooCommerce 上架（第 12 步）才有值。**佔位符是刻意留得很顯眼的**，避免忘了換就上線。

`report_ticket` 不用管，平台簽好章隨送件一起送進來。

---

## 6. 開啟並驗證

**依序做，不要跳。**

- [ ] 6.1 在 Render 設 `POWER_AUTOMATE_WEBHOOK_URL_PUBLIC` = 第 1 步記下的 URL
- [ ] 6.2 確認 `render.yaml` 已宣告該變數（已經宣告了，commit `4aa5412`）
- [ ] 6.3 在 Render Shell 鑄一組**測試用**公開代碼：

```bash
npm run access:grant -- --type code --code egbiotest2026 --unlimited --delivery-mode public --created-by "abbie" --notes "免費線串接測試，驗完撤銷"
```

- [ ] 6.4 開啟流程 B
- [ ] 6.5 用**自己的 email**，拿那組測試代碼實際填一份問卷送出

### 驗收

| 檢查 | 預期 |
|---|---|
| 收到的信 | **沒有** PDF 附件 |
| `report_results` 表 | 多一筆，`record_id` 與該次送件相符 |
| 流程 A 的執行紀錄 | **完全沒有新執行**（免費線不該碰到它） |
| 拿廠商代碼（如 Garmin）再填一次 | 照常收到含 PDF 附件的信 |

最後兩項是重點：**證明兩條線真的分開了。**

### 驗完收尾

```bash
npm run access:status -- --code egbiotest2026
```

確認 `delivery_mode: public`、`remaining: unlimited`。正式上線前把這組測試碼撤銷。

---

## 7. 目前已知的缺口

| 缺口 | 影響 | 何時補 |
|---|---|---|
| `/predict` 不回傳模型版本（實測確認） | `model_version` 只能存規則層＋特徵合約的複合值 | 需模型 API 端配合，見 3.4 |
| **信件分級與 API 分級不一致** | 同一筆評估，信說「較高」、API 說「中度」 | **免費線上線前必須決定以哪一邊為準**，見 3.4 |
| `report_status` 更新端點未做 | 規格 7.2 第 8 步暫時跳過 | 不影響免費線運作，`report_status` 會停在 `pending` |
| WooCommerce 商品未上架 | 付款連結是佔位符，按了不會進結帳 | 第 12 步 |

**第 1～5 步現在全部都能做**，第 6 步的完整驗收要等商品上架後才能走完付款那一段——但「收到無附件的免費信」「流程 A 沒有新執行」「廠商代碼照常」這三項現在就驗得了，而那三項才是這一步真正要證明的事。

---

## 8. 出事了怎麼辦

| 症狀 | 處置 |
|---|---|
| 流程 B 整個壞掉 | 清空 Render 的 `POWER_AUTOMATE_WEBHOOK_URL_PUBLIC`。公開代碼送件會得到 503 且不寄信，機構線完全不受影響 |
| 更保險 | 撤銷那組測試公開代碼，免費線就完全沒有入口了 |
| 機構線出事 | 不該發生（流程 A 沒被動過）。若真的發生，立刻停手並回報，不要自行修流程 A |

任何一步的結果跟預期不同，**先停下來問**，不要往下做。2026-09-08 那次事故就是每一步看起來都對、最後才發現前提錯了。
