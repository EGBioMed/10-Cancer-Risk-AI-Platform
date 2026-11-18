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

// Reads whose name is built from a prefix constant instead of written out:
//
//   const ENV_PREFIX = "SSO_JOIIUP_";
//   const keys = readKeys(env[`${ENV_PREFIX}KEYS`], problems);
//
// lib/sso-entrance.js names all eight of its variables this way, so the literal
// scan below saw none of them: the eight SSO_JOIIUP_* keys were undeclared in
// render.yaml while this file reported all clear. A guard with a hole in it is
// worse than no guard, because people stop checking by hand. Found 2026-11-18,
// the day those variables were first given values.
//
// `env` as well as `process.env`, because the parsing function takes the
// environment as a parameter -- `parseSsoConfig(process.env)` -- and reads it
// under that name.
function readComposedEnvNames(text) {
  const prefixes = new Map();
  const constPattern = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*["']([A-Za-z0-9_]*)["']\s*;/g;
  let declaration = constPattern.exec(text);
  while (declaration) {
    prefixes.set(declaration[1], declaration[2]);
    declaration = constPattern.exec(text);
  }

  const resolved = [];
  const unresolved = [];
  const readPattern = /(?:process\.)?env\[\s*`\$\{([A-Za-z_$][A-Za-z0-9_$]*)\}([A-Z0-9_]+)`\s*\]/g;
  let read = readPattern.exec(text);
  while (read) {
    const prefix = prefixes.get(read[1]);
    if (prefix === undefined) unresolved.push(`\${${read[1]}}${read[2]}`);
    else resolved.push(prefix + read[2]);
    read = readPattern.exec(text);
  }
  return { resolved, unresolved };
}

function readEnvNames() {
  const names = new Map();
  for (const file of collectSourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    const relative = path.relative(__dirname, file);
    // process.env.NAME and process.env["NAME"] / process.env['NAME'].
    const pattern = /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g;
    let match = pattern.exec(text);
    while (match) {
      const name = match[1] || match[2];
      if (!names.has(name)) names.set(name, relative);
      match = pattern.exec(text);
    }
    for (const name of readComposedEnvNames(text).resolved) {
      if (!names.has(name)) names.set(name, relative);
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
    "INTAKE_ENTRANCES", // intake entrances fall back to the questionnaire on sale, no error
    "INTAKE_POWER_AUTOMATE_WEBHOOK_URL", // every intake submission refused
    "REPORT_TICKET_SECRET", // every payment link fails a generic ticket check
    "AZURE_ACCESS_GATE_API_KEY", // no gate backend: /api/health drops to 503
    "SSO_JOIIUP_KEYS", // JoiiUp hand-off stops admitting anyone, no error
    "SSO_JOIIUP_ORG_GRANTS" // same: the entrance reports itself disabled
  ]) {
    assert.equal(declared.has(key), true, `${key} must be declared in render.yaml`);
  }
});

test("every composed environment read resolves to a name", () => {
  // The hole this file had until 2026-11-18 was a read the scan could not see.
  // A read built from a prefix the scan cannot resolve is the same hole again:
  // it contributes no name, so the key it needs is never checked against
  // render.yaml and nothing reports a problem. Fail loudly instead.
  const unresolved = [];
  for (const file of collectSourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const read of readComposedEnvNames(text).unresolved) {
      unresolved.push(`${path.relative(__dirname, file)}: env[\`${read}\`]`);
    }
  }
  assert.deepStrictEqual(
    unresolved,
    [],
    "A composed environment read whose prefix is not a string constant in the "
      + "same file. The scan cannot name the variable, so render.yaml is not "
      + `checked for it: ${unresolved.join(", ")}`
  );
});
