# IT 維運 SOP — AI 十大癌症健康風險因子評估平台

| 項目 | 內容 |
|---|---|
| 對象 | 新接手本平台維運的 IT 同仁 |
| 範圍 | Power Automate 失敗處理、GitHub 推送、Render 部署、Azure 資料 API |
| 不在範圍 | 問卷題目設計、模型、報告文案、地端部署（見 `ON_PREMISES_DEPLOYMENT.md`） |
| 撰寫日期 | 2026-11-17 |
| 必讀前置 | [`PIPELINE_READ_FIRST.md`](PIPELINE_READ_FIRST.md)（全文）、[`PLATFORM_SPEC.md`](PLATFORM_SPEC.md) 第 2、9、10 節 |

> **本文標示「未實地確認」的段落**，是從版控內的文件與程式碼寫出來的，撰寫時沒有人
> 在 Power Automate 編輯器、Render 儀表板或 Azure Portal 裡對過。接手第一週請自己
> 看過一次再採用，看到不一致的地方就直接改這份文件。這不是客套話——本專案兩次重大
> 事故的近因都是「照著過期文件推斷線上行為」。

---

## 0. 先讀這四句

1. **這套系統有兩段不在版本控制裡**：Power Automate 的三條流程，以及 Render／Azure
   的環境變數。兩段都出過事故（2026-09-08、2026-09-09）。**不要用文件推斷線上行為，
   要動之前先實地看一眼。**
2. **Power Automate 沒有草稿狀態。** 打開編輯器、誤觸一個欄位、按儲存，就直接對線上
   生效，沒有「發布」這一步，也沒有自動回退。
3. **流程 A 服務所有付費客戶**（華康、Numia、Myrostar、Garmin…）。沒有明確指示時，
   **連它的編輯器都不要打開**。
4. **push 到 `main` 就是上線。** GitHub 沒有「部署」按鈕，Render 看到 `main` 有新
   commit 就自動部署。

---

## 1. 四個系統、四個操作台

```
                 ┌──────────────────────────────┐
 受檢者 ────────►│ 問卷平台（Node）              │
                 │ ai-cancer-risk.eg-bio.com    │
                 │ Render，自 GitHub main 自動部署│
                 └───────┬──────────────┬────────┘
                         │ 驗證代碼      │ 送件 webhook
                         ▼              ▼
          ┌──────────────────────┐   ┌──────────────────────┐
          │ 資料 API（Node）      │   │ Power Automate       │
          │ Azure App Service    │   │ 流程 A／B／C          │
          │ 無 CI/CD，Kudu 上傳   │   └──────┬───────┬───────┘
          │ Azure MySQL（VNet）   │          │       │ 產報告
          └──────────┬───────────┘          │       ▼
                     │ 交付觸發               │  ┌─────────────────┐
                     └───────────────────────┘  │ 模型 API（外部） │
                                                │ cancer-risk-api │
     ┌──────────────────────┐                   │ .onrender.com   │
     │ WooCommerce 商店      │                   └─────────────────┘
     │ mdi.eg-bio.com       │
     └──────────────────────┘
```

| 元件 | 部署方式 | 版本控制 | 回退 |
|---|---|---|---|
| 問卷平台 | Render，push 到 `main` 自動部署 | `10-Cancer-Risk-AI-Platform` | revert 後再 push |
| 資料 API | **無 CI/CD**，Kudu 上傳 `server.js` | `egbiomed-ai-data-api` | 重新上傳舊版 |
| 商店外掛 | 手動上傳 + `php -l` | 原始碼在平台 repo `contracts/purchase/` | 自備份 `cp` 回去 |
| Power Automate 流程 | 編輯器，存檔即上線 | **無** | **無自動回退** |
| 模型 API | 外部服務，本專案不維護 | 無 | 無 |

### 1.1 四個操作台——每一條指令都要先確認在哪台跑

這是本專案最常見的失誤。三個 shell 長得一模一樣，跑錯機器的錯誤訊息都不會指向
真正的原因。

