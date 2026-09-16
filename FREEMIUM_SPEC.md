# 免費信 + 付費 PDF 實作規格

| 項目 | 內容 |
|---|---|
| 版本 | freemium/1.0.0（草案） |
| 狀態 | 待核可,尚未實作 |
| 撰寫日期 | 2026-09-16 |
| 影響範圍 | `10-Cancer-Risk-AI-Platform`、`egbiomed-ai-data-api`、Power Automate、mdi.eg-bio.com (WooCommerce) |
| 前端 `app.js` | **不需修改**,問卷版號維持 `questionnaire/2026-09-08-v19.9-phase1` |

---

## 1. 目標與範圍

將現行「付費才能填問卷、填完直接附上完整 PDF」的單一流程,拆成並存的兩條線:

| | 機構／廠商線 | 免費線（新增） |
|---|---|---|
| 對象 | 華康、Numia、Myrostar 等 | 一般大眾 |
| 進場 | 機構專屬代碼（維持現狀） | **公開宣傳代碼（免費,但仍須輸入）** |
| 閘門 | 維持 `enforced`,兩條線都經過同一道閘門 | 同左 |
| 問卷 | 相同 | 相同 |
| 寄出 | 信件 + PDF 附件 | 免費信,無附件,附付款連結 |
| 付款 | 機構已預付,不再收費 | 付款後另寄一封含 PDF 附件的信 |

### 1.1 免費／付費內容分界（已核定）

**免費信保留:**

- 風險指數數字（例:61.6 分）
- 風險分級（例:高風險）
- 完整模型驗證摘要（AUC、敏感度、測試筆數等現有內容全數保留）
- **排名最前面的那一個癌別名稱**（例:大腸直腸癌）

**僅出現在付費 PDF:**

- 完整十癌排序表與各癌別分數
- 高風險規則命中細節
- 個人化建議與篩檢指引

---

## 2. 系統架構

```text
                      ┌── 機構專屬代碼 ──┐
使用者 ── 輸入代碼 ──┤                    ├──> 閘門驗證 ──> 問卷（同一份）──> POST /api/submit
                      └── 公開宣傳代碼 ──┘         │
                                                   │
                            代碼所屬的 grant 帶著 delivery_mode,
                            於兌換時寫入已簽章的 session cookie
                                                        │
                        伺服器端注入 delivery_mode + report_ticket
                                                        │
                                          Power Automate 流程 A（評估）
                                                        │
                                     模型推論 ──> 存 report_results
                                                        │
                                    ┌───────────────────┴───────────────────┐
                        delivery_mode = institution          delivery_mode = public
                                    │                                       │
                        產 PDF ──> 寄信（含附件）              寄免費信（無附件 + 付款連結）
                                                                            │
                                                             使用者點連結 ──> WooCommerce 付款
                                                                            │
                                                        WordPress plugin ──> 資料 API 驗票
                                                                            │
                                          Power Automate 流程 B（交付）<────┘
                                                                            │
                                          讀 report_results ──> 產 PDF ──> 寄信（含附件）
```

**關鍵原則:PDF 只產一次,產在付款之後,且不重跑模型。** 免費信寄出當下就把模型輸出存進資料庫,付費 PDF 直接讀該筆存檔排版。這避免「免費信寫 61.6 分、模型改版後付費 PDF 卻變 58.3 分」的不一致。

---

## 3. 元件 A:以代碼本身區分兩條線

**檔案:`egbiomed-ai-data-api/create-schema.js`、`egbiomed-ai-data-api/server.js`、`10-Cancer-Risk-AI-Platform/server.js`**

### 3.1 進場方式:兩條線都必須輸入代碼

**`ACCESS_GATE_MODE` 維持 `enforced`,不新增模式,不改動任何路由。** 一般大眾同樣要在閘門輸入一組**公開的宣傳代碼**（免費、可印在文宣與社群貼文上）,機構客戶輸入自己的專屬代碼。畫面、入口與現狀完全相同。

兩條線的差別不在「有沒有代碼」,而在**輸入的是哪一種代碼**。

