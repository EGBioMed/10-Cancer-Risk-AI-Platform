# 平台規格：十癌風險因子評估系統

**版本** 1.0.0　**日期** 2026-09-22

---

## 0. 這份文件的定位

系統層級的規格：有哪些元件、如何連接、彼此的契約、以及哪些性質不得被破壞。

**它不取代既有文件。** 各主題的最終效力歸屬如下；本文若與它們衝突，以它們為準。

| 主題 | 最終效力文件 |
|---|---|
| 送件資料契約、欄位定義、版本規則 | [`DATA_CONTRACT.md`](DATA_CONTRACT.md) |
| 報告內容、用語、模型 API 回應最低規格 | [`REPORT_SPEC.md`](REPORT_SPEC.md) |
| 存取閘門的機制與操作 | [`ACCESS_GATE.md`](ACCESS_GATE.md) |
| 免費線的設計與實作順序 | [`FREEMIUM_SPEC.md`](FREEMIUM_SPEC.md) |
| 安全控制 | [`SECURITY.md`](SECURITY.md) |
| 問卷題目設計與追問機制 | [`QUESTIONNAIRE_DESIGN_AND_FOLLOWUP_MECHANISM.md`](QUESTIONNAIRE_DESIGN_AND_FOLLOWUP_MECHANISM.md) |
| 環境建置與日常維運 | [`DEVELOPER_ONBOARDING.md`](DEVELOPER_ONBOARDING.md) |
| **動 Power Automate 之前必讀** | [`PIPELINE_READ_FIRST.md`](PIPELINE_READ_FIRST.md) |
| 流程 B／C 的逐步建置 | [`FLOW_B_RUNBOOK.md`](FLOW_B_RUNBOOK.md)、[`FLOW_C_RUNBOOK.md`](FLOW_C_RUNBOOK.md) |

---

## 1. 目的與非目標

### 1.1 目的

依使用者自行填寫的年齡、生活型態、家族史、既往病史與症狀，運用統計與人工智慧方法，產出與十大癌症相關之**健康風險因子個人化整理與健康教育資訊**。

### 1.2 非目標（規範性）

本系統**不是**下列任何一種，所有對外文案與功能皆不得違反：

- 不是癌症診斷、篩檢、早期偵測或疾病預測工具
- 輸出不代表罹患癌症的機率
- 不用於治療決策
- 不取代醫師評估或任何標準醫療檢查

> 任何新功能若使輸出被合理理解為上述之一（例如自風險結果導向篩檢商品），須經法規審閱。

---

## 2. 系統組成

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
          │ Azure MySQL          │          │       │
          └──────────┬───────────┘          │       │ 產報告
                     │                       │       ▼
                     │ 交付觸發               │  ┌─────────────────┐
                     └───────────────────────┘  │ 模型 API         │
                                                │ cancer-risk-api │
     ┌──────────────────────┐                   │ .onrender.com   │
     │ WooCommerce 商店      │                   └─────────────────┘
     │ mdi.eg-bio.com       │
     │ Azure App Service    │
     │ eg-bio-mdi-Sandbox   │
     └──────────────────────┘
```

| 元件 | 語言／平台 | 部署方式 | 版本控制 |
|---|---|---|---|
| 問卷平台 | Node（無框架） | Render，push 到 `main` 自動部署 | `10-Cancer-Risk-AI-Platform` |
| 資料 API | Node（無框架） | **無 CI/CD**，以 Kudu 上傳 `server.js` | `egbiomed-ai-data-api` |
| 商店外掛 | PHP / WooCommerce | 手動上傳 + `php -l` 驗證 | 原始碼在平台 repo 的 `contracts/purchase/` |
| Power Automate 流程 | — | **不在版本控制內**，每次儲存立即上線 | 無 |
| 模型 API | — | 外部，本專案不維護 | 無 |

> **流程不在版本控制裡，且沒有草稿狀態。** 這是本系統最大的結構性風險，`PIPELINE_READ_FIRST.md` 記錄的兩次事故皆源於此。

### 2.1 地端部署（另一套）

平台另有地端 Windows 服務部署（`https://192.168.12.22`，見 `ON_PREMISES_DEPLOYMENT.md` 與 `DEVELOPER_ONBOARDING.md` 情境 C），以 Postgres 為後端、`SUBMISSION_MODE=postgres`。與雲端部署共用同一份程式碼，差別僅在環境變數。

