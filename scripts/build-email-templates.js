const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

// The WooCommerce product the free email's payment link adds to the cart, on
// mdi.eg-bio.com. SKU AI-CANCER-REPORT, published hidden from the catalogue
// because the only supported way in is that link -- the store plugin refuses
// to add it to a cart without a ticket.
//
// Declared once and interpolated into both languages. Two literals would be
// two places for one of them to be wrong, and a wrong id here quietly sells
// the reader a different product: nothing errors, they simply pay for
// something else.
const REPORT_PRODUCT_ID = 1062;

// The /predict action's name, as flow B has it. The paid templates carry
// flow A's name for it -- plain "HTTP" -- and flow A is frozen, so the
// rename happens here on the way out instead of in either flow.
//
// Power Automate resolves these by name and refuses to save an action that
// references one the flow does not have, so a wrong name here is at least
// loud. What makes it worth automating anyway is the count: seven of them in
// the Chinese template and six in the English one, and a hand edit in the
// HTML view is thirteen chances to leave one behind.
//
// If flow B's action is ever renamed, change this line and re-run. Do not
// edit the generated files.
const PREDICT_ACTION = "HTTP_AI_predict";

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
          <a href="https://mdi.eg-bio.com/?add-to-cart=${REPORT_PRODUCT_ID}&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">取得完整報告</a>
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
          <a href="https://mdi.eg-bio.com/?add-to-cart=${REPORT_PRODUCT_ID}&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Get the complete report</a>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">This link corresponds only to your own assessment. Please do not forward it. It expires after 30 days.</p>
        </div>

        `
  }
};

const VALIDATION_BLOCK_OPENER = '<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;';
const DISCLAIMER_BLOCK_OPENER = '<div style="background:#f4f7f6;border:1px solid #dce6e3;';
// Where the score card ends and the interpretive content begins.
const RECOMMENDATION_BLOCK_OPENER = '<div style="border-left:5px solid #0f766e;';

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

  // split/join rather than a regex: the action name goes in verbatim, with
  // no chance of a character in it being read as a pattern.
  const out = (src.slice(0, blockStart) + cfg.cta + src.slice(blockEnd))
    .split("body('HTTP')")
    .join(`body('${PREDICT_ACTION}')`);

  fs.writeFileSync(path.join(root, cfg.output), out);
  console.log(`${cfg.output}: ${out.split("\n").length} lines`);
}

// --- Delivery flow (flow C) ---------------------------------------------
//
// The email that carries the paid report is a covering note, not a second
// copy of the report. Everything substantial is in the attached PDF:
// the ten-cancer ranking, the rule hits, the screening guidance and the
// validation data. Repeating any of it in the body makes the email long and
// technical -- the exact criticism the report itself already drew -- and
// leaves the recipient reading the same thing twice.
//
// So this keeps only what is worth seeing without opening a 2.6 MB
// attachment: who it is for, that the report is attached, the headline
// figures, and the disclaimer.
//
// It is sliced from the paid template rather than written separately, so
// the header, the score card and the disclaimer stay byte-identical to what
// the other emails show. Only the middle is replaced.
//
// The model's output also moves: flow C has no /predict call of its own, so
// every body('HTTP') becomes the stored prediction. That is ten expressions
// per language, and a missed one fails at send time -- after payment.
const STORED = "body('GetStoredResult')?['result']?['prediction_json']";

const DELIVERY = {
  zh: {
    source: "power-automate-email-zh.html",
    output: "power-automate-email-delivery-zh.html",
    titleFrom: "AI 十大癌症健康風險因子整理報告",
    titleTo: "您的完整癌症風險評估報告",
    subtitleFrom: "本報告依據您自行填寫的健康資訊，提供癌症相關風險因子的個人化整理與健康教育資訊。",
    subtitleTo: "您購買的完整報告已附於本信件，以下為結果摘要。",
    introFrom: "感謝您完成本次健康風險因子互動問答。系統已依據您自行填寫的年齡、生活型態、家族史、既往病史及其他健康資訊，運用統計與人工智慧方法，整理出與十大癌症相關的健康風險因子參考資訊。",
    introTo: "感謝您購買完整評估報告。完整內容已以 PDF 附於本信件，可下載、列印，或在就診時提供給醫師參考。",
    middle: `<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;padding:18px 20px;margin-bottom:26px;">
          <div style="font-size:14px;color:#0f766e;font-weight:800;margin-bottom:8px;">附件報告包含</div>
          <ul style="margin:0;padding-left:22px;font-size:15px;line-height:1.9;color:#40514f;">
            <li>十大癌症的完整相對關注排序，以及各癌別的建議篩檢項目</li>
            <li>本次評估觸發的高風險規則，以及每一條的判定依據</li>
            <li>依您的年齡、家族史與居住地區整理的健康管理方向</li>
            <li>模型研究與驗證數據的完整說明</li>
          </ul>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#6b7976;">本信件僅為摘要，詳細內容請以附件報告為準。</p>
        </div>

        `
  },
  en: {
    source: "power-automate-email-en.html",
    output: "power-automate-email-delivery-en.html",
    titleFrom: "AI Cancer Risk Assessment Report",
    titleTo: "Your Complete Cancer Risk Assessment Report",
    subtitleFrom: "This report provides personalized organization of cancer-related risk factors and health education information based on the health information you provided.",
    subtitleTo: "The complete report you purchased is attached to this email. A summary of the results follows.",
    introFrom: "Thank you for completing this interactive health risk factor questionnaire. Based on the age, lifestyle, family history, past medical history, and other health information you provided, the system used statistical and artificial intelligence methods to organize reference information on health risk factors related to ten cancers.",
    introTo: "Thank you for purchasing the complete assessment report. It is attached to this email as a PDF, ready to download, print, or bring to a physician.",
    middle: `<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;padding:18px 20px;margin-bottom:26px;">
          <div style="font-size:14px;color:#0f766e;font-weight:800;margin-bottom:8px;">What the attached report covers</div>
          <ul style="margin:0;padding-left:22px;font-size:15px;line-height:1.9;color:#40514f;">
            <li>The full relative attention ranking across all ten cancer types, with the screening suggested for each</li>
            <li>The high-risk rules this assessment triggered, and what each one is based on</li>
            <li>Health management directions organised around your age, family history and country of residence</li>
            <li>The full account of the model's research and validation data</li>
          </ul>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#6b7976;">This email is a summary only. The attached report is the authoritative version.</p>
        </div>

        `
  }
};

for (const [lang, cfg] of Object.entries(DELIVERY)) {
  const src = fs.readFileSync(path.join(root, cfg.source), "utf8");

  // Keep everything up to the recommendation block: header, greeting,
  // score card. Then the new middle. Then the disclaimer onwards.
  const head = src.indexOf(RECOMMENDATION_BLOCK_OPENER);
  if (head < 0) throw new Error(`${lang}: recommendation block not found`);
  const tail = src.lastIndexOf(DISCLAIMER_BLOCK_OPENER);
  if (tail <= head) throw new Error(`${lang}: could not bound the middle`);

  let out = src.slice(0, head) + cfg.middle + src.slice(tail);

  out = out.replace(cfg.titleFrom, cfg.titleTo);
  out = out.replace(cfg.subtitleFrom, cfg.subtitleTo);
  out = out.replace(cfg.introFrom, cfg.introTo);

  // Flow C has no /predict action; the model's output comes from storage.
  // Both spellings appear -- body('HTTP')['x'] and body('HTTP')?['x'] -- so
  // replace the prefix, then normalise to safe navigation, which makes a
  // field the stored prediction lacks yield null rather than failing the
  // whole send.
  out = out.split("body('HTTP')").join(STORED);
  out = out.split("prediction_json']['").join("prediction_json']?['");

  // triggerBody()?['full_name'] is left alone: flow C's trigger carries it
  // too, from the contact row the purchase endpoint looked up.

  if (out.includes("body('HTTP')")) {
    throw new Error(`${cfg.output}: a body('HTTP') reference survived`);
  }
  for (const [needle, what] of [[cfg.titleFrom, "title"], [cfg.introFrom, "intro"]]) {
    if (out.includes(needle)) throw new Error(`${cfg.output}: the ${what} was not replaced`);
  }

  fs.writeFileSync(path.join(root, cfg.output), out);
  console.log(`${cfg.output}: ${out.split("\n").length} lines`);
}
