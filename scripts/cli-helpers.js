function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

// Shared safety guard: refuses to run a script against a non-loopback
// PGHOST unless the caller explicitly confirms. Extracted here (rather than
// duplicated per script) because drift in this specific check has real
// consequences -- writing to the wrong database.
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

module.exports = { argument, guardAgainstAccidentalRemoteHost };
