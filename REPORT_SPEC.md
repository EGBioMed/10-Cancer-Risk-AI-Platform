# AI 十大癌症健康風險因子評估報告規格

## 1. 文件資訊

| 項目 | 內容 |
|---|---|
| 文件狀態 | Draft |
| 規格版本 | 0.1.0 |
| 報告模板版本 | 待建立，初版建議為 `1.0.0` |
| 適用語言 | 繁體中文、英文 |
| 預計頁數 | 13–15 頁 |
| 主要輸出 | PDF 附件 |
| 寄送方式 | Power Automate `傳送電子郵件 (V2)` |
| 報告產生方式 | Report Generation API 使用固定 HTML/CSS 模板產生 PDF |

本文件定義個人化 PDF 報告的內容、資料契約、風險溝通、版面、版本控管、Power Automate 串接與驗收標準。模型、前端、報告服務、臨床審查、法規審查與維運人員皆應以本文件為共同規格。

---

## 2. 產品目的

本報告依據使用者自行填寫的年齡、生活型態、家族史、既往病史、近期症狀及其他健康資訊，結合統計與人工智慧模型結果，提供：

1. 十大癌症模型整體相對風險的解釋。
2. 十種癌症模型訊號的相對排序與個別說明。
3. 使用者所填健康風險因子的個人化整理。
4. 一般健康管理與生活型態建議。
5. 可與醫療專業人員討論的篩檢及健康檢查資訊。
6. 清楚、可執行的下一步指引。

本報告不提供疾病診斷、罹癌機率、早期偵測、治療決策或取代標準醫療檢查。

---

## 3. 非目標

報告不得：

1. 將模型分數描述為個人罹癌機率。
2. 宣稱使用者已罹癌、未罹癌或即將罹癌。
3. 單憑模型分數要求使用者接受特定侵入性檢查。
4. 讓 LLM 修改模型分數、相對風險分層或癌別排序。
5. 讓 LLM 自行決定篩檢資格、就醫急迫性或治療行動。
6. 將未納入現行模型的研究欄位描述成模型判定依據。
7. 把相關性、feature contribution 或 SHAP 值描述成因果關係。
8. 將缺失值、不確定回答或不適用欄位視為沒有風險因子。

---

## 4. 標準用語

### 4.1 允許使用

- 十大癌症模型整體相對風險
- 相對風險指數
- 相對風險等級
- 低相對風險
- 中度相對風險
- 較高相對風險
- 模型訊號
- 模型研究資料中的相對位置
- 與模型結果相關的主要輸入因子
- 可與醫療專業人員討論的篩檢與健康檢查
- 健康教育與自我健康管理參考

### 4.2 禁止使用

- 罹癌率
- 罹癌機率
- 患癌機率
- 癌症確診
- AI 已發現癌症
- AI 篩檢結果
- 一定需要做某項檢查
- 沒有癌症
- 安全、完全正常或零風險

### 4.3 固定分數說明

中文版：

> 此指數呈現您所填寫之風險因子組合在模型研究資料中的相對位置，不是罹癌機率。

英文版：

> This index shows the relative position of your reported risk-factor profile within the model's research data. It is not the probability of developing cancer.

---

## 5. 整體與個別癌別呈現邏輯

### 5.1 整體模型優先

整體十大癌症模型結果是報告的第一層資訊。個別癌別模型是第二層資訊，不得脫離整體結果單獨解讀。

### 5.2 顯示規則

| 整體相對風險 | 個別癌別呈現方式 |
|---|---|
| 低相對風險 | 顯示十癌模型排序，但降低視覺強度，說明目前未見需優先關注的整體模型訊號；仍應依一般篩檢資格管理健康。 |
| 中度相對風險 | 顯示十癌模型排序與健康因子摘要，提醒持續健康管理及依資格接受篩檢，不以個別分數要求額外檢查。 |
| 較高相對風險 | 顯示十癌排序、重要模型輸入因子及可與醫療專業人員討論的下一步；仍不得描述為已罹癌或確診。 |

### 5.3 門檻來源

報告不得自行硬編碼風險門檻。模型 API 必須回傳：

- `relative_level`
- `relative_label_zh`
- `relative_label_en`
- `threshold_version`

若門檻欄位缺失，報告產生應失敗，不得自行推測分層。

---

