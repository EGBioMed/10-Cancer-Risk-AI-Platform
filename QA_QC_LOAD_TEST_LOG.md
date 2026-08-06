# QA/QC k6 Load Test Log

## 2026-07-10 - Round 1 Minimal Smoke Test

- Target: Power Automate HTTP trigger
- k6 script: `test-powerautomate.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 794.78ms
- k6 average response time: 418.44ms
- k6 total HTTP requests: 43
- Power Automate CSV: `flow-3194a2e2-e456-46f1-b919-4fd2392abff4-20260710t041946z.csv`
- Power Automate records in CSV: 44
- Power Automate execution status: 44 Succeeded, 0 failed
- Trigger status: 44 Succeeded, 0 failed
- Compose raw body status: 44 Succeeded, 0 failed
- Response status: 44 Succeeded, 0 failed
- Conclusion: Round 1 passed. Proceed to Round 2 with 5 virtual users.

## 2026-07-10 - Round 2 Five VU Test

- Target: Power Automate HTTP trigger
- k6 script: `test-powerautomate.js`
- Profile: `five`
- Virtual users: 5 max
- Duration: 30s ramp to 5 VUs, 1m steady at 5 VUs, 30s ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 569.01ms
- k6 average response time: 383.54ms
- k6 max response time: 728.41ms
- k6 total HTTP requests: 336
- Power Automate CSV: `flow-3194a2e2-e456-46f1-b919-4fd2392abff4-20260710t071319z.csv`
- Power Automate records in CSV: 100
- Power Automate CSV time range: 2026-07-10 07:08:41 to 2026-07-10 07:09:19
- Power Automate execution status: 100 Succeeded, 0 failed
- Trigger status: 100 Succeeded, 0 failed
- Compose raw body status: 100 Succeeded, 0 failed
- Response status: 100 Succeeded, 0 failed
- Note: The export appears to contain the latest 100 Flow runs rather than every k6 request from Round 2. All exported high-load runs succeeded.
- Conclusion: Round 2 passed. Proceed to Round 3 with 20 virtual users.

## 2026-07-10 - Round 3 Twenty VU Test

- Target: Power Automate HTTP trigger
- k6 script: `test-powerautomate.js`
- Profile: `twenty`
- Virtual users: 20 max
- Duration: 1m ramp to 20 VUs, 2m steady at 20 VUs, 1m ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 566.30ms
- k6 average response time: 377.61ms
- k6 max response time: 1.27s
- k6 total HTTP requests: 2636
- Power Automate CSV: `flow-3194a2e2-e456-46f1-b919-4fd2392abff4-20260710t072305z.csv`
- Power Automate records in CSV: 100
- Power Automate CSV time range: 2026-07-10 07:19:59 to 2026-07-10 07:20:26
- Power Automate execution status: 100 Succeeded, 0 failed
- Trigger status: 100 Succeeded, 0 failed
- Compose raw body status: 100 Succeeded, 0 failed
- Response status: 100 Succeeded, 0 failed
- Error messages: 0
- Note: The export appears to contain the latest 100 Flow runs rather than every k6 request from Round 3. All exported high-load runs succeeded.
- Conclusion: Round 3 passed. Minimum receiver load test sequence passed through 20 virtual users.

## 2026-07-10 - Platform API Submit Smoke Test

- Layer: HTML platform backend entrypoint
- Target: Local `/api/submit`, forwarding through `server.js` to Power Automate
- k6 script: `test-platform-submit.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 675.87ms
- k6 average response time: 461.64ms
- k6 max response time: 1.20s
- k6 total HTTP requests: 42
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Conclusion: Local platform `/api/submit` smoke test passed. Next recommended test is `/api/submit` small load with 5 VUs, then Render `/api/submit` smoke test.

## 2026-07-10 - Render Platform API Submit Smoke Test

- Layer: Render production URL backend entrypoint
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 1.01s
- k6 average response time: 748.43ms
- k6 max response time: 1.64s
- k6 total HTTP requests: 35
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Note: User reported this was run while `POWER_AUTOMATE_WEBHOOK_URL` pointed to the production Power Automate URL.
- Conclusion: Render `/api/submit` smoke test passed on k6 side. Power Automate production Flow Run history still needs verification before any higher-load test.

