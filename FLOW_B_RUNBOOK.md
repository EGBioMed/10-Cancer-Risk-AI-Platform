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

### 3.3 本文（先用最小版本）

```json
{
  "record_id": "@{body('剖析_JSON')?['contact_row']?['record_id']}",
  "model_version": "@{body('HTTP')?['model_version']}",
  "prediction": @{body('HTTP')}
}
```

三件事說明：

- **`record_id` 這個運算式是確定的。** `contact_row.record_id` 由平台在覆寫過 `record_id` 之後才組出來，所以它就是那筆評估的正式 UUID（`server.js` 的 `buildContactRow`）。`ai_api_feature_row` 與 `excel_row` 裡的也是同一個值，任選其一都行。
- **`prediction` 直接塞整包模型回應**，不挑欄位。資料庫那一欄是 JSON blob，形狀隨模型版本變動，整包存下來最不會漏。注意 `@{body('HTTP')}` **不要加引號**，加了會存成字串。
- **`model_version` 是唯一需要你實地確認的。** 我沒有模型 API 的原始碼，不能從文件推斷欄位名——那正是 2026-09-08 事故的成因。做法見 3.4。

### 3.4 `/predict` 實際回傳什麼

信件樣板本身就是證據——現有的 `power-automate-email-zh.html` 直接引用了這些欄位，所以它們一定存在：

| 欄位 | 用途 | 備註 |
|---|---|---|
| `risk_score` | 風險指數 | **0～1 的小數**，信件裡乘以 100 顯示成「61.6 / 100」 |
| `risk_ratio_vs_healthy` | 與同齡健康者的倍數 | |
| `recommendation_zh` | 個人化建議 | 付費內容，免費信不用 |
| `cancer_risks_text` | 十大癌別排序（純文字） | 付費內容；免費信只取第一行 |
| `cancer_risks_text_en` | 同上英文版 | 英文樣板用 `coalesce` 回退到中文版 |

**沒有看到 `model_version`。** 這是個問題：付費 PDF「不跨模型版本重新計算」的保證要靠它。

先做這件事確認：流程 A 的執行紀錄裡找一筆成功的執行 → 點開 `HTTP`（`/predict`）→ 看**「輸出」**的 body。樣板只用到它需要的欄位，回應裡可能還有別的。

- **若真的有版本欄位** → 用它，3.3 的運算式直接可用
- **若確實沒有** → 暫時填一個標示來源與時間的字串，例如 `"model_version": "predict-api-2026-09"`，並**把「請模型 API 回傳版本號」列為待辦**。這是權宜之計，不是解法：它記錄的是「何時」而不是「哪一版模型」，模型改版而字串沒跟著改就失去保護作用

⚠️ 若讓 `model_version` 空著，`/api/reports/result` 會回 400（該欄位必填），**流程 B 的儲存動作會直接失敗**。

### 3.5 四個展示欄位（可稍後補）

拿到真實回應後可以補上，讓客服能直接查「我們到底跟這個人說了什麼」：

```json
  "risk_score": @{mul(float(string(body('HTTP')['risk_score'])),100)},
  "risk_band": "@{if(greaterOrEquals(float(string(body('HTTP')['risk_score'])),0.5),'high',if(greaterOrEquals(float(string(body('HTTP')['risk_score'])),0.25),'medium','low'))}",
  "top_cancer_label": "@{first(split(coalesce(body('HTTP')?['cancer_risks_text'],''), decodeUriComponent('%0A')))}"
```

- **`risk_score` 乘以 100** 才存，與免費信顯示的數字一致（61.6 而非 0.616）。兩邊不一致的話，客服比對時會對不上
- `risk_band` 的三段門檻（0.5 / 0.25）**照抄自現有信件樣板**，確保分級說法一致
- `top_cancer_label` 取 `cancer_risks_text` 的第一行。**這一項務必用真實回應驗證**：若那段文字的第一行是標題而不是癌別名稱，取出來的就是錯的

在補齊之前用 3.3 的最小版本就能運作——那三個欄位是 API 唯一必填的，而完整回應已經進了 `prediction`，什麼都沒少。

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
| `/predict` 疑似不回傳版本號 | `model_version` 只能填權宜字串，失去跨版本保護 | 見 3.4，需模型 API 端配合 |
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