| | 機構專屬代碼 | 公開宣傳代碼 |
|---|---|---|
| 範例 | `plq5x6bnb9`、`myroq5efc9a8` | `egbio2026`（可印在文宣上） |
| 額度 | 依合約,數十至數百次 | 無上限（見 3.3） |
| 保密 | 只給該機構 | **刻意公開** |
| 送出後 | 信件含 PDF 附件 | 免費信 + 付款連結 |

### 3.2 `grants` 資料表新增一欄

```sql
ALTER TABLE grants
  ADD COLUMN delivery_mode VARCHAR(16) NOT NULL DEFAULT 'institution'
    CHECK (delivery_mode IN ('institution', 'public'));
```

預設 `institution`,因此**所有既有代碼的行為完全不變**,不需回填。鑄碼工具新增旗標:

```bash
npm run access:mint -- --code egbio2026 --delivery-mode public --unlimited \
  --institution PROMO --notes "2026 秋季記者會宣傳代碼"
```

### 3.3 無上限額度:`max_uses` 改為可為 NULL（已決策）

現行約束是 `max_uses INT NOT NULL CHECK (max_uses > 0)`,**無法表達「無上限」**。若公開宣傳代碼沿用有限額度,會出現這個失敗情境:

> 行銷活動進行到一半額度用罄 → 民眾被擋在門外 → 而閘門的拒絕訊息是**刻意設計成一律相同的**（「代碼無法辨識」),所以民眾、客服、行銷三方都不會知道發生了什麼事。

**決定:`max_uses IS NULL` 代表無上限。** 已評估的替代方案是鑄碼時給一個極大的數字（如 1,000,000）——不需動資料庫,但只是把上述靜默失敗往後推,並未消除,且沒有任何監控會在接近上限時示警,故不採用。

#### 3.3.1 資料庫遷移（實作後更正,比原先估計簡單）

規格初版在此處寫錯兩件事,實作時查明並更正如下。

**一、本儲存庫其實有遷移機制。** `create-schema.js` 的 `TABLES` 陣列中每一項都可帶 `checkSql`:先查 `INFORMATION_SCHEMA`,結果為 0 才執行 `sql`。既有先例是 `contact_submissions_full_name`(Azure Database for MySQL 不支援 `ADD COLUMN IF NOT EXISTS`,這個探查就是冪等性的來源)。兩項變更因此都寫成標準遷移項目,重複執行安全,**不需要手動 ALTER**。

**二、兩個 CHECK 約束完全不必動。** 原先寫的「必須先查出自動產生的約束名稱才能卸除」是多餘的:**CHECK 只有在結果為 FALSE 時才算違反,而任何與 NULL 的比較結果是 UNKNOWN,UNKNOWN 滿足 CHECK**。所以 `CHECK (max_uses > 0)` 與 `CHECK (use_count >= 0 AND use_count <= max_uses)` 在 `max_uses IS NULL` 時皆自動通過。

升級因此只是一道 `MODIFY`:

```js
{
  name: 'grants_max_uses_nullable',
  // 探查 IS_NULLABLE 而非欄位是否存在——欄位一直都在,變的是它
  // 收不收 NULL;用欄位存在與否探查會直接跳過,讓它永遠是 NOT NULL。
  checkSql: `
    SELECT COUNT(*) AS existing_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'grants'
      AND COLUMN_NAME = 'max_uses'
      AND IS_NULLABLE = 'YES'
  `,
  sql: `ALTER TABLE grants MODIFY max_uses INT NULL DEFAULT 1`
}
```

保留 `DEFAULT 1` 是刻意的:未指定 `max_uses` 時得到「一次」而非「無上限」,不安全的值永遠不會是預設落點。不改寫兩個 CHECK 表達式,也讓**全新建立的資料庫與升級後的資料庫結構完全一致**。

以下為原先規劃、**現已不需執行**的手動作法,保留供對照:

```sql
-- 1. 查出自動產生的約束名稱
SELECT CONSTRAINT_NAME, CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'egbiomed_ai_cancer_risk';

-- 2. 卸除舊的跨欄位約束（名稱代入上一步查到的）
ALTER TABLE grants DROP CHECK grants_chk_N;

-- 3. 放寬欄位並重建兩項約束,這次明確命名
ALTER TABLE grants MODIFY max_uses INT NULL;
ALTER TABLE grants ADD CONSTRAINT grants_max_uses_positive
  CHECK (max_uses IS NULL OR max_uses > 0);
ALTER TABLE grants ADD CONSTRAINT grants_use_count_within_max
  CHECK (use_count >= 0 AND (max_uses IS NULL OR use_count <= max_uses));
```