## 6. 十大癌症範圍

初版報告包含：

1. 乳癌
2. 攝護腺癌
3. 肺癌
4. 頭頸癌
5. 胰臟癌
6. 肝癌
7. 大腸直腸癌
8. 胃癌
9. 子宮內膜癌
10. 膀胱癌

模型 API 應透過固定 `cancer_id` 回傳，不得以中文癌別名稱作為程式判斷鍵值。

建議 ID：

```text
breast
prostate
lung
head_neck
pancreatic
liver
colorectal
gastric
endometrial
bladder
```

性別或生理條件不適用的癌別應回傳 `applicable: false`。報告顯示「不適用」，不得顯示 `0%` 或低風險。

---

## 7. 系統架構

```text
使用者網頁
  -> Power Automate HTTP Trigger
  -> 剖析問卷 JSON
  -> Excel / Office Script 保存
  -> AI Model API
  -> 剖析模型結果
  -> Compose report_payload
  -> Report Generation API
  -> SharePoint / OneDrive 暫存 PDF
  -> 取得檔案內容
  -> Outlook Email HTML + PDF 附件
```

### 7.1 責任分工

| 元件 | 責任 |
|---|---|
| 前端 | 收集、確認並送出使用者回答 |
| Power Automate | 流程控制、資料保存、API 呼叫、檔案暫存、寄信與錯誤處理 |
| Model API | 模型推論、相對分層、排序及實際模型貢獻值 |
| Report API | 套用固定內容規則、產生圖表、排版及輸出 PDF |
| LLM | 僅能在核准內容範圍內做語句自然化；初版可完全不使用 |
| Excel | 保存結構化資料與報告處理狀態，不作為即時報告的唯一資料來源 |

---

## 8. Report Payload 資料契約

Power Automate 應在模型推論成功後建立以下資料：

```json
{
  "report_id": "RPT-WEB-123456",
  "record_id": "WEB-123456",
  "language": "zh-TW",
  "generated_at": "2026-07-27T08:00:00Z",
  "report_template_version": "1.0.0",
  "guideline_version": "TW-HPA-2026.06",
  "profile": {
    "sex": 1,
    "age": 52,
    "height_cm": 162,
    "weight_kg": 58,
    "bmi": 22.1
  },
  "answers": [],
  "symptom_feature_row": {},
  "research_feature_row": {},
  "prediction": {
    "model_version": "2026.07",
    "threshold_version": "2026.07",
    "overall": {},
    "cancer_results": []
  }
}
```

### 8.1 必填欄位

- `report_id`
- `record_id`
- `language`
- `generated_at`
- `report_template_version`
- `guideline_version`
- `profile`
- `prediction.model_version`
- `prediction.threshold_version`
- `prediction.overall`
- `prediction.cancer_results`

### 8.2 語言值

只允許：

```text
zh-TW
en
```

其他值一律使用 `zh-TW` 前，必須在 Power Automate 留下警告紀錄。

### 8.3 個資最小化

Report API 不應接收：

- Email
- Power Automate webhook URL
- Microsoft 帳號
- API 金鑰
- 不需要顯示於報告的內部欄位

Email 地址只保留在 Power Automate 寄信步驟。

---

## 9. Model API 回應最低規格

```json
{
  "record_id": "WEB-123456",
  "model_version": "2026.07",
  "threshold_version": "2026.07",
  "overall": {
    "relative_score": 0.62341,
    "relative_score_display": 62.3,
    "relative_level": "higher",
    "relative_label_zh": "較高相對風險",
    "relative_label_en": "Higher Relative Risk",
    "percentile": null,
    "top_contributors": []
  },
  "cancer_results": [
    {
      "cancer_id": "lung",
      "name_zh": "肺癌",
      "name_en": "Lung Cancer",
      "applicable": true,
      "relative_score": 0.71234,
      "relative_score_display": 71.2,
      "relative_level": "higher",
      "relative_label_zh": "較高相對風險",
      "relative_label_en": "Higher Relative Risk",
      "rank": 1,
      "top_contributors": [
        {
          "feature_id": "smoking",
          "direction": "increase",
          "contribution": 0.18
        }
      ]
    }
  ]
}
```

### 9.1 分數格式

