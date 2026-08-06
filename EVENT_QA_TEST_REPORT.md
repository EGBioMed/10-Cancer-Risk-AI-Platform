# 10 Cancer AI Platform 展場 QA/QC 測試報告

產出時間：2026-07-13 12:35 CST

## 測試目的

確認正式展場流程在多人同時填寫時是否穩定，並估算使用者等待報告寄出的時間。

正式流程：

```text
前端表單 -> Render /api/submit -> Power Automate -> AI API -> Excel -> Email
```

## 最終結論

目前正式流程可上展場，但建議採「分批送出」操作。

| 項目 | 結論 |
|---|---|
| 單筆正式流程 | 通過 |
| 新版 model 後單筆流程 | 通過 |
| 新版 model 後 5 人同時送出 | 功能通過 |
| 新版 model 後 6 人同時送出 | 通過 150 秒門檻 |
| 新版 model 後 7 人同時送出 | 功能通過，但超過 150 秒門檻 |
| AI API | 通過，HTTP 200 |
| Excel 寫入 | 通過，未再出現 409 |
| Email 寄送 | 通過 |
| 建議展場批次 | 每批 3-5 人最穩，6 人為測得上限 |
| 不建議情境 | 新版 model 下 7 人以上同時送出 |

## 關鍵測試結果

### 單筆正式流程

2026-07-13 重新測試新版 model 後單筆流程：

| 指標 | 結果 |
|---|---:|
| k6 checks | 100% |
| HTTP failed | 0% |
| k6 response time | 1.46 秒 |
| Power Automate 總時間 | 21 秒 |
| AI API | Succeeded / HTTP 200 |
| Excel | Succeeded / HTTP 200 |
| Email | Succeeded / HTTP 200 |

結論：單筆正式 E2E 通過。

### 5 人同時送出，新版 model

2026-07-13 測試 `production_burst_5`：

| 指標 | 結果 |
|---|---:|
| 送出筆數 | 5 |
| k6 checks | 100% |
| HTTP failed | 0% |
| k6 response p95 | 14.21 秒 |
| Flow 完成時間 | 73、90、107、123、140 秒 |
| 最後一筆完成 | 約 2 分 20 秒 |
| AI API | 5/5 Succeeded |
| Excel | 5/5 Succeeded |
| Email | 5/5 Succeeded |

結論：功能通過。5 人同時送出可承受，且仍在 150 秒門檻內。

### 6 人同時送出，新版 model

2026-07-13 測試 `production_burst_6`：

| 指標 | 結果 |
|---|---:|
| 送出筆數 | 6 |
| k6 checks | 100% |
| HTTP failed | 0% |
| k6 response p95 | 13.56 秒 |
| Flow 完成時間 | 69、85、102、118、133、148 秒 |
| 最後一筆完成 | 約 2 分 28 秒 |
| AI API | 6/6 Succeeded |
| Excel | 6/6 Succeeded |
| Email | 6/6 Succeeded |

結論：功能通過，且最後一筆 148 秒，仍在 150 秒門檻內，但只剩 2 秒緩衝。6 人是目前測得的舒適等待上限。

### 7 人同時送出，新版 model

2026-07-13 測試 `production_burst_7`：

| 指標 | 結果 |
|---|---:|
| 送出筆數 | 7 |
| k6 checks | 100% |
| HTTP failed | 0% |
| k6 response p95 | 13.45 秒 |
| Flow 完成時間 | 68、82、97、114、129、147、165 秒 |
| 最後一筆完成 | 約 2 分 45 秒 |
| AI API | 7/7 Succeeded |
| Excel | 7/7 Succeeded |
| Email | 7/7 Succeeded |

結論：功能通過，但最後一筆 165 秒，超過 150 秒門檻。7 人以上不建議作為展場同時送出批次。

### 10 人同時送出，舊版 model 測試參考

2026-07-10 測試 `production_burst_10`：

| 指標 | 結果 |
|---|---:|
| 送出筆數 | 10 |
| 失敗率 | 0% |
| 最後一筆完成 | 約 2 分 49 秒 |

結論：系統功能可承受 10 人同時送出，但等待時間超過 1-2 分鐘。新版 model 測得 7 人已超過 150 秒後，不需要再以 10 人作為展場建議批次；10 人僅作壅塞情境參考。

## 已修復問題

### AI API HTTP 422

曾發生：

```text
UnprocessableEntity
loc: ["body"]
msg: Field required
```

原因：Power Automate 的 AI API HTTP action 沒有送出 body。

修正後設定：

```text
Body:
body('剖析_JSON')?['ai_api_feature_row']
```

修復驗證：

```text
AI API HTTP input body: present
AI API response: HTTP 200
Production single E2E: PASS
```

### Excel 409

曾發生 Excel concurrent write conflict。

短期策略：

```text
Power Automate trigger concurrency control: On
Degree of parallelism: 1
```

效果：避免多人同時寫入 Excel 造成 409，但多人送出會排隊，因此等待時間會拉長。

## 展場操作建議

建議 SOP：

```text
每批 3-5 人同時送出最穩。
6 人同時送出可承受，但已接近 150 秒上限。
7 人以上不建議同時送出。
若人潮較多，工作人員分批引導送出。
若同時送出人數過多，告知使用者報告會陸續寄出。
```

建議現場說法：

```text
報告會寄到您的信箱。一般約 1-2 分鐘內收到；尖峰時可能需要 2-3 分鐘，請稍候並確認垃圾郵件匣。
```

## 上線前檢查清單

- 正式 Flow 不再修改 AI API HTTP Body。
- AI API HTTP Body 維持 `body('剖析_JSON')?['ai_api_feature_row']`。
- Production Flow concurrency control 維持 On，parallelism = 1。
- 展場前最後只跑 `production_single` 與必要的 `production_burst_5` 或 `production_burst_6`。
- 不再對正式 Flow 做連續 loop 壓測。
- 現場工作人員了解每批 3-5 人最穩、6 人為測得上限、7 人以上不建議的送出策略。
- 確認測試信件與正式信件不會進垃圾郵件匣。

## 最終建議

正式流程目前功能面通過，可用於展場。新版 model 後的測試顯示 6 人同時送出仍可在 150 秒內完成，但只剩 2 秒緩衝；7 人同時送出會超過 150 秒。展場應以 3-5 人分批送出為主要操作方式，6 人為可承受但接近上限的尖峰情境，避免 7 人以上同時送出。

