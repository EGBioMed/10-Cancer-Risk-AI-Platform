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

**保留**：`HTTP 1`（`/generate_report`）、建立檔案、轉換檔案、取得檔案內容、傳送電子郵件。

**`條件` 不要直接刪。** 先點開看它在比什麼——它很可能是中英文分支，寄信的動作就在其中一支裡面，刪掉會把那些一起帶走。

### 3.1 刪掉剖析 JSON 之後，每一處引用它的地方都要改

刪除後儲存會得到：

```
The action(s) '剖析_JSON' referenced by 'inputs' in action '條件'
are not defined in the template.
```

這是正常的——剩下的動作還指著已經不存在的來源。**儲存失敗一次只報一個錯**，修完再存可能還會跳下一個，逐一改完為止。

對照表（右欄都用 fx 運算式，不加 `@{}`，除非填的是本文或 URI）：

| 原本（流程 A） | 流程 C 改成 |
|---|---|
| `body('剖析_JSON')?['report_language']` | `triggerBody()?['report_language']` |
| `body('剖析_JSON')?['full_name']` | `triggerBody()?['full_name']` |
| `body('剖析_JSON')?['email']` | `triggerBody()?['email']` |
| `body('剖析_JSON')?['contact_row']?['record_id']` | `triggerBody()?['record_id']` |
| `body('剖析_JSON')?['ai_api_feature_row']` | `body('GetStoredResult')?['result']?['feature_row']` |

**建立檔案的檔名與 SharePoint 路徑裡也常帶 `record_id`**，容易漏看。

分支邏輯本身不必改——資料 API 送進來的內容同樣有 `report_language`，只是換一個來源。

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

## 5. 一致性檢查（**必做**）

這一步把「付費報告不會跟免費信說不同的數字」從承諾變成檢查。**三個動作**，插在第 4 步之後、第 6 步之前。

### 5.0 要比對什麼：免費信承諾過的每一個數字

免費信對客戶說了三件可驗證的事：風險指數、風險分級、排第一的癌別。付費報告若在任何一項上說了不同的話，客戶會發現，而且他已經付錢了。所以三項都比，不是只比分數。

**而且比的是「畫面上那個數字」，不是浮點原始值。** 免費信顯示分數的運算式是：

```
formatNumber(mul(float(string(body('HTTP_AI_predict')['risk_score'])),100),'0.0')
```

也就是 `risk_score`（0–1 形式）乘 100、取到小數一位。而資料庫那一欄是 `DECIMAL(6,2)`，存的是 `risk_score_pct`，讀回來是字串 `"64.00"`。兩邊經過的路徑不同，直接比浮點數是在比兩個不保證同型別、同精度的東西 —— 那會讓這道檢查變成「每一筆都中止」，也就是整條交付線停擺。

兩邊都先化成客戶看到的那個字串（小數一位）再比，同時也對得起這道檢查存在的理由：要保證的是**客戶讀到的數字**一致。

### 5.1 `RescoreCheck`

| 欄位 | 值 |
|---|---|
| 方法 | `POST` |
| URI | `https://cancer-risk-api.onrender.com/predict` |
| 本文 | `@{body('GetStoredResult')?['result']?['feature_row']}` |

存下來的 `feature_row` 就是 `ai_api_feature_row` 本身，與流程 B 當初餵給 `/predict` 的東西逐位元組相同（`lang`、`name` 是產報告時才附加的，沒有存進去）。所以這一次呼叫的輸入與當初完全一樣，輸出若不同，就只可能是模型變了。

### 5.2 `條件 - 與免費信是否仍一致`

三列，關係選 **且（AND）**。六個值**全部用 fx 運算式**填，**不加 `@{}`**（理由見第 7 步）：

| # | 比對 | 左值 | 右值 |
|---|---|---|---|
| 1 | 風險指數 | `formatNumber(mul(float(string(body('RescoreCheck')?['risk_score'])),100),'0.0')` | `formatNumber(float(body('GetStoredResult')?['result']?['risk_score']),'0.0')` |
| 2 | 風險分級 | `body('RescoreCheck')?['final_risk_level']` | `body('GetStoredResult')?['result']?['risk_band']` |
| 3 | 第一名癌別 | `first(body('RescoreCheck')?['cancer_risks'])?['cancer']` | `body('GetStoredResult')?['result']?['top_cancer_label']` |

運算子三列都是**等於**。

第 1 列左右兩邊路徑不同是刻意的：左邊重現免費信的算法（`risk_score` × 100），右邊是存檔值（`risk_score_pct`）。這道檢查因此也順便驗證了這兩個欄位沒有分岔。

### 5.3 `終止`

放進條件的 **「如果否」** 分支。狀態選 `Failed`，訊息：

