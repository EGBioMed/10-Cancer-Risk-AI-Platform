const fs = require("fs");
const path = require("path");

const root = require("path").resolve(__dirname, "..");

// Slice the paid template at these anchors and keep the parts that stay free.
// Slicing rather than retyping means the validation summary -- the longest
// block, and the one whose numbers must not drift -- is preserved byte for
// byte instead of being transcribed by hand.
const LANGS = {
  zh: {
    source: "power-automate-email-zh.html",
    output: "power-automate-email-free-zh.html",
    // end of what we keep from the top
    recommendationStart: '<div style="border-left:5px solid #0f766e;',
    bandExplainerStart: '<h2 style="font-size:19px;line-height:1.4;margin:0 0 14px;color:#172322;">整體相對風險因子等級怎麼看？</h2>',
    perCancerStart: '<h2 style="font-size:19px;line-height:1.4;margin:0 0 14px;color:#172322;">各癌種風險因子參考</h2>',
    validationMarker: "模型研究與驗證摘要",
    titleFrom: "AI 十大癌症健康風險因子整理報告",
    titleTo: "AI 癌症風險評估結果摘要",
    subtitleFrom: "本報告依據您自行填寫的健康資訊，提供癌症相關風險因子的個人化整理與健康教育資訊。",
    subtitleTo: "以下是您本次評估的結果摘要。完整報告包含十大癌症的完整排序、風險規則說明與個人化篩檢建議。",
    topCancerExpr: "@{first(split(coalesce(body('HTTP')?['cancer_risks_text'],''), decodeUriComponent('%0A')))}",
    middle: `<h2 style="font-size:19px;line-height:1.4;margin:0 0 14px;color:#172322;">最值得您留意的癌別</h2>
        <div style="border:1px solid #dce8e5;border-radius:14px;background:#ffffff;padding:18px 20px;margin-bottom:26px;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#5f6f6b;">依據您提供的資料，下列癌別在本次整理中的相對關注順序最前面。</p>
          <div style="font-size:18px;font-weight:800;line-height:1.7;color:#12312d;">__TOP_CANCER__</div>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#6b7976;">排序較前面不代表已經罹病，也不代表其他癌別可以忽略。完整的十大癌別排序與各項說明收錄於完整報告。</p>
        </div>

        <div style="border:2px solid #0f766e;border-radius:16px;background:#f9fcfb;padding:24px;margin-bottom:26px;">
          <div style="font-size:18px;font-weight:800;color:#12312d;margin-bottom:10px;">取得完整評估報告</div>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.8;color:#40514f;">完整報告（PDF）包含以上摘要未涵蓋的內容：</p>
          <ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.9;color:#40514f;">
            <li>十大癌症的完整相對關注排序與各別指數</li>
            <li>本次評估觸發的高風險規則與依據說明</li>
            <li>依您的年齡、家族史與居住地區整理的篩檢建議</li>
          </ul>
          <a href="https://mdi.eg-bio.com/?add-to-cart=REPLACE_WITH_PRODUCT_ID&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">取得完整報告</a>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">此連結僅對應您本次的評估結果，請勿轉寄他人。連結有效期限為 30 天。</p>
        </div>

`
  },
  en: {
    source: "power-automate-email-en.html",
    output: "power-automate-email-free-en.html",
    recommendationStart: '<div style="border-left:5px solid #0f766e;',
    bandExplainerStart: '<h2 style="font-size:19px;line-height:1.4;margin:0 0 14px;color:#172322;">Understanding the overall relative risk factor levels</h2>',
    perCancerStart: '<h2 style="font-size:19px;line-height:1.4;margin:0 0 14px;color:#172322;">Cancer-type risk factor reference</h2>',
    validationMarker: "Model Research and Validation Summary",
    titleFrom: "AI Cancer Risk Assessment Report",
    titleTo: "AI Cancer Risk Assessment Summary",
    subtitleFrom: null,
    subtitleTo: null,
    topCancerExpr: "@{first(split(coalesce(body('HTTP')?['cancer_risks_text_en'],body('HTTP')?['cancer_risks_text'],''), decodeUriComponent('%0A')))}",
    middle: `<h2 style="font-size:19px;line-height:1.4;margin:0 0 14px;color:#172322;">The cancer type most worth your attention</h2>
        <div style="border:1px solid #dce8e5;border-radius:14px;background:#ffffff;padding:18px 20px;margin-bottom:26px;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#5f6f6b;">Based on the information you provided, this cancer type ranks first for relative attention in this assessment.</p>
          <div style="font-size:18px;font-weight:800;line-height:1.7;color:#12312d;">__TOP_CANCER__</div>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#6b7976;">Ranking first does not mean disease is present, and it does not mean the other cancer types can be ignored. The full ranking of all ten, with the notes for each, is in the complete report.</p>
        </div>

        <div style="border:2px solid #0f766e;border-radius:16px;background:#f9fcfb;padding:24px;margin-bottom:26px;">
          <div style="font-size:18px;font-weight:800;color:#12312d;margin-bottom:10px;">Get the complete assessment report</div>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.8;color:#40514f;">The complete report (PDF) covers what this summary does not:</p>
          <ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.9;color:#40514f;">
            <li>The full relative attention ranking across all ten cancer types, with an index for each</li>
            <li>The high-risk rules this assessment triggered, and what each one is based on</li>
            <li>Screening guidance organised around your age, family history and country of residence</li>
          </ul>
          <a href="https://mdi.eg-bio.com/?add-to-cart=REPLACE_WITH_PRODUCT_ID&amp;egbio_ticket=@{triggerBody()?['report_ticket']}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Get the complete report</a>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7976;">This link corresponds only to your own assessment. Please do not forward it. It expires after 30 days.</p>
        </div>

`
  }
};

for (const [lang, cfg] of Object.entries(LANGS)) {
  const src = fs.readFileSync(path.join(root, cfg.source), "utf8");

  const recIdx = src.indexOf(cfg.recommendationStart);
  const bandIdx = src.indexOf(cfg.bandExplainerStart);
  const perCancerIdx = src.indexOf(cfg.perCancerStart);
  const markerIdx = src.indexOf(cfg.validationMarker);
  if ([recIdx, bandIdx, perCancerIdx, markerIdx].some((i) => i < 0)) {
    throw new Error(`${lang}: an anchor was not found`);
  }
  // The validation block opens with the div that precedes its heading.
  const validationIdx = src.lastIndexOf('<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;', markerIdx);
  if (validationIdx < 0) throw new Error(`${lang}: validation block start not found`);

  const head = src.slice(0, recIdx);
  const bands = src.slice(bandIdx, perCancerIdx);
  const tail = src.slice(validationIdx);
  const middle = cfg.middle.replace("__TOP_CANCER__", cfg.topCancerExpr);

  let out = head + bands + middle + tail;

  out = out.replace(cfg.titleFrom, cfg.titleTo);
  if (cfg.subtitleFrom) out = out.replace(cfg.subtitleFrom, cfg.subtitleTo);

  fs.writeFileSync(path.join(root, cfg.output), out);
  console.log(`${cfg.output}: ${out.split("\n").length} lines`);
}