- API 保存原始值，最多保留模型需要的精度。
- PDF 預設顯示一位小數。
- 分數後不得加上「罹癌機率」。
- 若顯示百分比形式，必須同頁顯示固定分數說明。
- 未完成校準的數值不得稱為 absolute risk。

### 9.2 排序

- `rank` 由 Model API 產生。
- Report API 可檢查排序一致性，但不得重新計算模型分數。
- `applicable: false` 不納入排序。
- 同分排序規則由模型團隊定義並記錄於 `threshold_version`。

---

## 10. 個人化因子解釋

### 10.1 因子類型

報告將因子分成：

1. 不可調整：年齡、生理性別、家族史等。
2. 可調整：抽菸、飲酒、運動、飲食等。
3. 健康史：慢性疾病、既往癌症史等。
4. 近期症狀：獨立呈現，不自動視為癌症症狀。
5. 研究欄位：明確標示目前未納入現行模型。

### 10.2 模型貢獻值

只有 Model API 回傳的 `top_contributors` 可以寫為「與本次模型結果相關的主要輸入因子」。

若 `top_contributors` 為空：

> 目前模型版本未提供個別特徵貢獻值。本頁僅整理您填寫的相關健康資料，不表示這些項目造成或直接決定模型結果。

### 10.3 方向文字

| direction | 中文 | 英文 |
|---|---|---|
| `increase` | 與較高模型訊號相關 | Associated with a higher model signal |
| `decrease` | 與較低模型訊號相關 | Associated with a lower model signal |
| `neutral` | 本次未見明顯方向 | No clear direction in this assessment |

不得使用「保護您不會罹癌」或「導致癌症」。

---

## 11. 症狀與研究欄位

目前平台另外收集近期症狀觀察及研究欄位。

初版規則：

1. 症狀資料獨立於現行模型結果呈現。
2. 除非 `model_version` 明確記錄已納入症狀，不得稱為模型輸入。
3. 持續、反覆、原因不明或明顯不適，可顯示一般性就醫提醒。
4. 不得依單一症狀推論特定癌症。
5. `research_feature_row.processed_meat` 初版只可標示為研究資料，不得列為模型貢獻因子。

---

## 12. 篩檢與健康檢查規則

### 12.1 文字標題

使用：

> 可與醫療專業人員討論的篩檢與健康檢查

不使用：

> AI 推薦檢驗

### 12.2 規則來源

篩檢內容只能來自版本化、經臨床審查的規則表，例如：

```json
{
  "guideline_version": "TW-HPA-2026.06",
  "rules": [
    {
      "rule_id": "breast_screening_40_74",
      "conditions": {
        "sex": 1,
        "age_min": 40,
        "age_max": 74
      },
      "title_zh": "乳房 X 光攝影",
      "title_en": "Mammography",
      "action_zh": "您可能符合公費篩檢資格，可向醫療院所確認。",
      "action_en": "You may be eligible for publicly funded screening. Please confirm with a healthcare provider.",
      "source_url": "https://www.hpa.gov.tw/211/s"
    }
  ]
}
```

### 12.3 建議分類

1. 依年齡、性別與暴露史符合的一般篩檢。
2. 因個人健康因子可與醫療人員進一步討論的項目。
3. 因持續症狀建議接受正式醫療評估的項目。

模型分數不得單獨觸發侵入性檢查建議。

---

## 13. 頁面內容規格

### 第 1 頁：封面

- EG BioMed 愛立基生醫
- AI 十大癌症健康風險因子評估報告
- 報告編號
- 產生日期
- 報告語言
- 簡短非診斷說明

不得在封面顯示高風險紅色警告或疾病圖像。

### 第 2 頁：如何閱讀

- 相對風險的意義
- 分數不是罹癌機率
- 整體模型優先、個別癌別次之
- 本報告可以與不可以回答的問題
- 若有明顯不適應尋求正式醫療評估

### 第 3 頁：整體相對風險

- 整體相對風險等級
- 相對風險指數
- 固定分數說明
- 一段依分層選用的核准文字
- 不顯示偽精確機率

### 第 4 頁：個人健康資料摘要

- 年齡
- 性別
- BMI
- 抽菸、飲酒、運動
- 家族史
- 既往癌症史
- 慢性病摘要
- 使用者不確定或缺失的資料

不得顯示模型內部 feature 名稱或編碼。

### 第 5 頁：個人化因子整理

