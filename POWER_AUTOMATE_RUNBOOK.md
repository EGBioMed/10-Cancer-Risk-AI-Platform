# Power Automate Runbook

## vNext symptom questionnaire transition

Questionnaire version `questionnaire/2026-08-05-symptom-vnext` adds structured
collection for the 32 literature-derived candidate fields while keeping the
deployed model request backward compatible.

### Parse JSON

Update both the HTTP trigger schema and Parse JSON schema from:

`contracts/power-automate/transitional-submission.schema.json`

The new payload members are:

- `vnext_feature_schema_version`
- `vnext_mapping_version`
- `vnext_feature_columns`
- `vnext_feature_row`
- `vnext_feature_metadata`

### Research Excel

Continue passing the complete research row to the Office Script:

```text
string(body('Parse_JSON')?['excel_row'])
```

The table must contain columns for the new symptom and vNext fields before event
testing. The existing header-driven Office Script will place values by matching
the JSON key to the Excel header. Missing or `null` values should be written as a
blank cell, not zero.

### Current model HTTP

Keep the current HTTP body as:

```text
body('Parse_JSON')?['ai_api_feature_row']
```

Do not use `excel_row`, `symptom_feature_row`, or `vnext_feature_row` as the current
model request. They include fields that the deployed model schema does not accept.
Switch to the vNext vector only after the model owner provides a versioned endpoint
and a frozen ordered feature manifest. See `MODEL_VNEXT_HANDOFF.md`.

## Unified Transitional Submission Schema

During the migration period, the HTTP trigger and Parse JSON action must use the
same schema:

```text
contracts/power-automate/transitional-submission.schema.json
```

The schema intentionally keeps feature row objects unexpanded. Power Automate
passes those objects to Office Script or the model API as a whole, so expanding all
model and symptom properties would add unnecessary dynamic fields and make the
designer harder to maintain.

Apply it in both locations:

1. Open `When an HTTP request is received`.
2. Replace `Request Body JSON Schema` with the complete schema file contents.
3. Open `Parse JSON`.
4. Set `Content` to the Expression:

```text
triggerBody()
```

5. Replace its `Schema` with the exact same schema file contents.
6. Save the Flow.
7. Submit one Chinese and one English test response.

The version fields are present but temporarily optional because the current web
payload does not send them yet. They will become required after the platform payload
is updated and a compatibility test passes.

Do not use `Generate from sample` after installing this schema. A single sample may
infer optional or empty fields incorrectly and cause the trigger and Parse JSON
definitions to drift again.

## QA Flow

QA receiver-only Flow:

```text
HTTP Trigger
→ Compose - Raw Body
→ Response { ok: true }
```

Use this Flow for k6 receiver/load tests.

Render environment variable during QA load tests:

```text
POWER_AUTOMATE_WEBHOOK_URL = QA Flow HTTP POST URL
```

## Production Flow Data Routing

Production Flow should parse the incoming submission and route rows by purpose:

| Destination | Payload field |
|---|---|
| AI API HTTP action | `body('Parse_JSON')?['ai_api_feature_row']` |
| Research Excel / Office Script | `string(body('Parse_JSON')?['excel_row'])` |
| Restricted contact Excel / Office Script | `string(body('Parse_JSON')?['contact_row'])` |
| Email/report content | Report result plus `email` and human-readable rows as needed |

Do not send `optimized_feature_row` directly to the AI API unless the AI API schema accepts all platform encodings.

## Two-Workbook Privacy Routing

Use two separate Excel workbooks so health research data and contact information can have different access permissions.

### Research workbook

- Receives `excel_row`.
- Contains coded `record_id`, questionnaire/model fields, symptoms, timestamps, and language.
- Must not contain an email column or other direct contact information.
- Can be shared with authorized research and model-validation staff.

### Contact workbook

- Receives `contact_row`.
- Table name: `ContactRecords`.
- Columns, in this order:

```text
record_id
email
submitted_at
language
report_language
```

- Access should be limited to staff responsible for report delivery and privacy requests.
- Do not use this workbook for model training or research analysis.

Add a second **Run script** action after the research Excel action. Select the restricted contact workbook and the `AppendContactRecord` script. Set `ScriptParameters/contactRowJson` to:

```text
string(body('剖析_JSON')?['contact_row'])
```

Add this property to both the HTTP trigger schema and Parse JSON schema:

```json
"contact_row": {
  "type": "object",
  "properties": {
    "record_id": { "type": "string" },
    "email": { "type": "string" },
    "submitted_at": { "type": "string" },
    "language": { "type": "string" },
    "report_language": { "type": "string" }
  },
  "required": [
    "record_id",
    "email",
    "submitted_at",
    "language",
    "report_language"
  ]
}
```

