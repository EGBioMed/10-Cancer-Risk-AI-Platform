import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/hmz/Desktop/EG BioMed/十癌問卷平台/跨癌別症狀危險比彙整總表_v19.3_A_早期偵測.xlsx";
const outputDir = "/Users/hmz/Documents/互動式聊天機器人/tmp/feature-gap-inspection";
const targetSheetName = "平台因子缺口分析_建議新增";

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetOverview = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});

const sheet = workbook.worksheets.getItem(targetSheetName);
const usedRange = sheet.getUsedRange();
const usedValues = usedRange.values;

const styleInspection = await workbook.inspect({
  kind: "computedStyle",
  sheetId: targetSheetName,
  range: `A1:A${usedValues.length}`,
  maxChars: 50000,
});

const preview = await workbook.render({
  sheetName: targetSheetName,
  range: `A1:F${usedValues.length}`,
  scale: 1.2,
  format: "png",
});
await fs.writeFile(
  `${outputDir}/platform-feature-gap.png`,
  new Uint8Array(await preview.arrayBuffer()),
);

const rows = usedValues.map((row, index) => ({
  row: index + 1,
  a: row[0] ?? null,
  b: row[1] ?? null,
  c: row[2] ?? null,
  d: row[3] ?? null,
  e: row[4] ?? null,
  f: row[5] ?? null,
}));

await fs.writeFile(
  `${outputDir}/inspection.json`,
  JSON.stringify(
    {
      sheetOverview: sheetOverview.ndjson,
      targetSheetName,
      usedRowCount: usedValues.length,
      usedColumnCount: Math.max(...usedValues.map((row) => row.length)),
      rows,
      styleInspection: styleInspection.ndjson,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({
  targetSheetName,
  usedRowCount: usedValues.length,
  usedColumnCount: Math.max(...usedValues.map((row) => row.length)),
  outputDir,
}, null, 2));
