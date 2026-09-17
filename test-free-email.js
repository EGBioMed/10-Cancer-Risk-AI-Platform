const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { execFileSync } = require("child_process");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

const PAID = { zh: read("power-automate-email-zh.html"), en: read("power-automate-email-en.html") };
const FREE = { zh: read("power-automate-email-free-zh.html"), en: read("power-automate-email-free-en.html") };

// Where the free email stops and the paid report starts is a commercial
// decision (FREEMIUM_SPEC.md 1.1), not a formatting one. Encoding it here
// means moving that line stays a deliberate act rather than something an
// unrelated edit does by accident.
//
// Revised 2026-09-17: the free email now keeps the whole of today's content
// -- including the full cancer ranking and the personalised recommendation
// -- and gives up only the model validation summary. What remains to sell is
// the rule hits, the screening guidance, the validation data and the PDF
// itself, which is what the call to action must confine itself to promising.
const WITHHELD = {
  zh: [
    ["模型研究與驗證摘要", "the validation summary heading"],
    ["0.875 ± 0.032", "the ROC-AUC figure"],
    ["543 筆獨立測試資料", "the test-set size"],
    ["11 個隨機森林模型", "the model count"],
    ["SMOTE", "the class-imbalance note"]
  ],
  en: [
    ["Model Research and Validation Summary", "the validation summary heading"],
    ["0.875 ± 0.032", "the ROC-AUC figure"],
    ["543 independent test records", "the test-set size"]
  ]
};

const KEPT = {
  zh: [
    ["risk_score", "the risk index"],
    ["risk_ratio_vs_healthy", "the comparison against healthy peers"],
    ["整體相對風險因子等級怎麼看？", "the band explainer"],
    ["各癌種風險因子參考", "the full cancer ranking section"],
    ["cancer_risks_text", "the ranking text itself"],
    ["recommendation_zh", "the personalised recommendation"],
    ["可與醫師討論的健康管理方向", "the guidance section"],
    ["報告使用說明", "the disclaimer"]
  ],
  en: [
    ["risk_score", "the risk index"],
    ["risk_ratio_vs_healthy", "the comparison against healthy peers"],
    ["Understanding the overall relative risk factor levels", "the band explainer"],
    ["Cancer-type risk factor reference", "the full cancer ranking section"],
    ["cancer_risks_text", "the ranking text itself"],
    ["Health management topics to discuss", "the guidance section"],
    ["How to use this report", "the disclaimer"]
  ]
};

for (const lang of ["zh", "en"]) {
  test(`the ${lang} free email withholds the validation summary and nothing else`, () => {
    for (const [needle, description] of WITHHELD[lang]) {
      assert.equal(FREE[lang].includes(needle), false, `the free email must not contain ${description}`);
      // The paid template must still have it, or this is asserting against a
      // string that no longer exists anywhere and would pass for free.
      assert.equal(
        PAID[lang].includes(needle),
        true,
        `${description} vanished from the paid email -- update this test deliberately`
      );
    }
  });

  test(`the ${lang} free email keeps everything else the paid one says`, () => {
    for (const [needle, description] of KEPT[lang]) {
      assert.equal(FREE[lang].includes(needle), true, `the free email must keep ${description}`);
    }
  });

  // The free email is now the paid one minus one block plus one block, so
  // everything before the removal has to match exactly. This is what stops
  // the two drifting as the paid email is edited over time.
  test(`the ${lang} free email is byte-identical to the paid one up to the removal`, () => {
    const opener = '<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;';
    const marker = lang === "zh" ? "模型研究與驗證摘要" : "Model Research and Validation Summary";
    const cut = PAID[lang].lastIndexOf(opener, PAID[lang].indexOf(marker));
    assert(cut > 0, "could not locate the removal point");
    assert.equal(FREE[lang].slice(0, cut), PAID[lang].slice(0, cut));
  });

  test(`the ${lang} free email offers exactly one payment link, carrying the ticket`, () => {
    const links = FREE[lang].match(/https:\/\/mdi\.eg-bio\.com\/[^"]*/g) || [];
    assert.equal(links.length, 1, "one call to action, not several");
    assert.match(links[0], /egbio_ticket=@\{triggerBody\(\)\?\['report_ticket'\]\}/);
    // The product does not exist on the store yet, so the placeholder has to
    // stay conspicuous enough that it cannot ship by accident.
    assert.match(links[0], /add-to-cart=REPLACE_WITH_PRODUCT_ID/);

    // The paid email must never grow a payment link: its recipients were
    // already paid for by their institution.
    assert.equal(PAID[lang].includes("mdi.eg-bio.com"), false);
  });

  // Promising something the reader was handed further up the same email is
  // the one way this call to action can be actively misleading.
  test(`the ${lang} call to action promises nothing the free email already gave`, () => {
    const ctaStart = FREE[lang].indexOf('<div style="border:2px solid #0f766e;');
    assert(ctaStart > 0, "call to action not found");
    const cta = FREE[lang].slice(ctaStart, FREE[lang].indexOf("</div>", FREE[lang].indexOf("</a>", ctaStart)));

    const alreadyGiven = lang === "zh"
      ? ["十大癌症的完整相對關注排序", "完整十癌排序", "各癌種風險因子"]
      : ["full relative attention ranking", "ranking across all ten"];
    for (const claim of alreadyGiven) {
      assert.equal(
        cta.includes(claim),
        false,
        `the call to action must not sell "${claim}" -- the free email already contains it`
      );
    }

    // It must promise the things that genuinely are paid-only.
    const genuinelyPaid = lang === "zh" ? ["高風險規則", "篩檢建議", "驗證"] : ["high-risk rules", "Screening guidance", "validation"];
    for (const claim of genuinelyPaid) {
      assert.equal(cta.includes(claim), true, `the call to action should name ${claim}`);
    }
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

// Slicing one document into another is exactly the operation that leaves an
// unclosed tag, and an unbalanced email renders differently in every client.
test("both free templates are well nested", () => {
  const balance = (html) => {
    const stack = [];
    for (const [, close, name, selfClose] of html.matchAll(/<(\/?)(div|table|tr|td|ul|li|a|p|h1|h2)\b[^>]*?(\/?)>/g)) {
      if (selfClose) continue;
      if (close) {
        assert.equal(stack.pop(), name, `stray </${name}>`);
      } else {
        stack.push(name);
      }
    }
    return stack;
  };
  assert.deepEqual(balance(FREE.zh), [], "zh free template has unclosed tags");
  assert.deepEqual(balance(FREE.en), [], "en free template has unclosed tags");
});
