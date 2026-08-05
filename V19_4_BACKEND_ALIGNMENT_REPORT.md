# v19.4 Backend Alignment Report

Source: `v19.4_新增問卷題目設計規格.xlsx`

Reviewed: 2026-08-05

## Executive conclusion

The backend workbook defines inputs for a high-risk rule layer. It does not replace
the current 71-column model input and it is not the same contract as the earlier
32 vNext model-training candidates.

The safe integration boundary is:

- keep `ai_api_feature_row` unchanged for the currently deployed `/predict`;
- add a separate, versioned rule-input record for v19.4;
- store new questionnaire and recurrence fields in research/Excel output first;
- activate rules only after the backend confirms the endpoint, field encodings,
  confidence switches, and response contract.

The machine-readable transcription is
`contracts/vnext/high-risk-rule-input-v19.4.json`.

## What the backend supplied

### New self-report inputs

Priority 1, recommended first:

1. `symptom_stool_loose_or_frequent`, shown only after bowel-habit change.
2. `symptom_mastalgia`, female path only.
3. `symptom_constipation`.

Priority 2:

1. `dx_orchitis_epididymitis`, male path only.
2. `hx_benign_gynae_disease`, female path only.
3. `screen_pap_overdue_or_out_of_range`, female age 18 or older.
4. `screen_psa_elevated`, male age 50 or older; rule disabled by default.

Two examination findings are explicitly clinician-only and must not be placed in
the public self-report questionnaire:

- `symptom_abdominal_tenderness`
- `symptom_abnormal_rectal_exam`

### Recurrence inputs

The workbook defines 16 integer repeat-count fields for events in the most recent
180 days. They are asked only when the parent symptom is positive, accept 0-9,
and trigger recurrence rules at a count of at least 2.

Four rows also define minimum-interval metadata. A mass and three oral-symptom
families require a shortest interval of at least 42 days to separate episodes.

### Backend-only aliases

Twelve rule-layer concepts can be obtained without adding questionnaire screens.
They should be implemented in the backend mapping layer. Examples include:

- `screen_fit_positive` from `symptom_abnormal_fobt`;
- broad abdominal pain from four existing abdominal fields;
- lower urinary tract symptoms from five existing urinary fields;
- broad mass from five existing mass fields;
- depression history from `depression_freq >= 4`.

The workbook itself labels the urinary-tract-infection and Pap-timing approximations
as high precision risk. Those temporary mappings should not be treated as final.

## Phase-1 frontend implementation status

Already present as exact parent fields include jaundice, sore throat, dysphagia,
hematochezia, bowel-habit change, visible haematuria, nocturia, urinary frequency,
oral ulcer, oral white/red patch, and pelvic discomfort/increased girth.

Present through an existing conservative or compound field include back pain,
abdominal pain, and broad mass.

The frontend now collects the three priority-1 fields, four priority-2 fields,
`symptom_shortness_of_breath`, a broad `symptom_mass`, all 16 conditional repeat
counts, and four interval fields. These values are emitted in a separate
`rule_input_row` and copied into `excel_row`; they are not sent to the current
71-field model request.

The current symptom introduction generally uses a three-month lookback. v19.4
uses six months for the new rule and repeat-count questions. This must remain an
explicit per-question time window rather than silently changing every existing
symptom definition.

## Recommended release sequence

### Stage 1: backend mapping, no questionnaire cost

Implement the 12 aliases in the rule service and add fixture tests for every
mapping. This moves rule coverage from 53/96 to 69/96 according to the workbook.

### Stage 2: safety-first questionnaire additions (implemented for collection)

Add the three priority-1 inputs. Keep them in a dedicated v19.4 rule row and in
the research export. Do not append them to the current model HTTP body.

### Stage 3: conditional recurrence capture (implemented for collection)

Add shortness of breath and a broad unexplained-mass input, then conditionally ask
repeat counts only for selected parent symptoms. The UI should use a compact
stepper or segmented count control rather than exposing 16 permanent questions.

### Stage 4: secondary and screening inputs (implemented for collection)

Add the four priority-2 inputs after privacy, clinical wording, and public-screening
bias controls are approved. Keep the PSA rule disabled by default.

## Backend actions required

1. Confirm whether the rule layer is part of `/predict/v2` or a separate endpoint.
2. Publish an exact request and response JSON Schema.
3. Implement the 12 aliases server-side; the browser must not own rule logic.
4. Confirm whether unknown is integer `9`, JSON `null`, or status metadata for each
   field. Do not use mixed encodings without an adapter contract.
5. Return rule IDs, confidence class, evidence version, and triggered-field names;
   do not return only prewritten medical prose.
6. Default `rule_include_low_confidence` and public-screening rules to disabled.
7. Add contract tests for missing repeat counts. Missing data must keep a recurrence
   rule silent rather than treating a single symptom as recurrent.
8. Version and store the rule-input snapshot independently of the model-feature
   snapshot.

## Power Automate and Excel impact

No current Power Automate HTTP field should be changed until the backend endpoint
contract is confirmed. For research storage, the eventual Excel row needs the 7
self-report fields, 16 repeat-count fields, required interval fields, and the two
parent additions. The Office Script can continue mapping values by exact header
name, but headers and payload must be updated together.

Excel is a transitional store. The on-premises design should store original answers,
rule-input snapshots, model-feature snapshots, rule evaluations, and inference runs
as separately versioned records.