```
@{concat('報告交付中止：重新評分與免費信不一致。record_id=', triggerBody()?['record_id'], '｜存檔 ', string(body('GetStoredResult')?['result']?['risk_score']), ' / ', body('GetStoredResult')?['result']?['risk_band'], ' / ', body('GetStoredResult')?['result']?['top_cancer_label'], '｜重算 ', string(body('RescoreCheck')?['risk_score_pct']), ' / ', body('RescoreCheck')?['final_risk_level'], ' / ', first(body('RescoreCheck')?['cancer_risks'])?['cancer'])}
```

訊息裡把六個值都印出來，是因為「不一致」有三種完全不同的成因（模型改版、分級門檻調整、癌別排序規則變動），而執行紀錄開了 Secure Outputs，看不到動作的輸出。這一行是唯一看得見的線索。

> **「如果是」分支留空。** 不要把後面的動作拖進去 —— 「終止」會立刻結束整個執行，所以只要把它放在「如果否」，條件之後的每一個動作自然就只在相符時才會跑。這樣新增這道檢查不必搬動任何既有動作，而搬動動作正是最容易把流程改壞的操作。

### 5.4 不相符時該怎麼辦

不相符代表模型在免費信寄出之後變動過。這時**不要**手動放行 —— 寄出的報告會跟客戶付錢時看到的數字不一樣。正確處置是：

1. 從終止訊息取得 record_id 與兩組數字
2. 判斷是哪一種變動（分數變／分級變／癌別排序變）
3. 客戶已經付款，所以要嘛以當初的數字人工補一份報告，要嘛退款並說明

`report_purchases` 的冪等是依 `order_reference`，所以這筆訂單不會自己重試。

### 5.5 怎麼驗證這道檢查真的會擋

建好之後**一定要測它會擋**，否則你只知道它不擋而已 —— 一個永遠回傳 true 的檢查跟沒有檢查是一樣的。

暫時把第 2 列的右值改成一個寫死的錯字串（例如 `'不存在的分級'`），觸發一次交付，確認：

- 執行結果是 **Failed**
- 終止訊息裡六個值都有印出來
- **沒有寄出任何信**

確認之後把右值改回 `body('GetStoredResult')?['result']?['risk_band']`，再跑一次正常的，確認會寄。

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

> ⚠️ **寄信動作有兩個，不是一個。** 中英文條件的兩支各有一個，**下面每一項都要做兩次**——收件者、附件、本文。
>
> 只改一個的話，另一支會在儲存時報「包含 `HTTP` 的無效參考」；或者更糟——存得起來，但只有一種語言的客戶收得到信。
>
> 哪一個是哪個語言，**看它所在的條件分支**，不要看動作名稱後面的編號：
>
> ```
> 條件（report_language 等於 en？）
> ├─ 是 → 貼 power-automate-email-delivery-en.html
> └─ 否 → 貼 power-automate-email-delivery-zh.html
> ```


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

### 7.1 信件內文必須換掉

**這封信是交付信，不是報告的複本。** 完整內容都在附件 PDF 裡——十大癌別排序、規則命中、篩檢建議、模型驗證數據。在信件本文重複一遍，只會讓信又長又技術（正是這份報告本來就被批評的地方），而且讓收件者把同樣的東西讀兩次。

所以交付信只留值得「不必打開 2.6 MB 附件就看得到」的部分：

| 區塊 | 交付信 |
|---|---|
| 標題 | 「您的完整癌症風險評估報告」 |
| 開場 | 感謝購買、完整報告已附於本信 |
| 風險指數、分級、與同齡者倍數 | **保留**（與其他兩封信逐位元組相同） |
| 「附件報告包含」 | **新增** |
| 各癌別排序、個人化建議、醫師建議、等級說明 | **移除**（都在 PDF 裡） |
| **模型驗證摘要** | **移除**（在 PDF 裡） |
| 免責聲明 | 保留 |
| 付款連結 | **無**——讀這封信的人已經付過了 |

結果是 46 行，付費樣板是 146 行。

**另外，它不能沿用流程 A 的樣板。** 那份用 `body('HTTP')` 讀模型輸出，也就是同一次執行裡 `/predict` 的回應——流程 C 沒有那個動作。它的模型輸出來自存檔，位置在 `body('GetStoredResult')?['result']?['prediction_json']`。漏掉一處不會在存檔時被擋下，而是在**寄信當下**才報運算式錯誤——那時客戶已經付過錢了。

兩件事都由產生器處理，直接整份貼進寄信動作的本文（HTML 檢視）：

```
power-automate-email-delivery-zh.html
power-automate-email-delivery-en.html
```

它們同時解決另一件事：**流程 A 目前貼著的樣板仍用舊的 `0.5` / `0.25` 門檻自行分級**，而那件事已經改為以 API 的 `final_risk_level` 為準（見 `FREEMIUM_SPEC.md`）。手動改運算式會把那個 bug 一起帶進付費報告；重新產生則不會。

> ⚠️ 這兩份檔案把動作名稱寫死為 **`GetStoredResult`**。流程 C 裡那個動作若取別的名字，請改 `scripts/build-email-templates.js` 後重新產生，**不要手動改產生出來的檔案**——下次重新產生就會被蓋掉。

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
