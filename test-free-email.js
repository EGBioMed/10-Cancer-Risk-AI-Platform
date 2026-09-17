const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { execFileSync } = require("child_process");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

const PAID = { zh: read("power-automate-email-zh.html"), en: read("power-automate-email-en.html") };
const FREE = { zh: read("power-automate-email-free-zh.html"), en: read("power-automate-email-free-en.html") };

// What the free email may and may not contain is a commercial decision
// (FREEMIUM_SPEC.md 1.1), not a formatting one. Encoding it here means an
// edit that quietly puts the paid content back into the free email fails a
// test rather than reaching a customer's inbox.
const PAID_ONLY = {
  zh: [
    ["各癌種風險因子參考", "the full ten-cancer ranking section"],
    ["cancer_risks_text']}", "the full ranking text itself"],
    ["recommendation_zh", "the personalised recommendation"],
    ["可與醫師討論的健康管理方向", "the personalised guidance section"]
  ],
  en: [
    ["Cancer-type risk factor reference", "the full ten-cancer ranking section"],
    ["Health management topics to discuss", "the personalised guidance section"]
  ]
};

const FREE_KEEPS = {
  zh: [
    ["risk_score", "the risk index"],
    ["risk_ratio_vs_healthy", "the comparison against healthy peers"],
    ["整體相對風險因子等級怎麼看？", "the band explainer"],
    ["0.875 ± 0.032", "ROC-AUC"],
    ["91.2%", "sensitivity"],
    ["543 筆獨立測試資料", "the test-set size"],
    ["100 次獨立分層驗證", "the validation runs"],
    ["11 個隨機森林模型", "the model count"],
    ["報告使用說明", "the disclaimer"]
  ],
  en: [
    ["risk_score", "the risk index"],
    ["risk_ratio_vs_healthy", "the comparison against healthy peers"],
    ["Understanding the overall relative risk factor levels", "the band explainer"],
    ["0.875 ± 0.032", "ROC-AUC"],
    ["91.2%", "sensitivity"],
    ["543 independent test records", "the test-set size"]
  ]
};

for (const lang of ["zh", "en"]) {
  test(`the ${lang} free email withholds every paid-only section`, () => {
    for (const [needle, description] of PAID_ONLY[lang]) {
      assert.equal(
        FREE[lang].includes(needle),
        false,
        `the free email must not contain ${description}`
      );
      // Sanity: the paid template must still have it, or this test is
      // asserting against a string that no longer exists anywhere.
      assert.equal(
        PAID[lang].includes(needle),
        true,
        `${description} vanished from the paid email -- update this test deliberately`
      );
    }
  });

  test(`the ${lang} free email keeps the score, the band and the whole validation summary`, () => {
    for (const [needle, description] of FREE_KEEPS[lang]) {
      assert.equal(FREE[lang].includes(needle), true, `the free email must keep ${description}`);
    }
  });

  // The validation summary is what makes the free email credible, and it is
  // also the longest block. Comparing it against the paid template catches a
  // number being retyped or drifting in one copy only.
  test(`the ${lang} free email's validation summary is identical to the paid one`, () => {
    const marker = lang === "zh" ? "模型研究與驗證摘要" : "Model Research and Validation Summary";
    const opener = '<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;';
    const extract = (html) => {
      const start = html.lastIndexOf(opener, html.indexOf(marker));
      assert(start >= 0, "validation block not found");
      return html.slice(start, html.indexOf("</table>", start) + 8);
    };
    assert.equal(extract(FREE[lang]), extract(PAID[lang]));
  });

  test(`the ${lang} free email offers exactly one payment link, carrying the ticket`, () => {
    const links = FREE[lang].match(/https:\/\/mdi\.eg-bio\.com\/[^"]*/g) || [];
    assert.equal(links.length, 1, "one call to action, not several");
    assert.match(links[0], /egbio_ticket=@\{triggerBody\(\)\?\['report_ticket'\]\}/);
    // The product does not exist on the store yet; the placeholder has to be
    // conspicuous so it cannot be shipped by accident.
    assert.match(links[0], /add-to-cart=REPLACE_WITH_PRODUCT_ID/);

    // The paid email must never grow a payment link: its recipients have
    // already been paid for by their institution.
    assert.equal(PAID[lang].includes("mdi.eg-bio.com"), false);
  });

  test(`the ${lang} free email names itself a summary, not a report`, () => {
    const title = lang === "zh" ? "AI 癌症風險評估結果摘要" : "AI Cancer Risk Assessment Summary";
    assert.equal(FREE[lang].includes(title), true);
    // Calling the free email a "report" while the report is behind a payment
    // link is the kind of wording a regulator reads unkindly.
    const paidTitle = lang === "zh" ? "AI 十大癌症健康風險因子整理報告" : "AI Cancer Risk Assessment Report";
    assert.equal(FREE[lang].includes(paidTitle), false);
  });
}

test("the free templates are exactly what the generator produces", () => {
  const before = { zh: FREE.zh, en: FREE.en };
  execFileSync(process.execPath, [path.join(__dirname, "scripts", "build-free-email-templates.js")], {
    cwd: __dirname,
    stdio: "pipe"
  });
  assert.equal(read("power-automate-email-free-zh.html"), before.zh);
  assert.equal(read("power-automate-email-free-en.html"), before.en);
});
