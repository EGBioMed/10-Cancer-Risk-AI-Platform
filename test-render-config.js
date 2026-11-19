// Keeps render.yaml's envVars list in step with what the code actually reads.
//
// Render's Blueprint sync PRUNES any dashboard variable this file does not
// declare. The value disappears quietly; nothing breaks until the next restart,
// which is why the 2026-09-09 outage (ACCESS_GATE_SESSION_SECRET pruned, site
// down on the following deploy) had hours between cause and effect. By
// 2026-11-17 the list had drifted to 8 declared keys against 20 the code reads,
// INSTITUTION_BRANDING among them -- one sync away from stripping both partner
// entrances of their branding with no error anywhere.
//
// A comment asking people to remember had been there since 2026-09-09 and did
// not hold, so this is a test instead.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Read from the environment but deliberately absent from render.yaml. Each one
// needs a reason; "it is currently unset on Render" is not one, because the
// point of declaring a key is to protect the value it will have later.
const EXCLUDED = new Map([
  [
    "PORT",
    "Render injects it. A Blueprint-owned PORT would be empty, server.js would "
      + "fall back to 3000, and Render would wait on the port it assigned."
  ],
  [
    "HOST",
    "On-premises only; on this service the code derives it from SUBMISSION_MODE."
  ],
  ["PGHOST", "Local backup/export scripts, which run on the on-premises server."],
  ["PGDATABASE", "Local backup/export scripts."],
  ["PG_DUMP_PATH", "Local backup scripts."],
  ["LOCAL_BACKUP_DIR", "Local backup scripts."],
  ["LOCAL_BACKUP_RETENTION_DAYS", "Local backup scripts."]
]);

const SOURCE_DIRS = ["lib", "scripts"];

function collectSourceFiles() {
  const files = [path.join(__dirname, "server.js")];
  for (const dir of SOURCE_DIRS) {
    const full = path.join(__dirname, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith(".js")) files.push(path.join(full, name));
    }
  }
  return files;
}

function readEnvNames() {
  const names = new Map();
  for (const file of collectSourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    // process.env.NAME and process.env["NAME"] / process.env['NAME'].
    const pattern = /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g;
    let match = pattern.exec(text);
    while (match) {
      const name = match[1] || match[2];
      if (!names.has(name)) names.set(name, path.relative(__dirname, file));
      match = pattern.exec(text);
    }
  }
  return names;
}

function readDeclaredKeys() {
  const text = fs.readFileSync(path.join(__dirname, "render.yaml"), "utf8");
  const keys = [];
  for (const line of text.split("\n")) {
    // Only real list entries; a key named inside a `#` comment does not count,
    // which is what keeps the "deliberately NOT declared" block from passing
    // itself off as a declaration.
    const match = /^\s*-\s*key:\s*([A-Z0-9_]+)\s*$/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

test("render.yaml declares every environment variable this service reads", () => {
  const used = readEnvNames();
  const declared = new Set(readDeclaredKeys());

  const missing = [];
  for (const [name, file] of used) {
    if (declared.has(name) || EXCLUDED.has(name)) continue;
    missing.push(`${name} (read in ${file})`);
  }

  assert.deepStrictEqual(
    missing,
    [],
    "Undeclared variables would be pruned by the next Blueprint sync. Add them "
      + `to render.yaml, or to EXCLUDED here with a reason: ${missing.join(", ")}`
  );
});

test("render.yaml has no duplicate keys and none that are also excluded", () => {
  const declared = readDeclaredKeys();
  const seen = new Set();
  const duplicates = declared.filter((key) => {
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  assert.deepStrictEqual(duplicates, []);

  const contradictory = declared.filter((key) => EXCLUDED.has(key));
  assert.deepStrictEqual(
    contradictory,
    [],
    `Declared in render.yaml and listed as deliberately excluded: ${contradictory.join(", ")}`
  );
});

test("every documented exclusion is still a variable the code reads", () => {
  // Stops the exclusion list from outliving the code it describes -- an
  // exclusion nobody can trace back to a read is how the next drift starts.
  const used = readEnvNames();
  const stale = [...EXCLUDED.keys()].filter((key) => !used.has(key));
  assert.deepStrictEqual(
    stale,
    [],
    `No longer read anywhere; remove from EXCLUDED: ${stale.join(", ")}`
  );
});

test("the keys that must survive a sync are declared", () => {
  // Named explicitly rather than left to the scan above, because each of these
  // fails silently: the service keeps serving, just wrongly.
  const declared = new Set(readDeclaredKeys());
  for (const key of [
    "ACCESS_GATE_SESSION_SECRET", // 2026-09-09: pruned, site down next deploy
    "INSTITUTION_BRANDING", // partner entrances render unbranded, no error
    "REPORT_TICKET_SECRET", // every payment link fails a generic ticket check
    "AZURE_ACCESS_GATE_API_KEY" // no gate backend: /api/health drops to 503
  ]) {
    assert.equal(declared.has(key), true, `${key} must be declared in render.yaml`);
  }
});
