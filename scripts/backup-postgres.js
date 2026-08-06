const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const backupRoot = path.resolve(process.env.LOCAL_BACKUP_DIR || path.join(__dirname, "..", "local-backups"));
const retentionDays = Number(process.env.LOCAL_BACKUP_RETENTION_DAYS || 30);
const pgDump = process.env.PG_DUMP_PATH || "pg_dump";

if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error("LOCAL_BACKUP_RETENTION_DAYS must be an integer between 1 and 3650.");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function pruneOldBackups() {
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
    const target = path.resolve(backupRoot, entry.name);
    if (path.dirname(target) !== backupRoot) continue;
    if (fs.statSync(target).mtimeMs < cutoff) fs.rmSync(target, { recursive: true, force: false });
  }
}

fs.mkdirSync(backupRoot, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupRoot, `backup-${stamp}`);
fs.mkdirSync(destination, { recursive: false });
const dumpPath = path.join(destination, "cancer_risk.dump");
const result = spawnSync(pgDump, ["--format=custom", "--no-password", "--file", dumpPath], {
  stdio: "inherit",
  env: process.env
});
if (result.error || result.status !== 0) {
  fs.rmSync(destination, { recursive: true, force: true });
  throw result.error || new Error(`pg_dump exited with status ${result.status}.`);
}
const manifest = {
  created_at: new Date().toISOString(),
  database: process.env.PGDATABASE || "",
  host: process.env.PGHOST || "localhost",
  encrypted: false,
  format: "PostgreSQL custom dump",
  files: { "cancer_risk.dump": sha256(dumpPath) }
};
fs.writeFileSync(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
pruneOldBackups();
console.log(destination);
