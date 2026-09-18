# 流程 C（報告交付）建立操作手冊

| 項目 | 內容 |
|---|---|
| 對象 | 實際在 Power Automate 編輯器裡操作的人 |
| 前置閱讀 | [`PIPELINE_READ_FIRST.md`](PIPELINE_READ_FIRST.md)、[`FLOW_B_RUNBOOK.md`](FLOW_B_RUNBOOK.md) |
| 設計依據 | [`FREEMIUM_SPEC.md`](FREEMIUM_SPEC.md) 第 7.3 節 |
| 撰寫日期 | 2026-09-18 |

流程 C 在付款完成後被資料 API 呼叫，負責產出完整報告並寄給付款的人。

---

## 0. 三件跟流程 B 不一樣的事

**一、流程 C 從「流程 A」複製，不是從 B。**

規格原本寫「由 B 再複製」，那是錯的。流程 C 需要的是 `/generate_report` → 存檔 → 轉檔 → 附件寄信 這一整段尾巴，而**流程 B 已經把那幾步刪掉了**，只有流程 A 還留著。

複製動作（「另存新檔」）在流程清單上操作即可，**不需要打開流程 A 的編輯器**，原本那條也完全不受影響。

**二、流程 A 仍然不要打開。** 規則沒變。

**三、複製完立刻改名**：

| | |
|---|---|
| 新複製出來的 | `EGAI-C 報告交付` |

---

## 1. 實測過的事實，先看

這些是 2026-09-17／18 實地量到的，不是從文件推斷的。

### `/generate_report` 回傳 Word 檔，不是 PDF

```
HTTP 200 | application/vnd.openxmlformats-officedocument.wordprocessingml.document | 2.6 MB
```

所以流程 A 的尾巴裡**一定有一個轉檔動作**（多半是 SharePoint／OneDrive 的「轉換檔案」），否則客戶收到的不會是 PDF。複製過來的流程 C 會一併帶著那一步——**不要刪它**。

動手前先把那段尾巴逐一點開看一次，確認實際有哪些動作。`PIPELINE_READ_FIRST` 第 3 節對這一段標註為「尚未實地確認」。

### 它吃的是特徵列，不是預測結果

`/generate_report` 的輸入與 `/predict` 相同，代表**它自己重跑一次模型**。這個 API 沒有「拿現成的預測結果去排版」的介面。

規格原本寫的「付款後產 PDF，但不重跑模型」**做不到**。改為下一項的做法。

### 因此模型輸入現在也存起來了

`report_results` 新增 `feature_row` 欄位，存的是產生該筆預測的**那一份 `ai_api_feature_row`**。流程 C 拿它去產報告，等於用產生免費信數字的同一份輸入重跑一次。

存的是**不含 `lang` 與 `name` 的版本**——那兩個欄位是流程呼叫 API 前才附加的，而 `name` 是受檢者的姓名，那張表依設計不存個資。流程 C 用觸發帶進來的收件資訊自己補上。

---

## 2. 觸發程序

流程 C 由資料 API 的 `/api/reports/purchase` 在驗票成功後呼叫，送進來的內容是：

```json
{
  "record_id": "dfc5e79a-f1dc-48f6-bc9c-46f282b3750f",
  "order_reference": "wc-order-984",
  "full_name": "AB",
  "email": "abbiehung@eg-bio.com",
  "language": "zh",
  "report_language": "zh-Hant"
}
```

觸發程序的 JSON 結構描述**整個換掉**（流程 A 那份 35 欄的不適用）：

```json
{
  "type": "object",
  "properties": {
    "record_id": { "type": "string" },
    "order_reference": { "type": "string" },
    "full_name": { "type": "string" },
    "email": { "type": "string" },
    "language": { "type": "string" },
    "report_language": { "type": "string" }
  },
  "required": ["record_id", "order_reference", "email"]
}
```

複製完成後，**把觸發 URL 記下來**，之後要填進 Azure 的 `REPORT_DELIVERY_FLOW_URL`。

---

## 3. 刪掉前半段

流程 C 不處理問卷，只處理一筆已經評估完的結果。依序刪除：

- [ ] `剖析 JSON`（沒有問卷內容可剖析）
- [ ] `執行指令碼`（研究資料在免費線那次就寫過了，重寫會產生重複列）
- [ ] `HTTP`（`/predict`）——**注意是這一個，不是 `HTTP 1`**
- [ ] `條件 1`（如果它是依問卷內容分支的話；先點開確認再刪）

**保留**：`HTTP 1`（`/generate_report`）、建立檔案、轉換檔案、取得檔案內容、傳送電子郵件。

---

## 4. 新增「取得模型結果」

插在最前面，緊接觸發程序之後。**命名為 `GetStoredResult`**（純 ASCII、無空格，理由見下方⚠️）。

| 欄位 | 值 |
|---|---|
| 方法 | `GET` |
| URI | `<資料 API 網址>/api/reports/result/@{triggerBody()?['record_id']}` |
| 標頭 | `x-egbiomed-report-result-key` : （Azure 上的 `REPORT_RESULT_API_KEY`） |

