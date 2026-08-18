# 資安防護措施總覽

本文件整理目前平台針對資料濫用／攻擊的所有防護機制，依防護層次排列。詳細的付款
閘門機制另見 [ACCESS_GATE.md](ACCESS_GATE.md)；資料契約與欄位定義另見
[DATA_CONTRACT.md](DATA_CONTRACT.md)。

## 1. 網路層（最外層）

- **Cloudflare（透過 Render）**：防大規模流量攻擊（DDoS、洪水攻擊把伺服器打垮）。
  由 Render 平台自動處理，我們沒有設定權限，也無法保證它一定涵蓋我們的特定路徑。
- **區網部署（`https://192.168.12.22`）沒有這一層**：只有 Caddy 做 HTTPS，沒有
  Cloudflare，所有應用層防護完全依賴本文件其他章節列出的機制。
- PostgreSQL（5432 埠）只綁定 `127.0.0.1`，從未對外或對區網開放。
- Azure Database for MySQL（付款閘門可選的另一套儲存後端，見第 5 節）是**私有
  存取（VNet-only）**，從 Azure 網路以外（包括 Render）完全連不到，只能透過
  `egbiomed-ai-data-api` 這個 Azure App Service 的 HTTPS API 存取。

## 2. 進入權限（誰能碰到問卷）

實作於 `lib/access-gate.js`、`server.js`、`database/migrations/002_access_gate.sql`、
`003_access_codes.sql`。

- 閘門預設為**關閉狀態才需要人工設定**（`ACCESS_GATE_MODE` 未設定時預設是
  `enforced`，即「找不到設定就當作要驗證」，避免忘記設定導致意外全開放）。
- **個人連結**：256-bit 隨機亂碼（`crypto.randomBytes(32)`），資料庫只存
  SHA-256 雜湊值，原始亂碼絕不落地儲存、絕不再次顯示。單次使用、有時效。
- **共用代碼**：機構／健檢中心批量購買額度用，額度制（用完為止），代碼字串同樣
  以雜湊比對驗證。
