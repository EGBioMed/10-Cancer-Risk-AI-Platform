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

// The free email is the paid email with one addition: this call to action,
// placed immediately before the disclaimer.
//
// It used to also remove the model validation summary. On 2026-09-21 that
// block came out of the paid email as well, so there is nothing left to
// remove -- no email in this family carries it now, and the validation data
// lives only in the PDF, which both paying lines receive.
//
// Building the free email from the paid one rather than keeping a second
// copy by hand is deliberate. Everything the two share -- the score, the
// band explainer, the full cancer ranking, the recommendation, the
// disclaimer -- then cannot drift apart, and an edit to the paid email
// reaches the free one by re-running this script.
//
// What the paid PDF still holds that this email does not (FREEMIUM_SPEC.md
// 1.1, revised 2026-09-17): the rule hits with their basis, the screening
// guidance, the validation data, and the PDF itself. The call to action must
// promise only those. Listing the ten-cancer ranking as a paid benefit would
// be selling the reader something they were handed further up the same
// email.
// Where the contents box goes: immediately above the score card, which is
// the first thing after the greeting. Anchored on that card's own style
// rather than on a character offset, and the style is checked to appear
// exactly once before anything is inserted.
const SCORE_CARD_OPENER =
  '<div style="border:1px solid #cfe0dc;border-radius:16px;padding:22px 24px;background:#f9fcfb;margin-bottom:22px;">';

// Deliberately not links. In-page anchors are unreliable across mail
// clients -- Gmail strips id attributes, and several clients open the mail
// in a pane where a fragment jump does nothing -- so a linked contents list
// would look broken for a large share of readers. This is a list of what
// the reader is about to get, which is what was asked for; it is not
// navigation.
//
// The conditional product recommendation is left out on purpose. It appears
// for some readers and not others, and a contents entry for a section that
// is not there reads as a fault in the email.
const LANGS = {
  zh: {
    source: "power-automate-email-zh.html",
    output: "power-automate-email-free-zh.html",
    disclaimerMarker: "報告使用說明",
    toc: `<div style="border:1px solid #dce8e5;border-radius:14px;background:#ffffff;padding:18px 20px;margin-bottom:22px;">
          <div style="font-size:13px;font-weight:800;color:#0f766e;letter-spacing:.02em;margin-bottom:10px;">本信件包含</div>
          <ol style="margin:0;padding-left:20px;font-size:14px;line-height:2.1;color:#40514f;">
            <li>您的十大癌症相對風險指數與分級</li>
            <li>各癌種風險因子的相對關注順序</li>
            <li><span style="background:#eef7f5;color:#0f766e;font-weight:800;padding:2px 7px;border-radius:6px;">取得您的個人化完整報告（50~70 頁）</span></li>
          </ol>
        </div>

        `,
    cta: `<div style="border:2px solid #0f766e;border-radius:16px;background:#f9fcfb;padding:26px 24px;margin-bottom:26px;">
          <div style="font-size:20px;font-weight:800;color:#12312d;line-height:1.5;margin-bottom:14px;">想更完整了解自己的癌症風險？</div>
          <div style="margin:0 0 16px;">
            <span style="display:inline-block;background:#0f766e;color:#ffffff;font-size:19px;font-weight:800;padding:7px 16px;border-radius:999px;">US$10</span>
            <span style="display:inline-block;margin-left:10px;font-size:15px;font-weight:700;color:#0f766e;line-height:2.1;">50~70 頁的完整報告</span>
          </div>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.9;color:#40514f;">只需 <strong style="color:#12312d;">US$10</strong>，即可取得一份 <strong style="color:#12312d;">50~70 頁</strong>的完整個人化 AI 癌症風險評估報告。報告結合 AI 模型與醫學文獻實證規則，依據您的健康史、生活型態與症狀等資訊，分析整體與各癌別風險，找出值得優先關注的癌症、重要風險因子與症狀警訊，並提供後續追蹤與健康管理方向，同時附有可供醫療專業人員快速參考的重點摘要與科學文獻依據。只需 US$10，換來一份更完整的健康風險全貌，以及更清楚的下一步。</p>
          <a href="https://mdi.eg-bio.com/?add-to-cart=${REPORT_PRODUCT_ID}&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:15px 32px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">立即取得完整報告</a>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">此連結僅對應您本次的評估結果，請勿轉寄他人。連結有效期限為 30 天。</p>
        </div>

        `
  },
  en: {
    source: "power-automate-email-en.html",
    output: "power-automate-email-free-en.html",
    disclaimerMarker: "How to use this report",
    toc: `<div style="border:1px solid #dce8e5;border-radius:14px;background:#ffffff;padding:18px 20px;margin-bottom:22px;">
          <div style="font-size:13px;font-weight:800;color:#0f766e;letter-spacing:.02em;margin-bottom:10px;">What this email contains</div>
          <ol style="margin:0;padding-left:20px;font-size:14px;line-height:2.1;color:#40514f;">
            <li>Your relative risk index and level across ten cancers</li>
            <li>The relative order of attention across cancer types</li>
            <li><span style="background:#eef7f5;color:#0f766e;font-weight:800;padding:2px 7px;border-radius:6px;">Your personalised complete report (50&ndash;70 pages)</span></li>
          </ol>
        </div>

        `,
    cta: `<div style="border:2px solid #0f766e;border-radius:16px;background:#f9fcfb;padding:26px 24px;margin-bottom:26px;">
          <div style="font-size:20px;font-weight:800;color:#12312d;line-height:1.45;margin-bottom:14px;">Want a deeper understanding of your personal cancer risk?</div>
          <div style="margin:0 0 16px;">
            <span style="display:inline-block;background:#0f766e;color:#ffffff;font-size:19px;font-weight:800;padding:7px 16px;border-radius:999px;">US$10</span>
            <span style="display:inline-block;margin-left:10px;font-size:15px;font-weight:700;color:#0f766e;line-height:2.1;">50&ndash;70 pages</span>
          </div>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.9;color:#40514f;">For just <strong style="color:#12312d;">US$10</strong>, you can access a comprehensive Personalized AI Cancer Risk Assessment Report of <strong style="color:#12312d;">50&ndash;70 pages</strong>. By combining AI-based risk modeling with evidence from medical literature, the report evaluates your overall and cancer-specific risks based on your health history, lifestyle, and symptoms. It highlights the cancers that may deserve greater attention, identifies key personal risk factors and symptom alerts, and provides clear guidance for follow-up and health management. A concise summary for healthcare professionals and supporting scientific references are also included. For just US$10, gain a more complete picture of your health risks&mdash;and greater clarity on what to consider next.</p>
          <a href="https://mdi.eg-bio.com/?add-to-cart=${REPORT_PRODUCT_ID}&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:15px 32px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Access your full report</a>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">This link corresponds only to your own assessment. Please do not forward it. It expires after 30 days.</p>
        </div>

        `
  }
};

