# ASR 評估：Taiwan Tongues ASR CE vs myVoca

對應《對話式問卷-開發現況與廠商合作評估》簡報的**階段 0**：用我們自己受檢者的錄音，量兩家 ASR 在本案真正要的那件事上表現如何。

## 量什麼

**不是逐字稿準確率，是「這句話最後有沒有落到正確選項」。**

每段錄音會走這條路：ASR 轉成逐字稿 → 丟進對話版用的同一個判讀器（`answer-resolver.js`，可選加上模型判讀）→ 得到選項 → 跟人工標的正確答案比對。

| 指標 | 意思 | 用途 |
|---|---|---|
| **有害率** | 選錯選項，或該答「不確定」卻選了一個 | 主要指標，越低越好 |
| **ASR 造成的傷害** | 人工逐字稿判讀正確，ASR 逐字稿卻判成錯的 | **比較兩家就看這個** |
| ASR 造成的重問 | 人工逐字稿判得出來，ASR 的判不出來 | 體驗成本，不危險 |
| 判讀層本身的極限 | 連人工逐字稿都判不出來 | 不能算在 ASR 頭上 |
| CER | 字元錯誤率，只算國語錄音 | 輔助診斷 |

每段錄音都會跑兩次判讀：一次用 ASR 的逐字稿，一次用人工逐字稿（`reference_text`）。兩者的差距才是 ASR 的責任；沒有人工逐字稿，就無法區分是 ASR 聽錯，還是判讀器本來就看不懂。

### 已知限制（2026-10-29 試跑發現）

只用規則判讀時，自然口語幾乎都判不出來：範例清單 4 筆裡，連人工逐字稿都有 3 筆判不出來（「以前有抽啦，十年前就戒了」「一百六十五公分」這類）。規則層只認得選項原文和「是／否／不知道」，不讀中文數字。**所以正式比較時要加 `--classifier`**，否則大部分結果都會落在「判讀層本身的極限」，兩家 ASR 分不出高下。

`--classifier` 目前用的是 Anthropic 模型（需要 `ANTHROPIC_API_KEY`）。如果之後選定的聊天機器人廠商負責判讀，換成對方的判讀器即可；兩家 ASR 只要用**同一個**判讀器比較，結論就成立。

## 錄音規格

**倫理前提：階段 0 的錄音需要另外取得受檢者同意**（評估文件第 6 節）。錄音和結果檔都含健康資訊，只能放在 `eval/asr/recordings/` 與 `eval/asr/results/`，這兩個資料夾已被 git 忽略，不要放到其他地方或上傳到雲端硬碟。

建議的最低規模：

| 項目 | 建議 |
|---|---|
| 受檢者人數 | 至少 30 人，其中台語為主的至少 10 人，客語能找到幾位算幾位 |
| 年齡 | 以 60 歲以上為主（這是健檢中心的實際族群） |
| 環境 | 健檢中心現場（`clinic`）為主，另錄一部分安靜環境（`quiet`）當對照 |
| 題目 | 每人 10–15 題，涵蓋下列四類 |
| 格式 | WAV，16 kHz 以上、單聲道；每題一個檔案 |

一定要涵蓋的四類題目，因為各自代表一種不同的失敗方式：

1. **是／否題**：抽菸 `smoking_ever`、檳榔 `betel_nut`、二手菸 `secondhand_smoke`、家族史 `family_cancer`。聽錯一個「無」或「有」就是相反的答案。
2. **數字題**：出生年 `birth_year`、身高 `height_cm`、體重 `weight_kg`。辨識錯誤不會被選項擋下來，會直接進入模型。
3. **複選症狀題**：例如 `symptoms_respiratory`、`symptoms_upper_digestive`。一句話裡講好幾個症狀。
4. **「不知道」**：刻意讓一部分回答是不確定的，正確答案是 `expect: []`。這是測 ASR 和判讀器會不會「替人作答」。

提問方式：由人員照題目唸，請受檢者**用自己的話**回答，不要唸選項。用自己的語言回答（國語、台語、客語、夾雜都可以），並如實記錄在 `language`。

## 檔案格式

錄音放在 `eval/asr/recordings/` 底下，清單寫在 `eval/asr/recordings/manifest.json`，格式見 [`manifest.example.json`](manifest.example.json)：

- `expect`：正確選項的編號（從 0 開始），`[]` 代表正確答案是「無法判斷」
- `expect_number`：數字題的正確值，`null` 代表無法判斷
- `reference_text`：人工逐字稿。**台語、客語的寫法要先統一**：建議先看兩家 ASR 對台語的輸出是台語漢字、台羅拼音還是翻成國語，再決定人工稿用哪一種
- `language`：`zh` / `nan`（台語）/ `hak`（客語）/ `en` / `mixed`
- `environment`：`quiet` / `clinic` / `phone`
- `speaker`：只放代號、年齡層、性別，**不放姓名**