#### 3.3.2 程式碼必須同步修改的四處

`null` 在 JavaScript 與 SQL 的比較語意**相反**,這是本項最危險的地方:

```js
5 >= null   // true  （null 被轉型為 0）
null + 5    // 5
```

而在 SQL 中 `x >= NULL` 得到 NULL,不成立。因此同一個 NULL 值在兩邊會得到相反的結果。

| 位置 | 現況 | 不改的後果 |
|---|---|---|
| `server.js:559` | `if (grant.use_count >= grant.max_uses)` | **`use_count >= null` 恆為 true,無上限代碼會 100% 被拒絕**,而拒絕訊息與「打錯字」完全相同,無從分辨。這是本項最嚴重的陷阱 |
| `server.js:633` | `grant.max_uses + add_uses` | `null + 5 = 5`,對無上限代碼執行加值會**把它變成只剩 5 次**。應直接拒絕對無上限代碼加值 |
| `server.js:467` | `const maxUses = row.max_uses \|\| 1` | 鑄碼路徑,`--unlimited` 須能寫入 NULL 而非被轉成 1 |
| `server.js:177`、`594` | 額度查詢與列表 | 剩餘額度會顯示 null,應顯示「無上限」 |

`server.js:568` 的 `CASE WHEN use_count + 1 >= max_uses THEN 'redeemed'` 在 SQL 中因 NULL 比較不成立而自動落到 ELSE,**恰好是正確行為**,無須修改——但正因為它「碰巧對了」,更該在測試中明確固定住。

#### 3.3.3 必要測試

- 無上限代碼連續兌換 50 次全部成功,`status` 始終維持 `issued`
- 對無上限代碼執行加值被拒絕,且 `max_uses` 仍為 NULL
- 既有的有限額度代碼行為完全不變（額度用罄仍轉為 `redeemed`）

### 3.4 `delivery_mode` 如何傳遞

兌換代碼時,`redeemAccessGrant` 除了回傳 `grantId`,一併回傳該 grant 的 `delivery_mode`,由 `buildAccessSessionCookie`（`server.js:504`）寫進**已簽章**的 session cookie:

```js
signSessionCookie({ grantId, mode, sid, exp: expiresAtSeconds }, ACCESS_GATE_SESSION_SECRET);
```

`receiveSubmission`（`server.js:297`）於契約驗證**之後**、轉送 Power Automate **之前**注入:

```js
submission.delivery_mode = sessionPayload.mode;
submission.grant_id = sessionPayload.grantId;
```

**三項安全性質:**

1. **前端完全無法影響。** 客戶端送出的任何 `delivery_mode` 一律被伺服器覆寫,作法比照 `server.js:324-338` 對 `record_id` 的處理。若讓客戶端決定,任何人改成 `institution` 就能免費取得完整 PDF。
2. **cookie 經 HMAC 簽章,改一個字元即失效**,所以把模式放進 cookie 與放在伺服器記憶體同樣安全。
3. **不增加資料庫查詢。** 模式在兌換當下就決定,送出時直接讀 cookie,無須回查 grant。

### 3.5 session 消耗行為

兩條線都維持現狀:送出報告後 session 立即作廢,要再填一次必須重新輸入代碼（`consumeSessionAndGetClearHeaders`)。公開代碼因額度無上限,民眾重新輸入同一組碼即可再次填寫——此為預期行為。

---

## 4. 元件 B:報告票券（report ticket）

**新檔案:`10-Cancer-Risk-AI-Platform/lib/report-ticket.js`**

### 4.1 構造

直接複用 `lib/access-gate.js` 既有的 `signSessionCookie` / `verifySessionCookie`,不另寫密碼學程式碼:

```text
payload: { v: "rt1", rid: <record_id>, exp: <unix seconds> }
輸出:    base64url(JSON) + "." + hmac_sha256_hex
```

