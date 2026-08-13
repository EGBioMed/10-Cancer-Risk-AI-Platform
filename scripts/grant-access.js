const { createPostgresRepository } = require("../lib/postgres-repository");
const { generateRawToken, hashToken } = require("../lib/access-gate");

const USAGE = "Usage: node scripts/grant-access.js --created-by <name> "
  + "[--provider <name>] [--reference <text>] [--notes <text>] "
  + "[--ttl-hours <n>] [--max-uses <n>] [--confirm-remote-host]";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function guardAgainstAccidentalRemoteHost() {
  const pgHost = process.env.PGHOST || "127.0.0.1";
  const isLocal = pgHost === "127.0.0.1" || pgHost === "localhost";
  const confirmed = process.argv.includes("--confirm-remote-host");
  if (!isLocal && !confirmed) {
    throw new Error(
      `Refusing to write to non-local PGHOST '${pgHost}' without --confirm-remote-host.`
    );
  }
}

async function main() {
  const createdBy = argument("--created-by");
  if (!createdBy) {
    throw new Error(USAGE);
  }

  const provider = argument("--provider") || "manual";
  const reference = argument("--reference") || null;
  const notes = argument("--notes") || null;
  const ttlHours = Number(argument("--ttl-hours") || 1);
  const maxUses = Number(argument("--max-uses") || 1);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error("--ttl-hours must be a positive number.");
  }
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    throw new Error("--max-uses must be a positive integer.");
  }

  guardAgainstAccidentalRemoteHost();

  const publicBaseUrl = process.env.PUBLIC_BASE_URL || "";
  if (!publicBaseUrl) {
    console.error("Warning: PUBLIC_BASE_URL is not set. Printing a path-only link.");
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const repository = createPostgresRepository({ requireAccessGateSchema: true });
  try {
    await repository.initialize();
    const grant = await repository.createAccessGrant({
      tokenHash,
      paymentProvider: provider,
      paymentReference: reference,
      createdBy,
      notes,
      expiresAt,
      maxUses
    });

    console.log("Access link created. This is the only time the raw token is shown:");
    console.log(`${publicBaseUrl}/access/${rawToken}`);
    console.log(`grant_id: ${grant.grantId}`);
    console.log(`expires_at: ${grant.expiresAt}`);
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