> ⚠️ 資料 API 網址取自 Render 的 `AZURE_ACCESS_GATE_API_BASE_URL`，**不要從 App Service 名稱拼**——流程 B 就是這樣踩到 `UnresolvableHostName` 的。

回應形狀：

```json
{ "ok": true, "result": { "record_id": "...", "risk_score": "64.00",
  "risk_band": "高風險", "prediction_json": { ... }, "feature_row": { ... } } }
```

---

## 5.（建議）加一道一致性檢查

這一步把「付費報告不會跟免費信說不同的數字」從承諾變成檢查。**兩個動作**：

**5.1 `RescoreCheck`**

| 欄位 | 值 |
|---|---|
| 方法 | `POST` |
| URI | `https://cancer-risk-api.onrender.com/predict` |
| 本文 | `@{body('GetStoredResult')?['result']?['feature_row']}` |

**5.2 `條件 - 分數是否仍相符`**

條件的兩個比較值都用 **fx 運算式**填，**不加 `@{}`**（見第 7 步的說明）：

| 位置 | 填入 |
|---|---|
| 左值 | `body('RescoreCheck')?['risk_score_pct']` |
| 運算子 | 等於 |
| 右值 | `float(body('GetStoredResult')?['result']?['risk_score'])` |

右值包了一層 `float()`：資料庫那一欄是 `DECIMAL`，讀回來是字串 `"46.80"`，而左值是數字 `46.8`。不轉型的話兩者永遠不相等，這道檢查就會變成「每一筆都中止」。

- **相符** → 繼續往下產報告
- **不相符** → **中止，不要寄信**。加一個「終止」動作，狀態設為 `Failed`，訊息寫明 record_id 與兩個分數

不相符代表模型在免費信寄出之後變動過。這時寄出的報告會跟客戶付錢時看到的數字不一樣——**停下來讓人處理，比自動寄一份對不上的報告好**。

> 想先把流程串通的話，這一步可以之後再加。但**正式對外之前必須補上**，否則「兩邊數字一致」只是一句沒有檢查的話。

---

## 6. 改 `HTTP 1`（`/generate_report`）的本文

原本它讀的是問卷剖析結果，現在改讀存檔。把本文換成：

```
@{addProperty(addProperty(
    body('GetStoredResult')?['result']?['feature_row'],
    'lang', if(equals(triggerBody()?['report_language'], 'en'), 'en', 'zh-TW')),
    'name', coalesce(triggerBody()?['full_name'], ''))}
```

這**刻意逐字照抄流程 A 的結構**，只換資料來源：

| 這一層 | 流程 A | 流程 C |
|---|---|---|
| 主體 | `body('剖析_JSON')?['ai_api_feature_row']` | 存檔的 `feature_row` |
| `lang` | `triggerBody()?['report_language']` | 同左（觸發內容不同但欄位同名） |
| `name` | 問卷裡的姓名 | 觸發帶進來的姓名（來自 contact 資料表） |

> `lang` 與 `name` 這兩層**不能省**。`PIPELINE_READ_FIRST` 第 3 節記載：動 body 運算式時把它們一起刪掉，報告語言與姓名會**靜默**落回預設值。

#### 出現「無效的參考」時，先看這兩件事

**一、順序。** Power Automate **只能引用排在自己前面的動作**，而新增的動作預設加在最後面。`GetStoredResult` 必須在 `HTTP 1` **上方**：

```
當收到 HTTP 要求時
  ↓
GetStoredResult          ← 必須在這裡
  ↓
RescoreCheck → 條件
  ↓
HTTP 1（/generate_report）
  ↓
建立檔案 → 轉換 → 取得內容 → 寄信
```

用拖曳把它移上去。

**二、名稱。** 運算式裡的動作名稱要把空格寫成底線，所以 `HTTP - 取得模型結果` 得寫成 `HTTP_-_取得模型結果`——空格、連字號、中文三種東西湊在一起，少一個底線就無效。

**這就是本手冊把兩個新動作命名為 `GetStoredResult` 與 `RescoreCheck` 的原因**：純 ASCII、無空格，運算式裡怎麼寫就怎麼是。已經用中文命名的話，改名時 Power Automate 通常會問要不要自動更新引用，選「是」。

最保險的填法是**不要打動作名稱**：在運算式編輯器切到「動態內容」分頁，點該動作的輸出，Power Automate 會插入正確的引用，再自己補上 `?['result']?['feature_row']` 這段。

---

## 7. 寄信

**收件人改成觸發帶進來的**（原本是問卷裡的 email）。

最簡單的做法是**不要打字**：點一下「收件者」欄位 → 右側的**動態內容**清單 → 在「當收到 HTTP 要求時」那一區點 `email`。

要自己寫運算式的話，點 **fx** 分頁，輸入 `triggerBody()?['email']`。

