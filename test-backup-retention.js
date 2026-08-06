const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pruneOldBackups } = require("./lib/backup-retention");

test("backup retention follows manifest time when OneDrive rewrites directory timestamps", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eg-backup-retention-"));
  try {
    const expired = path.join(root, "backup-expired");
    const recent = path.join(root, "backup-recent");
    const unrelated = path.join(root, "notes");
    fs.mkdirSync(expired);
    fs.mkdirSync(recent);
    fs.mkdirSync(unrelated);
    fs.writeFileSync(
      path.join(expired, "manifest.json"),
      `\uFEFF${JSON.stringify({ created_at: "2026-06-01T00:00:00.000Z" })}`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(recent, "manifest.json"),
      JSON.stringify({ created_at: "2026-08-05T00:00:00.000Z" }),
      "utf8"
    );

    pruneOldBackups(root, 30, Date.parse("2026-08-06T00:00:00.000Z"));

    assert.equal(fs.existsSync(expired), false);
    assert.equal(fs.existsSync(recent), true);
    assert.equal(fs.existsSync(unrelated), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