| 你要做的事 | 在哪台 | 典型指令 |
|---|---|---|
| 鑄碼、查代碼狀況、加額度 | **Render Shell**（Render → 問卷服務 → Shell） | `npm run access:grant / access:status / access:topup` |
| 查兌換事件、資料 API 維運 | **Azure App Service SSH**（`egbiomed-ai-data-api`） | `node /home/site/wwwroot/check-access-events.js 100` |
| 改程式、跑測試、推 git | **你自己的 Windows PowerShell** | `npm test`、`git push` |
| 看流程執行紀錄、改流程 | **Power Automate 網頁** | — |

實際踩過的兩個錯誤：

- 在 Azure SSH 跑 `npm run access:status` → `Missing script`（那是平台 repo 的指令）
- 在本機 PowerShell 跑 `node /home/site/wwwroot/check-answer-status.js` →
  `Cannot find module 'C:\home\site\wwwroot\...'`（PowerShell 把 Linux 路徑當成
  Windows 路徑）

**本文每一段指令都標了機器。交接給別人時請照做。**

### 1.2 為什麼鑄碼要在 Render Shell

`ACCESS_GATE_BACKEND`、`AZURE_ACCESS_GATE_API_BASE_URL`、`AZURE_ACCESS_GATE_API_KEY`
這三個值**已經在那台機器的環境變數裡**。在那裡執行，等於沒有任何祕密需要被讀出來、
貼上、或留在剪貼簿與工單裡。

**原則：在金鑰已經存在的地方執行操作，不要搬運金鑰。** 整個專案都照這條走——資料 API
的維運在 Azure SSH，商店外掛部署時金鑰自線上備份讀取。

---

## 2. 你需要哪些權限

| 系統 | 權限 | 用途 |
|---|---|---|
| GitHub `10-Cancer-Risk-AI-Platform` | Write + Actions 讀取 | 推送、看 CI |
| GitHub `egbiomed-ai-data-api` | Write | 資料 API 原始碼 |
| Render | 該服務的 dashboard 與 **Shell** | 部署狀態、日誌、環境變數、鑄碼 |
| Azure Portal | App Service `egbiomed-ai-data-api`：環境變數、**SSH／Kudu**、日誌 | 資料 API 維運 |
| Power Automate | 流程 A／B／C 的**共同擁有者** | 看執行紀錄、重新提交 |
| WordPress `mdi.eg-bio.com` | 管理員 | 只在代碼交付故障時用 |

> **拿到權限的第一天只做唯讀巡檢**（第 4 節），不要改任何東西。先把四個操作台各打開
> 一次、各看到一筆真實資料，確認權限到位；有哪一個打不開，當下就說。

---

## 3. 紅線——以下事情不要做

| 不要 | 為什麼 |
|---|---|
| 直接 push `main`（繞過 PR） | push 到 `main` 就是上線。PR 是唯一讓 CI 在上線**之前**跑完的關卡。緊急例外見 6.5 |
| 打開流程 A 的編輯器 | 沒有草稿狀態，誤觸即上線，服務對象是全部付費客戶 |
| 關掉流程的 Secure Outputs | `REPORT_SPEC.md` 第 17 節要求的設定，執行紀錄看不到輸出是刻意的 |
| 用 WordPress 的「外掛檔案編輯器」 | 2026-09-18 一次貼上造成 fatal，自動還原失敗、檔案留成 0 bytes，代碼交付停擺約 30 分鐘且訂單上沒有任何線索 |
| 在 Render 執行 Blueprint 同步（沒先對過儀表板的值） | 同步會砍掉 `render.yaml` 未宣告的變數——見 7.4 |
| 把 `ACCESS_GATE_MODE` 設成 `open` | 等於問卷對全世界開放。那是開發用的旁路 |
| 讓商店或任何元件自行產生存取代碼 | 閘門以雜湊查碼，未登記的碼一律被拒；一組看起來有效卻進不去的碼，比沒有碼更糟 |
| 重鑄已經發出去的代碼 | 會讓已經印出去、寄出去的碼失效。額度不夠要**加額度**，不是重鑄 |
| 把金鑰貼進聊天、工單、剪貼簿 | 見 1.2 |
| commit `runtime/`、`.env`、備份、匯出、真實健康資料、憑證私鑰 | — |

