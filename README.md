# AI 癌症風險互動評估平台

這是一個可部署的互動式癌症風險評估平台，將既有問卷轉成健康探索式流程，並透過後端中繼 API 將結構化資料送往 Power Automate。

## 本機開發

正式串接請不要直接用 `file://` 開啟 `index.html`，請使用本機 Node 服務：

```bash
npm start
```

然後開啟：

```text
http://localhost:3000
```

若要測試送出到 Power Automate，需先設定環境變數：

```bash
export POWER_AUTOMATE_WEBHOOK_URL="Power Automate 完整 webhook URL"
npm start
```

## 目前包含

- 歡迎頁與非診斷免責說明
- AI Health Guide 角色區塊、真人感角色素材、浮動提示 chips、狀態光點與微互動動畫
- 健康探索式進度條、題目切換動效與模組完成回饋
- 個資告知與三項知情同意確認
- 基本資料、女性相關資訊、菸草與環境暴露、心理健康、飲食習慣、病史與家族史題組
- 13 個身體系統的近期症狀複選題組，區分單次警示狀況與持續／反覆不適
- 男性、女性、病史與症狀頻率的條件式追問
- Email 收集
- 單選、多選、數字輸入、Email 輸入與條件式跳題
- 使用者可讀的資料確認列表
- 完成送出頁，不在前端呈現風險結果
- 每份填答會在瀏覽器端整理成表格列格式，暫存於 `window.latestSubmission`，並在完成頁生成隱藏節點 `#submissionRowsJson`；不在瀏覽器 `localStorage` 累積保存健康資料
- 每份填答會另外生成參考 `10Cancer_AI_structure_data_v1.xlsx` 的 71 欄最佳化寬表資料，包含單位轉換、多選編碼、缺失值與矛盾提醒，存於隱藏節點 `#structuredFeaturesJson`
- 前端送出至同站台 `/api/submit`
- 每筆 payload 會攜帶問卷、同意書、特徵、轉換規則與報告模板版本，後端會以部署版本固定補正
- `server.js` 由環境變數讀取 Power Automate webhook URL，避免把簽章 URL 暴露在公開 JavaScript
- 送出 payload 同時包含：
  - `optimized_feature_row`：固定 71 欄模型 feature，供模型 API 使用
  - `ai_api_feature_row`：目前正式模型 API 的向後相容輸入
  - `symptom_feature_row`：82 個症狀研究欄位，未知或不適用保留為空值
  - `vnext_feature_row`：文獻缺口分析中的完整 32 個候選欄位，尚未送入現行模型
  - `excel_row`：去識別化研究 Excel 留存列，包含模型與研究欄位，但不含 Email
  - `contact_row`：獨立聯絡資料表使用，僅包含 record_id、Email、時間與報告語言

## 正式部署到 Render

1. 建立 GitHub repository，將本資料夾內容上傳。
2. 到 Render 建立 Web Service，連接該 GitHub repository。
3. Runtime 選 Node。
4. Start command 使用：

```text
npm start
```

5. 在 Render Environment Variables 新增：

```text
POWER_AUTOMATE_WEBHOOK_URL=Power Automate 完整 webhook URL
```

6. 部署完成後會取得公開網址，例如：

```text
https://eg-biomed-cancer-risk-assessment.onrender.com
```

7. 將公開網址產生 QR code，即可供使用者掃描填寫。

## 上線資料流

```text
使用者瀏覽器
→ Render /api/submit
→ Power Automate
→ 研究 Excel Office Script 寫入 excel_row
→ 受限權限的聯絡 Excel Office Script 寫入 contact_row
→ 模型 API 使用 optimized_feature_row
→ Email 報告
```

## Power Automate 欄位對應

Excel 的「執行指令碼」參數建議使用：

```text
string(body('Parse_JSON')?['excel_row'])
```

聯絡資料 Excel 的第二個「執行指令碼」參數使用：

```text
string(body('Parse_JSON')?['contact_row'])
```

模型 API 的 HTTP body 應繼續使用：

```text
body('Parse_JSON')?['ai_api_feature_row']
```

若 Excel 需要留存自由文字，請在 `CancerRiskResponses` 表格最後新增欄位：

```text
submitted_at
language
report_language
recent_discomfort_text
recent_discomfort_no_symptom
recent_discomfort_body_parts
recent_discomfort_symptoms
recent_discomfort_duration
recent_discomfort_severity
recent_discomfort_care_seeking
recent_discomfort_follow_up
recent_discomfort_ready_to_close
```

## 注意事項

- Power Automate webhook URL 含簽章，正式版請只放在 Render 環境變數，不要放進 `app.js`。
- 若更新 Power Automate trigger URL，需同步更新 Render 的 `POWER_AUTOMATE_WEBHOOK_URL` 並重新部署或重啟服務。
- Email 報告內容與模型 API key 也應放在 Power Automate 或後端安全環境，不建議公開在前端。
