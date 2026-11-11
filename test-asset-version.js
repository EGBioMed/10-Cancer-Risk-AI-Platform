const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  VERSIONED_SCRIPTS,
  VERSIONED_STYLESHEETS,
  computeAssetVersion,
  withVersionedScripts,
  createAppAssetVersioner
} = require("./lib/asset-version");

// index.html 是 no-store，但 app.js 與 answer-codes.js 是 public, max-age=3600，
// 所以 `?v=...` 這一串是瀏覽器唯一的重新下載依據。它曾經是手寫的常數，2026-09-07
// 就是因此讓一個已經修好並部署的錯誤在線上又活了一小時：程式碼對了，瀏覽器卻還在
// 跑舊檔。下面的測試把「版本字串必須來自檔案內容」釘死。

// 兩個頁面都要查，因為它們載入的腳本不同。chat.html 帶的是對話版那四支，而只查
// index.html 正是它們被以字面上的 `?v=local` 送出、整整快取一小時的原因——上面那
// 段事故在對話頁上原地重演了一次，才把這條測試擴大。
const SERVED_PAGES = ["index.html", "chat.html"];

test("every served page asks for its cached scripts with their current content hash", () => {
  const versioner = createAppAssetVersioner(__dirname);
  const referenced = new Set();

  for (const page of SERVED_PAGES) {
    const source = fs.readFileSync(path.join(__dirname, page), "utf8");
    const rewritten = versioner.applyTo(source);

    for (const fileName of VERSIONED_SCRIPTS) {
      if (!new RegExp(`src="${fileName.replace(".", "\\.")}(\\?|")`).test(source)) continue;
      referenced.add(fileName);
      const expected = computeAssetVersion(fs.readFileSync(path.join(__dirname, fileName)));
      assert.equal(versioner.versions()[fileName], expected);
      assert(
        rewritten.includes(`src="${fileName}?v=${expected}"`),
        `${page} must request ${fileName} with its content hash`
      );
    }

    // 送出去的頁面不得留下任何手寫的版本字串：那正是雜湊取代掉的狀態，剩一個就
    // 足以把一支舊檔釘在使用者的瀏覽器裡。
    assert.doesNotMatch(
      rewritten,
      /src="[^"]+\?v=local"/,
      `${page} still serves a script with a literal ?v=local`
    );
  }

  assert.deepEqual(Object.keys(versioner.versions()), [...VERSIONED_SCRIPTS]);
  // 清單上有、卻沒有任何頁面載入的腳本，不是清單過期就是頁面漏載。兩種都該知道。
  for (const fileName of VERSIONED_SCRIPTS) {
    assert(referenced.has(fileName), `${fileName} is versioned but no served page loads it`);
  }
});

// 2026-11-11 的重演，這次是樣式表。夥伴聯名的標記進了 index.html，把 logo 縮到
// 26px 的規則進了 styles.css，但 styles.css 仍帶著手寫的
// `?v=20260724-diet-frequency-v2`。瀏覽器拿到新 HTML、配一小時前的 CSS，於是兩張
// 2048px 的 logo 把版面整個擠爛——程式是對的，使用者看到的是壞的。
test("every served page asks for its stylesheet with its current content hash", () => {
  const versioner = createAppAssetVersioner(__dirname);

  for (const page of SERVED_PAGES) {
    const source = fs.readFileSync(path.join(__dirname, page), "utf8");
    const rewritten = versioner.applyTo(source);

    for (const fileName of VERSIONED_STYLESHEETS) {
      if (!new RegExp(`href="${fileName.replace(".", "\\.")}(\\?|")`).test(source)) continue;
      const expected = computeAssetVersion(fs.readFileSync(path.join(__dirname, fileName)));
      assert.equal(versioner.styleVersions()[fileName], expected);
      assert(
        rewritten.includes(`href="${fileName}?v=${expected}"`),
        `${page} must request ${fileName} with its content hash`
      );
    }

    // 手寫的字串一個都不準留下。chat.html 送的是 `?v=local`，index.html 送的是一個
    // 2026-07 的日期——兩個都永遠不會變，所以兩個都會把舊 CSS 釘在瀏覽器裡。
    assert.match(
      rewritten,
      /href="styles\.css\?v=[0-9a-f]{12}"/,
      `${page} must serve styles.css with a content hash, not a hand-written token`
    );
    for (const stale of ["?v=local", "?v=20260724-diet-frequency-v2"]) {
      assert.equal(
        rewritten.includes(`styles.css${stale}`),
        false,
        `${page} still serves styles.css${stale}`
      );
    }
  }

  // 每一個被納管的樣式表都要真的有頁面載入它，否則不是清單過期就是頁面漏載。
  const loaded = SERVED_PAGES.map((page) => fs.readFileSync(path.join(__dirname, page), "utf8")).join("");
  for (const fileName of VERSIONED_STYLESHEETS) {
    assert(loaded.includes(`href="${fileName}`), `${fileName} is versioned but no served page loads it`);
  }
});

test("a stylesheet rewrite does not disturb the scripts, or vice versa", () => {
  const versioner = createAppAssetVersioner(__dirname);
  const html = '<link rel="stylesheet" href="styles.css?v=old" /><script src="app.js?v=old"></script>';
  const rewritten = versioner.applyTo(html);

  assert.match(rewritten, /href="styles\.css\?v=[0-9a-f]{12}"/);
  assert.match(rewritten, /src="app\.js\?v=[0-9a-f]{12}"/);
  assert.equal(rewritten.includes("?v=old"), false);
  // href 的規則不得碰到 src 的檔案，反之亦然。
  assert.equal(rewritten.includes('href="app.js'), false);
  assert.equal(rewritten.includes('src="styles.css'), false);
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