## 2026-07-10 - Production Flow Run History Verification

- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-20260710t075944z.csv`
- Flow type: Production Flow with HTTP, Parse JSON, Office Script, and Outlook email actions
- Records in CSV: 40
- CSV time range: 2026-07-08 10:08:38 to 2026-07-10 07:52:44
- Overall execution status: 3 Succeeded, 35 Failed, 2 Cancelled
- Trigger status: 40 Succeeded
- HTTP action status: 3 Succeeded, 13 Failed, 22 Skipped, 2 blank
- Parse JSON status: 39 Succeeded, 1 Failed
- Office Script status: 16 Succeeded, 21 Failed, 2 Running, 1 Skipped
- Send email action 1 status: 1 Succeeded, 33 Skipped, 6 blank
- Send email action 2 status: 2 Succeeded, 36 Skipped, 2 blank
- Main HTTP failure: AI API returned 422 because `quit_smoking` was `-1`, but the API requires `quit_smoking >= 0`.
- Main Office Script failure: 409 Conflict, "Your file was not saved because we could not merge your changes with changes from someone else."
- Parse JSON failure: required property `excel_row` missing in one older/other payload.
- Conclusion: Production Flow is not ready for higher-load testing. Stop production-flow load tests until payload validation and Excel write contention are fixed or bypassed in QA mode.

## 2026-07-10 - Render Platform API Submit Smoke Test After Switching Back to QA

- Layer: Render production URL backend entrypoint
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Failed
- k6 checks: 33.33%
- k6 HTTP failure rate: 100.00%
- k6 p95 response time: 290.08ms
- k6 average response time: 239.29ms
- k6 max response time: 715ms
- k6 total HTTP requests: 49
- Failed checks: status is 2xx, response JSON says `ok: true`
- Conclusion: Render returned fast non-2xx responses after switching back to QA. Verify Render environment variable value, deployment completion, and QA Flow response/status.

## 2026-07-10 - Render Platform API Submit Smoke Test After Redeploy

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 1.13s
- k6 average response time: 855.95ms
- k6 max response time: 1.89s
- k6 total HTTP requests: 33
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Conclusion: Render deployment picked up the QA Flow URL successfully. Proceed to Render `/api/submit` small load test with 5 VUs against QA Flow.

## 2026-07-10 - Render Platform API Submit Small Load Test

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `demo`
- Virtual users: 5 max
- Duration: 1m ramp to 5 VUs, 3m steady at 5 VUs, 1m ramp down
- k6 result: Failed
- k6 checks: 33.33%
- k6 HTTP failure rate: 100.00%
- k6 p95 response time: 0s
- k6 total HTTP requests: 1228
- Network data received: 0 B
- Network data sent: 0 B
- Failed checks: status is 2xx, response JSON says `ok: true`
- Conclusion: Failure appears to happen before HTTP traffic is sent, not inside Render or Power Automate. Capture k6 warning/error lines or rerun with HTTP debug to identify the connection/DNS/TARGET_URL issue.

## 2026-07-10 - Render Platform API Submit Smoke Retest

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Failed by strict check threshold
- k6 checks: 98.71%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 1.41s
- k6 average response time: 1.31s
- k6 max response time: 12.86s
- k6 total HTTP requests: 26
- Status check: 26/26 were 2xx
- Response body check: 26/26 returned `ok: true`
- Failed check: 1/26 requests exceeded the per-request 10s response-time check
- Conclusion: Connectivity and correctness passed, but one latency outlier exceeded 10s. Retest once before proceeding to 5 VUs; if repeated, inspect Render cold start or Power Automate transient latency.

## 2026-07-10 - Render Platform API Submit Smoke Retest 2

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `smoke`
- Virtual users: 1
- Duration: 30s ramp to 1 VU, 30s ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 1.23s
- k6 average response time: 834.55ms
- k6 max response time: 1.48s
- k6 total HTTP requests: 33
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Conclusion: Render `/api/submit` to QA Flow smoke test passed cleanly. Proceed to 5 VU small load test.

## 2026-07-10 - Render Platform API Submit Small Load Test 2

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `demo`
- Virtual users: 5 max
- Duration: 1m ramp to 5 VUs, 3m steady at 5 VUs, 1m ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 2.14s
- k6 average response time: 1.53s
- k6 max response time: 4.12s
- k6 total HTTP requests: 487
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Power Automate CSV: `flow-648d5d20-3049-4cba-8d4d-49aabbf03890-20260710t085721z.csv`
- Power Automate records in CSV: 100
- Power Automate CSV time range: 2026-07-10 08:53:55 to 2026-07-10 08:55:04
- Power Automate execution status: 100 Succeeded, 0 failed
- Trigger status: 100 Succeeded, 0 failed
- Compose raw body status: 100 Succeeded, 0 failed
- Response status: 100 Succeeded, 0 failed
- Error messages: 0
- Note: The export appears to contain the latest 100 Flow runs rather than every k6 request from the 487-request test. All exported high-load QA runs succeeded.
- Conclusion: Render `/api/submit` to QA Flow 5 VU small load test passed on both k6 and Power Automate sides.

## 2026-07-10 - Render Platform API Submit 20 VU Event Test

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `event`
- Virtual users: 20 max
- Planned duration: 2m ramp to 20 VUs, 5m steady at 20 VUs, 2m ramp down
- Actual result: Manually interrupted after repeated request timeouts
- k6 result: Failed
- k6 checks: 89.56%
- k6 HTTP failure rate: 5.80%
- k6 p95 response time: 29.99s
- k6 average response time: 13.15s
- k6 max response time: 2m53s
- k6 total HTTP requests: 655
- Status check: 617/655 were 2xx, 38 failed
- Response body check: 617/655 returned `ok: true`, 38 failed
- Response time check: 526/655 completed under 10s, 129 exceeded 10s
- Observed warnings: repeated `request timeout` errors around 350s onward
- Network data received: 204 kB
- Network data sent: 4.3 MB
- Conclusion: 20 VU Render `/api/submit` to QA Flow exceeded the safe threshold. Do not increase load. Next recommended step is to find the stable ceiling with 10 VU or 15 VU tests and inspect Render/Power Automate logs for timeout source.

## 2026-07-10 - Render Platform API Submit 10 VU Ceiling Test

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `ten`
- Virtual users: 10 max
- Duration: 1m ramp to 10 VUs, 3m steady at 10 VUs, 1m ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 5.17s
- k6 average response time: 3.68s
- k6 max response time: 5.86s
- k6 total HTTP requests: 520
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Network data received: 141 kB
- Network data sent: 3.3 MB
- Power Automate CSV: `flow-648d5d20-3049-4cba-8d4d-49aabbf03890-20260710t092229z.csv`
- Power Automate records in CSV: 100
- Power Automate CSV time range: 2026-07-10 09:17:33 to 2026-07-10 09:18:32
- Power Automate execution status: 100 Succeeded, 0 failed
- Trigger status: 100 Succeeded, 0 failed
- Compose raw body status: 100 Succeeded, 0 failed
- Response status: 100 Succeeded, 0 failed
- Error messages: 0
- Note: The export appears to contain the latest 100 Flow runs rather than every k6 request from the 520-request test. All exported high-load QA runs succeeded.
- Conclusion: 10 VU Render `/api/submit` to QA Flow passed on both k6 and Power Automate sides. Next step: optionally test 15 VU to narrow the ceiling between 10 and 20 VUs.

## 2026-07-10 - Render Platform API Submit 15 VU Ceiling Test

- Layer: Render production URL backend entrypoint routed to QA Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `fifteen`
- Virtual users: 15 max
- Duration: 1m ramp to 15 VUs, 3m steady at 15 VUs, 1m ramp down
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 p95 response time: 7.25s
- k6 average response time: 5.66s
- k6 max response time: 7.43s
- k6 total HTTP requests: 549
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Network data received: 169 kB
- Network data sent: 3.5 MB
- Power Automate CSV: `flow-648d5d20-3049-4cba-8d4d-49aabbf03890-20260710t093157z.csv`
- Power Automate records in CSV: 100
- Power Automate CSV time range: 2026-07-10 09:27:54 to 2026-07-10 09:28:52
- Power Automate execution status: 100 Succeeded, 0 failed
- Trigger status: 100 Succeeded, 0 failed
- Compose raw body status: 100 Succeeded, 0 failed
- Response status: 100 Succeeded, 0 failed
- Error messages: 0
- Note: The export appears to contain the latest 100 Flow runs rather than every k6 request from the 549-request test. All exported high-load QA runs succeeded.
- Conclusion: 15 VU Render `/api/submit` to QA Flow passed on both k6 and Power Automate sides. Since 20 VU failed previously, current QA receiver safe ceiling is 15 VU for the tested 5-minute profile.

## 2026-07-10 - Production Flow Single Submission Test

- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `single`
- Test email: `abbiehung@eg-bio.com`
- Virtual users: 1
- Iterations: 1
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: 1.72s
- k6 total HTTP requests: 1
- Checks: status is 2xx, response time < 10s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260710t095216z.csv`
- Latest production Flow run start: 2026-07-10 09:49:11
- Latest production Flow run end: 2026-07-10 09:50:22
- Latest production Flow run ID: `08584179299341838109772366941CU26`
- Overall production Flow status: Succeeded
- Trigger status: Succeeded
- AI API HTTP status: Succeeded, output HTTP 200
- Parse JSON status: Succeeded
- Office Script status: Succeeded, output HTTP 200
- Email action 1 status: Skipped
- Email action 2 status: Succeeded, output HTTP 200
- AI API returned risk result: `risk_score_pct` 51.8 and `risk_level` high risk in the sampled output
- Conclusion: Production Flow single submission passed. The previous AI API 422 from `quit_smoking = -1` was resolved by routing the Flow to `ai_api_feature_row`.