- 不可調整因子
- 可調整因子
- 與本次模型結果相關的主要輸入因子
- 資料完整性提醒

### 第 6 頁：十癌排序

- 十個癌別固定列表
- 相對風險等級
- 相對風險指數
- 排名
- 不適用狀態
- 整體模型門檻解釋

圖表不得使用純紅綠判讀，需搭配文字與圖示。

### 第 7–11 頁：十癌個別說明

每種癌症包含：

- 癌別名稱
- 相對等級與排序
- 指數說明
- 實際模型貢獻因子，若有
- 使用者填寫的相關資料
- 一般健康教育
- 可與醫療專業人員討論的事項
- 適用的一般篩檢規則
- 固定限制說明

每頁建議呈現兩種癌症。

### 第 12 頁：健康管理

依實際回答顯示：

- 戒菸與二手菸
- 飲酒
- 運動
- 體重管理
- 飲食
- 睡眠與心理健康
- 慢性疾病追蹤

只顯示使用者可採取且經核准的行動，不使用恐嚇文字。

### 第 13 頁：篩檢與健康檢查

- 一般篩檢資格
- 可進一步諮詢項目
- 症狀相關就醫提醒
- 規則版本與官方來源

### 第 14 頁：下一步

依優先順序呈現：

1. 持續或明顯不適時尋求醫療評估。
2. 確認是否符合公費篩檢資格。
3. 整理欲與醫療人員討論的問題。
4. 持續一般健康管理。
5. 日後重新評估時更新健康資料。

### 第 15 頁：模型與聲明

- 模型版本
- 門檻版本
- 報告模板版本
- 指引版本
- 訓練與驗證資料摘要
- ROC-AUC、敏感度等效能指標的正確解釋
- 限制
- 完整免責聲明
- 聯絡方式

---

## 14. 模型效能呈現

模型效能資料必須由版本化設定檔提供，不得散落硬編碼於模板。

至少包含：

- 資料集筆數與族群摘要
- 訓練、驗證與測試方法
- ROC-AUC
- 敏感度
- 特異性，如經核准顯示
- 測試集或重複驗證次數
- 決策閾值
- 模型版本

固定解釋：

> 模型效能指標反映模型在特定研究資料與驗證設計中的整體辨識能力，不代表本報告對單一使用者的診斷正確率。

所有數據更新必須：

1. 由模型負責人確認。
2. 更新 `model_version`。
3. 更新報告設定檔。
4. 通過中英文內容審查。

---

## 15. LLM 使用規則

初版建議完全使用固定模板。

若未來使用 LLM：

1. 輸入只能是允許清單中的結構化欄位。
2. 輸出必須符合 JSON Schema。
3. 不得輸出分數、風險層級或檢查資格的新值。
4. 不得自行增加癌症症狀、診斷或治療建議。
5. 所有可能輸出句型需經臨床與法規審查。
6. LLM 失敗時必須回退固定模板。
7. 保存 `prompt_version`、模型名稱及生成狀態供稽核。
8. 不將 Email、姓名或非必要識別資訊送入 LLM。

---

## 16. 視覺與 PDF 規格

### 16.1 品牌與排版

- 延續目前 Email 的深綠、白色與淺綠色系。
- 主要字型：Noto Sans TC。
- 內文最小 10.5 pt。
- 行距至少 1.5。
- 每頁保留頁碼、報告編號與機密性提示。
- 卡片圓角不超過 8 px。
- 不使用恐嚇性照片或病灶影像。

### 16.2 圖表

- 使用 SVG 或伺服器端產生的靜態圖。
- 顏色不得作為唯一判讀方式。
- 每張圖必須有文字標題與數值標籤。
- 不適用與缺失資料需使用不同狀態。
- 十癌排序應維持固定癌別名稱與一致刻度。

### 16.3 分頁

- 標題不得孤立在頁尾。
- 癌別區塊不得跨頁切斷。
- 聲明與來源不得被截斷。
- 中英文皆需執行分頁測試。

### 16.4 檔案

- 格式：PDF
- 建議大小：5 MB 以下
- 檔名：

```text
EG_BioMed_Cancer_Risk_Report_{record_id}_{language}.pdf
```

---

## 17. Report API

### 17.1 Endpoint

```http
POST /generate-report
Content-Type: application/json
X-API-Key: {secret}
Idempotency-Key: {report_id}
```

