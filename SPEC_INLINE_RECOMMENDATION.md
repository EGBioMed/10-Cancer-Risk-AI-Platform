# 規格：癌別內嵌檢測產品推薦

**版本** 1.0.0　**日期** 2026-09-22　**狀態** 待實作

實作現況、既有障礙與參考實作見 [`HANDOVER_INLINE_RECOMMENDATION.md`](HANDOVER_INLINE_RECOMMENDATION.md)。本文只定義**應該做成什麼樣**與**如何驗收**。

---

## 1. 目的與範圍

在免費信的「各癌種風險因子參考」區塊內，為符合條件的癌別，在該癌別的建議篩檢旁附上對應 OkaiDx 檢測產品的連結。

**範圍**：所有帶有「各癌種風險因子參考」區塊的信件。

> **2026-09-22 範圍變更（林若凱決定）**：原本限定免費信（流程 B），排除機構信與
> 交付信，理由是「機構為 B2B 關係，直接對其受檢者推銷未經該機構同意」與「交付信
> 讀者剛購買完整報告」。決定改為三封信都放。**機構信那條排除理由涉及與機構的合約
> 條款，決定者已知悉此點。**
>
> 實際落地為兩封：流程 A（機構信）與流程 B（免費信）。流程 C（交付信）沒有癌別
> 區塊——完整報告已以 PDF 附於信中，再重印一次排序等於讓收件者讀同樣的東西兩遍，
> 所以那封信的中段被整段替換掉（見 `scripts/build-email-templates.js` 的 DELIVERY
> 說明）。要在交付信裡出現推薦，必須做成獨立區塊，那是另一個決定。

**不在範圍內**：

- 流程 C 的交付信 —— 該信沒有癌別區塊，見上
- 付費 PDF 報告內容

---

## 2. 資料來源

| 名稱 | 來源 | 說明 |
|---|---|---|
| 癌別 | `body('HTTP_AI_predict')?['cancer_risks'][n]?['cancer']` | 唯一事實來源。**不得**使用問卷的癌別選項清單，兩者不同 |
| 風險等級 | 同上 `?['level']` | `低風險` / `中度風險` / `高風險` |
| 可靠性 | 同上 `?['reliable']` | 布林 |
| 自述病史 | `excel_row.personal_cancer_types` | 分號串接的中文癌別字串，例如 `乳癌; 大腸直腸癌`。中英文作答皆為中文標準值 |
| 排序文字 | `body('HTTP_AI_predict')?['cancer_risks_text']` | 預先排版的單一字串，含建議篩檢 |

`personal_cancer_types` 的取值方式見 §6.2。

---

## 3. 功能需求

### 3.1 有對應產品的癌別

僅以下四種。其餘癌別（含胃癌、膽道癌、頭頸癌、肺癌、子宮內膜癌、攝護腺癌、膀胱癌、腎癌）**不得**顯示連結。

| 癌別 | 連結目標 |
|---|---|
| 大腸直腸癌 | `/recommend?c=大腸直腸癌` |
| 胰臟癌 | `/recommend?c=胰臟癌` |
| 肝癌 | `/recommend?c=肝癌` |
| 乳癌 | `/recommend?c=乳癌` |

> 胃癌無產品。Gastrointestinal 該項產品的涵蓋範圍為 pancreatic / colorectal / liver，不含胃。

### 3.2 顯示條件（規範性）

對每一個癌別，依下表判定。**先判病史，再判風險**。

| # | 條件 | 結果 |
|---|---|---|
| 1 | 該癌別在 §3.1 清單中，且出現在 `personal_cancer_types` | 顯示，採**病史文案** |
| 2 | 該癌別為**乳癌**且不符合條件 1 | **不顯示** |
| 3 | 該癌別在 §3.1 清單中，`level` ∈ {`中度風險`, `高風險`}，`reliable` = `true`，且未出現在 `personal_cancer_types` | 顯示，採**風險文案** |
| 4 | 其他 | 不顯示 |

條件 2 為硬性要求：乳癌產品用途為監測已確診患者之疾病狀態，對未確診者不適用。

條件 3 的「未出現在病史」亦為硬性要求：大腸直腸癌與胰臟癌產品為偵測（detection）用途，對已確診者不適用。

### 3.3 數量

符合條件的癌別**各顯示一條**，不設上限。與先前「整封信最多一顆按鈕」的設計不同。

---

## 4. 連結規格

```
https://mdi.eg-bio.com/recommend?c=<癌別>&src=free
```

- `c` 之值必須為該癌別的**逐字名稱**並經 `encodeUriComponent()` 編碼
- `c` **不得**填入 `personal_cancer_types` 的原始字串（那是多個癌別的串接）
- `src` 固定為 `free`；若日後其他信件沿用，改用可辨識來源的值
- 信件中**不得**出現任何產品頁網址

---

## 5. 文案規格

文案所宣稱的用途，不得超出該產品頁面所聲明的用途。

### 5.1 乳癌（病史）

產品頁聲明監測用途，故得明述。

- 中文：`您在問卷中表示曾被診斷為乳癌。EG BioMed 提供用於監測乳癌疾病狀態的血液檢測服務，供您與醫師討論追蹤方式時參考。是否需要檢測請由醫師判斷，本信件不構成醫療建議。`
- 英文：`You indicated in the questionnaire that you have been diagnosed with breast cancer. EG BioMed offers a blood test for monitoring the disease status of breast cancer, which you may wish to discuss with your physician. Whether testing is appropriate is a decision for your physician; this email is not medical advice.`

### 5.2 大腸直腸癌／胰臟癌／肝癌（病史）