## 2026-07-10 - Production Flow Single Submission Test After Concurrency Setting

- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `single`
- Virtual users: 1
- Iterations: 1
- k6 result: Failed by latency threshold
- k6 checks: 66.66%
- k6 HTTP failure rate: 0.00%
- k6 response time: 15.07s
- k6 total HTTP requests: 1
- Checks passed: status is 2xx, response JSON says `ok: true`
- Failed check: response time < 10s
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260710t102006z.csv`
- Latest production Flow run start: 2026-07-10 10:13:34
- Latest production Flow run end: 2026-07-10 10:14:54
- Latest production Flow run ID: `08584179284712980443335135643CU25`
- Overall production Flow status: Succeeded
- Trigger status: Succeeded
- Parsed trigger payload email: `abbiehung@eg-bio.com`
- Parsed trigger payload `quit_smoking`: 0
- AI API HTTP status: Succeeded, output HTTP 200
- AI API input `quit_smoking`: 0
- AI API returned risk result: `risk_score_pct` 51.8 and `risk_level` high risk in the sampled output
- Parse JSON status: Succeeded
- Office Script status: Succeeded, output HTTP 200, returned `ok: true`
- Email action 1 status: Skipped
- Email action 2 status: Succeeded, output HTTP 200
- Conclusion: Production Flow functional path passed after setting concurrency to 1. The only failed gate was the k6 10s response-time check; the full production E2E path completed successfully but took 15.07s from the Render caller's perspective. Keep the 10s threshold for receiver/load tests, and use a 30s threshold for production full-flow single E2E unless the architecture is changed to return before AI, Excel, and email complete.

## 2026-07-10 - Production Flow Single Submission Test With 30s E2E Threshold

- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_single`
- Virtual users: 1
- Iterations: 1
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: 2.06s
- k6 total HTTP requests: 1
- Checks passed: status is 2xx, response time < 30s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260710t102607z.csv`
- Latest production Flow run start: 2026-07-10 10:25:15
- Latest production Flow run end: 2026-07-10 10:25:30
- Latest production Flow run ID: `08584179277695459292528584209CU29`
- Overall production Flow status: Succeeded
- Trigger status: Succeeded
- Parsed trigger payload email: `abbiehung@eg-bio.com`
- Parsed trigger payload `quit_smoking`: 0
- AI API HTTP status: Succeeded, output HTTP 200
- AI API input `quit_smoking`: 0
- AI API returned risk result: `risk_score_pct` 51.8 and `risk_level` high risk in the sampled output
- Parse JSON status: Succeeded
- Office Script status: Succeeded, output HTTP 200, returned `ok: true`
- Email action 1 status: Skipped
- Email action 2 status: Succeeded, output HTTP 200
- Conclusion: Production full-flow single E2E test passed under the production-specific 30s threshold, and Power Automate Run history confirms that AI API, Excel Office Script, and email all succeeded. This validates that the updated `production_single` profile avoids false failures for slower but successful production runs.

## 2026-07-10 - Production Event Rehearsal 3 Simultaneous Submissions

- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_burst_3`
- Virtual users: 3
- Iterations: 3 total, 1 per VU
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: avg 1.48s, p95 1.52s, max 1.52s
- k6 total HTTP requests: 3
- Checks passed: status is 2xx, response time < 90s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260710t103435z.csv`
- Latest 3 production Flow runs started: 2026-07-10 10:33:29
- Flow run 1 ID: `08584179272758724725009846295CU23`, duration 13s, overall Succeeded
- Flow run 2 ID: `08584179272758612042645823448CU04`, duration 26s, overall Succeeded
- Flow run 3 ID: `08584179272758464228231459149CU16`, duration 40s, overall Succeeded
- All 3 trigger statuses: Succeeded
- All 3 parsed trigger payload emails: `abbiehung@eg-bio.com`
- All 3 parsed trigger payload `quit_smoking` values: 0
- All 3 AI API HTTP actions: Succeeded, output HTTP 200
- All 3 AI API returned risk result: `risk_score_pct` 51.8 and `risk_level` high risk in the sampled output
- All 3 Parse JSON actions: Succeeded
- All 3 Office Script actions: Succeeded, output HTTP 200, returned `ok: true`
- All 3 email action 1 statuses: Skipped
- All 3 email action 2 statuses: Succeeded, output HTTP 200
- Conclusion: Render accepted 3 simultaneous production submissions successfully and returned quickly. Power Automate Run history confirms all 3 completed through AI API, Excel Office Script, and email. With production Flow concurrency set to 1, the 3 simultaneous submissions queued and completed in about 13s, 26s, and 40s, which is the current measured report delivery window for a 3-person burst.

## 2026-07-10 - Production Event Rehearsal 5 Simultaneous Submissions

- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_burst_5`
- Virtual users: 5
- Iterations: 5 total, 1 per VU
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: avg 1.38s, p95 1.39s, max 1.39s
- k6 total HTTP requests: 5
- Checks passed: status is 2xx, response time < 180s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260710t103812z.csv`
- Latest 5 production Flow runs started: 2026-07-10 10:36:26
- Flow run 1 ID: `08584179270988165119975439222CU07`, duration 16s, overall Succeeded
- Flow run 2 ID: `08584179270988024645336421284CU29`, duration 29s, overall Succeeded
- Flow run 3 ID: `08584179270988003980553354246CU24`, duration 62s, overall Succeeded
- Flow run 4 ID: `08584179270987895635064133518CU23`, duration 76s, overall Succeeded
- Flow run 5 ID: `08584179270987759455579368741CU09`, duration 90s, overall Succeeded
- All 5 trigger statuses: Succeeded
- All 5 parsed trigger payload emails: `abbiehung@eg-bio.com`
- All 5 parsed trigger payload `quit_smoking` values: 0
- All 5 AI API HTTP actions: Succeeded, output HTTP 200
- All 5 AI API returned risk result: `risk_score_pct` 51.8 and `risk_level` high risk in the sampled output
- All 5 Parse JSON actions: Succeeded
- All 5 Office Script actions: Succeeded, output HTTP 200, returned `ok: true`
- All 5 email action 1 statuses: Skipped
- All 5 email action 2 statuses: Succeeded, output HTTP 200
- Conclusion: Render accepted 5 simultaneous production submissions successfully and returned quickly. Power Automate Run history confirms all 5 completed through AI API, Excel Office Script, and email. With production Flow concurrency set to 1, the 5 simultaneous submissions queued and completed in about 16s, 29s, 62s, 76s, and 90s. The measured 5-person report delivery window is therefore up to about 90s in this run.

## 2026-07-10 - Production Event Rehearsal 10 Simultaneous Submissions

- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_burst_10`
- Virtual users: 10
- Iterations: 10 total, 1 per VU
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: avg 1.53s, p95 1.77s, max 1.79s
- k6 total HTTP requests: 10
- Checks passed: status is 2xx, response time < 360s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260710t104554z.csv`
- Latest 10 production Flow runs started: 2026-07-10 10:41:32
- Flow run durations: 14s, 28s, 41s, 55s, 69s, 83s, 125s, 141s, 155s, 169s
- Last completed run duration: 169s, about 2m49s
- All 10 trigger statuses: Succeeded
- All 10 parsed trigger payload emails: `abbiehung@eg-bio.com`
- All 10 parsed trigger payload `quit_smoking` values: 0
- All 10 AI API HTTP actions: Succeeded, output HTTP 200
- All 10 AI API returned risk result: `risk_score_pct` 51.8 and `risk_level` high risk in the sampled output
- All 10 Parse JSON actions: Succeeded
- All 10 Office Script actions: Succeeded, output HTTP 200, returned `ok: true`
- All 10 email action 1 statuses: Skipped
- All 10 email action 2 statuses: Succeeded, output HTTP 200
- Conclusion: Render accepted 10 simultaneous production submissions successfully and returned quickly. Power Automate Run history confirms all 10 completed through AI API, Excel Office Script, and email with no observed failures. However, the measured 10-person report delivery window was up to 169s, which exceeds the preferred 1-2 minute event waiting target. Operationally, 10 simultaneous submissions are survivable but should be treated as a congestion scenario; the recommended event operating batch remains 5 simultaneous submissions or fewer.

## 2026-07-13 - Production Flow Single Retest After AI API HTTP Body Fix

- Context: Production Flow AI API HTTP action was modified and returned HTTP 422 `UnprocessableEntity` with `loc: ["body"]`, indicating the AI API received a null request body.
- Recommended fix: Restore the AI API HTTP action Body to `body('剖析_JSON')?['ai_api_feature_row']`.
- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_single`
- Virtual users: 1
- Iterations: 1
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: 1.46s
- k6 total HTTP requests: 1
- Checks passed: status is 2xx, response time < 30s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260713t022253z.csv`
- Latest production Flow run start: 2026-07-13 02:22:07
- Latest production Flow run end: 2026-07-13 02:22:28
- Latest production Flow run duration: 21s
- Latest production Flow run ID: `08584176975580156638665803680CU16`
- Overall production Flow status: Succeeded
- Trigger status: Succeeded
- Parsed trigger payload email: `abbiehung@eg-bio.com`
- Parsed trigger payload `quit_smoking`: 0
- AI API HTTP input body: present, not null
- AI API HTTP status: Succeeded, output HTTP 200
- AI API input `quit_smoking`: 0
- AI API returned risk result: `risk_score_pct` 69.8 and `risk_level` high risk in the sampled output
- Parse JSON status: Succeeded
- Office Script status: Succeeded, output HTTP 200, returned `ok: true`
- Email action 1 status: Skipped
- Email action 2 status: Succeeded, output HTTP 200
- Conclusion: The `UnprocessableEntity` / missing request body issue is fixed. Power Automate Run history confirms the AI API HTTP action now sends a non-null JSON body and receives HTTP 200, and the downstream Excel and email actions succeed.

## 2026-07-13 - Production Event Rehearsal 5 Simultaneous Submissions After Model Update

- Context: R&D updated/tuned the AI model. A single production E2E retest passed after restoring the Power Automate AI API HTTP body.
- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_burst_5`
- Virtual users: 5
- Iterations: 5 total, 1 per VU
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: avg 14.21s, p95 14.21s, max 14.21s
- k6 total HTTP requests: 5
- Checks passed: status is 2xx, response time < 180s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260713t035007z.csv`
- Latest 5 production Flow runs started: 2026-07-13 03:45:59
- Flow run durations: 73s, 90s, 107s, 123s, 140s
- Last completed run duration: 140s, about 2m20s
- All 5 trigger statuses: Succeeded
- All 5 parsed trigger payload emails: `abbiehung@eg-bio.com`
- All 5 parsed trigger payload `quit_smoking` values: 0
- All 5 AI API HTTP actions: Succeeded, output HTTP 200
- All 5 AI API returned risk result: `risk_score_pct` 69.8 and `risk_level` high risk in the sampled output
- All 5 Parse JSON actions: Succeeded
- All 5 Office Script actions: Succeeded, output HTTP 200, returned `ok: true`
- All 5 email action 1 statuses: Skipped
- All 5 email action 2 statuses: Succeeded, output HTTP 200
- Conclusion: Render accepted 5 simultaneous production submissions successfully after the model update, and Power Automate Run history confirms all 5 completed through AI API, Excel Office Script, and email. The measured report delivery window was 73s to 140s. This is functionally passing, but the last completion is slightly above the preferred 1-2 minute event waiting target, so 5 simultaneous submissions should be treated as the practical upper operating batch for the updated model.

## 2026-07-13 - Production Event Rehearsal 6 Simultaneous Submissions After Model Update

- Context: R&D updated/tuned the AI model. This test is part of finding the simultaneous-user limit for a 150s event comfort target.
- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_burst_6`
- Virtual users: 6
- Iterations: 6 total, 1 per VU
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: avg 13.55s, p95 13.56s, max 13.56s
- k6 total HTTP requests: 6
- Checks passed: status is 2xx, response time < 240s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-status eq 'succeeded'-20260713t041106z.csv`
- Latest 6 production Flow runs started: 2026-07-13 04:08:04
- Flow run durations: 69s, 85s, 102s, 118s, 133s, 148s
- Last completed run duration: 148s, about 2m28s
- All 6 trigger statuses: Succeeded
- All 6 parsed trigger payload emails: `abbiehung@eg-bio.com`
- All 6 parsed trigger payload `quit_smoking` values: 0
- All 6 AI API HTTP actions: Succeeded, output HTTP 200
- All 6 AI API returned risk result: `risk_score_pct` 69.8 and `risk_level` high risk in the sampled output
- All 6 Parse JSON actions: Succeeded
- All 6 Office Script actions: Succeeded, output HTTP 200, returned `ok: true`
- All 6 email action 1 statuses: Skipped
- All 6 email action 2 statuses: Succeeded, output HTTP 200
- Conclusion: Render accepted 6 simultaneous production submissions successfully after the model update, and Power Automate Run history confirms all 6 completed through AI API, Excel Office Script, and email. The measured report delivery window was 69s to 148s, which stays within the 150s event comfort target but leaves only a 2s margin. This makes 6 simultaneous submissions the current provisional upper bound until 7-user testing is evaluated.

## 2026-07-13 - Production Event Rehearsal 7 Simultaneous Submissions After Model Update

- Context: R&D updated/tuned the AI model. This test is part of finding the simultaneous-user limit for a 150s event comfort target.
- Layer: Render production URL backend entrypoint routed to production Flow
- Target: `https://one0-cancer-risk-ai-platform.onrender.com/api/submit`
- k6 script: `test-platform-submit.js`
- Profile: `production_burst_7`
- Virtual users: 7
- Iterations: 7 total, 1 per VU
- k6 result: Passed
- k6 checks: 100.00%
- k6 HTTP failure rate: 0.00%
- k6 response time: avg 13.43s, p95 13.45s, max 13.45s
- k6 total HTTP requests: 7
- Checks passed: status is 2xx, response time < 300s, response JSON says `ok: true`
- Power Automate CSV: `flow-b5e2cb58-91b6-4a37-a428-0258ec19d15c-20260713t043030z.csv`
- Latest 7 production Flow runs started: 2026-07-13 04:27:27
- Flow run durations: 68s, 82s, 97s, 114s, 129s, 147s, 165s
- Last completed run duration: 165s, about 2m45s
- All 7 trigger statuses: Succeeded
- All 7 parsed trigger payload emails: `abbiehung@eg-bio.com`
- All 7 parsed trigger payload `quit_smoking` values: 0
- All 7 AI API HTTP actions: Succeeded, output HTTP 200
- All 7 AI API returned risk result: `risk_score_pct` 69.8 and `risk_level` high risk in the sampled output
- All 7 Parse JSON actions: Succeeded
- All 7 Office Script actions: Succeeded, output HTTP 200, returned `ok: true`
- All 7 email action 1 statuses: Skipped
- All 7 email action 2 statuses: Succeeded, output HTTP 200
- Conclusion: Render accepted 7 simultaneous production submissions successfully after the model update, and Power Automate Run history confirms all 7 completed through AI API, Excel Office Script, and email. The measured report delivery window was 68s to 165s, which exceeds the 150s event comfort target. This establishes 6 simultaneous submissions as the measured upper limit for the 150s target, while 7 simultaneous submissions are functional but outside the preferred event waiting window.

