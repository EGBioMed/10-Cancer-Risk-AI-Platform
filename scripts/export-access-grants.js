const fs = require("fs");
const path = require("path");
const { createPostgresRepository } = require("../lib/postgres-repository");
const { hashToken, normalizeCode } = require("../lib/access-gate");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

// One-off migration helper: exports specific named grants (by their raw
// code, exactly as issued) from Postgres so they can be reviewed and then
// imported into Azure MySQL. Deliberately code-scoped rather than a full
// table dump -- keeps a human in the loop over exactly which real grants
// move, rather than exporting everything indiscriminately.
async function main() {
  const codesArg = argument("--codes");
  const output = argument("--output");
  if (!codesArg || !output) {
    throw new Error(
      "Usage: node scripts/export-access-grants.js --codes <code1,code2,...> --output <file.json>"
    );
  }

  const rawCodes = codesArg.split(",").map((code) => code.trim()).filter(Boolean);
  const repository = createPostgresRepository({ requireAccessGateSchema: true });

  try {
    await repository.initialize();

    const grants = [];
    for (const rawCode of rawCodes) {
      const normalized = normalizeCode(rawCode);
      if (!normalized) {
        console.error(`Skipping "${rawCode}": failed normalization.`);
        continue;
      }

      const tokenHash = hashToken(normalized);
      const grant = await repository.getAccessGrantStatus({ tokenHash });
      if (!grant) {
        console.error(`No grant found for "${rawCode}".`);
        continue;
      }

      grants.push({ ...grant, token_hash: tokenHash });
    }

    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ grants }, null, 2), "utf8");
    console.log(`${grants.length} of ${rawCodes.length} requested grant(s) exported to ${outputPath}`);
    console.log("Review this file before importing it into Azure MySQL.");
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