const DISCLAIMER_BLOCK_OPENER = '<div style="background:#f4f7f6;border:1px solid #dce6e3;';
// Where the score card ends and the interpretive content begins.
const RECOMMENDATION_BLOCK_OPENER = '<div style="border-left:5px solid #0f766e;';

for (const [lang, cfg] of Object.entries(LANGS)) {
  const src = fs.readFileSync(path.join(root, cfg.source), "utf8");

  // The free email used to be "the paid email minus the validation block,
  // plus this one". Since 2026-09-21 the paid email does not carry that
  // block either, so nothing is cut: the call to action simply goes in
  // where the block used to sit, immediately before the disclaimer.
  //
  // The insertion point is still anchored on the disclaimer's OUTER div
  // rather than counted from the end. That div's style is distinctive, and
  // anchoring on structure is what keeps the output a balanced document
  // when the paid email is edited above it.
  const at = src.lastIndexOf(DISCLAIMER_BLOCK_OPENER);
  if (at < 0) throw new Error(`${lang}: disclaimer block not found`);

  // Guards against the anchor matching something else that happens to share
  // the style: the disclaimer's own heading has to be just after it.
  if (src.indexOf(cfg.disclaimerMarker, at) < 0) {
    throw new Error(`${lang}: the disclaimer anchor does not lead to the disclaimer`);
  }

  // The contents box goes above the score card, so it is the first thing
  // read after the greeting. Inserted from the back forwards -- disclaimer
  // first, then this -- so the earlier offset is still valid when it is
  // used. Doing it the other way round shifts `at` and puts the call to
  // action somewhere inside the disclaimer.
  const tocAt = src.indexOf(SCORE_CARD_OPENER);
  if (tocAt < 0) throw new Error(`${lang}: score card not found`);
  if (src.indexOf(SCORE_CARD_OPENER, tocAt + 1) >= 0) {
    throw new Error(`${lang}: the score card's style is no longer unique; pick another anchor`);
  }
  if (tocAt >= at) throw new Error(`${lang}: the score card is below the disclaimer`);

  // split/join rather than a regex: the action name goes in verbatim, with
  // no chance of a character in it being read as a pattern.
  // The recommendation goes after the payment call to action and before the
  // disclaimer. Order matters commercially: the report is what this email is
  // selling, and a test the reader may not be able to order must not sit
  // above it.
  const withCta = src.slice(0, at) + cfg.cta + src.slice(at);
  const out = (withCta.slice(0, tocAt) + cfg.toc + withCta.slice(tocAt))
    .split("body('HTTP')")
    .join(`body('${PREDICT_ACTION}')`);
  // 檢測產品推薦不必在這裡處理：2026-09-22 的決定是三封信都放，所以付費信這個
  // 源頭本身就讀 ['cancer_risks_text_with_recommendations']，免費信與交付信照樣
  // 繼承。曾經有一版只在免費信替換，那是規格原本把機構信與交付信排除在外的緣故。

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
