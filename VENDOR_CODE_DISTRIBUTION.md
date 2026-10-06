# 廠商代碼發放紀錄

這份表格記的是**代碼交給了誰**。資料庫記得住一組代碼被用了幾次，記不住它是什麼時候、透過誰、為了哪一檔活動發出去的——而「分辨流向」正是這些代碼存在的理由。`use_count` 少了這份紀錄就只是一個沒有對照組的數字。

發了碼就在這裡補一列，不要等事後回想。

---

## 1. 最重要的一件事：兩條線，兩種碼

| | 免費線 | 機構／廠商線 |
|---|---|---|
| 代碼格式 | `EG` + 縮寫 + 3 亂碼 | `<機構>Q<額度><6 亂碼>` |
| `delivery_mode` | `public` | `institution` |
| 持碼人收到 | 免費信（分數、分級、完整排序）＋ 付款連結 | **含 PDF 附件**的完整報告 |
| 付費與否 | 免費，報告另行付費 | 機構已付費 |

**同一家廠商在兩條線上有兩組不同的代碼。** 發錯的後果是實際的：

- 把免費碼給了已付費的機構 → 他們的人只收到免費信，會來客訴
- 把機構碼給了推廣對象 → 民眾免費拿到完整 PDF，該筆收入直接消失

所以下面兩張表**分開放**，不要合併成一張再用欄位區分。

---

## 2. 免費線（`delivery_mode: public`）

額度預設每組 1000 次。**不是 1000 的一定要在備註寫出來**——額度用盡的拒絕訊息和打錯字的拒絕訊息完全相同（見第 4 節），所以一組悄悄只有 5 次的碼，對廠商來說就是一組突然變成假的碼。

格式與設計理由見 [`FREEMIUM_SPEC.md` §10.3](FREEMIUM_SPEC.md)。

> ⚠️ **IRB 補件完成前不得對外發放。** 見 `FREEMIUM_SPEC.md` 第 13 步。

| 廠商 | 代碼 | grant_id | 發放日期 | 發給誰（姓名／職稱） | 通路 | 活動／用途 | 備註 |
|---|---|---|---|---|---|---|---|
| 華康 | `EGHK3FV` | 43 | | | | | |
| 雙和 | `EGSHN3J` | 44 | | | | | |
| 秀傳 | `EGSCHJGJ` | 45 | | | | | |
| 行動基因 | `EGACTJVK` | 46 | | | | | |
| 北醫藥學 | `EGTMUPDXQ` | 47 | | | | | |
| Numia | `EGNUMEDJ` | 48 | | | | | |
| 星源 | `EGETAG3` | 49 | | | | | |
| Eplus | `EGEPGGD` | 50 | | | | | |
| 保生 | `EGPLCG4` | 51 | | | | | |
| Garmin | `EGGRMUDH` | 52 | | | | | |
| Myrostar | `EGMYRO9RU` | 53 | | | | | |
| TimVo | `EGTVH8E` | 54 | | | | | |
| Daniel Chen | `EGDC57Q` | 55 | | | | | |
| ThomasTLee | `EGTTLARC` | 57 | | | | | 2026-10-01 有 1 次兌換，發放對象待補 |
| ASUS | `EGASUSMZ5` | 58 | | | | | 2026-10-01 有 2 次兌換，發放對象待補 |
| JoiiUP | `EGJOIICAQ` | 61 | | | | 測試 | **額度只有 5**，不是 1000。確認後 `access:topup --add-uses 995` |

**通路**寫代碼實際出現的地方，因為那決定了它會被多少人看到：`Email`、`LINE 群組`、`紙本文宣`、`活動海報`、`廠商自有網站`⋯⋯。印在海報上的碼和寄給單一窗口的碼，被陌生人用掉的機率差好幾個數量級。

---

## 3. 機構／廠商線（`delivery_mode: institution`）

這條線的既有代碼不在這裡，用這個指令匯出後填進來：

```bash
npm run access:export
```

（或 `node scripts/export-access-grants.js`，在 Render Shell 跑。）

| 機構 | 代碼 | grant_id | 額度 | 發放日期 | 發給誰 | 通路 | 備註 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

---

## 4. 對帳

查單一代碼：

```bash
npm run access:status -- --code EGHK3FV
```

一次查完免費線 16 組（Render Shell）：

```bash
for c in EGHK3FV EGSHN3J EGSCHJGJ EGACTJVK EGTMUPDXQ EGNUMEDJ EGETAG3 EGEPGGD EGPLCG4 EGGRMUDH EGMYRO9RU EGTVH8E EGDC57Q EGTTLARC EGASUSMZ5 EGJOIICAQ; do echo "--- $c ---"; npm run access:status -- --code $c; done
```

但 `use_count` 只回答「這組碼被兌換過幾次」，而**對帳真正要問的是「這次填答是誰帶來的」**，那是另一個問題。一個歸零的 `use_count` 不代表那家廠商沒帶人進來——他們的人可能拿著同一家廠商的**機構線**舊碼進來的，那組碼有自己的計數器，而且會寄出含 PDF 的完整報告。2026-10-01 就發生過：Garmin 的試用者用的是 9/17 鑄的 `grmnq59kxmfp`（grant 39，機構線），`EGGRMUDH` 動都沒動。

要看完整的進出紀錄，用資料 API 那邊的唯讀腳本（Azure SSH，`egbiomed-ai-data-api`）：

```bash
node /home/site/wwwroot/check-access-events.js 100
```

它印出每一筆兌換與被拒事件、每日「填答 vs 兌換」對照，以及所有 EG 開頭代碼的現況。`npm run access:status` 看不到這些，因為 Azure 閘門 API 只有建立／兌換／查詢／加額度四個端點，沒有事件查詢。

對帳時看的是 `use_count` 與這份表格的落差：

| 觀察 | 可能的意思 |
|---|---|
| 某組 `use_count` 上升，但表格裡沒有發放紀錄 | 有人發了碼沒登記，或代碼被猜中／外流 |
| 表格裡登記發放了，`use_count` 長期是 0 | 廠商沒有實際推廣，或代碼在他們那端卡住了 |
| `remaining` 逼近 0 | 加額度，**不要重鑄**——重鑄會讓已經印出去的碼失效 |

加額度（Render Shell）：

```bash
npm run access:topup -- --code EGHK3FV --add-uses 1000 --created-by "abbie"
```

額度用盡時的拒絕訊息與打錯字的拒絕訊息**完全相同**。對推廣對象來說，看起來就是「這個碼是假的」。所以 `remaining` 要主動盯，不能等客訴。

---

## 5. 撤銷

目前**沒有撤銷工具**。代碼一旦鑄出就永久有效（`expires_at: never`）。

代碼外流時能做的是：

1. 鑄一組新碼給該廠商，請他們改用
2. 在這份表格把舊的那一列標記為「已停用（勿再發放）」
3. 舊碼仍然可以被兌換——這是已知限制，評估影響時要把它算進去

所以**謹慎決定要不要把代碼印在公開通路上**，這個決定沒有回頭路。
