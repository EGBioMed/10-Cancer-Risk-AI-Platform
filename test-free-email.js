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
  //
  // The one permitted difference is the /predict action's name: flow A calls
  // it HTTP and flow B calls it HTTP_AI_predict, so the paid side is renamed
  // before comparing. Renaming the paid copy rather than stripping the name
  // from both keeps the comparison strict -- a template that referenced some
  // third action would still fail here.
  test(`the ${lang} free email is byte-identical to the paid one up to the removal`, () => {
    const opener = '<div style="border:1px solid #dce8e5;border-radius:14px;background:#f9fcfb;';
    const marker = lang === "zh" ? "模型研究與驗證摘要" : "Model Research and Validation Summary";
    const cut = PAID[lang].lastIndexOf(opener, PAID[lang].indexOf(marker));
    assert(cut > 0, "could not locate the removal point");

    const renamed = PAID[lang]
      .slice(0, cut)
      .split("body('HTTP')")
      .join("body('HTTP_AI_predict')");

    // The longer action name shifts everything after it, so the free side is
    // taken to the renamed length, not to the cut offset in the paid file.
    assert.equal(FREE[lang].slice(0, renamed.length), renamed);
  });

  // Flow B has no action called HTTP, so a leftover reference is rejected at
  // save time -- which is how this was found. Flow A must keep its own name:
  // it is frozen and still serving institutions.
  test(`the ${lang} free email points at flow B's own /predict action`, () => {
    assert.equal(
      FREE[lang].includes("body('HTTP')"),
      false,
      "a body('HTTP') survived the rename; flow B will refuse to save"
    );
    assert(
      FREE[lang].includes("body('HTTP_AI_predict')"),
      "the free email no longer reads the model output at all"
    );
    assert(
      PAID[lang].includes("body('HTTP')"),
      "the paid template was renamed -- flow A is frozen and must keep HTTP"
    );
  });

  test(`the ${lang} free email offers exactly one payment link, carrying the ticket`, () => {
    const links = FREE[lang].match(/https:\/\/mdi\.eg-bio\.com\/[^"]*/g) || [];
    assert.equal(links.length, 1, "one call to action, not several");
    assert.match(links[0], /egbio_ticket=@\{triggerBody\(\)\?\['report_ticket'\]\}/);
    // Product 1062 on the store, hidden from the catalogue because this link
    // is the only supported way in. A wrong id here raises no error -- it
    // quietly sells the reader some other product -- so it is pinned
    // literally, and the generator holds the one copy of it.
    assert.match(links[0], /add-to-cart=1062&/);
    assert.doesNotMatch(links[0], /REPLACE_WITH_PRODUCT_ID/);

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
  execFileSync(process.execPath, [path.join(__dirname, "scripts", "build-email-templates.js")], {
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

// 2026-09-17 decision: the API's final_risk_level is authoritative, and the
// email must not compute a band of its own. Measurement showed the email's
// own 0.25 / 0.50 thresholds sat above the model's ~0.40 / ~0.60, so four
// profiles in eleven were told their risk was worse than the model judged
// it -- while the same email's footer cited 0.40 as the model's threshold.
//
// Reading the label instead of recomputing it also means a change to the
// model's thresholds reaches the email with no edit at all, which is the
// maintenance burden this decision was meant to remove.
const ALL_TEMPLATES = [
  "power-automate-email-zh.html",
  "power-automate-email-en.html",
  "power-automate-email-free-zh.html",
  "power-automate-email-free-en.html"
];

test("no email template decides a risk band from a hardcoded threshold", () => {
  for (const name of ALL_TEMPLATES) {
    const html = read(name);
    assert.doesNotMatch(
      html,
      /greaterOrEquals\(float\(string\(body\('HTTP'\)\['risk_score'\]\)\),\s*0?\.\d+\)/,
      `${name} still compares risk_score against a threshold of its own`
    );
    // The band and the conditional advice must both come from the API.
    assert.match(html, /final_risk_level/, `${name} must read the API's band`);
  }
});

test("both languages map the API's band from the same Chinese labels", () => {
  // Only risk_level_display is localised; final_risk_level stays Chinese
  // whatever lang is sent, so matching on it is what keeps the two
  // templates in agreement about which band a reader is in.
  for (const name of ALL_TEMPLATES) {
    const html = read(name);
    for (const label of ["高風險", "中度風險", "低風險"]) {
      assert.match(html, new RegExp(`final_risk_level'\],'${label}'`), `${name} must handle ${label}`);
    }
  }

  // An unrecognised band must surface, not silently fall into the lowest
  // one: a new level added upstream should look wrong, not look safe.
  assert.match(read("power-automate-email-zh.html"), /,body\('HTTP'\)\?\['final_risk_level'\]\)\)\)\}/);
  assert.match(read("power-automate-email-en.html"), /,body\('HTTP'\)\?\['risk_level_display'\]\)\)\)\}/);
});


