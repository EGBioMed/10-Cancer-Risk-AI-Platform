const { hashToken, normalizeCode } = require("../lib/access-gate");
const { argument, createAccessGateRepository } = require("./cli-helpers");

const USAGE = "Usage: node scripts/topup-access-code.js --code <string> --add-uses <n> "
  + "--created-by <name> [--confirm-remote-host]";

async function main() {
  const rawCode = argument("--code");
  const createdBy = argument("--created-by");
  const addUsesArg = argument("--add-uses");
  if (!rawCode || !createdBy || !addUsesArg) {
    throw new Error(USAGE);
  }

  const addUses = Number(addUsesArg);
  if (!Number.isInteger(addUses) || addUses <= 0) {
    throw new Error("--add-uses must be a positive integer.");
  }

  const normalized = normalizeCode(rawCode);
  if (!normalized) {
    throw new Error("--code failed normalization. Check it matches the code exactly as issued.");
  }

  const repository = createAccessGateRepository();
  try {
    await repository.initialize();
    const result = await repository.topUpAccessCode({
      tokenHash: hashToken(normalized),
      addUses,
      actor: createdBy
    });
    if (!result.ok) {
      throw new Error(`Top-up failed: ${result.reason}`);
    }
    console.log(`Topped up "${normalized}".`);
    console.log(`use_count: ${result.useCount}`);
    console.log(`max_uses: ${result.maxUses}`);
    console.log(`remaining: ${result.maxUses - result.useCount}`);
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
