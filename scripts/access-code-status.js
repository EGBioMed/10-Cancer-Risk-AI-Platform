const { hashToken, normalizeCode } = require("../lib/access-gate");
const { argument, createAccessGateRepository } = require("./cli-helpers");

const USAGE = "Usage: node scripts/access-code-status.js --code <string>";

async function main() {
  const rawCode = argument("--code");
  if (!rawCode) {
    throw new Error(USAGE);
  }

  const normalized = normalizeCode(rawCode);
  if (!normalized) {
    throw new Error("--code failed normalization. Check it matches the code exactly as issued.");
  }

  // Read-only: skips the remote-host guard (Postgres backend only). That
  // guard exists to prevent accidental WRITES to the wrong database; a
  // mistaken read here has no destructive consequence.
  const repository = createAccessGateRepository({ skipRemoteHostGuard: true });
  try {
    await repository.initialize();
    const grant = await repository.getAccessGrantStatus({ tokenHash: hashToken(normalized) });
    if (!grant) {
      console.log(`No grant found for "${normalized}".`);
      return;
    }
    console.log(`code: ${grant.code}`);
    console.log(`credential_type: ${grant.credential_type}`);
    console.log(`status: ${grant.status}`);
    console.log(`max_uses: ${grant.max_uses}`);
    console.log(`use_count: ${grant.use_count}`);
    console.log(`remaining: ${grant.max_uses - grant.use_count}`);
    console.log(`issued_at: ${grant.issued_at}`);
    console.log(`expires_at: ${grant.expires_at || "never"}`);
    console.log(`created_by: ${grant.created_by}`);
    console.log(`payment_reference: ${grant.payment_reference || "-"}`);
    console.log(`notes: ${grant.notes || "-"}`);
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
