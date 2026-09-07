const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  VERSIONED_SCRIPTS,
  computeAssetVersion,
  withVersionedScripts,
  createAppAssetVersioner
} = require("./lib/asset-version");

// index.html 是 no-store，但 app.js 與 answer-codes.js 是 public, max-age=3600，
// 所以 `?v=...` 這一串是瀏覽器唯一的重新下載依據。它曾經是手寫的常數，2026-09-07
// 就是因此讓一個已經修好並部署的錯誤在線上又活了一小時：程式碼對了，瀏覽器卻還在
// 跑舊檔。下面的測試把「版本字串必須來自檔案內容」釘死。

test("the served HTML asks for every cached script with its current content hash", () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const versioner = createAppAssetVersioner(__dirname);
  const rewritten = versioner.applyTo(indexHtml);

  for (const fileName of VERSIONED_SCRIPTS) {
    const expected = computeAssetVersion(fs.readFileSync(path.join(__dirname, fileName)));
    assert.equal(versioner.versions()[fileName], expected);
    assert(
      rewritten.includes(`src="${fileName}?v=${expected}"`),
      `${fileName} must be requested with its content hash`
    );
  }
  assert.deepEqual(Object.keys(versioner.versions()), [...VERSIONED_SCRIPTS]);
});

test("a changed file necessarily changes the URL the browser requests", () => {
  const before = computeAssetVersion('const AI_API_REPORT_ONLY_FIELDS = [];');
  const after = computeAssetVersion('const AI_API_REPORT_ONLY_FIELDS = ["country"];');
  assert.notEqual(before, after);
  const html = '<script src="app.js"></script>';
  assert.notEqual(
    withVersionedScripts(html, { "app.js": before }),
    withVersionedScripts(html, { "app.js": after })
  );
});

test("an existing hand-written v= token is replaced, not appended", () => {
  // 舊的 index.html 帶著 ?v=20260826-participant-name，替換後不能留下殘骸。
  const html = [
    '<script src="answer-codes.js?v=20260805-answer-codes-v1"></script>',
    '<script src="app.js?v=20260826-participant-name"></script>'
  ].join("\n");
  const rewritten = withVersionedScripts(html, { "app.js": "abc123abc123", "answer-codes.js": "def456def456" });
  assert.equal(rewritten, [
    '<script src="answer-codes.js?v=def456def456"></script>',
    '<script src="app.js?v=abc123abc123"></script>'
  ].join("\n"));
  assert(!rewritten.includes("20260826"));
  assert(!rewritten.includes("20260805"));
});

test("only the top-level scripts are rewritten", () => {
  const html = [
    '<link rel="stylesheet" href="styles.css?v=keep-me">',
    '<script src="app.js?v=old"></script>',
    '<script src="vendor/app.js"></script>',
    '<script src="legacy-app.js"></script>'
  ].join("\n");
  const rewritten = withVersionedScripts(html, { "app.js": "deadbeefcafe" });
  assert(rewritten.includes('href="styles.css?v=keep-me"'));
  assert(rewritten.includes('src="app.js?v=deadbeefcafe"'));
  assert(rewritten.includes('src="vendor/app.js"'));
  assert(rewritten.includes('src="legacy-app.js"'));
});
