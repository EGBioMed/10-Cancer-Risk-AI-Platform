# EG BioMed 十癌風險平台：後端交接包

建立日期：2026-08-05

## 這包文件的用途

本交接包用於讓後端、模型與臨床審查人員共同確認 v19.4 問卷、答案代碼、feature mapping、新版模型輸入與 API 契約。

**這是審查與實作規格，不代表新版 API 或 Power Automate 已經切換。**

## 後端的閱讀順序

1. `01_questionnaire/QUESTIONNAIRE_V19_4_SPEC.md`：先理解前端問了什麼、題序與分流。
2. `01_questionnaire/answer-code-manifest.json`：確認語言中立的答案代碼。
3. `02_mapping/answer-to-feature-mapping.json`：確認答案如何轉成現行 71 個 features。
4. `03_vnext/MODEL_VNEXT_HANDOFF.md`：確認新版模型、症狀與 rule layer 的後端工作。
5. `04_api/assessment-submission.proposed.schema.json`：審查擬議中的前後端 payload。
6. `05_signoff/BACKEND_SIGNOFF_CHECKLIST.md`：逐項回覆最終決策。

## 重要界線

- 目前已部署模型仍只接收 `ai_api_feature_row` 的 71 欄 `model-features/1.0.0`。
- `symptom_feature_row`、`vnext_feature_row` 與 `rule_input_row` 目前是新版蒐集，不可未經確認就加入現行 `/predict`。
- 後端不可依中文或英文文字轉換 features，必須使用 `question_id` 與固定 `code`。
- `unknown` 與 `not_applicable` 必須與明確回答「無」分開。
- Email 只允許儲存在限制權限的聯絡資料，不得進入研究 feature row 或模型。

## 後端必須交回的成果

- 簽核後的模型輸入欄位清單與順序。
- 每個欄位的型別、合法值、單位與缺失值規則。
- 簽核後的 answer-to-feature mapping。
- 新版 API request/response JSON Schema 與範例。
- 模型、前處理、門檻與報告文案的版本號。
- 中文、英文、男性、女性、全無、不確定、條件追問與矛盾回答的測試案例。
- 新舊模型雙軌測試、切換與回退方案。
