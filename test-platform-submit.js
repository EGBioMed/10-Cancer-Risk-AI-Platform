import http from "k6/http";
import { check, fail, sleep } from "k6";

const frozenFieldManifest = JSON.parse(open("./contracts/power-automate/transitional-field-manifest.json"));
const answerCodeManifest = JSON.parse(open("./contracts/v1/answer-code-manifest.json"));

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000/api/submit";
const PROFILE = __ENV.PROFILE || "smoke";
const TEST_EMAIL = __ENV.TEST_EMAIL || "";
const isSingleProfile = PROFILE === "single" || PROFILE === "production_single";

const productionBurstProfiles = {
  production_burst_3: { vus: 3, responseTimeLimitMs: 90000, requestTimeout: "120s" },
  production_burst_4: { vus: 4, responseTimeLimitMs: 150000, requestTimeout: "180s" },
  production_burst_5: { vus: 5, responseTimeLimitMs: 180000, requestTimeout: "240s" },
  production_burst_6: { vus: 6, responseTimeLimitMs: 240000, requestTimeout: "300s" },
  production_burst_7: { vus: 7, responseTimeLimitMs: 300000, requestTimeout: "360s" },
  production_burst_8: { vus: 8, responseTimeLimitMs: 360000, requestTimeout: "420s" },
  production_burst_9: { vus: 9, responseTimeLimitMs: 420000, requestTimeout: "480s" },
  production_burst_10: { vus: 10, responseTimeLimitMs: 480000, requestTimeout: "540s" }
};

const productionBurstProfile = productionBurstProfiles[PROFILE];
const responseTimeLimitMs = productionBurstProfile?.responseTimeLimitMs
  || (PROFILE === "production_single" ? 30000 : 10000);
const requestTimeout = productionBurstProfile?.requestTimeout
  || (PROFILE === "production_single" ? "45s" : "30s");

const profiles = {
  single: null,
  production_single: null,
  smoke: [
    { duration: "30s", target: 1 },
    { duration: "30s", target: 0 }
  ],
  demo: [
    { duration: "1m", target: 5 },
    { duration: "3m", target: 5 },
    { duration: "1m", target: 0 }
  ],
  ten: [
    { duration: "1m", target: 10 },
    { duration: "3m", target: 10 },
    { duration: "1m", target: 0 }
  ],
  fifteen: [
    { duration: "1m", target: 15 },
    { duration: "3m", target: 15 },
    { duration: "1m", target: 0 }
  ],
  event: [
    { duration: "2m", target: 20 },
    { duration: "5m", target: 20 },
    { duration: "2m", target: 0 }
  ]
};

const baseOptions = {
  stages: isSingleProfile ? undefined : profiles[PROFILE] || profiles.smoke,
  iterations: isSingleProfile ? 1 : undefined,
  vus: isSingleProfile ? 1 : undefined,
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: [`p(95)<${responseTimeLimitMs}`]
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"]
};

export const options = productionBurstProfile ? {
  scenarios: {
    event_burst: {
      executor: "per-vu-iterations",
      vus: productionBurstProfile.vus,
      iterations: 1,
      maxDuration: requestTimeout
    }
  },
  thresholds: baseOptions.thresholds,
  summaryTrendStats: baseOptions.summaryTrendStats
} : baseOptions;

const optimizedFeatureColumns = [
  "record_id", "sex", "age", "height_cm", "weight_kg", "bmi", "diagnosis", "is_cancer_patient",
  "prev_cancer", "family_cancer_history", "first_degree_relative_cancer", "chronic_hypertension",
  "chronic_diabetes", "chronic_hyperlipidemia", "chronic_liver_disease", "chronic_gerd",
  "chronic_heart_disease", "chronic_thyroid", "chronic_asthma_copd", "chronic_gout",
  "chronic_arthritis", "chronic_mental", "chronic_stroke", "chronic_kidney", "chronic_autoimmune",
  "chronic_other_unclassified", "chronic_disease_count", "smoking", "quit_smoking",
  "secondhand_smoke", "betel_nut", "radiation_exposure", "cooking_fumes", "air_pollution",
  "cooking_freq_missing", "cooking_freq_per_week", "weight_change_6m", "exercise_per_week",
  "anxiety_freq_missing", "anxiety_freq", "insomnia_freq_missing", "insomnia_freq",
  "depression_freq_missing", "depression_freq", "alcohol", "vegetarian", "grilled_fried_food",
  "pickled_food", "red_meat", "sweets_junk", "sugary_drinks", "vegetables_fruits",
  "high_fat_food_missing", "high_fat_food", "dairy_missing", "dairy", "coffee_habit_missing",
  "tea_habit_missing", "coffee_habit", "tea_habit", "menarche_early", "menopause_ordinal",
  "first_pregnancy_age_ordinal", "num_pregnancies", "num_births", "breastfed", "pap_smear_done",
  "pap_smear_abnormal", "hormone_drug", "score", "data_source"
];