---

## 3. 兩條產品線

| | 機構／廠商線 | 免費線 |
|---|---|---|
| 入場 | 存取代碼或專屬連結 | 存取代碼（公開發放） |
| `delivery_mode` | `institution` | `public` |
| 處理流程 | **流程 A** | **流程 B** |
| 收到的東西 | 含 PDF 附件的完整報告 | 免費信（分數、分級、完整十癌排序、個人化建議）＋ 付款連結 |
| 付費報告 | 機構已付費 | 另行付費，經流程 C 交付 |

**兩條線共用同一個閘門、同一份問卷、同一個模型。** 差異僅在兌換的代碼帶有哪一種 `delivery_mode`，以及據此選擇哪一個 webhook。

---

## 4. 端到端流程

### 4.1 機構線

```
輸入代碼 → 閘門驗證（資料 API）→ 簽發工作階段 cookie（mode=institution）
→ 填答 → POST /api/submit → 平台驗證與正規化
→ POST 流程 A webhook
→ 流程 A：剖析 → Excel 保存 → /predict → /generate_report → 轉檔 → 附件寄信
```

### 4.2 免費線

```
輸入公開代碼 → 閘門驗證 → 工作階段 cookie（mode=public）
→ 填答 → POST /api/submit → 平台注入 delivery_mode / grant_id / report_ticket
→ POST 流程 B webhook
→ 流程 B：剖析 → Excel 保存 → /predict
         → POST /api/reports/result（存下輸出與輸入）
         → 寄免費信（無附件，含帶票券的付款連結）
```

### 4.3 付費報告交付

```
點免費信的付款連結 → 商店擷取票券至工作階段 → 加入購物車（無票券則擋下）
→ 結帳付款 → 票券寫入訂單
→ 外掛 POST /api/reports/purchase（帶 PURCHASE_API_KEY）
→ 資料 API：驗票 → 查存檔 → 記錄付款（依 order_reference 冪等）→ 觸發流程 C
→ 流程 C：取存檔 → 重新評分比對（不符即中止）→ /generate_report → 轉檔 → 附件寄信
```

---

## 5. 元件規格

### 5.1 問卷平台

