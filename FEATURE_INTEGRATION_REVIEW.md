# vNext symptom feature integration review

Date: 2026-08-05

Source workbook: `跨癌別症狀危險比彙整總表_v19.3_A_早期偵測.xlsx`

Source sheet: `平台因子缺口分析_建議新增`

Scope: the 32 light-orange feature-code cells in column A, compared with the
current 55 symptom fields and the complete questionnaire in `app.js`.

## 1. Main conclusion

The 32 candidate fields should not become 32 standalone user questions. They can
be collected through reorganized multi-select symptom groups, with conditional
follow-ups for recurrence, subtype, or diagnosis history.

The workbook does **not** provide a valid user-facing frequency threshold for every
feature. Most source studies use whether a symptom or diagnosis was recorded in a
clinical look-back window. A recorded consultation is not equivalent to a symptom
occurring a particular number of times. Therefore:

- use an explicit threshold only when the workbook supports it;
- use `any occurrence` for red-flag events and masses;
- use `persistent or recurrent` for common non-specific symptoms;
- use `ever diagnosed` or a specified look-back window for diagnoses and events;
- store recurrence/duration separately instead of changing the binary feature.

The current global reminder (`past 3 months` plus `more than 2 weeks`) must not
govern every option. It would incorrectly exclude one-time haematemesis, visible
haematuria, postcoital bleeding, testicular lumps, and similar events.

## 2. Recommended questionnaire groups

| Proposed group | Existing content reused | New highlighted fields |
| --- | --- | --- |
| Upper digestive symptoms | early satiety, upper abdominal discomfort, nausea, dysphagia | epigastric pain, dyspepsia, reflux, heartburn, haematemesis |
| Bowel and lower abdominal symptoms | bowel change, haematochezia, melaena, tenesmus, FOBT | pelvic pain remains in the applicable gynaecological group |
| Urinary symptoms | frequency, nocturia, weak stream, hesitancy, interrupted flow, haematuria | visible haematuria, dysuria |
| Male reproductive symptoms | none | testicular lump, testicular swelling, scrotal swelling, testicular pain, groin pain, urinary retention, impotence |
| Gynaecological symptoms | abnormal bleeding, postmenopausal bleeding, irregular bleeding, pelvic discomfort | postcoital bleeding, intermenstrual bleeding, vaginal discharge, pelvic pain |
| Oral and throat symptoms | oral ulcer, hoarseness, oral white/red patch | oral submucous fibrosis, sore throat, otalgia |
| Head, neck, and nasal symptoms | neck lump | nasal mass, nasal discharge, head/neck mass |
| Bone and joint symptoms | persistent back pain | fracture, rib pain, other bone pain, joint pain |
| Blood, lymph, and unusual bleeding | recurrent infection, bruising/bleeding, lymphadenopathy | nosebleeds |
| Diagnosed conditions and recent events | chronic disease history | VTE, chronic pancreatitis, liver disease aetiology |

This changes the symptom section from 9 broad groups to approximately 13 shorter
groups. Sex/organ applicability means a respondent will not see every group. The
benefit is fewer ambiguous options per screen and safer feature mapping.

## 3. Frequency and time-window decisions

### 3.1 Any occurrence within the past 3 months

These should be selected even if they happened once:

- `symptom_testicular_lump`
- `symptom_testicular_swelling`
- `symptom_scrotal_swelling`
- `symptom_postcoital_bleeding`
- `symptom_intermenstrual_bleeding`
- `symptom_hematemesis`
- `symptom_nasal_mass`
- `symptom_hematuria_visible`
- `symptom_urinary_retention`

The workbook treats these primarily as recorded warning features and does not
support requiring two weeks of persistence before selection.

### 3.2 Persistent, recurrent, or clearly new/worsening in the past 3 months

The binary feature can use this common user-facing rule:

- `symptom_groin_pain`
- `symptom_abnormal_vaginal_discharge`
- `symptom_pelvic_pain`
- `symptom_epigastric_pain`
- `symptom_dyspepsia`
- `symptom_reflux`
- `symptom_heartburn`
- `symptom_rib_pain`
- `symptom_bone_pain_other`
- `symptom_joint_pain`
- `symptom_nosebleeds`
- `symptom_otalgia`
- `symptom_nasal_discharge`
- `symptom_dysuria`