function randomId() {
  return `${Date.now()}-${__VU}-${__ITER}-${Math.floor(Math.random() * 1000000)}`;
}

function buildOptimizedFeatureRow(recordId) {
  const row = {
    record_id: recordId,
    sex: 0,
    age: 66,
    height_cm: 160,
    weight_kg: 55,
    bmi: 21.48,
    diagnosis: "",
    is_cancer_patient: 0,
    prev_cancer: 0,
    family_cancer_history: 1,
    first_degree_relative_cancer: 1,
    chronic_hypertension: 0,
    chronic_diabetes: 1,
    chronic_hyperlipidemia: 0,
    chronic_liver_disease: 0,
    chronic_gerd: 0,
    chronic_heart_disease: 0,
    chronic_thyroid: 0,
    chronic_asthma_copd: 0,
    chronic_gout: 0,
    chronic_arthritis: 0,
    chronic_mental: 0,
    chronic_stroke: 0,
    chronic_kidney: 0,
    chronic_autoimmune: 0,
    chronic_other_unclassified: 0,
    chronic_disease_count: 1,
    smoking: 0,
    quit_smoking: 0,
    secondhand_smoke: 0,
    betel_nut: 0,
    radiation_exposure: 0,
    cooking_fumes: 1,
    air_pollution: 0,
    cooking_freq_missing: 0,
    cooking_freq_per_week: 4,
    weight_change_6m: 1,
    exercise_per_week: 1,
    anxiety_freq_missing: 0,
    anxiety_freq: 1,
    insomnia_freq_missing: 0,
    insomnia_freq: 1,
    depression_freq_missing: 0,
    depression_freq: 0,
    alcohol: 0,
    vegetarian: 0,
    grilled_fried_food: 1,
    pickled_food: 0,
    red_meat: 1,
    sweets_junk: 0,
    sugary_drinks: 0,
    vegetables_fruits: 1,
    high_fat_food_missing: 0,
    high_fat_food: 0,
    dairy_missing: 0,
    dairy: 1,
    coffee_habit_missing: 0,
    tea_habit_missing: 0,
    coffee_habit: 0,
    tea_habit: 1,
    menarche_early: 1,
    menopause_ordinal: 1,
    first_pregnancy_age_ordinal: 2,
    num_pregnancies: 2,
    num_births: 2,
    breastfed: 1,
    pap_smear_done: 1,
    pap_smear_abnormal: 0,
    hormone_drug: 0,
    score: "",
    data_source: "k6_platform_submit_test"
  };

  return optimizedFeatureColumns.reduce((ordered, column) => {
    ordered[column] = row[column];
    return ordered;
  }, {});
}

