# Model vNext handoff

Status: questionnaire collection implemented; deployed model input intentionally unchanged

Questionnaire version: `questionnaire/2026-08-05-symptom-vnext`

Current production model feature schema: `model-features/1.0.0`

Candidate extension set: `feature-gap-candidates/2026-08-05`

## 1. Why the questionnaire changed

The literature workbook contains 32 highlighted candidate fields that are not all
equivalent kinds of data. The questionnaire now separates them into:

- warning signs such as bleeding, a mass, or urinary retention, selected even when
  they occurred once during the past 3 months;
- common symptoms, selected when persistent, recurrent, or clearly new;
- clinician-confirmed diagnoses or events, collected in medical history rather
  than asking users to self-diagnose them;
- recurrence or duration follow-ups, stored as research metadata without changing
  the main binary symptom value.

The 32 candidates were integrated into 13 body-system groups rather than 32 new
screens. Male, female, and follow-up questions use conditional routing. `Not sure`
is stored as missing, while a hidden question is not applicable; neither becomes
an automatic zero.

## 2. What is already emitted

The browser payload now contains:

| Payload field | Purpose |
| --- | --- |
| `ai_api_feature_row` | Existing model request. Shape remains `model-features/1.0.0`. |
| `symptom_feature_row` | Binary symptom collection; `1` selected, `0` explicitly absent, `null` unknown/not applicable. |
| `vnext_feature_row` | Complete ordered 32-field candidate set, combining symptom, clinician-confirmed/event, and liver-disease fields. |
| `vnext_feature_metadata` | Recurrence or duration answers for testicular pain, sore throat, head/neck mass, and visible haematuria. |
| `excel_row` | Combined temporary research row for the Power Automate/Excel adapter. |

The current `/predict` request must continue to use `ai_api_feature_row`. Do not
send the new fields to the deployed model until the contract below is frozen.

## 3. Decisions required from the model owner

Provide one machine-readable manifest and one signed-off mapping table containing:

1. Exact ordered input column list for the retrained model.
2. Data type and allowed values for every column.
3. Missing, unknown, and not-applicable encoding for every column.
4. Final look-back period and positive-answer definition for every new field.
5. Whether recurrence/duration metadata is a model input or research-only data.
6. Whether visible and test-only haematuria are separate inputs and whether the
   legacy `symptom_hematuria` remains as a derived umbrella.
7. Whether liver disease aetiology is categorical or multi-hot, including the
   exact category order and reference category.
8. Final boundaries among `symptom_neck_lump`, `symptom_head_neck_mass`, and
   `symptom_lymphadenopathy`.
9. Final boundaries among upper abdominal discomfort, epigastric pain,
   dyspepsia, reflux, and heartburn.
10. Model artifact version, preprocessing artifact version, thresholds, expected
    response schema, and backward-compatible endpoint strategy.

## 4. Recommended backend contract

Create a new endpoint such as `POST /predict/v2`. It should accept an envelope,
not an unversioned flat object:

```json
{
  "assessment_id": "server-generated-id",
  "feature_schema_version": "model-features/2.0.0",
  "mapping_version": "answer-mapping/2.0.0",
  "questionnaire_version": "questionnaire/2026-08-05-symptom-vnext",
  "features": {
    "age": 54,
    "symptom_hematemesis": 0,
    "symptom_hematuria_visible": 1
  }
}
```

The API must reject an unknown schema version, missing required column, extra
column, invalid type, and impossible value with a field-specific `422` response.
It must not silently reorder, drop, coerce, or fill fields.

The response should include at least:

```json
{
  "model_version": "cancer-risk-v2.0.0",
  "feature_schema_version": "model-features/2.0.0",
  "mapping_version": "answer-mapping/2.0.0",
  "threshold_version": "risk-thresholds/2.0.0",
  "risk_score": 0.42,
  "risk_level": "moderate_relative_risk",
  "cancer_risks": [],
  "warnings": []
}
```

## 5. Release sequence

1. Freeze the model input manifest and answer mapping.
2. Have a clinical reviewer approve wording and time windows.
3. Create fixture cases for male, female, all-none, unknown, warning-sign, and
   contradictory answers.
4. Run the old and new models in shadow mode without changing the user report.
5. Compare missingness, feature distributions, API failures, and risk outputs.
6. Release model, feature schema, mapping, questionnaire, and report wording as a
   coordinated versioned deployment.
7. Keep `/predict` available for rollback until the v2 audit is complete.

## 6. Acceptance criteria

- The backend reproduces the training preprocessing exactly from stored answers.
- Feature order and input hash are recorded for every inference.
- Unknown and not-applicable values are distinguishable from confirmed absence.
- All sex-specific and conditional paths have passing fixtures.
- No new candidate field is used in a report before its model version is active.
- Historical submissions retain their original questionnaire and mapping versions.