| 項目 | 值 | 理由 |
|---|---|---|
| 密鑰 | `REPORT_TICKET_SECRET`（新增環境變數） | 與 `ACCESS_GATE_SESSION_SECRET` 分離。後者外洩只能偽造 30 分鐘的問卷進場權;若共用,一併等於能偽造所有付費報告 |
| 有效期 | 30 天 | 付款連結必須遠長於問卷 session |
| 驗證 | HMAC 常數時間比對 + `exp` 檢查 | `verifySessionCookie` 已具備 |

### 4.2 關於「不透明」的說明

上述構造是**簽章過且無法竄改**的,但 payload 是 base64url 編碼的 JSON,可被解開讀出 `record_id`。嚴格說是「不可偽造」而非「不可讀」。

判斷:**可接受,建議採用。** `record_id` 是伺服器產生的 UUID,單獨持有它不能做任何事;沒有正確簽章的票券一律被拒。且此設計為無狀態,不需額外資料表與查詢。

若日後認定必須真正不可讀（例如付款連結會出現在 WooCommerce 訂單備註而被門市人員看到）,有兩條升級路徑,皆不影響其他元件:

1. 改用 AES-256-GCM 加密 payload 取代單純簽章（仍無狀態,約 15 行）
2. 改為資料庫存放隨機票券（可撤銷、可標記已使用,但多一張表與一次查詢）

### 4.3 注入時機

於 `receiveSubmission` 內 `recordId` 產生後立即簽發,隨提交內容一併送往 Power Automate。**不需新增 API 呼叫**——流程 A 直接拿到現成的票券字串填進信件連結。

```js
submission.report_ticket = deliveryMode === "public"
  ? signReportTicket(recordId, REPORT_TICKET_SECRET)
  : null;
```

---

## 5. 元件 C:模型結果存檔

**檔案:`egbiomed-ai-data-api/create-schema.js`、`server.js`**

現況 `assessment_submissions` 只存輸入（`submission_json`）與狀態旗標（`report_status`）,**完全沒有存模型輸出**。新增一張表:

```sql
CREATE TABLE IF NOT EXISTS report_results (
  record_id CHAR(36) NOT NULL,

  model_version VARCHAR(64) NOT NULL,
  threshold_version VARCHAR(64) NULL,
  report_template_version VARCHAR(64) NULL,
  guideline_version VARCHAR(64) NULL,

  -- 免費信要用到的四項,獨立成欄以便查詢與客服比對
  risk_score DECIMAL(6,2) NULL,
  risk_band VARCHAR(32) NULL,
  top_cancer_id VARCHAR(64) NULL,
  top_cancer_label VARCHAR(128) NULL,

  -- REPORT_SPEC.md 第 8 節的完整 prediction 物件,含 cancer_results 與
  -- 規則命中。欄位隨模型版本變動,比照 submission_json 以 JSON blob 保存
  prediction_json JSON NOT NULL,

  computed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (record_id),
  INDEX idx_computed_at (computed_at)
)
```

### 5.1 新增端點

| 端點 | 呼叫者 | 用途 |
|---|---|---|
| `POST /api/reports/result` | Power Automate 流程 A | 模型推論後立即寫入 |
| `GET /api/reports/result/:record_id` | Power Automate 流程 B | 付款後讀回以排版 PDF |

認證:新增第五把金鑰 `REPORT_RESULT_API_KEY`,比照 `server.js:44-57` 既有的「一把金鑰一種爆炸半徑」原則。此金鑰外洩的後果是可讀取健康評估結果（隱私問題）,不涉及鑄造代碼或竄改資料,故與 `ACCESS_GATE_API_KEY`、`PURCHASE_API_KEY` 分離。

速率限制比照 `purchaseLimiter`,**在比對金鑰之前檢查**,使錯誤金鑰的嘗試同樣消耗額度。

### 5.2 `report_status` 狀態機

沿用 `assessment_submissions.report_status` 既有欄位,不新增:

```text
pending ──> free_sent ──> paid ──> delivered
   │            │
   └────────────┴──> failed
```

機構線:`pending -> delivered`（跳過中間兩段）。

---

## 6. 元件 D:付款流程（WooCommerce）

**檔案:`10-Cancer-Risk-AI-Platform/contracts/purchase/egbio-access-code.php`（擴充現有 plugin,不另建）**

### 6.1 商品