三者產品頁目前僅聲明 "early health screening purposes"，**不得**宣稱追蹤或監測用途。

- 中文：`您在問卷中表示曾被診斷為<癌別>。EG BioMed 提供相關的血液檢測服務，可作為您與醫師討論後續追蹤方式時的參考。是否適用、以及何時檢測，請由醫師判斷；本信件不構成醫療建議。`
- 英文：`You indicated in the questionnaire that you have been diagnosed with <cancer>. EG BioMed offers a related blood test, which you may wish to raise with your physician when discussing how your condition is followed up. Whether it is appropriate, and when, is a decision for your physician; this email is not medical advice.`

> 該三項產品頁補上追蹤／監測用途後，得改用 5.1 的措辭。**產品頁先改，信件後改**，不得反序。

### 5.3 風險文案

- 中文：`本次整理中，與<癌別>相關的風險因子較為集中。EG BioMed 提供對應的血液檢測服務，可作為您與醫師討論時的參考。是否需要檢測請由醫師判斷，本信件不構成醫療建議。`
- 英文：`This assessment found a denser cluster of risk factors associated with <cancer>. EG BioMed offers a corresponding blood test, which you may wish to raise with your physician. Whether testing is appropriate is a decision for your physician; this email is not medical advice.`

### 5.4 英文癌別名稱

模型不回傳英文癌別名（`prediction_json` 無任何 `_en` 欄位）。英文信須自帶對照：

| 中文 | 英文 |
|---|---|
| 大腸直腸癌 | colorectal cancer |
| 胰臟癌 | pancreatic cancer |
| 肝癌 | liver cancer |
| 乳癌 | breast cancer |

對照表查無之癌別，**不得**退回顯示中文名稱；應不顯示該連結。

---

## 6. 非功能需求

### 6.1 產品對應表的位置

癌別與產品網址之對應**必須**維持在商店端（WordPress 外掛第 14 節），不得寫入信件樣板。理由：更換產品不應需要編輯 Power Automate。

### 6.2 欄位取值

`personal_cancer_types` 須同時透過兩種引用取值：

```
coalesce(
  triggerBody()?['excel_row']?['personal_cancer_types'],
  body('剖析_JSON')?['excel_row']?['personal_cancer_types'],
  ''
)
```

僅用 `triggerBody()` 曾實測取不到值。條件式讀到不存在的欄位回傳 false 而非錯誤，故此失效**不會產生任何告警**。

### 6.3 快取

商店端轉址已設 `nocache_headers()`，且 W3 Total Cache 之「Never cache」已含 `/recommend*`。兩層皆不得移除。

### 6.4 內容一致性

信件樣板由 `scripts/build-email-templates.js` 產生，**不得**手改產出檔。「免費信 = 付費信 + 目錄 + 付款區塊」之比對測試不得放寬，新增區塊時應更新其移除邏輯。

### 6.5 法規

- 文案上線前須經法規審閱
- 本服務自述「不用於癌症診斷、篩檢、早期偵測、疾病預測或治療決策」，而產品頁自述用途為 early health screening；自風險結果導向篩檢產品之動線，與該免責聲明存在張力，屬法規判斷事項
- 資料使用目的自「健康教育」延伸至「產品推薦」，應納入 IRB 補件範圍

---

## 7. 驗收條件

每一項皆須實測，不得以程式碼審閱替代。

**顯示**

- [ ] 病史勾乳癌 → 乳癌連結出現，文案為 5.1
- [ ] 病史勾大腸直腸癌 → 大腸直腸癌連結出現，文案為 5.2（非 5.3）
- [ ] 無病史，某癌別中度風險且 `reliable` → 該癌別連結出現，文案為 5.3
- [ ] 多個癌別同時符合 → 各自顯示一條
- [ ] 連結位置在該癌別的建議篩檢旁，非獨立區塊

**不顯示**

- [ ] 無病史，第一名為乳癌 → 無乳癌連結
- [ ] 無病史，胃癌中度以上 → 無連結
- [ ] 某癌別低風險 → 無連結
- [ ] 某癌別 `reliable` 為 false → 無連結
- [ ] 病史勾大腸直腸癌且模型第一名亦為大腸直腸癌 → 僅出現病史文案，不重複出現風險文案

**連結**

- [ ] 四種癌別之連結各自落在正確產品頁
- [ ] 中文癌別經正確百分號編碼
- [ ] 信件原始碼中不含任何 `/product/` 網址

**英文信**

- [ ] 癌別名稱顯示為英文
- [ ] 不出現中文癌別名稱

**不得破壞**

- [ ] 流程 A 未被編輯
- [ ] 付費信與交付信未出現任何推薦連結
- [ ] `npm test` 全數通過

---

## 8. 明確不做的事

- 不依 `country` 篩選顯示對象。該項已知但未決（見 §9）
- 不在信件內顯示產品價格
- 不做點擊追蹤；歸因由轉址附加的 utm 參數交由既有網站分析處理

---

## 9. 待決事項

| 項目 | 需要誰決定 |
|---|---|
| ~~是否依 `country` 限制顯示對象~~ **已決定 2026-09-22：不限制，三個國別一律顯示**（林若凱）。§8 原本就是這樣寫，此決定確認維持現況。產品仍為美國 LDT、USD 計價、需醫師授權、寄送採集套組，台灣與越南讀者點進去會看到這些條件 | ~~業務~~ 已決 |
| 三項產品頁是否補上追蹤／監測用途（決定 5.2 能否改用 5.3 措辭） | 產品 |
| 文案審閱 | 法規 |
| 「找出值得優先關注的癌症」與免費信已提供之完整排序重疊，付款區塊文案是否調整 | 行銷 |