// The email that carries the paid report is a covering note, not a second
// copy of the report. Everything substantial is in the attached PDF, so
// repeating it in the body makes the email long and technical -- the
// criticism the report itself already drew -- and has the recipient read
// the same thing twice.
const DELIVERY = {
  zh: read("power-automate-email-delivery-zh.html"),
  en: read("power-automate-email-delivery-en.html")
};

// Belongs in the PDF, not in the covering email.
const NOT_IN_DELIVERY = {
  zh: [
    ["模型研究與驗證摘要", "the validation summary"],
    ["543 筆獨立測試資料", "the test-set size"],
    ["各癌種風險因子參考", "the full cancer ranking"],
    ["cancer_risks_text", "the ranking text"],
    ["recommendation_zh", "the personalised recommendation"],
    ["可與醫師討論的健康管理方向", "the guidance section"],
    ["整體相對風險因子等級怎麼看？", "the band explainer"]
  ],
  en: [
    ["Model Research and Validation Summary", "the validation summary"],
    ["543 independent test records", "the test-set size"],
    ["Cancer-type risk factor reference", "the full cancer ranking"],
    ["cancer_risks_text", "the ranking text"],
    ["Health management topics to discuss", "the guidance section"],
    ["Understanding the overall relative risk factor levels", "the band explainer"]
  ]
};

// Worth seeing without opening a 2.6 MB attachment.
const IN_DELIVERY = {
  zh: [
    ["risk_score", "the risk index"],
    ["risk_ratio_vs_healthy", "the comparison against healthy peers"],
    ["final_risk_level", "the band, read from the API"],
    ["您的完整癌症風險評估報告", "its own title"],
    ["附件報告包含", "what the attachment covers"],
    ["報告使用說明", "the disclaimer"]
  ],
  en: [
    ["risk_score", "the risk index"],
    ["risk_ratio_vs_healthy", "the comparison against healthy peers"],
    ["final_risk_level", "the band, read from the API"],
    ["Your Complete Cancer Risk Assessment Report", "its own title"],
    ["What the attached report covers", "what the attachment covers"],
    ["How to use this report", "the disclaimer"]
  ]
};

for (const lang of ["zh", "en"]) {
  test(`the ${lang} delivery email is a covering note, not the report again`, () => {
    for (const [needle, description] of NOT_IN_DELIVERY[lang]) {
      assert.equal(
        DELIVERY[lang].includes(needle),
        false,
        `the delivery email must not repeat ${description} -- it is in the PDF`
      );
    }
    for (const [needle, description] of IN_DELIVERY[lang]) {
      assert.equal(DELIVERY[lang].includes(needle), true, `the delivery email must keep ${description}`);
    }
  });

  // It must not read like the free email with an attachment stapled on.
  test(`the ${lang} delivery email is materially shorter than the free one`, () => {
    const delivery = DELIVERY[lang].split("\n").length;
    const free = FREE[lang].split("\n").length;
    assert(
      delivery < free * 0.75,
      `the covering note (${delivery} lines) should be well shorter than the free email (${free})`
    );
  });

  test(`the ${lang} delivery email reads the model output from the stored result`, () => {
    // Flow C has no /predict action of its own.
    assert.doesNotMatch(DELIVERY[lang], /body\('HTTP'\)/);
    assert.match(DELIVERY[lang], /body\('GetStoredResult'\)\?\['result'\]\?\['prediction_json'\]/);
    // Safe navigation throughout, so a field the stored prediction lacks
    // yields null rather than failing the send -- after payment.
    assert.doesNotMatch(DELIVERY[lang], /prediction_json'\]\['/);
    // The recipient's name still comes from the trigger.
    assert.match(DELIVERY[lang], /triggerBody\(\)\?\['full_name'\]/);
  });

  test(`the ${lang} delivery email carries the corrected risk band`, () => {
    // Flow A still has the pre-fix template pasted in; regenerating rather
    // than hand-editing is what keeps that bug out of the paid report.
    assert.doesNotMatch(DELIVERY[lang], /greaterOrEquals\(float\(string\(body/);
  });

  test(`the ${lang} delivery email sells nothing -- its reader already paid`, () => {
    assert.equal(DELIVERY[lang].includes("mdi.eg-bio.com"), false);
    assert.equal(DELIVERY[lang].includes("REPLACE_WITH_PRODUCT_ID"), false);
  });

  // The header and the score card come from the paid template by slicing,
  // so the figures and their formatting cannot drift between the three
  // emails a customer might see.
  test(`the ${lang} delivery email's score card is identical to the paid one`, () => {
    const cardOpener = '<div style="border:1px solid #cfe0dc;border-radius:16px;';
    const cardStart = PAID[lang].indexOf(cardOpener);
    assert(cardStart > 0, "score card not found in the paid template");
    const cardEnd = PAID[lang].indexOf('<div style="border-left:5px solid #0f766e;');
    const paidCard = PAID[lang].slice(cardStart, cardEnd).split("body('HTTP')").join(
      "body('GetStoredResult')?['result']?['prediction_json']"
    ).split("prediction_json']['").join("prediction_json']?['");

    assert(DELIVERY[lang].includes(paidCard), "the score card must be the paid one, only repointed");
  });
}