在 mdi.eg-bio.com 新增商品「完整癌症風險評估報告」,取得其 product ID。

### 6.2 付款連結格式

免費信中的按鈕指向:

```text
https://mdi.eg-bio.com/?add-to-cart=<PRODUCT_ID>&egbio_ticket=<REPORT_TICKET>
```

### 6.3 plugin 需新增的三段

1. **接票**:在 `woocommerce_add_to_cart` 或 `template_redirect` 讀取 URL 上的 `egbio_ticket`,存入 WC session。
2. **綁訂單**:`woocommerce_checkout_create_order` 將票券寫入訂單 meta `_egbio_report_ticket`。
3. **付款後回報**:`woocommerce_order_status_processing` / `completed`（**priority 5,與現有代碼發放同一組掛鉤**）,POST 至資料 API:

```json
POST /api/reports/purchase
X-EGBiomed-Purchase-Key: <PURCHASE_API_KEY>

{ "ticket": "<REPORT_TICKET>", "order_reference": "wc-order-984" }
```

沿用現有 `PURCHASE_API_KEY`,不再增加 WordPress 端持有的密鑰。**票券密鑰 `REPORT_TICKET_SECRET` 絕對不放在 WordPress**——該主機是本系統中最暴露的元件（此判斷已記於 `server.js:49-56`）。驗票一律在資料 API 端進行。

比照現有 plugin 的既定作法:**每一條提早返回的路徑都要寫一筆訂單備註**,否則「plugin 沒載入」「掛鉤沒觸發」「SKU 不符」三種失敗在畫面上無法區分。

### 6.4 資料 API 的 `/api/reports/purchase`

1. 速率限制（先於金鑰比對）
2. 比對 `PURCHASE_API_KEY`
3. 驗證票券簽章與 `exp`
4. 冪等性檢查:同一 `order_reference` 已處理過則直接回 200（比照 `findPurchaseGrantByReference`）
5. 確認 `report_results` 有該 `record_id` 的資料
6. `report_status` 更新為 `paid`
7. 觸發 Power Automate 流程 B（觸發 URL 存於資料 API 環境變數 `REPORT_DELIVERY_FLOW_URL`）
8. 回傳 `{ ok: true }`

---

## 7. 元件 E:Power Automate 拆流

### 7.1 流程 A（現有流程,修改）

| 步驟 | 變更 |
|---|---|
| 1-5 | 不變（觸發、剖析、Excel 保存、模型 API、剖析模型結果） |
| **6（新增）** | `HTTP - 儲存模型結果` → `POST /api/reports/result` |
| **7（新增）** | `條件 - delivery_mode` |
| 7a `institution` | 原有步驟全部保留:Compose report_payload → Generate PDF → SharePoint → 取得檔案內容 → 寄信（含附件） |
| 7b `public` | 寄免費信（**無附件**）,付款按鈕連結由 `report_ticket` 組成;更新 `report_status = free_sent` |

### 7.2 流程 B（新建:報告交付流程）

| 步驟 | 內容 |
|---|---|
| 1 | HTTP Trigger（由資料 API 於驗票成功後呼叫） |
| 2 | `HTTP - 取得模型結果` → `GET /api/reports/result/{record_id}` |
| 3 | `Compose - Report Payload`（與流程 A 相同的組裝邏輯） |
| 4 | `HTTP - Generate PDF` |
| 5 | `建立檔案 - SharePoint`,路徑維持 `/CancerRiskReports/{yyyy}/{MM}/{record_id}.pdf` |
| 6 | `取得檔案內容` |
| 7 | `傳送電子郵件 (V2)`,含 PDF 附件 |
| 8 | `HTTP - 更新報告狀態` → `delivered` |

流程 B 的組裝與產檔步驟與流程 A 的 7a 相同,實作時應確認兩處使用同一份 report_payload 組裝邏輯,避免日後只改一邊。

### 7.3 觸發 schema 重貼（必要）

`contracts/power-automate/deployed-flow-trigger.schema.json` 需新增三個由伺服器注入的欄位:

```json
"delivery_mode": { "type": "string", "enum": ["institution", "public"] },
"report_ticket": { "type": ["string", "null"] },
"grant_id": { "type": ["integer", "null"] }
```