---

## 4. 例行巡檢

### 4.1 每日（兩分鐘，在你自己的 PowerShell 或任何能上網的機器）

```bash
curl -s https://ai-cancer-risk.eg-bio.com/api/health
```

逐欄期望值：

| 欄位 | 應該是 | 不是的話 |
|---|---|---|
| `ok` | `true` | 整包 503，看下面哪一欄壞了 |
| `access_gate_mode` | `"enforced"` | **立即升級**。`open` = 問卷全開；**欄位整個不見** = 部署的版本早於閘門功能，見 7.6 |
| `access_gate_ready` | `true` | 連不到 Azure 資料 API，見 8.3 |
| `access_gate_backend` | `"azure_mysql"` | 變成 `postgres` 表示有人動了回退開關 |
| `submission_mode` | `"power-automate"` | — |
| `public_webhook_configured` | `true` | 免費線沒有出口（可能是刻意降級，見第 9 節） |
| `report_ticket_secret_configured` | `true` | 付款連結簽不出來 |

同一天也看一眼 Power Automate 三條流程的**失敗計數**。有紅的就進第 5 節。

### 4.2 每週

- GitHub Actions：`gh run list --limit 10`，確認沒有連續紅（6.3）
- Render：Events 頁有沒有非預期的重啟或部署失敗
- 代碼額度：`VENDOR_CODE_DISTRIBUTION.md` 裡 `remaining` 逼近 0 的，加額度

---

## 5. 情境 A：Power Automate 執行失敗

### 5.1 先定位，不要先修

1. 是**哪一條**流程？三條的名稱（依 `FLOW_B_RUNBOOK.md`／`FLOW_C_RUNBOOK.md` 的
   改名指示）應為——**未實地確認，接手時請自己核對**：

   | 流程 | 名稱 | 服務對象 |
   |---|---|---|
   | A | `EGAI-A 廠商推廣版（勿動）` | 機構／廠商線，全部付費客戶 |
   | B | `EGAI-B 免費版` | 免費線 |
   | C | `EGAI-C 報告交付` | 付費報告交付 |

2. 打開那一次執行，找**第一個**變紅的動作。後面的紅都是它的結果。
3. 點開那個動作看 **「輸入」**，不是「輸出」——Secure Outputs 開著，輸出看不到。
   輸入才是真正送出去的 body。

### 5.2 錯誤訊息對照表

| 訊息 | 意思 | 處置 |
|---|---|---|
| `TriggerInputSchemaMismatch` | 送件多了一個觸發 schema 未宣告的欄位。schema 是 `additionalProperties: false`，**該線所有送件全被拒** | 不是流程壞了，是平台端加了欄位沒同步 schema。**停手回報**，並依第 9 節降級 |
| `addProperty ... Unable to add property 'X' ... as it already exists` | 流程自己在塞同名欄位，平台端也送了同一個 | 2026-09-08 事故的原型。**停手回報**，不要自行刪運算式 |
| 模型 API 回 422 `{"loc":["body"],"msg":"Field required"}` | 模型 API 收到**空 body**，不是欄位驗證錯 | 看該 HTTP 動作的 Body 運算式。不要把運算式包成 JSON 字串，也不要加 `{"model": ...}` 外層 |
| Excel `Conflict ... could not merge your changes` | 多個執行同時寫同一本 Excel | 確認觸發設定「並行控制＝開、平行處理度＝1」。失敗那幾筆可以重新提交（5.3） |
| `UnresolvableHostName` | 有人用 App Service 的**名稱**拼網址 | Azure 預設網域帶後綴（`egbiomed-ai-data-api-<suffix>.azurewebsites.net`），從 Portal 複製，不要拼 |
| `Ticket not valid`（流程 C／購買端點） | Render 與 Azure 的 `REPORT_TICKET_SECRET` 不一致 | 見 8.5 |
| 模型 API 5xx／逾時 | `cancer-risk-api.onrender.com` 是**外部服務**，本專案不維護 | 暫時性，依 5.3 重新提交 |
| 流程 C 的「終止」動作被觸發 | 一致性檢查擋下了——付費報告的數字與該筆免費信不符 | **這是設計好的保護，不是故障。** 不要繞過。看那段訊息裡印出的六個值，回報 |

