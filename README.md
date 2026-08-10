# EG BioMed AI 十大癌症健康風險因子評估平台

本專案是中英文互動式健康風險因子問卷。目前地端開發環境使用 Node.js、
PostgreSQL 與 Caddy，提交資料不再依賴 Power Automate／Excel 逐筆寫入。

## 新加入專案請先閱讀

- [開發者與新電腦快速上手手冊](DEVELOPER_ONBOARDING.md)：從第一次取得程式碼、
  pgAdmin、Windows 服務、HTTPS 憑證，到除錯、備份及日常操作。
- [地端 PostgreSQL 部署手冊](ON_PREMISES_DEPLOYMENT.md)：資料庫結構、權限邊界與
  正式上線前仍需完成的事項。
- [資料契約](DATA_CONTRACT.md)：提交格式、欄位與版本管理規則。
- [Power Automate 舊架構手冊](POWER_AUTOMATE_RUNBOOK.md)：只供舊系統回溯與緊急
  回復使用，新開發預設不得使用。

## 目前地端入口

- 問卷：`https://192.168.12.22`
- 健康檢查：`https://192.168.12.22/api/health`
- 本機 Node 健康檢查：`http://127.0.0.1:3000/api/health`

區網電腦第一次使用 HTTPS 前，必須安裝伺服器匯出的內部 CA 根憑證。完整步驟請見
[開發者與新電腦快速上手手冊](DEVELOPER_ONBOARDING.md#情境-a區網電腦只需使用問卷)。

## 開發指令

先進入專案目錄：

```powershell
Set-Location "C:\Users\user\Documents\Codex\10-Cancer-Risk-AI-Platform"
```

安裝相依套件及執行測試：

```powershell
npm ci
npm test
```

若終端機找不到 `node` 或 `npm`：

```powershell
& "C:\Program Files\nodejs\npm.cmd" ci
& "C:\Program Files\nodejs\node.exe" --test test-contract.js test-questionnaire-ui.js test-postgres-repository.js test-backup-retention.js
```

地端伺服器已使用 Windows 服務常駐，平常不必保持 PowerShell 視窗開啟。

## 重要安全規則

- 不得提交 `runtime/`、`.env`、資料庫密碼、Webhook、API 金鑰、備份或匯出資料。
- 不得將 PostgreSQL 5432 直接開放至區網或網際網路。
- 研究資料與聯絡資料分屬不同 schema；只授予工作所需的最低權限。
- 不得散布 `C:\ProgramData\EGBioMed\CancerRisk\caddy\data\caddy\pki` 內的私鑰。
- 問卷或資料契約變更後必須執行完整測試，再提交 Git。
