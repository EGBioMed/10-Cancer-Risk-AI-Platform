const fs = require("fs");
const path = require("path");
const { createLocalRepository } = require("../lib/local-repository");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function safeCell(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, records) {
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const lines = [columns.map(safeCell).join(",")];
  for (const record of records) {
    lines.push(columns.map((column) => safeCell(record[column])).join(","));
  }
  fs.writeFileSync(filePath, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

const dataset = argument("--dataset");
const output = argument("--output");
if (!['research', 'contacts'].includes(dataset) || !output) {
  throw new Error("Usage: node scripts/export-local-data.js --dataset research|contacts --output <file.csv>");
}

const repository = createLocalRepository({
  dataDir: process.env.LOCAL_DATA_DIR,
  encryptionKey: process.env.LOCAL_DATA_ENCRYPTION_KEY
});
try {
  const records = dataset === "research"
    ? repository.listResearchRecords().map(({ record_id, payload }) => ({
      record_id,
      ...payload.excel_row,
      submitted_at: payload.submitted_at,
      language: payload.language,
      report_language: payload.report_language
    }))
    : repository.listContactRecords().map(({ record_id, payload }) => ({ record_id, ...payload }));
  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeCsv(outputPath, records);
  console.log(`${records.length} records exported to ${outputPath}`);
} finally {
  repository.close();
}