## 2026-07-13 - Manual Submission AI API HTTP 422 Missing Body Recurrence

- Context: A new manual submission returned AI API HTTP 422.
- Error: `UnprocessableEntity`
- AI API output HTTP status: 422
- Error detail: `loc: ["body"]`, `msg: "Field required"`, `input: null`
- Interpretation: The AI API received a null request body. This is not a model scoring failure and not a field-level schema validation failure.
- Likely source: The production Flow AI API HTTP action Body field is empty, points to a missing expression, or the manual submission route is using a different HTTP action/branch than the recently validated k6 route.
- Required check: Inspect the failed Power Automate run's AI API HTTP action Inputs and confirm whether the `body` field is present and contains the feature row.
- Recommended body expression for the AI API HTTP action: `body('剖析_JSON')?['ai_api_feature_row']`
- More robust alternative if the Parse JSON action output is unreliable: `triggerBody()?['ai_api_feature_row']`
- Conclusion: Treat the production Flow as not fully stable for manual submissions until the failed manual run confirms that the AI API HTTP action receives a non-null JSON body and returns HTTP 200.

## 2026-07-13 - Manual Submission Retest Still Missing AI API HTTP Body

- Context: The AI API HTTP action Body was reportedly changed to `triggerBody()?['ai_api_feature_row']`.
- Retest result: AI API HTTP action still returned HTTP 422.
- AI API HTTP Inputs observed in Power Automate: `uri`, `method`, and `headers` only.
- AI API HTTP Inputs missing field: `body`
- AI API output HTTP status: 422
- Error detail: `loc: ["body"]`, `msg: "Field required"`, `input: null`
- Interpretation: The Body expression was not actually saved into the executed AI API HTTP action, was entered in the wrong field, or a different HTTP action/branch is being executed for manual submissions.
- Required next check: Open the executed HTTP action in Power Automate and use Peek code. It must contain a `body` property such as `"body": "@triggerBody()?['ai_api_feature_row']"`. If Peek code has no `body` property, the Body field is still empty.