### 5.3 什麼時候可以按「重新提交」

**可以**，當兩個條件同時成立：

- 失敗的動作在**任何寄信／交付動作之前**，且
- 原因是暫時性的（Excel 409、模型 API 5xx、逾時）

**不可以**：

- 已經有信寄出去了——重新提交會**再寄一次**
- 原因是 schema 或 body 結構——重試只會再失敗一次，而且會把證據洗掉
- 流程 C 的「終止」被觸發——那是保護，不是故障

**驗收一項修改時，一律不可以用「測試」或「重新提交」代替真的送一筆問卷。**
重新提交重播的是同一份舊的觸發內容，證明不了新的送件會發生什麼事。

### 5.4 查不出「資料到底有沒有進流程」時

在流程裡加一個**暫時的「編輯」動作**（zh-TW 介面把 Compose 譯作「編輯」，在「資料作業」
分類下），輸出例如 `string(triggerBody()?['excel_row'])`，跑一次再看執行紀錄。

2026-09-22 就是靠這個找出 `personal_cancer_types` 一直是空字串的；在那之前**四次**
從程式碼推論的判斷全是錯的。查完記得把那個動作刪掉。

### 5.5 要動流程之前

1. **先把要改的那個動作的本文（運算式）整段複製出來存成檔案**，標上日期。
   沒有自動回退，這就是你唯一的備份。
2. 讀 `PIPELINE_READ_FIRST.md` 第 4 節的檢查表，逐項打勾。
3. 動的應該是流程 B 或 C；動流程 A 要有明確指示。

### 5.6 立刻停手回報的情況

- 錯的是**流程 A**
- 錯誤訊息是 `TriggerInputSchemaMismatch` 或 `addProperty ... already exists`
- 流程 A 出現**非預期的執行**（測試免費線或交付線時，流程 A 不該有任何新執行）
- 任何一步的結果跟本文件寫的不一樣

---

## 6. 情境 B：GitHub 推送

### 6.1 一句話

**push 到 `main` 就是上線。** 沒有分階段，沒有預覽環境。

### 6.2 日常流程（在你自己的 PowerShell）

```powershell
git switch -c "it/<工作名稱>"
```

改完之後：

```powershell
npm test
```

```powershell
git diff --check
```

```powershell
git status
```

```powershell
git add <明確檔案清單>
```

```powershell
git commit -m "<清楚描述變更>"
```

```powershell
git push -u origin "it/<工作名稱>"
```

然後開 PR，**不要直接 push `main`**。你不是在推程式碼，你是在部署。

絕不加入 git：`runtime/`、`.env`、`local-backups/`、`local-exports/`、憑證私鑰、
真實健康資料。commit 前再 `git status` 看一次。

### 6.3 push 之後一定要看 CI

```bash
gh run list --limit 3
```

```bash
gh run view <id> --log-failed
```

CI 設定：`.github/workflows/ci.yml`，ubuntu-latest、Node 24、`npm ci && npm test`，
`main` 的每次 push 與每個 PR 都跑。

> **本機全綠不等於 CI 綠。** 2026-09-21 加了一支測試用 `git show <sha>:<file>` 讀舊檔，
> 而 `actions/checkout` 只抓單一 commit，runner 上沒有那個物件。CI **連紅 18 次、
> 橫跨兩天**，期間每次都回報「npm test 全綠」——因為沒有人養成看的習慣。
>
> 本機與 CI 差在：clone 深度（淺層，沒有歷史、沒有其他分支）、行尾（runner 是 LF，
> Windows 工作區是 CRLF）、檔名大小寫敏感、本機才有的工具。
>
> **回報時把本機結果與 CI 結果講成兩件事，不要合成一句。**

