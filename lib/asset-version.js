const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// index.html 用 `app.js?v=...` 做快取破壞，而靜態檔是以 `public, max-age=3600`
// 送出的，所以那串 v= 就是瀏覽器判斷「要不要重新下載」的唯一依據。
// 過去它是手寫的字串（app.js 最後一次是 2026-08-26、answer-codes.js 是
// 2026-08-05），沒有任何機制提醒開發者跟著改。2026-09-07 的後果：country 的修正
// 推上線後程式碼是對的，但受檢者的瀏覽器仍拿著網址一模一樣的舊 app.js，於是
// 「送出資料格式驗證失敗」又出現了一輪，而且要等快取一小時到期才會自己好。
//
// 因此版本字串改成由檔案內容的雜湊算出來：檔案一改，網址就一定改，沒有人需要記得
// 手動改，也不可能忘記。index.html 本身是 no-store，所以永遠拿得到新的 v=。
// answer-codes.js 一併納管，它同樣會隨問卷改版而變，並且直接決定送出的答案碼。
// api-symptoms.js 一併納管：它決定送給 API 的症狀區塊，舊快取會讓規則層繼續全暗。
// 對話版（chat.html）的四支一併納管。它們決定一句話怎麼對應到選項、什麼可以寫進
// 答案庫、以及什麼時候放棄重問——全都是會隨問卷改版而變、而且錯了不會報錯的東西。
// 漏掉它們的後果就是上面那一段：修好推上線，使用者的瀏覽器照舊拿一小時前的版本。
const VERSIONED_SCRIPTS = [
  "app.js",
  "answer-codes.js",
  "api-symptoms.js",
  "answer-intake.js",
  "answer-resolver.js",
  "chat-session.js",
  "chat.js"
];

// 樣式表 2026-11-11 才納管，而漏掉它的後果跟上面那一段一字不差。當天上線的夥伴
// 聯名功能同時改了 index.html 和 styles.css，但 styles.css 的版本字串是手寫的
// `?v=20260724-diet-frequency-v2`、沒跟著改，於是每一個手上還有快取的瀏覽器都拿到
// 「新的 HTML 配舊的 CSS」：新標記進了頁面，負責把 logo 縮到 26px 的規則卻沒跟上，
// 兩張 2048px 的圖把整個版面擠爛，而且要等快取一小時到期才會自己好。
//
// 版面比腳本更容易漏，因為改 CSS 的人通常不覺得自己動到了「要清快取」的東西。
const VERSIONED_STYLESHEETS = ["styles.css"];

function computeAssetVersion(source) {
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
}

// HTML 用 src 載腳本、用 href 載樣式表，所以同一條規則套不了兩邊。
// (?<![\w/-]) 擋掉 vendor/app.js 或 my-app.js 之類的相近路徑，只換根目錄那一支。
function assetPattern(attribute, fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(\\b${attribute}=")(?<![\\w/-])${escaped}(?:\\?v=[^"]*)?(")`, "g");
}

function replaceWithVersions(html, versions, attribute) {
  return Object.entries(versions).reduce(
    (output, [fileName, version]) =>
      output.replace(assetPattern(attribute, fileName), `$1${fileName}?v=${version}$2`),
    String(html)
  );
}

function withVersionedScripts(html, versions) {
  return replaceWithVersions(html, versions, "src");
}

function withVersionedStylesheets(html, versions) {
  return replaceWithVersions(html, versions, "href");
}

// 快取雜湊：同一個 process 內這些檔案不會變（Render 每次部署都是新 process）。
function createAppAssetVersioner(
  publicDir,
  fileNames = VERSIONED_SCRIPTS,
  styleNames = VERSIONED_STYLESHEETS
) {
  const hashAll = (names) => Object.fromEntries(names.map((fileName) => [
    fileName,
    computeAssetVersion(fs.readFileSync(path.join(publicDir, fileName)))
  ]));

  let cachedScripts = null;
  let cachedStyles = null;
  const versions = () => {
    if (!cachedScripts) cachedScripts = hashAll(fileNames);
    return cachedScripts;
  };
  const styleVersions = () => {
    if (!cachedStyles) cachedStyles = hashAll(styleNames);
    return cachedStyles;
  };

  return {
    versions,
    styleVersions,
    version: (fileName = fileNames[0]) => versions()[fileName],
    applyTo: (html) => withVersionedStylesheets(
      withVersionedScripts(html, versions()),
      styleVersions()
    )
  };
}

module.exports = {
  VERSIONED_SCRIPTS,
  VERSIONED_STYLESHEETS,
  computeAssetVersion,
  withVersionedScripts,
  withVersionedStylesheets,
  createAppAssetVersioner
};