- **儲存後端可切換**（`ACCESS_GATE_BACKEND`）：預設仍是 Postgres/Supabase；也可
  切成 Azure MySQL（透過 `egbiomed-ai-data-api` 這個 Azure API，因為那台 MySQL
  是 VNet 私有存取，這裡連不到）。兩種後端的雜湊比對、額度鎖定、拒絕訊息邏輯
  完全一致，詳見 [ACCESS_GATE.md](ACCESS_GATE.md#儲存後端postgres-或-azure-mysql)。
- **登入狀態（session cookie）**：
  - HMAC-SHA256 簽章，防止使用者自行竄改內容。
  - `HttpOnly`：JavaScript 讀不到，防止 XSS 竊取。
  - `Secure`：只能透過 HTTPS 傳輸。
  - `SameSite=Lax`：降低 CSRF 風險。
  - 不設定 `Max-Age`（瀏覽器 session cookie），關閉瀏覽器即失效；伺服器端仍有獨立
    的到期時間（`exp`）做最後把關，即使 cookie 因瀏覽器行為（分頁還原等）意外留存
    也有上限。
- **拒絕訊息一律相同**：連結過期、已使用、查無此代碼、額度用盡等情況，回應內容
  完全一樣，避免有心人士透過錯誤訊息內容反推、大量嘗試找出有效憑證。真正的原因
  只記錄在伺服器端的稽核紀錄（`operations.access_events`），從不外顯。

## 3. 流量限制（防濫用、防洗資料）

實作於 `lib/rate-limiter.js`，套用在 `server.js` 的兩個端點：

| 端點 | 限制 | 原因 |
| --- | --- | --- |
| `POST /api/access/redeem-code` | 同 IP 10 分鐘內最多 60 次 | 代碼比連結容易被猜，且現場常是一台電腦連續幫多人輸入 |
| `POST /api/submit` | 同 IP 10 分鐘內最多 20 次 | 送出即寫入資料庫、可能觸發 Email，濫用有實際成本；**不論閘門開關都生效** |

真實使用者 IP 的判斷方式依部署環境不同：

- **Render（背後有 Cloudflare）**：優先採用 `CF-Connecting-IP` 標頭——這是
  Cloudflare 自己驗證、覆寫過的值，使用者無法偽造，且不受 Cloudflare 邊緣節點
  （anycast，每次請求可能經過不同節點）影響。
- **區網（Caddy，單層代理）**：採用轉發標頭（`X-Forwarded-For`）的最後一段。

> 這個判斷方式曾經出過一次真實的漏洞：一開始兩邊都用「轉發標頭最後一段」，在
> Render 上因為 Cloudflare 邊緣節點會變動，導致同一個人的連續請求被誤判成來自
>不同 IP，流量限制形同虛設（實測 22 次請求全部通過、完全沒被擋）。已改用
> `CF-Connecting-IP` 修正並重新驗證過。

## 4. 資料驗證（防送假資料、防格式攻擊）

實作於 `lib/transitional-contract.js`、`lib/access-gate.js`、`server.js`。

- 送出的問卷資料要通過嚴格的契約驗證（欄位數量、版本號、資料型別都要完全吻合，
  格式不對直接以 422 拒絕）。
- 單筆請求大小上限 1MB（`MAX_BODY_BYTES`），超過直接中斷連線，防止超大資料把
  伺服器記憶體塞爆。
- 必須是 `application/json`，其他格式直接拒絕。
- 代碼字串（`normalizeCode`）限制 6–64 字元、拒絕控制字元，降低被猜中或誤觸發
  例外的風險。

## 5. 資料庫層防護

實作於 `lib/postgres-repository.js`、`database/development-roles.sql`。

- 研究資料（`research`）、聯絡資料（`contact`）、營運稽核（`operations`）、
  存取憑證（`access`）分開存放在不同 schema，各自有獨立的最小權限授權——就算
  某一組帳密外洩，能碰到的資料範圍也有限。
- 所有查詢一律使用參數化寫法（`$1`、`$2`…），不會把使用者輸入直接拼進 SQL 字串，
  沒有 SQL injection 的空間。
- 兌換連結／代碼、扣額度等關鍵動作都在資料庫交易中使用列鎖（`SELECT ... FOR
  UPDATE`），確保同時湧入多個請求時，額度不會被超額扣用或重複兌換。
- 問卷送出的識別碼（`record_id`）一律由伺服器端產生（`crypto.randomUUID()`），
  絕不採信使用者端送過來的 ID，避免有人蓄意送出衝突或可預測的 ID。
- 當付款閘門切到 `ACCESS_GATE_BACKEND=azure_mysql` 時，這個服務（Render）本身
  **完全不持有任何資料庫密碼**——所有讀寫都透過 `egbiomed-ai-data-api` 的
  HTTPS API（該服務用 Managed Identity 連 MySQL，不是密碼），是比目前 Postgres
  直連模式更進一步的改善。Azure 那邊的列鎖（`SELECT ... FOR UPDATE` in MySQL）
  跟 Postgres 提供一樣的「同時湧入多個兌換請求時只有一個會成功」保證。
- `egbiomed-ai-data-api` 上用**兩把不同的密鑰**分開授權：`x-egbiomed-ingest-key`
  只能寫問卷研究資料（洩漏頂多是資料被污染）；`x-egbiomed-access-gate-key`
  能核發付費存取權、能扣/加代碼額度，風險等級完全不同，所以刻意分開、可各自
  獨立輪換，不共用同一把密鑰。

## 6. 傳輸安全

- 全站 HTTPS（區網用 Caddy + 內部 CA 憑證；Render 用其平台憑證）。
- 每個回應都帶有安全標頭：`X-Content-Type-Options: nosniff`、
  `X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`（停用
  camera/microphone/geolocation）。

## 7. 稽核與追蹤（事後可查，不是預防）

- `operations.access_events`（`ACCESS_GATE_BACKEND=postgres` 時）或 Azure MySQL
  的 `access_events` 表（`ACCESS_GATE_BACKEND=azure_mysql` 時）：記錄每一次
  連結／代碼的核發、成功兌換、被拒絕（含原因），但**絕對不記錄原始連結或代碼
  本身**，只記錄雜湊值與時間、操作者。
- `operations.submission_events`：記錄每一次問卷送出嘗試的結果。

## 8. 已知的取捨與尚未做的事

- 共用代碼的原始字串**刻意**同時存放雜湊值與明文（`access.grants.code`），跟
  個人連結（只存雜湊、絕不明文）不同——因為代碼會被工作人員重複查詢、對外核發，
  一次性顯示的模式反而不利於日常管理。這是刻意的權衡，不是疏漏。
- 尚未實作：手動撤銷連結／代碼的工具（資料庫結構已預留 `revoked` 狀態）、真實
  金流串接（目前是人工核發，等金流廠商確定後再串接同一套核發邏輯）。
- 這些防護措施是分好幾次陸續建立起來的，彼此互補，沒有單點依賴；但也代表沒有
  「一次到位」的保證——後續新增功能時，仍需要重新檢視是否踩到既有防護的邊界
  （例如這次 rate limiting 在 Render 上失效的案例）。