function buildPayload() {
  const submittedAt = new Date().toISOString();
  const recordId = `platform-loadtest-${randomId()}`;
  const email = TEST_EMAIL || `qa-platform+${recordId}@example.com`;
  const optimizedFeatureRow = buildOptimizedFeatureRow(recordId);
  const aiApiFeatureRow = {
    ...optimizedFeatureRow,
    quit_smoking: Math.max(0, Number(optimizedFeatureRow.quit_smoking) || 0)
  };
  const symptomFeatureRow = Object.fromEntries(
    frozenFieldManifest.symptom_feature_columns.map((column) => [column, null])
  );
  const vnextFeatureRow = Object.fromEntries(
    frozenFieldManifest.vnext_feature_columns.map((column) => [column, null])
  );
  const researchFeatureRow = Object.fromEntries(
    frozenFieldManifest.research_feature_columns.map((column) => [column, 0])
  );
  const ruleInputRow = Object.fromEntries(
    frozenFieldManifest.rule_input_columns.map((column) => [column, null])
  );

  return {
    contract_version: "assessment-submission/1.1.0",
    questionnaire_version: "questionnaire/2026-08-19-v19.5-phase1",
    consent_version: "consent/2026-08-05",
    answer_code_schema_version: "question-answer-codes/1.0.0",
    feature_schema_version: "model-features/1.0.0",
    mapping_version: "answer-to-feature/1.0.0",
    vnext_feature_schema_version: "feature-gap-candidates/2026-08-05",
    vnext_mapping_version: "answer-mapping-vnext/0.1.0",
    rule_input_schema_version: "high-risk-rules/19.5",
    rule_input_mapping_version: "rule-input-mapping/19.5-phase1",
    report_template_version: "email-report/2026-08-05",
    submitted_at: submittedAt,
    email,
    language: "zh",
    report_language: "zh-Hant",
    consent_record: {
      consent_version: "consent/2026-08-05",
      accepted_at: submittedAt,
      accepted_item_ids: ["data_use", "model_limitations", "non_medical_use"]
    },
    answer_code_rows: answerCodeManifest.questions
      .filter((question) => !["consent_acknowledgement", "email"].includes(question.question_id))
      .map((question) => ({ question_id: question.question_id, status: "unknown", value: null })),
    rows: [
      { submitted_at: submittedAt, question_id: "birth_year", question_text: "您的出生年（西元）", answer: "1960" },
      { submitted_at: submittedAt, question_id: "sex", question_text: "您的性別？", answer: "女性" },
      { submitted_at: submittedAt, question_id: "recent_discomfort", question_text: "最近三個月是否有身體不適？", answer: "近期血糖異常，體重下降，上腹部不適，尚未就醫。" }
    ],
    optimized_feature_columns: optimizedFeatureColumns,
    optimized_feature_row: optimizedFeatureRow,
    ai_api_feature_row: aiApiFeatureRow,
    symptom_feature_columns: frozenFieldManifest.symptom_feature_columns,
    symptom_feature_row: symptomFeatureRow,
    symptom_answers: Array.from({ length: 13 }, (_, index) => ({
      category_id: `category_${index + 1}`,
      category_zh: `測試症狀類別 ${index + 1}`,
      category_en: `Test symptom category ${index + 1}`,
      answer_status: "unknown",
      selected_symptoms: []
    })),
    vnext_feature_columns: frozenFieldManifest.vnext_feature_columns,
    vnext_feature_row: vnextFeatureRow,
    vnext_feature_metadata: Object.fromEntries(
      frozenFieldManifest.vnext_feature_metadata_columns.map((column) => [column, null])
    ),
    research_feature_columns: frozenFieldManifest.research_feature_columns,
    research_feature_row: researchFeatureRow,
    rule_input_columns: frozenFieldManifest.rule_input_columns,
    rule_input_row: ruleInputRow,
    contact_row: {
      record_id: recordId,
      email,
      submitted_at: submittedAt,
      language: "zh",
      report_language: "zh-Hant"
    },
    excel_row: {
      ...optimizedFeatureRow,
      ...symptomFeatureRow,
      ...vnextFeatureRow,
      ...ruleInputRow,
      research_processed_meat: 0,
      submitted_at: submittedAt,
      language: "zh",
      report_language: "zh-Hant",
      recent_discomfort_text: "近期血糖異常，體重下降，上腹部不適，尚未就醫。",
      recent_discomfort_no_symptom: 0,
      recent_discomfort_body_parts: "腹部或腸胃",
      recent_discomfort_symptoms: "腸胃不適; 體重或食慾改變",
      recent_discomfort_duration: "",
      recent_discomfort_severity: "",
      recent_discomfort_care_seeking: "尚未就醫",
      recent_discomfort_follow_up: "我想再確認持續多久，可以補充一句嗎？",
      recent_discomfort_ready_to_close: 0
    },
    data_quality: {
      missing_columns: [],
      contradiction_warnings: []
    }
  };
}

export default function () {
  if (!TARGET_URL) {
    fail("Missing TARGET_URL. Example: TARGET_URL='http://localhost:3000/api/submit' k6 run test-platform-submit.js");
  }

  const response = http.post(TARGET_URL, JSON.stringify(buildPayload()), {
    headers: {
      "Content-Type": "application/json",
      "X-QA-Test": "k6-platform-submit"
    },
    timeout: requestTimeout
  });

  check(response, {
    "status is 2xx": (res) => res.status >= 200 && res.status < 300,
    [`response time < ${responseTimeLimitMs / 1000}s`]: (res) => res.timings.duration < responseTimeLimitMs,
    "response says ok": (res) => {
      try {
        return JSON.parse(res.body).ok === true;
      } catch (error) {
        return false;
      }
    }
  });

  sleep(1);
}