> ⚠️ **`@{ }` 只用在「文字裡插值」的地方，一般欄位不要加。**
>
> | 填在哪裡 | 寫法 |
> |---|---|
> | HTTP 動作的**本文**（整塊 JSON 文字） | `@{triggerBody()?['email']}` |
> | HTTP 動作的 **URI**（字串中插值） | `.../result/@{triggerBody()?['record_id']}` |
> | 收件者這種**一般欄位**（用 fx 運算式） | `triggerBody()?['email']` ← 不加 `@{}` |
>
> 在一般欄位裡連 `@{}` 一起貼，會得到「無效的參數」。本手冊第 4 與第 6 步寫的是本文與 URI，那兩處**要**保留 `@{}`。
>
> 動態內容清單裡找不到 `email`，代表第 2 步的觸發 schema 沒貼好，回去確認。

**附件保留**——這封信的重點就是那份 PDF。

信件內文可以先沿用流程 A 的樣板。之後若要做一封專屬的「您購買的完整報告」信件，再另外處理。

---

## 8. 啟用與驗證

### 8.1 先設環境變數

Azure App Service → 環境變數：

| Key | Value |
|---|---|
| `REPORT_DELIVERY_FLOW_URL` | 第 2 步記下的流程 C 觸發 URL |
| `REPORT_TICKET_SECRET` | **與 Render 上完全相同的值** |

⚠️ 票券密鑰兩邊不一致的話，**每一條付款連結都會驗不過**，而錯誤訊息是刻意通用的，看不出原因。

### 8.2 不靠 WooCommerce 就能測整條鏈路

WooCommerce 商品還沒上架（第 12 步），但**不需要它也能走完整條路**——從簽票券到收到附件。這比用 Power Automate 的「測試 → 手動」好，因為它同時驗證了購買端點。

**先確認測試資料有 `feature_row`。** 只有在流程 B 補上那一行**之後**送出的評估才有；更早的那些是 null，購買端點會擋下來並回「predates stored report inputs」。

Azure SSH — Application：

```bash
P=${PORT:-8080}; R=<你的 record_id>; curl -s "http://localhost:$P/api/reports/result/$R" -H "x-egbiomed-report-result-key: $REPORT_RESULT_API_KEY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).result;const f=r.feature_row;console.log('risk_score:',r.risk_score,'| feature_row:',f?'✓ '+Object.keys(f).length+' 欄':'✗ null');});"
```

**簽一張票券**（Render Shell——密鑰只在那台的環境變數裡，不會被印出來）：

```bash
node -e "const{signReportTicket}=require('./lib/report-ticket');console.log(signReportTicket('<你的 record_id>', process.env.REPORT_TICKET_SECRET))"
```

**模擬付款**（Azure SSH）：

```bash
P=${PORT:-8080}; curl -s -X POST "http://localhost:$P/api/reports/purchase" -H "Content-Type: application/json" -H "x-egbiomed-purchase-key: $PURCHASE_API_KEY" -d '{"ticket":"<票券>","order_reference":"manual-test-001"}'; echo
```

預期 `{"ok":true,"reused":false,"record_id":"...","delivery_triggered":true}`。

**再跑一次完全相同的指令**，預期 `"reused":true` 且**不會收到第二封信**——這驗的是 WooCommerce 重送 webhook 時不會重複寄報告。

| 回應 | 意思 |
|---|---|
| `Ticket not valid` | 兩邊的 `REPORT_TICKET_SECRET` 不一致 |
| `predates stored report inputs` | 那筆沒有 `feature_row`，換一筆新的 |
| `No contact details` | contact 資料表沒那筆 |
| `Delivery flow unreachable` | `REPORT_DELIVERY_FLOW_URL` 錯了，或流程 C 沒開 |

### 驗收

| 檢查 | 預期 |
|---|---|
| 購買端點回應 | `reused:false`、`delivery_triggered:true` |
| 收到的信 | **有** PDF 附件 |
| PDF 裡的風險分數 | 與那筆免費信**完全相同** |
| 流程 A 的執行紀錄 | **沒有**新執行 |
| 流程 B 的執行紀錄 | **沒有**新執行 |
| 重送同一 order_reference | `reused:true`，**沒有第二封信** |

最後兩項確認三條流程彼此獨立。

---

## 9. 已知缺口

| 缺口 | 影響 |
|---|---|
| `/generate_report` 會重跑模型 | 以第 5 步的一致性檢查因應，不是根治 |
| `/predict` 不回傳模型版本 | `model_version` 只能存規則層＋特徵合約的複合值 |
| `report_status` 更新端點未做 | 交付完成後狀態不會更新，不影響寄送 |
| 付費報告沿用免費信樣板 | 內容正確，但沒有針對「您購買的報告」調整措辭 |

---

## 10. 出事了怎麼辦

| 症狀 | 處置 |
|---|---|
| 流程 C 壞掉 | 清空 Azure 的 `REPORT_DELIVERY_FLOW_URL`。購買端點會記錄付款、標記交付失敗並回 503，**付款紀錄不會遺失**，客戶查得到 |
| 想整個關掉免費線 | 撤銷公開宣傳代碼 |
| 流程 A 或 B 出現非預期執行 | 立刻停手回報，不要自行修流程 A |

`report_purchases` 表裡 `delivery_triggered_at` 為 null 且 `delivery_error` 有值的列，就是「付了錢還沒拿到報告」的客戶名單。
