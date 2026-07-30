# Data Contract

## Submission Payload

The platform submits one JSON object to `/api/submit`. The backend forwards the same object to Power Automate after adding fallback fields when needed.

Required top-level fields:

- `optimized_feature_columns`: ordered model/storage feature column names
- `optimized_feature_row`: canonical feature row for storage and auditing
- `ai_api_feature_row`: normalized row for the AI API
- `research_feature_columns`: research-only feature column names
- `research_feature_row`: research-only values that are excluded from the current AI API
- `excel_row`: row for Excel retention and Office Script writes
- `contact_row`: restricted contact workbook row containing only the coded record ID and report-delivery fields
- `rows`: de-identified, human-readable questionnaire rows; the email question and email address are excluded
- `email`: report recipient email, kept only at the top level for delivery
- `submitted_at`: ISO timestamp

## Row Responsibilities

### `optimized_feature_row`

Canonical platform feature row. It is allowed to preserve source-model encodings, including special values that mean "not applicable" when that is part of the feature design.

Use for:

- Audit/debug
- Internal feature compatibility checks
- Building `excel_row`

Do not send this row directly to the AI API unless the API schema explicitly accepts every encoded value.

### `ai_api_feature_row`

AI API-safe feature row. It starts from `optimized_feature_row`, then normalizes fields that the API schema rejects.

Current normalization:

| Field | Source value | API value | Reason |
|---|---:|---:|---|
| `quit_smoking` | negative, blank, or invalid | `0` | Current AI API schema requires `quit_smoking >= 0`. |

Use this row as the Power Automate HTTP body for the AI API.

Recommended Power Automate expression:

```text
body('Parse_JSON')?['ai_api_feature_row']
```

Fallback only if `ai_api_feature_row` is missing:

```text
body('Parse_JSON')?['optimized_feature_row']
```

### `excel_row`

Storage row for Excel. It may include extra reporting fields that are not model features, such as:

- `submitted_at`
- `language`
- `report_language`
- `recent_discomfort_text`
- structured symptom summary fields
- research-only fields prefixed with `research_`

Use this row for Office Script / Excel retention.

The report recipient email is intentionally excluded from `excel_row`. Power Automate should read the top-level `email` only in the email delivery step and should not write it to the research workbook.

Recommended Power Automate Office Script parameter:

```text
string(body('Parse_JSON')?['excel_row'])
```

### `contact_row`

Restricted contact row stored separately from the research workbook:

- `record_id`
- `email`
- `submitted_at`
- `language`
- `report_language`

Use a second Office Script action connected to a separate, access-restricted Excel workbook:

```text
string(body('Parse_JSON')?['contact_row'])
```

The shared `record_id` allows an authorized privacy administrator to locate the corresponding research record when handling a valid access, correction, or deletion request. Research users should not receive access to the contact workbook.

### `research_feature_row`

Research-only structured fields collected for future analysis. These fields are written to `excel_row` with a `research_` prefix and are not included in `optimized_feature_row` or `ai_api_feature_row`.

Current field:

| Research field | Excel column | Current model input |
|---|---|---|
| `processed_meat` | `research_processed_meat` | No |

## Current Production Bug

The production Flow previously sent `optimized_feature_row` to the AI API. A k6 test payload contained:

```json
{ "quit_smoking": -1 }
```

The AI API rejected it with HTTP 422 because its schema requires `quit_smoking >= 0`.

Resolution:

- Platform and k6 payloads now include `ai_api_feature_row`.
- k6 synthetic data now uses `quit_smoking: 0`.
- Power Automate should send `ai_api_feature_row` to the AI API.
