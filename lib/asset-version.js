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
const VERSIONED_SCRIPTS = ["app.js", "answer-codes.js", "api-symptoms.js"];

function computeAssetVersion(source) {
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function scriptPattern(fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?<![\w/-]) 擋掉 vendor/app.js 或 my-app.js 之類的相近路徑，只換根目錄那一支。
  return new RegExp(`(\\bsrc=")(?<![\\w/-])${escaped}(?:\\?v=[^"]*)?(")`, "g");
}

function withVersionedScripts(html, versions) {
  return Object.entries(versions).reduce(
    (output, [fileName, version]) => output.replace(scriptPattern(fileName), `$1${fileName}?v=${version}$2`),
    String(html)
  );
}

// 快取雜湊：同一個 process 內這些檔案不會變（Render 每次部署都是新 process）。
function createAppAssetVersioner(publicDir, fileNames = VERSIONED_SCRIPTS) {
  let cached = null;
  const versions = () => {
    if (!cached) {
      cached = Object.fromEntries(fileNames.map((fileName) => [
        fileName,
        computeAssetVersion(fs.readFileSync(path.join(publicDir, fileName)))
      ]));
    }
    return cached;
  };
  return {
    versions,
    version: (fileName = fileNames[0]) => versions()[fileName],
    applyTo: (html) => withVersionedScripts(html, versions())
  };
}

module.exports = {
  VERSIONED_SCRIPTS,
  computeAssetVersion,
  withVersionedScripts,
  createAppAssetVersioner
};