修改後必須**手動貼進 Power Automate 的 HTTP 觸發程序與 Parse JSON 兩個地方**（既有的手動同步流程）。

`contracts/power-automate/transitional-submission.schema.json`（伺服器對 `/api/submit` 的入站驗證）**不需修改**——這三個欄位是驗證通過後才注入的,前端從未送出。

---

## 8. 元件 F:信件樣板

### 8.1 新增兩份

| 檔案 | 用途 |
|---|---|
| `power-automate-email-free-zh.html` | 免費線中文信 |
| `power-automate-email-free-en.html` | 免費線英文信 |

現有 `power-automate-email-zh.html` / `power-automate-email-en.html` 保留給機構線與付費交付信,不更動版型。

### 8.2 免費信版型（以現有樣板為基礎修改）

| 區塊 | 處理 |
|---|---|
| 標題 / 品牌 | 不變 |
| 風險指數數字 | **保留** |
| 風險分級 | **保留** |
| 模型驗證摘要 | **完整保留** |
| 各癌別風險 | 由完整列表改為**僅呈現排名第一的癌別名稱**一行 |
| 規則命中細節 | **移除** |
| 個人化建議 | **移除**,改為付款引導 |
| 付款按鈕（新增） | 連向第 6.2 節的連結,說明完整報告包含十癌完整排序、規則命中說明與個人化篩檢建議 |
| 免責聲明 / 聯絡方式 | 不變 |

沿用既有版型規範:表格 `width="100%"`,儲存格 `width="50%"` 與 `valign="top"`。

---

## 9. 風險與必須處理的副作用

### 9.1 公開宣傳代碼不是存取控制

宣傳代碼刻意公開,因此它擋不住有心人,也不該被當成防護。它實際提供的是另外三件事:

| 作用 | 說明 |
|---|---|
| **行銷歸因** | 每個通路發一組不同的公開代碼（記者會、社群、展覽、通路商),全部標記 `delivery_mode=public`,即可從 `access_events` 看出哪個通路帶進多少人、轉換多少 |
| **開關** | 撤銷代碼即可立刻關閉免費線,不需改設定、不需重新部署 |
| **摩擦** | 擋掉隨手亂填的流量,自動化濫用仍須靠速率限制 |

真正的防濫用仍是既有的 `submitLimiter`（每 IP 每 10 分鐘 20 次)與 `codeRedeemLimiter`。建議另加:同一 email 於短時間內重複提交時僅寄一封信。

相較於「免費線完全不設閘門」的作法,本設計讓 `/api/submit` **維持在閘門之後**,風險明顯較低。

### 9.2 IRB 文件需補件

現行 IRB 逐題審核文件描述的是「付費進場」的受試者來源。改以公開宣傳代碼免費招募,改變了受試者組成與招募方式,且免費線的資料同樣進入研究資料表。**知情同意內容本身不需修改**（現有三項同意已涵蓋資料使用）,但「受試者來源與招募方式」一節必須補件後,才可對外公布宣傳代碼。

保留閘門對此有利:受試者仍須主動輸入一組代碼才能進入,招募路徑是可指認、可追溯、可隨時終止的,而非任何人經搜尋引擎即可進入填答。此點應寫入補件說明。

### 9.3 付費客戶重新索取報告

PDF 存於 SharePoint `/CancerRiskReports/{yyyy}/{MM}/{record_id}.pdf`,客服可依 `record_id` 重寄。不建立匿名公開連結（維持 `REPORT_SPEC.md` 第 18.1 節的規定）。

### 9.4 模型改版與已寄出的免費信

因 PDF 讀取 `report_results` 的存檔,模型改版不影響已寄出免費信的一致性。但 `report_template_version` 若改版,舊資料重新排版可能失敗——`prediction_json` 已保留原始 `model_version` 與 `report_template_version`,產檔前應比對,不相容時記錄錯誤而非寄出錯誤報告。

---

## 10. 實作順序

建議依序進行,每一步皆可獨立驗證:

