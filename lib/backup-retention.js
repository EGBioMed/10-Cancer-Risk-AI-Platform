const fs = require("fs");
const path = require("path");

function backupCreatedAt(target) {
  const manifestPath = path.join(target, "manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
    const createdAt = Date.parse(manifest.created_at);
    if (Number.isFinite(createdAt)) return createdAt;
  } catch {
    // Incomplete or legacy backups fall back to filesystem time.
  }
  return fs.statSync(target).mtimeMs;
}

function pruneOldBackups(backupRoot, retentionDays, now = Date.now()) {
  const cutoff = now - retentionDays * 86400000;
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
    const target = path.resolve(backupRoot, entry.name);
    if (path.dirname(target) !== backupRoot) continue;
    if (backupCreatedAt(target) < cutoff) fs.rmSync(target, { recursive: true, force: false });
  }
}

module.exports = { backupCreatedAt, pruneOldBackups };