## 執行

```bash
# 1. 先跑天花板：假設 ASR 完美，看判讀器本身能做到多好
node eval-asr.js --asr transcript --classifier

# 2. Taiwan Tongues（自架服務，需先設定環境變數）
#    TT_BASE_URL=http://<主機>:5000  以及 TT_TOKEN，或 TT_USERNAME + TT_PASSWORD
node eval-asr.js --asr taiwan-tongues --classifier

# 3. myVoca：等台灣大哥大提供 API 規格後才能接（目前會直接回報未實作）
node eval-asr.js --asr myvoca --classifier

# 重新計分已存的逐字稿，不再呼叫 ASR（例如換了判讀器之後）
node eval-asr.js --reuse eval/asr/results/<檔名>.json --classifier
```

結果會分語言、分環境列出。結論要看**台語＋現場環境**那一列的「ASR 造成的傷害」，不是總平均。

## 兩家目前已知的資料（2026-10-29 查證）

| 項目 | Taiwan Tongues ASR CE | myVoca |
|---|---|---|
| 來源 | 數位發展部數位產業署計畫，維護單位台灣大哥大 | 台灣大哥大 × 長問科技，2026-03 發表 |
| 語言 | 國語、台語、客語、英語（模型標示 zh / nan / hak / en） | 中、台、英、客混合辨識（廠商自述） |
| 底層模型 | Whisper large-v2 微調，CTranslate2 格式 | 未公開 |
| 授權 | **TRAIL v0.1**（見下方說明） | 商用授權 |
| 部署 | 自架；GPU 需 10 GB 以上 VRAM。純 CPU 也能跑但慢（官方數字：5 分鐘音檔約 7 分鐘） | 公有雲 API、私有雲、企業內部署 |
| API | HTTP 任務式檔案辨識＋WebSocket 串流，JWT 認證 | 未公開，需向台灣大哥大索取 |
| 公開的準確率 | 無，各語言 CER 都沒有公布 | 「客製化調教後最高 97%」「算力 1/8」，廠商自述，無第三方評測 |
| 最近更新 | 2026-09-15 最後一次 commit（移除印尼語支援） | — |
| 本機能不能跑 | 這台電腦沒有 NVIDIA GPU，也沒有 Python 3.10，需要另外準備機器 | 只要有 API 金鑰 |

**兩家其實是同一個維護單位**：Taiwan Tongues 的 GitHub 頁面寫明由台灣大哥大維護。比較結果仍然有意義（開源自架 vs 商用 API 是不同的取捨），但不要把它當成兩個獨立來源的交叉驗證。

### Taiwan Tongues 的授權：簡報寫的 MIT 是錯的

簡報第 5 頁寫「MIT，無用途限制」。實際上 GitHub 的 `LICENSE` 檔是 **TRAIL – Taiwan Responsible AI License v0.1（2025-09-30）**，只有 `CITATION.cff` 裡寫 MIT，兩者互相矛盾，以 `LICENSE` 檔為準。重點：

- **只呼叫、不修改模型**（推論、載入原始權重）：適用「連接例外」，我們的程式不需要開源。
- **微調後散布**（包含以 API 讓他人存取）：衍生模型必須以 TRAIL 公開權重。「散布」的定義包含 API 與遠端存取，所以如果日後拿我們受檢者的錄音微調模型、再讓外部使用，可能觸發這一條，**需要法務確認**。
- **使用限制**：不得違法、不得歧視；機器生成的內容要明示是機器生成；不得用於「對個人法律權利有不利影響的全自動決策」。本案用來轉錄問卷回答，看起來不衝突，但同樣建議法務確認。

## 要問台灣大哥大的事（myVoca）

1. API 規格：檔案辨識和串流各怎麼呼叫、音檔格式、是否回傳信心分數
2. 台語、客語的輸出是什麼文字（台語漢字、台羅、還是翻成國語）
3. 有沒有試用金鑰或評估期，可以先用我們的錄音測
4. 音檔與逐字稿在哪裡處理、保存多久、會不會被拿去訓練模型
5. 能不能簽委外處理約定；企業內部署的條件與價格
6. 計價方式（每分鐘？每次呼叫？）
7. 是否有第三方或公開測試集上的各語言準確率

## 參考來源

- Taiwan Tongues ASR CE：<https://github.com/adi-gov-tw/Taiwan-Tongues-ASR-CE>（`LICENSE`、`api/README.md`）
- 模型頁：<https://huggingface.co/adi-gov-tw/Taiwan-Tongues-ASR-CE>
- myVoca 發表報導：<https://technews.tw/?p=1524998>、<https://www.techbang.com/posts/128350-myvoca-multi-lang-speech-ai>