成功回應：

```http
200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="EG_BioMed_Cancer_Risk_Report_WEB-123_zh-TW.pdf"
```

### 17.2 錯誤回應

```json
{
  "error_code": "INVALID_MODEL_RESPONSE",
  "message": "Required model fields are missing.",
  "report_id": "RPT-WEB-123456"
}
```

建議錯誤碼：

- `INVALID_PAYLOAD`
- `UNSUPPORTED_LANGUAGE`
- `INVALID_MODEL_RESPONSE`
- `MISSING_CANCER_RESULT`
- `MISSING_THRESHOLD_VERSION`
- `TEMPLATE_RENDER_FAILED`
- `PDF_GENERATION_FAILED`
- `REPORT_TOO_LARGE`

### 17.3 效能目標

- 一般生成時間：30 秒內
- Power Automate 呼叫不得超過其同步 HTTP 限制
- PDF 目標大小：5 MB 以下
- 同一 `Idempotency-Key` 重試不得產生不同內容或重複寄信

---

## 18. Power Automate 串接

模型成功後新增：

1. `剖析 JSON - AI Model Response`
2. `Compose - Report Payload`
3. `HTTP - Generate PDF`
4. `建立檔案 - SharePoint / OneDrive`
5. `取得檔案內容`
6. `傳送電子郵件 (V2)`
7. `更新 Excel 報告狀態`

### 18.1 PDF 暫存路徑

```text
/CancerRiskReports/{yyyy}/{MM}/{record_id}.pdf
```

不得建立匿名公開連結。

### 18.2 Email

Email 維持目前品牌模板，但正文縮短為：

- 感謝完成評估
- 整體相對風險摘要
- 完整個人化報告已附於 Email
- 聯絡方式
- 精簡服務聲明

附件：

```text
Name: EG_BioMed_Cancer_Risk_Report_{record_id}_{language}.pdf
ContentBytes: 取得檔案內容
```

---

## 19. Excel 報告狀態欄位

建議新增：

| 欄位 | 用途 |
|---|---|
| `report_id` | 報告唯一識別碼 |
| `report_status` | `pending`、`generated`、`sent`、`failed` |
| `report_template_version` | PDF 模板版本 |
| `report_language` | `zh-TW` 或 `en` |
| `model_version` | 模型版本 |
| `threshold_version` | 分層門檻版本 |
| `guideline_version` | 篩檢規則版本 |
| `pdf_generated_at` | PDF 完成時間 |
| `email_sent_at` | Email 寄送時間 |
| `report_error_code` | 錯誤代碼 |
| `report_error_message` | 錯誤摘要 |

---

## 20. 錯誤處理

Power Automate 建議使用：

```text
TRY
CATCH
FINALLY
```

### TRY

- 模型推論
- 模型回應驗證
- PDF 生成
- PDF 保存
- Email 寄送

### CATCH

- 將 `report_status` 更新為 `failed`
- 記錄錯誤碼與來源
- 通知管理員
- 視政策寄送目前既有的簡版 HTML 報告
- 不將內部錯誤、API 金鑰或健康資料寫入對外 Email

### FINALLY

- 記錄流程完成時間
- 記錄最終狀態
- 執行暫存檔清理或排程保留

---

## 21. 保存與安全

1. Report API 必須使用 HTTPS。
2. API 金鑰只能保存在 Render 環境變數與 Power Automate 連線設定。
3. Power Automate 的安全輸入／輸出應用於健康資料與 API 回應。
4. PDF 只存於受控 SharePoint 或 OneDrive 資料夾。
5. 不建立匿名公開分享連結。
6. 依公司個資政策設定 PDF 保存期限。
7. 建議另建排程流程刪除超過保存期限的 PDF。
8. 稽核紀錄不得保存完整 API 金鑰或 webhook 簽章。
9. 正式上線前應更換曾出現在測試紀錄、聊天或截圖中的 API 金鑰與 webhook URL。

---

## 22. 驗收標準

### 22.1 資料

- [ ] `record_id` 在問卷、Excel、模型、PDF 與 Email 一致。
- [ ] 十個癌別結果完整且無重複。
- [ ] 不適用癌別不顯示為零風險。
- [ ] 中文與英文使用正確模板。
- [ ] 模型版本、門檻版本與報告版本均顯示。
- [ ] 症狀與研究欄位未被錯誤描述為現行模型輸入。

