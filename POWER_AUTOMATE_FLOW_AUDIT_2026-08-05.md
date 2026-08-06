# Power Automate Flow Audit

Audit date: 2026-08-05

Package: `EG_CancerRisk_PoC_2026-08-05_20260805035954.zip`

Flow: `EGAI - 癌症風險評估自動化`

This report intentionally excludes API keys, signed webhook URLs, workbook IDs,
script IDs, connection IDs, and recipient data.

## 1. Current action graph

```text
HTTP request trigger
-> Parse JSON
-> Run research Excel script (excel_row)
-> If contact_row exists
   -> Run restricted contact Excel script (contact_row)
-> HTTP POST to model API
-> If report_language equals en
   -> Send English email
   Else
   -> Send Chinese email
```

Connections embedded in the package:

- Excel Online (Business)
- Office 365 Outlook

## 2. Critical findings

### P0: Model API key is stored as a static literal

The exported Flow definition contains the model API key directly in the HTTP
action. Secure inputs and secure outputs are not enabled for that action.

Required action:

1. Rotate the current model API key.
2. Enable secure inputs and secure outputs on the model HTTP action.
3. Do not commit or redistribute the exported package.
4. Move the secret to an approved secret store when the platform supports it.

### P0: Trigger and Parse JSON contracts do not match

The HTTP trigger requires only the older payload fields:

```text
submitted_at
email
rows
optimized_feature_columns
optimized_feature_row
data_quality
```

Parse JSON requires additional `excel_row`, but fields used later in the Flow are
not consistently required by both schemas:

```text
language
report_language
ai_api_feature_row
symptom_feature_columns
symptom_feature_row
symptom_answers
contact_row
```

This allows a request to pass the trigger contract and fail or silently skip data
later in the Flow.

Required action: use one transitional payload schema for both the trigger and Parse
JSON until the canonical on-premises contract replaces it.

## 3. High-priority findings

### P1: Model request has an unsafe fallback

Current model HTTP body:

```text
coalesce(ai_api_feature_row, excel_row)
```

`excel_row` includes storage, symptom, language, and research fields that are not
part of the strict model API input. Sending it can produce HTTP 422 responses or
silently change behavior if the API later accepts extra fields.

Required action: validate that `ai_api_feature_row` exists, then send only that
object. Missing model input should stop inference with an explicit error.

### P1: Model response is not parsed

Email templates read properties directly from `body('HTTP')`. There is no dedicated
Parse JSON action or versioned response contract between the model service and the
report templates.

This previously caused English report failures when optional English properties
were absent.

Required action: add `Parse_Model_Response` immediately after the model HTTP action
and validate all fields consumed by both report languages.

### P1: No explicit error-handling scope

All actions use the default `Succeeded` run-after behavior. There is no shared
failure scope, error record, operational alert, or retry classification.

Consequences:

- research data may be stored even if inference or email fails
- a contact workbook failure prevents inference
- failures are visible mainly through temporary Flow run history
- there is no durable assessment status

Required action: add stage scopes and a final failure scope with run-after settings
for failure, timeout, and skip outcomes.

### P1: No explicit HTTP Response action

The Flow does not define a stable response contract for the web relay. The caller
cannot reliably distinguish accepted, completed, and failed processing states.

Required action: define a response containing a correlation ID and processing
status. The long-term API should return `202 received` after durable persistence.

## 4. Medium-priority findings

### P2: Contact validation and delivery use different objects

The contact Excel action checks `contact_row`, while both email actions use the
top-level `email`. If `contact_row` is absent, contact persistence is skipped but
email delivery may still proceed.

Required action: validate one canonical contact object and have persistence and
delivery consume the same validated email value.

### P2: No contract or component versions

The Flow does not require or persist:

- contract version
- questionnaire version
- consent version
- feature schema version
- mapping version
- model version
- report template version

Required action: add these fields before database migration so historical records
remain interpretable.

### P2: Infrastructure identifiers are embedded

The model URL, workbook references, Office Script references, and sender connections
are embedded in the non-solution Flow. This makes ownership transfer and environment
migration fragile.

Required action: document every value now. Move them to environment variables and
connection references if Dataverse Solutions become available; otherwise isolate
non-secret configuration in clearly named configuration actions during transition.

### P2: Action names do not communicate their purpose

Current names such as `HTTP`, `條件`, `條件_1`, and `執行指令碼_1` make expressions
and troubleshooting error-prone.

Recommended names:

```text
01_Parse_Submission
02_Write_Research_Record
03_Check_Contact_Record
04_Write_Contact_Record
05_Call_Model_API
06_Parse_Model_Response
07_Check_Report_Language
08_Send_Report_EN
09_Send_Report_ZH
90_Handle_Failure
```

## 5. Verified behavior

- The research workbook receives `excel_row`.
- The restricted contact workbook receives `contact_row` only when it exists.
- The model HTTP action currently runs after the contact condition succeeds.
- `report_language == en` selects the English report; all other values select the
  Chinese report.
- The English report includes a fallback between English and Chinese cancer-risk
  text, but other model response fields remain contract-sensitive.
- The Chinese report reads the Chinese recommendation and cancer-risk text.

## 6. Recommended cleanup order

1. Rotate the model API key and secure the HTTP action inputs/outputs.
2. Create a disabled cleanup copy of the Flow and keep the exported package as the
   rollback artifact.
3. Align the HTTP trigger and Parse JSON schemas.
4. Add contract and component version fields to the platform payload.
5. Remove the `excel_row` model fallback.
6. Add and test the model-response schema.
7. Rename actions and group them into validation, persistence, inference, report,
   and failure scopes.
8. Add a stable response and correlation ID.
9. Run Chinese, English, invalid-input, model-failure, Excel-failure, and duplicate-
   submission tests.
10. Switch the production webhook only after the cleanup copy passes all tests.

## 7. Migration boundary

Power Automate should be treated as a temporary orchestration adapter. The browser
contract, model request, model response, and report-delivery contracts must remain
stable when the following implementations are replaced:

```text
Excel scripts -> PostgreSQL repositories
Power Automate HTTP -> on-premises worker
Power Automate email -> report-delivery service
Render relay/model endpoint -> on-premises API/model service
```
