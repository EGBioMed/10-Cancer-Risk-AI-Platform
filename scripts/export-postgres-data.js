const fs = require("fs");
const path = require("path");
const { createPostgresRepository } = require("../lib/postgres-repository");

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
  for (const record of records) lines.push(columns.map((column) => safeCell(record[column])).join(","));
  fs.writeFileSync(filePath, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

async function main() {
  const dataset = argument("--dataset");
  const output = argument("--output");
  if (!["research", "contacts"].includes(dataset) || !output) {
    throw new Error("Usage: node scripts/export-postgres-data.js --dataset research|contacts --output <file.csv>");
  }
  const repository = createPostgresRepository();
  try {
    await repository.initialize();
    const records = dataset === "research"
      ? (await repository.listResearchRecords()).map(({ record_id, payload }) => ({
        record_id,
        ...payload.excel_row,
        submitted_at: payload.submitted_at,
        language: payload.language,
        report_language: payload.report_language
      }))
      : await repository.listContactRecords();
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    writeCsv(outputPath, records);
    console.log(`${records.length} records exported to ${outputPath}`);
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
