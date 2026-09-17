const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

// The free email is the paid email with two edits: the model validation
// summary comes out, and a call to action goes in where it stood.
//
// Slicing the paid template rather than keeping a second copy by hand is
// deliberate. Everything the two share -- the score, the band explainer, the
// full cancer ranking, the recommendation, the disclaimer -- then cannot
// drift apart, and an edit to the paid email reaches the free one by
// re-running this script.
//
// What the paid PDF still holds that this email does not (FREEMIUM_SPEC.md
// 1.1, revised 2026-09-17): the rule hits with their basis, the screening
// guidance, the validation data, and the PDF itself. The call to action must
// promise only those. Listing the ten-cancer ranking as a paid benefit would
// be selling the reader something they were handed further up the same
// email.
const LANGS = {
  zh: {
    source: "power-automate-email-zh.html",
    output: "power-automate-email-free-zh.html",
    validationMarker: "模型研究與驗證摘要",
    disclaimerMarker: "報告使用說明",
    cta: `<div style="border:2px solid #0f766e;border-radius:16px;background:#f9fcfb;padding:24px;margin-bottom:26px;">
          <div style="font-size:18px;font-weight:800;color:#12312d;margin-bottom:10px;">取得完整 PDF 報告</div>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.8;color:#40514f;">完整報告是一份可下載、可列印、可直接帶給醫師的 PDF，並額外包含：</p>
          <ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.9;color:#40514f;">
            <li>本次評估觸發的高風險規則，以及每一條的判定依據</li>
            <li>依您的年齡、家族史與居住地區整理的篩檢建議</li>
            <li>模型研究與驗證資料的完整說明</li>
          </ul>
          <a href="https://mdi.eg-bio.com/?add-to-cart=REPLACE_WITH_PRODUCT_ID&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">取得完整報告</a>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">此連結僅對應您本次的評估結果，請勿轉寄他人。連結有效期限為 30 天。</p>
        </div>

        `
  },
  en: {
    source: "power-automate-email-en.html",
    output: "power-automate-email-free-en.html",
    validationMarker: "Model Research and Validation Summary",
    disclaimerMarker: "How to use this report",
    cta: `<div style="border:2px solid #0f766e;border-radius:16px;background:#f9fcfb;padding:24px;margin-bottom:26px;">
          <div style="font-size:18px;font-weight:800;color:#12312d;margin-bottom:10px;">Get the complete PDF report</div>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.8;color:#40514f;">The complete report is a PDF you can download, print and take to a physician. It also adds:</p>
          <ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.9;color:#40514f;">
            <li>The high-risk rules this assessment triggered, and what each one is based on</li>
            <li>Screening guidance organised around your age, family history and country of residence</li>
            <li>The full account of the model's research and validation data</li>
          </ul>
          <a href="https://mdi.eg-bio.com/?add-to-cart=REPLACE_WITH_PRODUCT_ID&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Get the complete report</a>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">This link corresponds only to your own assessment. Please do not forward it. It expires after 30 days.</p>
        </div>

        `
  }
};

const VALIDATION_BLOCK_OPENER = '<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;';
const DISCLAIMER_BLOCK_OPENER = '<div style="background:#f4f7f6;border:1px solid #dce6e3;';

for (const [lang, cfg] of Object.entries(LANGS)) {
  const src = fs.readFileSync(path.join(root, cfg.source), "utf8");

  const markerIdx = src.indexOf(cfg.validationMarker);
  if (markerIdx < 0) throw new Error(`${lang}: validation summary heading not found`);

  // The block opens with the div immediately preceding its heading...
  const blockStart = src.lastIndexOf(VALIDATION_BLOCK_OPENER, markerIdx);
  if (blockStart < 0) throw new Error(`${lang}: validation block start not found`);

  // ...and ends where the disclaimer's OUTER div begins. Anchoring on that
  // div's own style rather than on "the nearest <div before the heading" is
  // the difference between a balanced document and one missing an opening
  // tag: the heading sits inside a second, inner div, and searching
  // backwards from it lands on the inner one.
  const disclaimerIdx = src.indexOf(cfg.disclaimerMarker, markerIdx);
  if (disclaimerIdx < 0) throw new Error(`${lang}: disclaimer not found after the validation summary`);
  const blockEnd = src.lastIndexOf(DISCLAIMER_BLOCK_OPENER, disclaimerIdx);
  if (blockEnd <= blockStart) throw new Error(`${lang}: could not bound the validation block`);

  const out = src.slice(0, blockStart) + cfg.cta + src.slice(blockEnd);

  fs.writeFileSync(path.join(root, cfg.output), out);
  console.log(`${cfg.output}: ${out.split("\n").length} lines`);
}
