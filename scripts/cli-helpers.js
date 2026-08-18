const { createPostgresRepository } = require("../lib/postgres-repository");
const { createAzureAccessGateClient } = require("../lib/azure-access-gate-client");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

// Shared safety guard: refuses to run a script against a non-loopback
// PGHOST unless the caller explicitly confirms. Extracted here (rather than
// duplicated per script) because drift in this specific check has real
// consequences -- writing to the wrong database. Only meaningful for the
// Postgres backend -- Azure MySQL is a single private instance reached by
// API key, so there's no "wrong host" to guard against; the real risk
// there is the opposite one (no harmless local instance to default to), and
// is addressed by never putting the production key in a local .env, not by
// a host check.
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

// Picks the access-gate backend the same way server.js does (ACCESS_GATE_BACKEND,
// default "postgres"), so these CLI tools always operate against whichever
// backend is currently live. skipRemoteHostGuard lets read-only scripts
// (access-code-status.js) opt out of the Postgres-only guard above, exactly
// as they did before this backend became selectable.
function createAccessGateRepository({ skipRemoteHostGuard = false } = {}) {
  const backend = String(process.env.ACCESS_GATE_BACKEND || "postgres").toLowerCase();
  if (backend === "azure_mysql") {
    return createAzureAccessGateClient();
  }
  if (!skipRemoteHostGuard) {
    guardAgainstAccidentalRemoteHost();
  }
  return createPostgresRepository({ requireAccessGateSchema: true });
}

module.exports = { argument, guardAgainstAccidentalRemoteHost, createAccessGateRepository };