**對外端點**

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/`、`/index.html` | 問卷；未通過閘門時顯示代碼輸入畫面 |
| GET | `/access/<token>` | 專屬連結，兌換後導回 `/` |
| POST | `/api/access/redeem-code` | 兌換共用代碼 |
| POST | `/api/submit` | 送出問卷 |
| GET | `/api/health` | 健康檢查 |

**`/api/health` 為系統狀態的唯一對外事實來源。** 欄位：`submission_mode`、`access_gate_mode`、`access_gate_backend`、`access_gate_ready`、`public_webhook_configured`、`report_ticket_secret_configured`。

> 任何主機在對外公布（印刷、QR code、連結）之前，**必須**以此端點確認 `access_gate_mode` 存在且為 `enforced`。欄位不存在代表該部署的程式碼早於閘門功能。見 `ACCESS_GATE.md`「The gate protects a deployment, not a domain」。

**環境變數**：`ACCESS_GATE_MODE`、`ACCESS_GATE_BACKEND`、`ACCESS_GATE_SESSION_SECRET`、`ACCESS_GATE_SESSION_TTL_HOURS`、`ACCESS_GATE_COOKIE_SECURE`、`REPORT_TICKET_SECRET`、`POWER_AUTOMATE_WEBHOOK_URL`、`POWER_AUTOMATE_WEBHOOK_URL_PUBLIC`、`SUBMISSION_MODE`、`PORT`、`HOST`

### 5.2 資料 API

**端點分組**（各有專屬金鑰，見 §7）

| 群組 | 路徑 | 呼叫者 |
|---|---|---|
| 閘門 | `/api/access-gate/grants`、`/lookup`、`/topup`、`/redemptions` | 問卷平台、鑄碼 CLI |
| 送件保存 | `/api/submissions`、`/api/research-rows`、`/api/contact-rows` | 問卷平台 |
| 報告存檔 | `/api/reports/result`、`/api/reports/result/<record_id>` | 流程 B、流程 C |
| 購買 | `/api/purchases/access-code`、`/api/reports/purchase` | WooCommerce 外掛 |
| 管理 | `/api/admin/submissions`、`/export` | 人工 |

**資料表**：`grants`、`access_events`、`assessment_submissions`、`research_submissions`、`contact_submissions`、`report_results`、`report_purchases`

### 5.3 Power Automate 流程

| 流程 | 觸發 | 狀態 |
|---|---|---|
| **A** 機構線 | 平台送件（`delivery_mode` 不為 public） | 服務付費客戶。非必要不得修改 |
| **B** 免費線 | 平台送件（`delivery_mode: public`） | 由 A 複製而來 |
| **C** 報告交付 | 資料 API 驗票成功後 | 由 A 複製而來 |

拆成三條而非一條加分支，是因為 Power Automate 沒有草稿狀態，在服務付費客戶的流程上改動等於邊改邊上線。理由詳見 `FREEMIUM_SPEC.md` §7.4。

### 5.4 WooCommerce 商店

| 商品 | SKU | 付款後 |
|---|---|---|
| AI Cancer Risk Assessment | `AI-CANCER-RISK` | 向資料 API 索取一組**已登記**的存取代碼 |
| 完整報告 | `AI-CANCER-REPORT` | 轉交票券，請資料 API 交付報告 |

另提供 `/recommend?c=<癌別>&src=<來源>` 轉址端點（癌別→檢測產品對應表）。

> **商店不得自行產生存取代碼。** 閘門以正規化後的 SHA-256 查碼，未經登記的碼一律被拒 —— 一組看起來有效卻進不去的碼，比沒有碼更糟。

---

## 6. 資料與保存

資料分類、去識別化邊界與欄位定義見 `DATA_CONTRACT.md`。本節僅記其結構性事實：

- **研究資料與聯絡資料分開保存。** `research_submissions` 不含 Email 與姓名；對應關係只存在於 `contact_submissions`
- **`excel_row` 不得包含 `full_name` 或 `email`**，伺服器於轉送前移除
- **`report_results` 依設計不存個資**：存的是模型輸出（`prediction_json`）與產生該輸出的輸入（`feature_row`），後者刻意不含流程附加的 `lang` 與 `name`
- 保存期自填寫日起 5 年，期滿刪除聯絡資料與代碼對應關係

---

## 7. 祕密與金鑰

**原則：在金鑰已經存在的地方執行操作，不要搬運金鑰。**

| 金鑰 | 存放位置 | 用途 |
|---|---|---|
| `ACCESS_GATE_SESSION_SECRET` | Render | 簽署工作階段 cookie |
| `REPORT_TICKET_SECRET` | Render **與** Azure 資料 API | 簽署／驗證報告票券，兩邊必須一致 |
| `ACCESS_GATE_API_KEY` | Render → 資料 API | 閘門端點 |
| `REPORT_RESULT_API_KEY` | 流程 B／C → 資料 API | 報告存檔端點 |
| `PURCHASE_API_KEY` | WordPress 外掛 → 資料 API | 購買端點 |
| `ADMIN_VIEW_KEY` | 人工 | 管理查詢 |

`ACCESS_GATE_SESSION_SECRET` 與 `REPORT_TICKET_SECRET` **刻意分開**：前者外洩可偽造 30 分鐘的問卷存取，共用會使同一次外洩可偽造付費報告。

**操作位置**：鑄碼在 Render Shell（已具備閘門金鑰）；資料 API 的查詢與維運在 Azure SSH（已具備該台金鑰）；商店外掛部署時，金鑰自線上備份讀取，不經畫面或剪貼簿。

---

## 8. 契約與版本

送件 payload 帶 11 個版本字串，由 `lib/transitional-contract.js` 的 `EXPECTED_VERSIONS` 定義，目前為：

```
contract_version              assessment-submission/1.2.0
questionnaire_version         questionnaire/2026-09-08-v19.9-phase1
consent_version               consent/2026-08-26
feature_schema_version        model-features/1.0.0
rule_input_schema_version     high-risk-rules/19.5
（其餘見該檔）
```

版本異動規則見 `DATA_CONTRACT.md` §6。

**觸發 schema 為 `additionalProperties: false`。** 送件多出任何一個未宣告欄位，該線所有送件皆會以 `TriggerInputSchemaMismatch` 被拒。新增欄位必須同時更新 schema 並重新貼入流程。

---

## 9. 系統不變式

以下性質若被破壞即為事故，不是退化。每一條都有對應的自動化測試或明確的驗證步驟。

1. **閘門維持 `enforced`。** 任何部署、任何時候
2. **存取代碼只由資料 API 產生並登記**，其他元件一律不得自行產生
3. **機構線送往流程 A 的 payload 逐欄不變**，不得含 `delivery_mode`／`report_ticket`／`grant_id`
4. **`excel_row` 不含 `full_name` 與 `email`**
5. **`report_results` 不含個資**
6. **付費報告的數字與該筆免費信完全一致**；不一致即中止交付，不得自動寄出（流程 C 一致性檢查）
7. **同一 `order_reference` 不得重複交付**
8. **免費信不含 PDF 附件、規則命中細節、個人化篩檢建議**
9. **信件對外文案不得宣稱 §1.2 所否認的用途**
10. **信件樣板由產生器產出，不得手改產出檔**

---

## 10. 部署與變更

| 元件 | 誰部署 | 方式 | 回退 |
|---|---|---|---|
| 問卷平台 | 自動 | push 到 `main` | revert 後再 push |
| 資料 API | 人工 | Kudu 上傳 `server.js` | 重新上傳舊版 |
| 商店外掛 | 人工 | 備份 → 上傳 → `php -l` → `cp` 進兩個目錄 | 自備份 `cp` 回去 |
| 流程 A／B／C | 人工 | 流程編輯器 | **無自動回退**；改動前須自行備份本文 |
| 信件樣板 | 人工 | 改產生器 → 重新產出 → 貼入流程 | 同上 |

**WordPress 外掛絕不得經由外掛編輯器修改。** 2026-09-18 一次貼上造成 fatal，編輯器的自動還原失敗並將檔案留成 0 bytes，代碼交付停擺約 30 分鐘且無任何訂單註記可循。

**變更 Power Automate 前必讀 `PIPELINE_READ_FIRST.md`。**

回退層級（由輕至重）：撤銷代碼 → 清空 `POWER_AUTOMATE_WEBHOOK_URL_PUBLIC`（免費線回 503 不寄信）→ 清空 `REPORT_DELIVERY_FLOW_URL`（付款仍記錄，交付標記失敗）。**三者皆不需碰流程 A。**

---

## 11. 已知限制與未完成事項

### 11.1 結構性

- **Power Automate 流程不在版本控制內**，且每次儲存立即上線
- **模型 API 不回傳模型版本**，`model_version` 只能存規則層與特徵合約的複合值
- **`/generate_report` 會重跑模型**，沒有「拿現成預測去排版」的介面；以流程 C 的一致性檢查因應，非根治
- **無撤銷代碼的工具**，代碼一經鑄出永久有效

### 11.2 待處理（詳見 `FREEMIUM_SPEC.md` §10.2）

- 流程 A 的信件分級 bug 仍在線上，影響現有付費客戶
- 補發 2026-09-18 外掛停擺期間的存取代碼
- 輪替 `PURCHASE_API_KEY`
- 撤銷測試碼 `egbiotest2026`
- IRB 補件（含 2026-09-21 閘門外收案事件的影響評估）
- 英文信的癌別排序可能顯示中文（`cancer_risks_text_en` 疑似不存在，待確認）
- 工作階段 30 分鐘對 8–12 分鐘的問卷偏短，逾時失敗發生在送出當下且答案全失

### 11.3 資料品質

2026-09-22 之前的所有送件，`excel_row` 的 `personal_cancer_types` 與七個 `recent_discomfort_*` 欄位皆為空字串（見 `0938952`）。原始答案仍在 `rows` 陣列內，但該八欄無法回填。**若曾以這些欄位做過分析，結論須重新檢視。**
