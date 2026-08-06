const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync, backup } = require("node:sqlite");

const dataDir = path.resolve(process.env.LOCAL_DATA_DIR || path.join(__dirname, "..", "local-data"));
const backupRoot = path.resolve(process.env.LOCAL_BACKUP_DIR || path.join(__dirname, "..", "local-backups"));
const retentionDays = Number(process.env.LOCAL_BACKUP_RETENTION_DAYS || 30);

if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error("LOCAL_BACKUP_RETENTION_DAYS must be an integer between 1 and 3650.");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function copyDatabase(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Database not found: ${sourcePath}`);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(source, destinationPath);
  } finally {
    source.close();
  }
}

function pruneOldBackups() {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
    const target = path.resolve(backupRoot, entry.name);
    if (path.dirname(target) !== backupRoot) continue;
    if (fs.statSync(target).mtimeMs < cutoff) fs.rmSync(target, { recursive: true, force: false });
  }
}

async function main() {
  fs.mkdirSync(backupRoot, { recursive: true });
  const destination = path.join(backupRoot, `backup-${timestamp()}`);
  fs.mkdirSync(destination, { recursive: false });
  const researchBackup = path.join(destination, "research.sqlite");
  const contactsBackup = path.join(destination, "contacts.sqlite");
  await copyDatabase(path.join(dataDir, "research.sqlite"), researchBackup);
  await copyDatabase(path.join(dataDir, "contacts.sqlite"), contactsBackup);
  const manifest = {
    created_at: new Date().toISOString(),
    source: dataDir,
    encrypted: true,
    files: {
      "research.sqlite": sha256(researchBackup),
      "contacts.sqlite": sha256(contactsBackup)
    }
  };
  fs.writeFileSync(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  pruneOldBackups();
  console.log(destination);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