### 6.4 `npm test` 第一次紅、第二次就綠

**行尾問題，不要當成沒事。** 失敗的通常是「產出檔與產生器逐位元組一致」那類測試：
工作區是 CRLF，產生器寫的是 LF，第一次比對失敗，而那次執行順手把檔案改回 LF，
所以第二次就過。

依 `DEVELOPER_ONBOARDING.md` 的 **B8** 讓工作區重取一次。真正的失敗也在同一批測試
裡，習慣重跑之後就分不出來了。拉別人的 commit、切分支、rebase 之後特別容易遇到。

### 6.5 回退

回退跟其他改動一樣，走分支 + PR：

```powershell
git switch -c "it/revert-<commit>"
```

```powershell
git revert <commit>
```

```powershell
git push -u origin "it/revert-<commit>"
```

PR 合進 `main` 之後，Render 會自動部署 revert 後的版本。

**現場故障、來不及等 review 的時候**：直接 push `main` 要有平台負責人當下同意，
事後補一則說明（哪一個 commit、為什麼來不及走 PR）。**這是例外，不是第二條
路徑。** 緊急直推沒有 PR 當關卡，而上一次 CI 連紅 18 次就是因為沒有人在看（見 6.3）。

另外兩件事：

- **改資料庫結構的 commit 不能這樣回退**——revert 程式不會把資料改回去，先問。
- 回退程式碼 **不會動到 Render 儀表板上的環境變數**。跟設定有關的故障
  （聯名、webhook、金鑰）要到儀表板處理，見 7.3、7.4。

---

## 7. 情境 C：Render 部署

### 7.1 服務與網域

| 項目 | 值 |
|---|---|
| 服務名稱 | `eg-biomed-cancer-risk-assessment`（`render.yaml`） |
| 正式網域 | `https://ai-cancer-risk.eg-bio.com` |
| 部署觸發 | GitHub `main` 有新 commit |
| 啟動指令 | `npm start` |

### 7.2 部署成功了沒有

三個互相獨立的證據，建議都看：

1. **Render 儀表板 → Events**：該次部署是 Live 還是 Failed。
2. **Deploy log**：失敗多半在 `npm ci` 或啟動時丟例外。最常見的啟動例外是
   `ACCESS_GATE_SESSION_SECRET must be set when ACCESS_GATE_MODE=enforced`——
   那是環境變數不見了，見 7.4。
3. **線上版本對得上嗎**（在你自己的 PowerShell）：

```bash
curl -s https://ai-cancer-risk.eg-bio.com/api/health
```

```bash
curl -s https://ai-cancer-risk.eg-bio.com/app.js | grep -o "questionnaire_version[^,]*" | head -1
```

把第二條的結果跟 repo 裡 `grep -n "questionnaire_version" app.js` 比對。不一樣就是
線上還沒換版。樣式與腳本的網址帶的是**內容雜湊**（例如 `styles.css?v=a8de6dfa87e1`），
雜湊沒變就是檔案沒變。

### 7.3 環境變數改了為什麼沒生效

**這個服務的環境變數是啟動時讀一次的。** 在儀表板改完要等服務重啟才生效。Render
改變數通常會自動觸發重啟，但 **Render Shell 是另一個 process**——在 Shell 裡
`echo $FOO` 看得到新值，不代表正在服務流量的那個 process 已經換過。以
`/api/health` 的輸出為準。

### 7.4 Blueprint 同步會砍掉未宣告的變數

`render.yaml` 裡每個變數都是 `sync: false`（只宣告 key，值留在儀表板）。
**但 Blueprint 同步會把 `render.yaml` 沒列到的儀表板變數整個刪掉。**