### 22.2 內容

- [ ] 未出現「罹癌機率」或診斷式文字。
- [ ] 每個分數旁皆有必要的相對位置說明。
- [ ] 整體模型結果優先於個別癌別。
- [ ] 健康建議來自核准句庫。
- [ ] 篩檢資訊來自版本化規則。
- [ ] 模型效能未描述為個人準確率。

### 22.3 PDF

- [ ] 中文字型完整。
- [ ] 無文字重疊、截斷或空白頁。
- [ ] 癌別區塊不被分頁切斷。
- [ ] 手機、桌面與列印皆可閱讀。
- [ ] 檔案小於 5 MB，或符合核准上限。
- [ ] 頁碼、報告編號與版本資訊正確。

### 22.4 流程

- [ ] PDF 生成失敗時不會寄出空白附件。
- [ ] Email 失敗時保留可重試狀態。
- [ ] 相同 `report_id` 不會重複寄信。
- [ ] 錯誤通知不包含敏感健康資料。
- [ ] 暫存 PDF 按政策清除。

---

## 23. 最低測試矩陣

至少涵蓋：

1. 中文低相對風險
2. 中文中度相對風險
3. 中文較高相對風險
4. 英文低相對風險
5. 英文中度相對風險
6. 英文較高相對風險
7. 男性
8. 女性
9. 有既往癌症史
10. 有家族癌症史
11. 有近期症狀
12. 有不確定及缺失回答
13. 不適用癌別
14. 模型 API 失敗
15. Report API 失敗
16. Email 地址無效
17. 同一 `record_id` 重送
18. Gmail、Outlook 與 iPhone Mail
19. 5 MB 附近的 PDF
20. 中英文分頁與字型

---

## 24. 審查與發布

每次正式發布需完成：

| 審查 | 負責內容 |
|---|---|
| 模型審查 | 分數、門檻、排序、特徵貢獻與效能資料 |
| 臨床審查 | 癌別衛教、健康建議、篩檢規則與症狀提醒 |
| 法規審查 | 產品用途、宣稱、風險文字與完整聲明 |
| 個資審查 | 傳輸、保存、權限、刪除與稽核 |
| 工程審查 | API、模板、錯誤處理、效能與安全 |
| 語言審查 | 中英文一致性與一般民眾可讀性 |

正式發布時必須同步記錄：

```text
model_version
threshold_version
report_template_version
guideline_version
content_version
```

---

## 25. 待確認事項

1. Model API 是否能提供每個模型的 SHAP 或 feature contribution。
2. 十癌模型完整 `cancer_id` 與輸出順序。
3. 整體與個別癌別分層門檻。
4. 模型效能最新版核准數據。
5. 報告 PDF 保存期限。
6. 症狀是否只呈現摘要或逐項列出。
7. 使用者既往癌症史對報告內容的特殊處理。
8. 是否顯示研究資料百分位。
9. 臨床與法規審查負責人。
10. Report API 的部署帳號、網域與 API 金鑰管理方式。

---

## 26. 建議實作順序

1. 確認本文件與報告頁面架構。
2. 取得目前 Model API 完整成功回應。
3. 定義新版 Model API JSON Schema。
4. 建立特徵顯示名稱、癌別內容及健康建議句庫。
5. 建立篩檢規則檔與版本。
6. 建立中文版固定 HTML 模板。
7. 完成中文版臨床與法規審查。
8. 建立英文版模板。
9. 建立 Report Generation API。
10. 建立 Power Automate 測試流程。
11. 執行最低測試矩陣。
12. 完成簽核後切換正式流程。

---

## 27. 參考來源

- 衛生福利部食品藥物管理署，醫用軟體分類分級參考指引  
  <https://www.fda.gov.tw/TC/siteListContent.aspx?id=41637&sid=11652>
- 衛生福利部國民健康署，癌症篩檢介紹  
  <https://www.hpa.gov.tw/211/s>
- Microsoft Learn，Word Online (Business) connector  
  <https://learn.microsoft.com/en-nz/connectors/wordonlinebusiness/>
- Microsoft Learn，Power Automate limits and configuration  
  <https://learn.microsoft.com/en-us/power-automate/limits-and-config>