## 2026-07-13 - AI API HTTP Action Peek Code Confirms Body Expression

- Context: User inspected the AI API HTTP action via Peek code.
- AI API HTTP action code now contains: `"body": "@triggerBody()?['ai_api_feature_row']"`
- Method: POST
- URI: `https://cancer-risk-api.onrender.com/predict`
- Headers: `Content-Type: application/json` plus API key
- Run order: AI API HTTP action currently runs after `執行指令碼` succeeds.
- Interpretation: The current saved/draft action definition includes a Body expression. If a new run still sends no body or sends `null`, the next suspected cause is that `triggerBody()?['ai_api_feature_row']` evaluates to null for the manual submission payload, or the tested run used an older unsaved version.
- Required next check: Save the Flow, run exactly one new manual submission, then inspect the new run's AI API HTTP Inputs. The Inputs must show a `body` object with fields such as `record_id`, `age`, and `quit_smoking`.

## 2026-07-13 - Manual Submission Retest Output Still HTTP 422

- Context: User reran one manual submission after setting the AI API HTTP action Body expression.
- Output observed: AI API returned HTTP 422 `UnprocessableEntity`.
- Error detail: `loc: ["body"]`, `msg: "Field required"`, `input: null`
- Important distinction: The shared evidence is the AI API HTTP action Output. The next required evidence is the AI API HTTP action Input and the Trigger Output for the same run.
- Current likely cause if the action Input contains no `body`: `triggerBody()?['ai_api_feature_row']` evaluated to null or the run executed an older/different action definition.
- Current likely cause if Trigger Output has no `ai_api_feature_row`: the manual form submission payload does not include the AI API row expected by the Flow.