2026-09-09 就是這樣：`ACCESS_GATE_SESSION_SECRET` 被砍掉，當下沒壞，**等到下一次
部署重啟才炸**，整個網站挂掉，因與果差了好幾個小時。

**清單現在是齊的，而且有測試守著。** 2026-11-17 補齊：程式會讀的 20 個變數裡，
當時只宣告了 8 個，`INSTITUTION_BRANDING`（聯名入口設定）就在漏掉的那一半——
一次同步就會讓 Numia 與華康的入口靜默退回無標誌狀態，不會有任何錯誤訊息。

`test-render-config.js` 現在會掃 `server.js`、`lib/`、`scripts/` 裡每一個
`process.env.*`，只要有一個既沒宣告、也不在排除清單裡，CI 就會紅。新增環境變數時
會被擋下來，這是故意的。

**`PORT` 刻意沒有宣告。** Render 自己注入它；宣告了反而會讓同步建出一個空值的
Blueprint PORT，`server.js` 退回 3000，而 Render 等的是它指定的埠，健康檢查會失敗。
其他被排除的都是地端備份／匯出腳本專用的，理由寫在 `render.yaml` 最下方。

> **同步之前還是要做一件事：** 透過儀表板確認每一個宣告過的 key 都有它該有的值。
> 宣告了但儀表板上沒值的 key，同步後可能以**空字串**存在——現有程式對這些
> 變數都有安全的預設值，但不要把這件事當作永遠成立。

### 7.5 Render Shell：代碼相關操作

Render → 該服務 → Shell 分頁。閘門金鑰已經在環境裡，不需要輸入任何祕密。

查一組代碼現況：

```bash
npm run access:status -- --code EGHK3FV
```

加額度：

```bash
npm run access:topup -- --code EGHK3FV --add-uses 1000 --created-by "<你的名字>"
```

鑄新碼：

```bash
npm run access:grant -- --type code --institution GRMN --max-uses 5 --created-by "<你的名字>" --notes "<用途>"
```

`--institution` 用**短縮寫**（`GRMN`、`HK`），不要用全名——代碼字串由它組成
（`<機構><Q><次數><6 碼亂數>`，例如 `grmnq59kxmfp`）。

發出去之後額度不夠就用 `access:topup`，**不要重鑄**。

### 7.6 同一個 repo 可能有不只一個 Render 服務

2026-09-21：流通中的一個 QR code 指向 `one0-cancer-risk-ai-platform.onrender.com`，
那是**另一個沒人停掉的舊服務**，還在自動部署閘門功能出現之前的版本——掃到的人拿到
的是完整問卷（知情同意、全部題目、聯絡資料），完全不需要任何憑證。

**閘門是某一個部署裡的程式碼，它看不到、也保護不了同一份 repo 的其他部署。**

```bash
curl -s https://<要印出去的那個確切主機名>/api/health
```

`access_gate_mode` 必須存在且是 `enforced`。**欄位整個不見**，表示那個部署的版本早於
閘門功能——這跟 `open` 是兩種不同的故障，而且它不會自己說。

**任何主機名要印在文宣、QR code 或對外連結上之前，先跑這一條。** 另外：停掉的服務
不會轉址，所以網址印出去之後才關掉它，等於讓每一次掃描都變成錯誤頁。

---

## 8. 情境 D：Azure 資料 API

### 8.1 它是什麼

`egbiomed-ai-data-api`，Azure App Service 上的 Node 服務。存取代碼、兌換紀錄、
報告結果、購買紀錄都在它後面的 **Azure Database for MySQL**。

那台 MySQL 是 **VNet 私有存取**：從 Azure 網路以外（**包括 Render**）完全連不到。
所以這層 HTTPS API 是必要的，不是多包一層。它用 Managed Identity 連 MySQL，不是密碼。

### 8.2 它沒有 CI/CD

部署方式是**用 Kudu 上傳 `server.js`**。

1. **先把線上那一份下載下來備份**，標上日期。回退就是把它傳回去。
2. 上傳。
3. 驗證（8.3）。

