import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "/Users/hmz/Desktop/EG BioMed/十癌問卷平台/跨癌別症狀危險比彙整總表_v19.3_A_早期偵測.xlsx";
const sheets = [
  "睪丸癌_詳細",
  "子宮頸癌_詳細",
  "子宮內膜癌_停經後出血_詳細",
  "食道胃癌_詳細",
  "骨髓瘤_詳細",
  "攝護腺癌_詳細",
  "頭頸癌_口腔病灶_詳細",
  "喉癌_詳細",
  "鼻竇癌_詳細",
  "非何杰金氏淋巴瘤_詳細",
  "膀胱癌_詳細",
  "腎細胞癌_詳細",
  "胰臟癌_QCancer模型_詳細",
  "肝細胞癌_監測早期偵測_詳細",
  "QCancer女性多癌別_詳細",
  "QCancer男性多癌別_詳細"
];

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const name of sheets) {
  const sheet = workbook.worksheets.getItem(name);
  const used = sheet.getUsedRange().values;
  console.log(`\n===== ${name} =====`);
  for (let i = 0; i < Math.min(6, used.length); i += 1) {
    console.log(`${i + 1}: ${used[i].map((v) => v ?? "").join(" | ")}`);
  }
}