This threshold is a questionnaire-operational definition, not a frequency directly
estimated by every cited study. It requires clinical approval before release.

### 3.3 Capture a recurrence or duration follow-up

| Feature | Workbook signal | Recommended follow-up |
| --- | --- | --- |
| `symptom_testicular_pain` | second consultation is separately reported | once / repeated two or more times / persistent |
| `symptom_sore_throat` | first and second consultations have separate ORs | once / repeated or sought care twice / persistent |
| `symptom_head_neck_mass` | repeated mass codes at least 42 days apart have substantially different evidence | present less than 6 weeks / present or recurred at least 6 weeks apart / uncertain |
| `symptom_hematuria_visible` | recurrent visible haematuria is separately discussed | once / repeated two or more times / uncertain |

The binary model field remains `0/1`; recurrence belongs in a separate research
attribute until the next model contract explicitly includes it.

### 3.4 Diagnoses and events, not symptom-frequency questions

| Feature | Recommended collection |
| --- | --- |
| `symptom_fracture` | use the model's confirmed clinical-record look-back window; a 12-month user question is only provisional, and low-trauma/pathological status should be captured separately |
| `symptom_vte` | clinician-diagnosed DVT or pulmonary embolism and date/recency; do not ask users to self-diagnose VTE |
| `symptom_oral_submucous_fibrosis` | ever diagnosed by a dentist or physician; consider renaming to a diagnosis/history namespace |
| `hx_chronic_pancreatitis` | ever diagnosed by a clinician |
| `hx_liver_disease_etiology` | current/previous clinician diagnosis, multi-select HBV/HCV/cirrhosis/MASLD/alcohol-related liver disease |
| `symptom_impotence` | new or clearly worsened erectile dysfunction; the workbook supports early signal beyond 180 days but does not itself establish a patient-facing frequency threshold, so the final look-back requires model-owner confirmation |

## 4. Existing fields that must be split or derived

| Existing field | vNext handling |
| --- | --- |
| `symptom_upper_abdominal_discomfort` | keep separate from epigastric pain and dyspepsia; current wording combines discomfort and indigestion and must be rewritten |
| `symptom_pelvic_discomfort_or_increased_girth` | split user options into pelvic pain/discomfort and increased abdominal girth; derive the legacy umbrella only if required |
| `symptom_hematuria` | ask visible versus test-only/non-visible haematuria; derive the old umbrella as an OR of subtypes |
| `symptom_neck_lump` and `symptom_lymphadenopathy` | define anatomical mass versus clinician-identified lymph-node enlargement before adding head/neck mass |
| `chronic_gerd` | keep diagnosis history separate from current reflux/heartburn symptoms |
| `chronic_liver_disease` | derive the umbrella from specific aetiologies rather than replacing all detail with one binary value |

## 5. Proposed global instructions

Replace the current single rule with:

> 請回想最近 3 個月內的身體狀況。每個選項會標示適用條件；出血、腫塊或其他警示狀況即使只發生一次也請勾選，一般不適則請勾選持續、反覆或明顯新發生的情況。

Each group must include mutually exclusive `None of the above` and a separate
`Not sure` answer. `Not sure` must not be encoded as zero. A conditionally hidden
group must be `not_applicable`, not symptom absence.

## 6. Decisions required before implementation

1. The model owner must confirm the exact training look-back window for each new
   feature. The workbook often describes clinical-record occurrence but not a
   patient-report frequency threshold.
2. Clinical reviewers must approve the operational wording for common symptoms,
   especially reflux/heartburn, nasal discharge, pelvic pain, and dysuria.
3. Decide whether organ-specific routing continues to use binary sex or moves to
   an explicit relevant-organ question.
4. Freeze whether recurrence fields are model inputs, research-only fields, or
   answer metadata.
5. Release the questionnaire, mapping, feature schema, and model version together.