### 8.3 怎麼知道它活著

最快的一條，**在你自己的 PowerShell**：

```bash
curl -s https://ai-cancer-risk.eg-bio.com/api/health
```

`access_gate_ready` 是平台對資料 API 的**即時探測**——每次健康檢查都真的打一次它的
健康端點。`false` 就是連不到或它回錯；此時整包 `/api/health` 會回 **503**。

所以這一條同時回答了「問卷平台活著嗎」和「資料 API 活著嗎」兩個問題。

### 8.4 Azure App Service SSH 常用指令

從 Azure Portal 進該 App Service 的 SSH（**不要從名稱拼網址**，見 5.2）。

查兌換與被拒事件、每日「填答 vs 兌換」對照：

```bash
node /home/site/wwwroot/check-access-events.js 100
```

> **線上那份 `check-access-events.js` 是舊版，只列 EG 開頭的免費碼**，機構線的代碼
> 印不出來（`esq10065ys8r` 就是這樣漏掉的）。要補齊得先把更新版傳上 Kudu。
> 在那之前只能用 Render Shell 的 `access:status` 一組一組查——而那需要先知道代碼是
> 什麼，正好是缺的那件事。

平台端的 `npm run access:status` 看不到事件，因為 Azure 閘門 API 只有建立／兌換／
查詢／加額度四個端點，沒有事件查詢。

### 8.5 金鑰：四把分開的，加一把必須相同的

| 金鑰 | 誰拿 | 洩漏的後果 |
|---|---|---|
| `x-egbiomed-ingest-key` | 平台 → 資料 API | 研究資料被污染 |
| `x-egbiomed-access-gate-key` | 平台 → 資料 API | **可以核發付費存取、可以扣／加代碼額度** |
| `x-egbiomed-purchase-key` | WordPress 外掛 → 資料 API | 可以鑄評估碼（有上限、可稽核、可輪換） |
| `x-egbiomed-report-result-key` | 流程 B／C → 資料 API | 讀寫模型結果 |

刻意分開、可各自獨立輪換，**不要為了方便共用同一把**。

`REPORT_TICKET_SECRET` 是另一回事：它**必須在 Render 與 Azure 兩邊完全相同**。
不一致的話每一條付款連結都會驗不過，而且錯誤訊息是刻意通用的（`Ticket not valid`），
從訊息看不出原因。

---

## 9. 緊急降級：由輕至重

**三者都不需要碰流程 A。**

| 層級 | 動作 | 後果 |
|---|---|---|
| 1 | 停發／不再發放出問題的那組代碼 | 影響最小 |
| 2 | 清空 **Render** 的 `POWER_AUTOMATE_WEBHOOK_URL_PUBLIC` | 免費線送件回 503 且不寄信；**機構線完全不受影響** |
| 3 | 清空 **Azure** 的 `REPORT_DELIVERY_FLOW_URL` | 購買端點仍記錄付款、標記交付失敗並回 503；**付款紀錄不會遺失**，客戶查得到 |

第 3 層之後，`report_purchases` 表裡 `delivery_triggered_at` 為 null 且 `delivery_error`
有值的列，就是「付了錢還沒拿到報告」的客戶名單——恢復後要逐筆補。

**另一個獨立的回退**：`ACCESS_GATE_BACKEND` 從 `azure_mysql` 切回 `postgres`，只要
重啟、不用部署程式。但——**未實地確認**——切換之後才鑄出來的代碼在 Postgres 裡
不存在，那些客戶會進不來。用這一招之前先問，不要當成無痛開關。

---

## 10. 什麼時候必須停手、找人

- 任何一步的結果跟本文件或 runbook 寫的**不一樣**
- 錯的是**流程 A**，或流程 A 出現非預期的執行
- `/api/health` 的 `access_gate_mode` 不是 `enforced`，或欄位整個不見
- 看到 `TriggerInputSchemaMismatch` 或 `addProperty ... already exists`
- 要動資料庫結構、要輪換金鑰、要改 `render.yaml`
- 想「先試試看」的任何操作

