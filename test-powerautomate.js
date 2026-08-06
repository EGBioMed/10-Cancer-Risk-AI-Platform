import http from "k6/http";
import { check, fail, sleep } from "k6";

const TARGET_URL = __ENV.POWER_AUTOMATE_URL || __ENV.TARGET_URL;
const PROFILE = __ENV.PROFILE || "smoke";

const profiles = {
  smoke: [
    { duration: "30s", target: 1 },
    { duration: "30s", target: 0 }
  ],
  five: [
    { duration: "30s", target: 5 },
    { duration: "1m", target: 5 },
    { duration: "30s", target: 0 }
  ],
  twenty: [
    { duration: "1m", target: 20 },
    { duration: "2m", target: 20 },
    { duration: "1m", target: 0 }
  ]
};

export const options = {
  stages: profiles[PROFILE] || profiles.smoke,
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<5000"]
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"]
};

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
    data_source: "k6_qa_load_test"
  };

  return optimizedFeatureColumns.reduce((ordered, column) => {
    ordered[column] = row[column];
    return ordered;
  }, {});
}

function buildRows() {
  return [
    { question_id: "birth_year", label: "您的出生年（西元）", answer: "1960" },
    { question_id: "sex", label: "您的性別？", answer: "女性" },
    { question_id: "height_cm", label: "身高（公分）", answer: "160" },
    { question_id: "weight_kg", label: "體重（公斤）", answer: "55" },
    { question_id: "smoking_ever", label: "是否有抽菸習慣（現在或過去）？", answer: "否" },
    { question_id: "family_cancer", label: "家族成員（一等親內）是否有癌症史？", answer: "是" },
    { question_id: "recent_discomfort", label: "最近三個月是否有身體不適？", answer: "近期血糖異常，體重下降，上腹部不適，尚未就醫。" }
  ];
}

function buildPayload() {
  const submittedAt = new Date().toISOString();
  const recordId = `loadtest-${randomId()}`;
  const email = `qa-test+${recordId}@example.com`;
  const optimizedFeatureRow = buildOptimizedFeatureRow(recordId);
  const aiApiFeatureRow = {
    ...optimizedFeatureRow,
    quit_smoking: Math.max(0, Number(optimizedFeatureRow.quit_smoking) || 0)
  };

  return {
    submission_id: recordId,
    submitted_at: submittedAt,
    language: "zh-Hant",
    report_language: "zh-Hant",
    email,
    rows: buildRows(),
    optimized_feature_columns: optimizedFeatureColumns,
    optimized_feature_row: optimizedFeatureRow,
    ai_api_feature_row: aiApiFeatureRow,
    contact_row: {
      record_id: recordId,
      email,
      submitted_at: submittedAt,
      language: "zh-Hant",
      report_language: "zh-Hant"
    },
    excel_row: {
      ...optimizedFeatureRow,
      submitted_at: submittedAt,
      language: "zh-Hant",
      report_language: "zh-Hant",
      recent_discomfort_text: "近期血糖異常，體重下降，上腹部不適，尚未就醫。",
      recent_discomfort_no_symptom: 0,
      recent_discomfort_body_parts: "腹部或腸胃",
      recent_discomfort_symptoms: "腸胃不適、體重或食慾改變",
      recent_discomfort_duration: "",
      recent_discomfort_severity: "",
      recent_discomfort_care_seeking: "尚未就醫",
      recent_discomfort_follow_up: "我想再確認持續多久，可以補充一句嗎？",
      recent_discomfort_ready_to_close: 0
    },
    qa_metadata: {
      test_mode: true,
      tool: "k6",
      profile: PROFILE,
      note: "Synthetic QA/QC load test data. Do not treat as a real patient submission."
    }
  };
}

export default function () {
  if (!TARGET_URL) {
    fail("Missing POWER_AUTOMATE_URL or TARGET_URL. Example: POWER_AUTOMATE_URL='https://...' k6 run test-powerautomate.js");
  }

  const response = http.post(TARGET_URL, JSON.stringify(buildPayload()), {
    headers: {
      "Content-Type": "application/json",
      "X-QA-Test": "k6"
    },
    timeout: "30s"
  });

  check(response, {
    "status is 2xx": (res) => res.status >= 200 && res.status < 300,
    "response time < 5s": (res) => res.timings.duration < 5000,
    "response has body": (res) => Boolean(res.body && res.body.length > 0)
  });

  sleep(1);
}
