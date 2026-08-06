import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "/Users/hmz/Desktop/EG BioMed/十癌問卷平台/跨癌別症狀危險比彙整總表_v19.3_A_早期偵測.xlsx";
const candidatePath = "/Users/hmz/Documents/互動式聊天機器人/contracts/vnext/model-feature-extension-candidates.json";
const outputPath = "/Users/hmz/Documents/互動式聊天機器人/tmp/feature-gap-inspection/frequency-evidence.json";

const candidates = JSON.parse(await fs.readFile(candidatePath, "utf8"));
const allCandidates = [
  ...candidates.direct_new_candidates,
  ...candidates.semantic_review_candidates,
];

const searchTerms = {
  symptom_testicular_lump: ["睪丸腫塊", "testicular lump"],
  symptom_testicular_swelling: ["睪丸腫大", "testicular swelling"],
  symptom_scrotal_swelling: ["陰囊腫大", "scrotal swelling"],
  symptom_testicular_pain: ["睪丸疼痛", "testicular pain"],
  symptom_groin_pain: ["腹股溝疼痛", "groin pain"],
  symptom_postcoital_bleeding: ["性交後出血", "postcoital bleeding"],
  symptom_intermenstrual_bleeding: ["經間出血", "intermenstrual bleeding"],
  symptom_abnormal_vaginal_discharge: ["異常陰道分泌物", "vaginal discharge"],
  symptom_pelvic_pain: ["骨盆疼痛", "pelvic pain"],
  symptom_epigastric_pain: ["上腹痛", "epigastric pain"],
  symptom_dyspepsia: ["消化不良", "dyspepsia"],
  symptom_reflux: ["胃酸逆流", "reflux"],
  symptom_heartburn: ["火燒心", "heartburn"],
  symptom_hematemesis: ["吐血", "haematemesis", "hematemesis"],
  symptom_fracture: ["骨折", "fracture"],
  symptom_rib_pain: ["肋骨疼痛", "rib pain"],
  symptom_bone_pain_other: ["骨骼疼痛", "bone pain"],
  symptom_joint_pain: ["關節疼痛", "joint pain"],
  symptom_nosebleeds: ["鼻出血", "nosebleed", "epistaxis"],
  symptom_urinary_retention: ["尿滯留", "urinary retention"],
  symptom_impotence: ["陽萎", "勃起功能障礙", "impotence"],
  symptom_oral_submucous_fibrosis: ["口腔黏膜下纖維化", "oral submucous fibrosis"],
  symptom_sore_throat: ["喉嚨痛", "sore throat"],
  symptom_otalgia: ["耳痛", "otalgia"],
  symptom_nasal_mass: ["鼻部腫塊", "nasal mass"],
  symptom_nasal_discharge: ["鼻漏", "鼻塞", "nasal discharge"],
  symptom_head_neck_mass: ["頭頸部腫塊", "head and neck mass", "head/neck mass"],
  symptom_hematuria_visible: ["肉眼血尿", "visible haematuria", "visible hematuria"],
  symptom_dysuria: ["排尿疼痛", "排尿困難", "dysuria"],
  symptom_vte: ["靜脈血栓栓塞", "DVT", "pulmonary embolism", "VTE"],
  hx_chronic_pancreatitis: ["慢性胰臟炎", "chronic pancreatitis"],
  hx_liver_disease_etiology: ["HBV", "HCV", "MASLD", "酒精性肝病"],
};

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const evidence = {};

for (const candidate of allCandidates) {
  evidence[candidate.name] = [];
  const terms = searchTerms[candidate.name] || [candidate.label_zh];
  for (const sheet of workbook.worksheets.items) {
    const used = sheet.getUsedRange();
    if (!used) continue;
    const values = used.values;
    for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
      const rowText = values[rowIndex]
        .map((value) => value === null || value === undefined ? "" : String(value))
        .join(" | ");
      const normalized = rowText.toLowerCase();
      if (terms.some((term) => normalized.includes(term.toLowerCase()))) {
        evidence[candidate.name].push({
          sheet: sheet.name,
          row: rowIndex + 1,
          text: rowText.slice(0, 3000),
        });
      }
    }
  }
}

await fs.writeFile(outputPath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ outputPath, featureCount: allCandidates.length }, null, 2));