> 2026-09-08 那次事故，每一步看起來都對、三個獨立佐證都指向同一個結論，
> **唯獨那個結論是錯的**——因為三個佐證共用同一份過期文件。**合理不等於正確。**

---

## 11. 已知未解的問題（看到不要當成新事故）

來自 `PLATFORM_SPEC.md` 第 11 節與 `PIPELINE_READ_FIRST.md` 第 6 節，接手時應該知道：

**結構性**

- Power Automate 流程不在版本控制內，且每次儲存立即上線
- 模型 API 不回傳模型版本
- `/generate_report` 會重跑模型，沒有「拿現成預測去排版」的介面——流程 C 的一致性
  檢查是因應，不是根治
- **沒有撤銷代碼的工具**，代碼一經鑄出永久有效（資料庫已預留 `revoked` 狀態）

**待處理**

- 流程 A 的信件分級 bug 仍在線上
- 輪替 `PURCHASE_API_KEY`；撤銷測試碼 `egbiotest2026`
- 三個症狀欄位命名對不上（`symptom_nausea_vomiting`／`symptom_back_pain`／
  `symptom_infection`），相關規則一直沒作用，而且不會有任何錯誤訊息
- 工作階段 30 分鐘對 8–12 分鐘的問卷偏短，逾時失敗發生在送出當下且答案全失
- Azure 上的 `check-access-events.js` 是舊版（8.4）

**不要引用的文件**

- `POWER_AUTOMATE_FLOW_AUDIT_2026-08-05.md` 內容已與線上不符，是 2026-09-08 事故的
  近因。除非先實地核對過，否則不要引用。

---

## 12. 建議的第一週

| 天 | 做什麼 |
|---|---|
| 1 | 四個操作台各打開一次，各看到一筆真實資料。打不開的當天回報。**只讀不改** |
| 2 | 讀 `PIPELINE_READ_FIRST.md` 全文、`PLATFORM_SPEC.md` 第 2、9、10 節。讀完把看不懂的列出來問 |
| 3 | 跟著第 4 節做一次完整巡檢，把每一欄的實際值抄下來當基線 |
| 4 | 在自己的機器 clone repo，`npm ci && npm test` 跑綠；開一個無意義的分支推上去，看 CI 跑完 |
| 5 | 翻一次最近 30 天的流程執行紀錄，認得出「成功」長什麼樣子 |

**第一次真的要改東西時，找人一起看。**

---

## 文件索引

| 文件 | 內容 |
|---|---|
| [`PIPELINE_READ_FIRST.md`](PIPELINE_READ_FIRST.md) | 動送件管線前的檢查表＋兩次事故全記錄。**必讀** |
| [`PLATFORM_SPEC.md`](PLATFORM_SPEC.md) | 架構、祕密、系統不變式、部署與回退 |
| [`ACCESS_GATE.md`](ACCESS_GATE.md) | 閘門機制、環境變數、線上購買、2026-09-21 事故 |
| [`SECURITY.md`](SECURITY.md) | 分層防護總覽 |
| [`FLOW_B_RUNBOOK.md`](FLOW_B_RUNBOOK.md) | 流程 B（免費線）逐步操作 |
| [`FLOW_C_RUNBOOK.md`](FLOW_C_RUNBOOK.md) | 流程 C（報告交付）逐步操作 |
| [`POWER_AUTOMATE_RUNBOOK.md`](POWER_AUTOMATE_RUNBOOK.md) | 流程動作設定、Excel 409、422 等故障對照 |
| [`VENDOR_CODE_DISTRIBUTION.md`](VENDOR_CODE_DISTRIBUTION.md) | 代碼發放台帳、聯名入口設定 |
| [`DEVELOPER_ONBOARDING.md`](DEVELOPER_ONBOARDING.md) | 本機開發環境、git 流程、行尾、地端伺服器 |
| [`DATA_CONTRACT.md`](DATA_CONTRACT.md) | 送件格式與版本管理規則 |
