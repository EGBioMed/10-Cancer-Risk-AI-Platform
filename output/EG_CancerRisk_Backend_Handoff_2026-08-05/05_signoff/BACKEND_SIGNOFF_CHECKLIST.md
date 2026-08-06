# 後端簽核清單

請後端或模型負責人對每項填寫「已確認／需修正／不適用」，並附上說明。

## A. 題庫與答案代碼

- [ ] 已確認 78 個題目定義與 76 個標準答案題。
- [ ] 已確認中英文共用同一組 `question_id` 與 `code`。
- [ ] 已確認性別、年齡、母題與追問的顯示條件。
- [ ] 已確認 `unknown`、`not_applicable` 與明確陰性的差異。

## B. Feature mapping

- [ ] 已逐欄確認現行 71 個 model features。
- [ ] 已決定舊有 `-1` 編碼是否保留或由 adapter 轉換。
- [ ] 已確認 84 個症狀欄位的 1/0/null 語意。
- [ ] 已確認 32 個 vNext 候選 features 的最終名稱與去留。
- [ ] 已確認 29 個 rule inputs 是模型輸入、rule layer 輸入或研究欄位。
- [ ] 已確認肝病成因、血尿、腹部症狀與腫塊類別的邊界。

## C. API 與模型版本

- [ ] 已提供最終有序 feature manifest。
- [ ] 已提供 request JSON Schema、response JSON Schema 與範例。
- [ ] API 會拒絕未知版本、缺欄、多欄、錯誤型別與不可能數值。
- [ ] response 包含 model、feature schema、mapping 與 threshold 版本。
- [ ] 已定義舊 `/predict` 與新 `/predict/v2` 的兼容和回退策略。

## D. 驗收與上線

- [ ] 後端可由 `answer_code_rows` 重建訓練時相同的 features。
- [ ] 男性、女性、全無、不確定、不適用與矛盾案例皆已通過。
- [ ] 新模型已完成 shadow mode，且不會先改變使用者報告。
- [ ] 已記錄每次 inference 的 feature snapshot、順序與版本。
- [ ] Email 未出現在研究表、feature snapshot 或 model request。

## 簽核

- 後端負責人：
- 模型負責人：
- 臨床審查人：
- 前端負責人：
- 簽核日期：
- 核定版本：