| # | 工作 | 產出可驗證於 |
|---|---|---|
| 1 | `report_results` 表 + 兩個端點 + `REPORT_RESULT_API_KEY` | 資料 API 單元測試 |
| 2 | 流程 A 新增步驟 6（存模型結果） | 實際提交後資料表有值 |
| 3 | `lib/report-ticket.js` + 單元測試 | 平台測試套件 |
| 4 | `grants.delivery_mode` 欄位 + 額度決策 + 鑄碼旗標 | 資料 API 單元測試;既有代碼行為不變 |
| 5 | 兌換回傳 mode、寫入 cookie、`delivery_mode` 注入 | 平台測試套件（含「客戶端偽造 delivery_mode 被覆寫」的測試） |
| 6 | 免費信樣板 + 流程 A 條件分支 | 以測試用 public 代碼提交,收到無附件信件 |
| 7 | 流程 B（交付流程） | 手動以測試 record_id 觸發 |
| 8 | `/api/reports/purchase` + 驗票 | 以簽發的測試票券呼叫 |
| 9 | WooCommerce 商品 + plugin 擴充 | 測試訂單（沿用先前不實際付款的測試方式） |
| 10 | IRB 補件 | —— |
| 11 | 鑄發正式宣傳代碼並對外公布 | —— |

**全程不需切換 `ACCESS_GATE_MODE`。** 第 4 步的新欄位預設為 `institution`,既有代碼行為不變;第 1 至 9 步都能在正式環境安全完成,因為在鑄出第一組 `public` 代碼之前,免費線根本沒有入口。第 11 步——公布代碼——才是真正的上線動作,而撤銷該代碼即可立即回退。

---

## 11. 驗收條件

- [ ] 持機構代碼者進場、填答、送出後,收到含 PDF 附件的信,行為與現狀完全一致
- [ ] 既有的每一組機構代碼在加入 `delivery_mode` 欄位後行為不變（預設 `institution`）
- [ ] 持公開宣傳代碼者進場、填答,送出後收到免費信:含分數、分級、完整驗證摘要、第一名癌別名稱
- [ ] 未輸入任何代碼者仍無法進入問卷（閘門維持 `enforced`）
- [ ] 無上限的公開代碼連續兌換多次皆成功,`use_count` 不會觸頂拒絕
- [ ] 免費信**不含** PDF 附件、完整十癌排序、規則命中細節、個人化建議
- [ ] 客戶端提交偽造的 `delivery_mode: "institution"` 時被伺服器覆寫為 `public`
- [ ] 竄改票券任一字元後,`/api/reports/purchase` 回傳失敗且不觸發交付
- [ ] 過期票券（逾 30 天）被拒
- [ ] 同一訂單重複回報時不會寄出第二份 PDF
- [ ] 付費 PDF 上的分數與分級與該筆免費信完全相同
- [ ] 模型結果寫入失敗時,免費信不寄出,`report_status` 記為 `failed`
- [ ] PDF 產生失敗時不寄出空白附件（沿用 `REPORT_SPEC.md` 既有驗收條件）

---

## 12. 新增環境變數彙整

| 變數 | 位置 | 用途 |
|---|---|---|
| `REPORT_TICKET_SECRET` | Render（平台）、Azure（資料 API） | 票券簽章,兩端必須相同 |
| `REPORT_RESULT_API_KEY` | Azure（資料 API）、Power Automate | 模型結果讀寫 |
| `REPORT_DELIVERY_FLOW_URL` | Azure（資料 API） | 流程 B 的觸發 URL |
| `EGBIO_REPORT_PRODUCT_ID` | WordPress | 完整報告商品 ID |

**`REPORT_TICKET_SECRET` 必須同時宣告於 [`render.yaml`](render.yaml)（`sync: false`）與 Render dashboard,缺一不可。** 只設在 dashboard 而未宣告於 Blueprint 的變數,會在下一次 Blueprint 同步時被靜默清除——2026-09-09 的 `ACCESS_GATE_SESSION_SECRET` 即為此例,且變數消失的當下不會壞,要等下一次部署重啟才整站掛掉,兩者之間有時間差,難以歸因。詳見 `ACCESS_GATE.md` 的升級警告。

票券密鑰一旦遺失或重新產生,所有**尚未付款的免費信裡的付款連結會全數失效**,且使用者不會收到任何說明。與 session cookie 不同的是,受影響的人無法靠「重新輸入代碼」自救——他們必須重填整份問卷。