Also add `"contact_row"` to the top-level `required` array.

### AI API HTTP 422: Missing Body

If the AI API HTTP action returns:

```json
{
  "statusCode": 422,
  "body": {
    "detail": [
      {
        "type": "missing",
        "loc": ["body"],
        "msg": "Field required",
        "input": null
      }
    ]
  }
}
```

Interpretation:

- The AI API received an empty/null request body.
- This is different from a field validation error such as `quit_smoking = -1`.
- Check the Power Automate AI API HTTP action first, especially the Body field.

Expected AI API HTTP action settings:

```text
Method: POST
URI: https://cancer-risk-api.onrender.com/predict
Headers:
  Content-Type: application/json
  X-API-Key: <AI API key>
Body:
  body('Parse_JSON')?['ai_api_feature_row']
```

For the Chinese action name used in the current production Flow, the Body expression may need to be:

```text
body('剖析_JSON')?['ai_api_feature_row']
```

Do not put the expression inside a JSON string, and do not send a wrapper object such as `{ "model": ... }` unless the AI API contract explicitly changes to require that wrapper.

## Excel 409 Conflict

Observed error:

```text
Conflict
Your file was not saved because we could not merge your changes with changes from someone else.
```

Interpretation:

Multiple Flow runs attempted to write the same Excel workbook at the same time. Excel Online / Office Script could not merge concurrent writes.

Safe production options:

1. Serialize Excel writes in the Flow.
   - In the trigger settings, enable concurrency control and set degree of parallelism to `1` for the production Flow, or otherwise ensure only one run writes to Excel at a time.
   - This protects Excel but reduces throughput.

2. Split receiver and writer.
   - Receiver Flow responds quickly and stores the payload in a queue/list/table.
   - A separate writer Flow processes queued rows one at a time.
   - This is safer for larger events.

3. Disable Excel writes during load tests.
   - Add a QA/load-test condition such as `qa_metadata.test_mode == true`.
   - If true, skip Office Script and email actions.

Do not run high-concurrency production load tests while Office Script writes directly to one shared Excel workbook.

## Current Short-Term Decision

Use trigger concurrency control on the production Flow:

```text
Concurrency control: On
Degree of parallelism: 1
```

Reason:

- Protect the shared Excel workbook from concurrent Office Script writes.
- Avoid 409 merge conflicts during low-volume production use.
- Accept slower throughput and queued Flow runs as a short-term tradeoff.

After enabling this setting, validate routine production behavior with `PROFILE=production_single` or 1-2 manual submissions. Do not run looped 5-minute VU load profiles against the production Flow.

## Production Event Rehearsal

For event-day behavior, test a small number of simultaneous one-time submissions instead of sustained load.

Use these k6 profiles only when the Render environment variable points to the production Flow and the team intentionally wants a controlled production rehearsal:

| Profile | Behavior | Threshold |
|---|---|---|
| `production_single` | 1 user submits 1 record | 30s |
| `production_burst_3` | 3 users each submit 1 record at the same time | 90s |
| `production_burst_4` | 4 users each submit 1 record at the same time | 150s |
| `production_burst_5` | 5 users each submit 1 record at the same time | 180s |
| `production_burst_6` | 6 users each submit 1 record at the same time | 240s |
| `production_burst_7` | 7 users each submit 1 record at the same time | 300s |
| `production_burst_8` | 8 users each submit 1 record at the same time | 360s |
| `production_burst_9` | 9 users each submit 1 record at the same time | 420s |
| `production_burst_10` | 10 users each submit 1 record at the same time | 480s |

Recommended order:

```text
production_single
production_burst_3
production_burst_5
production_burst_10
```

Stop immediately if any profile shows HTTP failures, non-2xx responses, `ok: false`, Excel 409 conflicts, AI API errors, or email send failures.

Because production Flow concurrency is set to `1`, simultaneous submissions may queue. This is expected. The event rehearsal measures the user-facing wait time from submission to completed Flow response and confirms whether reports are sent successfully.

For the updated model, use 150 seconds as the practical event comfort limit. To find the precise simultaneous-user limit, run one profile at a time and inspect the latest matching Power Automate runs:

```text
production_burst_6
production_burst_7
production_burst_8
production_burst_9
production_burst_10
```

Stop when the last completed report exceeds 150 seconds, or earlier if any run fails. The maximum safe event batch is the highest profile whose latest run history shows all AI API, Excel, and email actions succeeded and the last report completed within 150 seconds.

## Current QA Capacity Finding

For Render `/api/submit` routed to QA Flow:

```text
5 VU: passed
10 VU: passed
15 VU: passed
20 VU: failed
```

Current provisional QA receiver safe ceiling:

```text
15 VU / 5-minute profile
p95 < 10s
error rate = 0%
```
