const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRAND_MARKER,
  MAX_SUMMARY_LENGTH,
  MIN_LOGO_SCALE,
  MAX_LOGO_SCALE,
  FOOTER_MARKER,
  HOST_LOCAL_MARKERS,
  parseInstitutionBranding,
  brandForEntrance,
  brandForSlug,
  applyInstitutionBranding
} = require("./lib/institution-branding");

// Co-branding: which entrances show a partner's logo, and what the page does
// with it. The delivery counterpart is test-report-recipients.js, and the two
// are kept apart on purpose -- a partner can be branded without its reports
// being redirected, which is exactly Numia's case.
//
// The section that earns its place is the last one. Every claim here is about
// what a partner's user sees on the first page they load, and the failures
// that matter are the quiet ones: a logo that resolves for the wrong partner,
// a marker left in the HTML of the page strangers can see, a brand a browser
// can ask for by editing a cookie.

const NUMIA = JSON.stringify({
  numia: {
    name: "Numia Health",
    logo: "brand/numia-health-colour.svg",
    logoOnDark: "brand/numia-health-white.svg",
    codes: ["EGNUMEDJ"]
  }
});

test("a well-formed partner parses and resolves by code", () => {
  const w = parseInstitutionBranding(NUMIA);
  assert.deepEqual(w.problems, []);
  assert.equal(brandForEntrance(w, { code: "EGNUMEDJ" }), "numia");
  // Codes are normalized at the door, so the case an operator typed into the
  // configuration cannot decide whether a partner's users see their own logo.
  assert.equal(brandForEntrance(w, { code: "egnumedj" }), "numia");
  assert.equal(brandForSlug(w, "numia").name, "Numia Health");
});

test("an unlisted entrance has no brand", () => {
  const w = parseInstitutionBranding(NUMIA);
  assert.equal(brandForEntrance(w, { code: "egtw2026" }), null);
  assert.equal(brandForEntrance(w, { grantId: 44 }), null);
  assert.equal(brandForEntrance(w, {}), null);
  assert.equal(brandForSlug(w, null), null);
});

test("absent or empty configuration is not an error", () => {
  for (const raw of [undefined, null, "", "   "]) {
    const w = parseInstitutionBranding(raw);
    assert.deepEqual(w.problems, []);
    assert.equal(w.brands.size, 0);
  }
});

test("malformed configuration is reported, never thrown", () => {
  const cases = [
    ["{not json", /not valid JSON/],
    ['["numia"]', /object keyed by partner slug/],
    ['{"NUMIA":{"name":"N","logo":"brand/a.svg","codes":["x123456"]}}', /lowercase letters/],
    ['{"numia":{"name":"","logo":"brand/a.svg","codes":["x123456"]}}', /no usable name/],
    ['{"numia":{"name":"N","logo":"brand/a.svg"}}', /no codes and no grants/]
  ];
  for (const [raw, pattern] of cases) {
    const w = parseInstitutionBranding(raw);
    assert.equal(w.problems.length >= 1, true, `expected a problem for ${raw}`);
    assert.match(w.problems.join(" | "), pattern);
    assert.equal(w.brands.size, 0);
  }
});

// The logo path is the one field an environment variable could turn into an
// attack on the people answering the questionnaire. A remote URL reports every
// visitor to a third party; a data: or javascript: URI is script injection by
// configuration. Confining it to brand/<file> is what makes the worst case a
// logo that fails to load.
test("a logo that is not a path inside brand/ is refused", () => {
  const rejected = [
    "https://cdn.example.com/logo.svg",
    "//cdn.example.com/logo.svg",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "brand/../server.js",
    "../../etc/passwd",
    "assets/eg-biomed-icon.png",
    "brand/logo.html",
    "brand/logo.svg?x=1"
  ];
  for (const logo of rejected) {
    const w = parseInstitutionBranding(JSON.stringify({
      numia: { name: "Numia Health", logo, codes: ["EGNUMEDJ"] }
    }));
    assert.match(w.problems.join(" | "), /no usable logo path/, `accepted ${logo}`);
    assert.equal(w.brands.size, 0, `accepted ${logo}`);
  }
});

test("a logo that is not on disk is refused rather than rendered broken", () => {
  const w = parseInstitutionBranding(NUMIA, { logoExists: () => false });
  assert.match(w.problems.join(" | "), /not on disk/);
  assert.equal(w.brands.size, 0);
});

// Showing one partner's logo to another partner's users is noticed by the
// partner, not by us, so a disputed code is dropped from both rather than won
// by JSON key order.
test("a code claimed by two partners brands neither", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: { name: "Numia Health", logo: "brand/a.svg", codes: ["EGSHARED"] },
    hwakang: { name: "華康生醫", logo: "brand/b.svg", codes: ["EGSHARED"] }
  }));
  assert.match(w.problems.join(" | "), /claimed by more than one partner/);
  assert.equal(brandForEntrance(w, { code: "EGSHARED" }), null);
  // And neither partner survives as a slug an old cookie could still name.
  assert.equal(w.brands.size, 0);
});

test("one partner's bad entry does not take the others down", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: { name: "Numia Health", logo: "brand/numia-health-white.svg", codes: ["EGNUMEDJ"] },
    broken: { name: "Broken", logo: "https://example.com/x.svg", codes: ["EGBROKEN"] }
  }));
  assert.equal(w.problems.length, 1);
  assert.equal(brandForEntrance(w, { code: "EGNUMEDJ" }), "numia");
  assert.equal(brandForEntrance(w, { code: "EGBROKEN" }), null);
});

test("a partner can be listed by grant id, for an entrance with no code", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: { name: "Numia Health", logo: "brand/a.svg", grants: [48] }
  }));
  assert.deepEqual(w.problems, []);
  assert.equal(brandForEntrance(w, { grantId: 48 }), "numia");
  assert.equal(brandForEntrance(w, { grantId: "48" }), "numia");
  assert.equal(brandForEntrance(w, { grantId: 63 }), null);
});

test("no brand leaves the page identical apart from the marker", () => {
  const html = `<div class="brand-row"><span>EG BioMed</span>${BRAND_MARKER}</div>`;
  assert.equal(
    applyInstitutionBranding(html, null),
    '<div class="brand-row"><span>EG BioMed</span></div>'
  );
});

test("a brand renders both marks, with the partner named for a screen reader", () => {
  const w = parseInstitutionBranding(NUMIA);
  const html = applyInstitutionBranding(
    `<div class="brand-row"><span>EG BioMed</span>${BRAND_MARKER}</div>`,
    brandForSlug(w, "numia")
  );
  // Ours is still there. Co-branded means both; the report arrives from us,
  // and a user who never saw our name would be surprised by it.
  assert.match(html, /EG BioMed/);
  assert.match(html, /src="\/brand\/numia-health-colour\.svg"/);
  assert.match(html, /alt="Numia Health"/);
  assert.equal(html.includes(BRAND_MARKER), false);
});

// The hero is a dark photograph above 840px and plain white below it, so one
// file cannot serve both. This is the regression test for the first version,
// which shipped only the reversed logo: it rendered at 42x22 on every phone,
// in white, on white, and was visible to nobody.
test("both variants are shipped so CSS can pick one", () => {
  const brand = brandForSlug(parseInstitutionBranding(NUMIA), "numia");
  assert.equal(brand.logoOnDark, "brand/numia-health-white.svg");

  const html = applyInstitutionBranding(BRAND_MARKER, brand);
  assert.match(html, /class="brand-partner__on-light"[^>]*numia-health-colour\.svg/);
  assert.match(html, /class="brand-partner__on-dark"[^>]*numia-health-white\.svg/);
  // Announced once, not twice: only one of the two is ever on screen.
  assert.equal((html.match(/alt="Numia Health"/g) || []).length, 1);
  assert.match(html, /alt="" aria-hidden="true"/);
});

test("a partner who supplies one file gets it on both backgrounds", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    solo: { name: "Solo", logo: "brand/numia-health-colour.svg", codes: ["EGSOLO1"] }
  }));
  assert.deepEqual(w.problems, []);
  const brand = brandForSlug(w, "solo");
  assert.equal(brand.logoOnDark, null);

  // No switching classes at all, so neither CSS rule applies to it.
  const html = applyInstitutionBranding(BRAND_MARKER, brand);
  assert.equal(html.includes("brand-partner__on-light"), false);
  assert.equal(html.includes("brand-partner__on-dark"), false);
  assert.equal((html.match(/<img/g) || []).length, 1);
});

test("a bad logoOnDark is refused rather than quietly ignored", () => {
  for (const bad of ["https://cdn.example.com/w.svg", "brand/../server.js", "javascript:alert(1)"]) {
    const w = parseInstitutionBranding(JSON.stringify({
      numia: {
        name: "Numia Health",
        logo: "brand/numia-health-colour.svg",
        logoOnDark: bad,
        codes: ["EGNUMEDJ"]
      }
    }));
    assert.match(w.problems.join(" | "), /no usable logoOnDark path/, `accepted ${bad}`);
    assert.equal(w.brands.size, 0, `accepted ${bad}`);
  }

  // Falling back to the light logo on a dark hero would be a readable-looking
  // configuration that puts a blue wordmark on a near-black photograph.
  const missing = parseInstitutionBranding(NUMIA, { logoExists: (p) => !p.includes("white") });
  assert.match(missing.problems.join(" | "), /numia-health-white\.svg, which is not on disk/);
  assert.equal(missing.brands.size, 0);
});

// Our own name, which the page carries twice as "EG BioMed 愛立基生醫" --
// once in the hero and once in the footer. Numia's campaign is Canadian and
// runs in English; four Chinese characters in the first line their users read
// made the page look like somebody else's.
const OUR_NAME = `EG BioMed${HOST_LOCAL_MARKERS[0]} 愛立基生醫${HOST_LOCAL_MARKERS[1]}`;
const HOST_ROW = `<div class="brand-row"><span>${OUR_NAME}</span>${BRAND_MARKER}</div>`
  + `<footer><p class="site-footer__brand">${OUR_NAME}</p>${FOOTER_MARKER}</footer>`;

test("a partner can ask for our name without the Chinese half", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: {
      name: "Numia Health",
      logo: "brand/numia-health-colour.svg",
      codes: ["EGNUMEDJ"],
      hostName: "english"
    }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(HOST_ROW, brandForSlug(w, "numia"));
  // Both places, not just the first one. Trimming the hero and leaving the
  // footer would read as an oversight rather than a decision.
  assert.equal(html.includes("愛立基生醫"), false);
  // Trimmed, not replaced: the report arrives from us, and a user who never
  // saw our name anywhere would be surprised by it.
  assert.equal(html.includes("<span>EG BioMed</span>"), true);
  assert.equal(html.includes('<p class="site-footer__brand">EG BioMed</p>'), true);
});

test("everyone else keeps both halves, and nobody keeps the markers", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    hwakang: { name: "華康生醫", logo: "brand/numia-health-colour.svg", codes: ["EGHK3FV"] }
  }));
  assert.equal(brandForSlug(w, "hwakang").hostName, "bilingual");

  for (const brand of [brandForSlug(w, "hwakang"), null]) {
    const html = applyInstitutionBranding(HOST_ROW, brand);
    assert.equal(html.includes("<span>EG BioMed 愛立基生醫</span>"), true);
    assert.equal(html.includes('<p class="site-footer__brand">EG BioMed 愛立基生醫</p>'), true);
    // Including the page strangers see: a comment left in the source names a
    // mechanism and invites a look at it.
    for (const marker of HOST_LOCAL_MARKERS) assert.equal(html.includes(marker), false);
  }
});

test("an unknown hostName shows both rather than costing the partner their logo", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: {
      name: "Numia Health",
      logo: "brand/numia-health-colour.svg",
      codes: ["EGNUMEDJ"],
      hostName: "zh"
    }
  }));
  assert.match(w.problems.join(" | "), /unknown hostName "zh"/);
  const brand = brandForSlug(w, "numia");
  assert(brand, "an unreadable hostName took the whole partner down");
  assert.equal(brand.hostName, "bilingual");
});

// How big a partner's mark is drawn. 華康's lockup puts their name under a
// symbol and spends most of its height on the symbol, so at the house size
// the four characters came out around 14px and they asked for a little more.
test("a partner's mark can be drawn larger, and only theirs", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    hwakang: {
      name: "華康生醫",
      logo: "brand/hwakang-colour.png",
      codes: ["EGHK3FV"],
      logoScale: 1.3
    },
    numia: { name: "Numia Health", logo: "brand/numia-health-colour.svg", codes: ["EGNUMEDJ"] }
  }));
  assert.deepEqual(w.problems, []);
  assert.equal(brandForSlug(w, "hwakang").logoScale, 1.3);
  assert.equal(brandForSlug(w, "numia").logoScale, 1);

  // One number for both breakpoints: styles.css multiplies the 26px desktop
  // row and the 22px phone row by it.
  const bigger = applyInstitutionBranding(BRAND_MARKER, brandForSlug(w, "hwakang"));
  assert.equal(bigger.includes(`<span class="brand-partner" style="--brand-partner-scale: 1.3">`), true);

  // And a partner who asked for nothing gets exactly the markup they had
  // before the field existed -- their entrance was approved as it was.
  const house = applyInstitutionBranding(BRAND_MARKER, brandForSlug(w, "numia"));
  assert.equal(house.includes(`<span class="brand-partner">`), true);
  assert.equal(house.includes("brand-partner-scale"), false);
});

test("an unusable logoScale costs the size, not the logo", () => {
  for (const bad of [0.1, 4, "big", true, [], { px: 40 }]) {
    const w = parseInstitutionBranding(JSON.stringify({
      hwakang: { name: "華康生醫", logo: "brand/hwakang-colour.png", codes: ["EGHK3FV"], logoScale: bad }
    }));
    assert.match(w.problems.join(" | "), /unusable logoScale/, `accepted ${String(bad)}`);
    const brand = brandForSlug(w, "hwakang");
    assert(brand, `${String(bad)} took the whole partner down`);
    assert.equal(brand.logoScale, 1);
    assert.equal(applyInstitutionBranding(BRAND_MARKER, brand).includes("brand-partner-scale"), false);
  }

  // The bounds are the point of the field being bounded: a mark that towers
  // over our own is not co-branding, and one scaled to a tenth is invisible.
  assert(MIN_LOGO_SCALE > 0 && MAX_LOGO_SCALE > MIN_LOGO_SCALE);
});

// The footer block: who the partner is and how to reach them, at the bottom
// of the page. Someone who arrived from a partner's landing page and is now
// looking at a cancer questionnaire should be able to find both companies
// without scrolling back to the hero.
test("the footer names the partner and links what was configured", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: {
      name: "Numia Health",
      logo: "brand/numia-health-colour.svg",
      codes: ["EGNUMEDJ"],
      footer: {
        summary: "At-home blood work.",
        website: "https://numiahealth.ca/",
        email: "hello@numiahealth.ca",
        phone: "+1 (604) 555-0100"
      }
    }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "numia"));
  assert.match(html, /Numia Health/);
  assert.match(html, /At-home blood work\./);
  // The host, not the whole URL: a long path in a footer reads as a tracker.
  assert.match(html, /href="https:\/\/numiahealth\.ca\/"[^>]*>numiahealth\.ca</);
  // The questionnaire may be part-answered in the tab this opens from.
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /href="mailto:hello@numiahealth\.ca"/);
  assert.match(html, /\+1 \(604\) 555-0100/);
  assert.equal(html.includes(FOOTER_MARKER), false);
});

// 華康 asked for their QR in the footer as well as the link. It is the same
// address either way: the link is what you tap on the page you are already
// looking at, the code is what you point another phone at.
test("a partner's QR is rendered under their contact lines", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    hwakang: {
      name: "華康生醫",
      logo: "brand/hwakang-colour.png",
      codes: ["EGHK3FV"],
      footer: { website: "https://www.hkdna.com.tw/", qr: "brand/hwakang-qr.png", phone: "0909-956-886" }
    }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "hwakang"));
  assert.equal(html.includes('<img src="/brand/hwakang-qr.png"'), true);
  // Named, because a code nobody can read is an unlabelled image.
  assert.equal(html.includes('alt="華康生醫 QR code"'), true);
  // Dimensions on the tag: the footer must not jump when the image lands.
  assert.equal(html.includes('width="140" height="140"'), true);
  // After the written lines, not between them.
  assert(html.indexOf("site-footer__qr") > html.indexOf("0909-956-886"));

  // And nobody else grows one.
  const plain = parseInstitutionBranding(JSON.stringify({
    numia: {
      name: "Numia Health",
      logo: "brand/numia-health-colour.svg",
      codes: ["EGNUMEDJ"],
      footer: { website: "https://numiahealth.ca/" }
    }
  }));
  assert.equal(
    applyInstitutionBranding(FOOTER_MARKER, brandForSlug(plain, "numia")).includes("site-footer__qr"),
    false
  );
});

test("a QR is held to the logo's rules, and a bad one drops only itself", () => {
  for (const bad of ["https://cdn.example.com/qr.png", "brand/../server.js", "data:image/png;base64,AAAA"]) {
    const w = parseInstitutionBranding(JSON.stringify({
      hwakang: {
        name: "華康生醫",
        logo: "brand/hwakang-colour.png",
        codes: ["EGHK3FV"],
        footer: { website: "https://www.hkdna.com.tw/", qr: bad }
      }
    }));
    assert.match(w.problems.join(" | "), /footer qr must be brand/, `accepted ${bad}`);
    const brand = brandForSlug(w, "hwakang");
    assert(brand, `${bad} took the whole partner down`);
    assert.equal(brand.footer.qr, undefined);
    // The website line it sits under is untouched.
    assert.equal(applyInstitutionBranding(FOOTER_MARKER, brand).includes("www.hkdna.com.tw"), true);
  }

  // A path that is fine but names a file we do not ship would render a broken
  // image in a partner's own footer.
  const missing = parseInstitutionBranding(JSON.stringify({
    hwakang: {
      name: "華康生醫",
      logo: "brand/hwakang-colour.png",
      codes: ["EGHK3FV"],
      footer: { qr: "brand/nobody-made-this.png" }
    }
  }), { logoExists: (path) => !path.includes("nobody") });
  assert.equal(missing.problems.join(" | ").includes("footer qr points at brand/nobody-made-this.png"), true);
  assert.equal(brandForSlug(missing, "hwakang").footer.qr, undefined);
});

// The partner's own sentence, which also has to switch with the page: a
// Chinese description sitting under an English questionnaire is the same
// defect as a Chinese label, one line further up.
test("a partner's summary can be sent in both languages", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    hwakang: {
      name: "華康生醫",
      logo: "brand/hwakang-colour.png",
      codes: ["EGHK3FV"],
      footer: {
        summary: { zh: "專注於高科技基因檢測服務。", en: "Specialists in high-tech genetic testing." }
      }
    }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "hwakang"));
  assert.equal(html.includes('data-label-zh="專注於高科技基因檢測服務。"'), true);
  assert.equal(html.includes('data-label-en="Specialists in high-tech genetic testing."'), true);
  // Rendered in Chinese, like everything else index.html ships; app.js swaps.
  assert.equal(html.includes(">專注於高科技基因檢測服務。</p>"), true);
});

test("a summary sent in one language is shown on both pages, not translated", () => {
  // Numia's case, and the reason this differs from a label: the sentence is
  // the partner's own copy. We do not write an English version of a company's
  // description of itself, and we do not leave the line empty either.
  const w = parseInstitutionBranding(JSON.stringify({
    numia: {
      name: "Numia Health",
      logo: "brand/numia-health-colour.svg",
      codes: ["EGNUMEDJ"],
      footer: { summary: "At-home blood work." }
    }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "numia"));
  assert.equal(html.includes('data-label-zh="At-home blood work." data-label-en="At-home blood work."'), true);
});

test("an over-long summary is caught in either language", () => {
  for (const summary of [
    { zh: "長".repeat(MAX_SUMMARY_LENGTH + 1), en: "Short." },
    { zh: "短。", en: "x".repeat(MAX_SUMMARY_LENGTH + 1) }
  ]) {
    const w = parseInstitutionBranding(JSON.stringify({
      x: { name: "X", logo: "brand/hwakang-colour.png", codes: ["EGX1234"], footer: { summary } }
    }));
    assert.match(w.problems.join(" | "), /footer summary is longer than/);
    // The partner survives, as every other bad footer field leaves them.
    assert.equal(brandForSlug(w, "x").footer.summary, undefined);
  }
});

// A bare phone number under a cancer questionnaire, with nothing saying
// whose it is or what it is for, is what shipped first. 華康 had sent theirs
// as 「諮詢專線」 and 「信箱」 and both words were dropped on the way in.
test("a contact line says what it is, in the partner's own words where they gave them", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    hwakang: {
      name: "華康生醫",
      logo: "brand/hwakang-colour.png",
      codes: ["EGHK3FV"],
      footer: {
        email: "HuaKangDNA@gmail.com",
        emailLabel: { zh: "信箱", en: "Email" },
        phone: "0909-956-886",
        phoneLabel: { zh: "諮詢專線", en: "Consultation line" }
      }
    }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "hwakang"));
  // 「諮詢專線」 says something 「電話」 does not, so their wording is kept --
  // and it travels with an English twin, because the page switches language
  // under the reader. Leaving the Chinese on the English page is how this
  // first shipped.
  assert.equal(html.includes('data-label-zh="諮詢專線" data-label-en="Consultation line"'), true);
  assert.equal(html.includes('data-label-zh="信箱" data-label-en="Email"'), true);
  // Rendered in Chinese, which is what index.html ships; app.js swaps it.
  assert.equal(html.includes(">諮詢專線</span>"), true);
});

test("a label given in one language still has something to show in the other", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    x: {
      name: "X",
      logo: "brand/hwakang-colour.png",
      codes: ["EGX1234"],
      footer: { phone: "02-1234-5678", phoneLabel: "客服專線" }
    }
  }));
  assert.deepEqual(w.problems, []);

  // Their word in Chinese, ours in English. A label is our furniture
  // describing their line, not their text, so there is always a sensible
  // thing to fall back to -- unlike their name, which is never translated.
  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "x"));
  assert.equal(html.includes('data-label-zh="客服專線" data-label-en="Phone"'), true);
});

test("a partner who named nothing still gets labelled lines, in the page language", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    x: {
      name: "X",
      logo: "brand/hwakang-colour.png",
      codes: ["EGX1234"],
      footer: { email: "a@b.co", phone: "02-1234-5678" }
    }
  }));
  assert.deepEqual(w.problems, []);

  // The id is the whole mechanism: app.js looks these up and swaps the text,
  // exactly as it does for #partnerLabel.
  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "x"));
  assert.equal(html.includes('data-label-zh="信箱" data-label-en="Email"'), true);
  assert.equal(html.includes('data-label-zh="電話" data-label-en="Phone"'), true);
});

test("a label with nothing to label, or too long, is reported and dropped", () => {
  const orphan = parseInstitutionBranding(JSON.stringify({
    x: {
      name: "X",
      logo: "brand/hwakang-colour.png",
      codes: ["EGX1234"],
      footer: { website: "https://example.com/", phoneLabel: "諮詢專線" }
    }
  }));
  assert.match(orphan.problems.join(" | "), /set phoneLabel but no phone/);
  assert.equal(applyInstitutionBranding(FOOTER_MARKER, brandForSlug(orphan, "x")).includes("諮詢專線"), false);

  const shouty = parseInstitutionBranding(JSON.stringify({
    x: {
      name: "X",
      logo: "brand/hwakang-colour.png",
      codes: ["EGX1234"],
      footer: { phone: "02-1234-5678", phoneLabel: "請在上班時間撥打這支專線洽詢檢測相關問題謝謝您的來電" }
    }
  }));
  assert.match(shouty.problems.join(" | "), /phoneLabel is longer than/);
  // The number survives; only the label it came with is dropped, and the
  // default takes its place rather than leaving the line bare.
  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(shouty, "x"));
  assert.equal(html.includes("02-1234-5678"), true);
  assert.equal(html.includes('data-label-zh="電話" data-label-en="Phone"'), true);
});

test("a contact label is escaped", () => {
  const html = applyInstitutionBranding(FOOTER_MARKER, {
    slug: "x",
    name: "X",
    logo: "brand/a.svg",
    footer: { phone: "02-1234-5678", phoneLabel: { zh: '"><script>alert(1)</script>', en: "Phone" } }
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
});

test("the footer renders the name alone when nothing else is configured", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    hwakang: { name: "華康生醫", logo: "brand/numia-health-colour.svg", codes: ["EGHK3FV"] }
  }));
  assert.deepEqual(w.problems, []);

  const html = applyInstitutionBranding(FOOTER_MARKER, brandForSlug(w, "hwakang"));
  assert.match(html, /華康生醫/);
  // No empty contact lines: a heading with nothing under it is worse than none.
  assert.equal(html.includes("site-footer__contact"), false);
  assert.equal(html.includes("<a "), false);
});

test("an unbranded page keeps neither marker", () => {
  const html = `<div>${BRAND_MARKER}</div><footer>${FOOTER_MARKER}</footer>`;
  assert.equal(applyInstitutionBranding(html, null), "<div></div><footer></footer>");
});

// A link under a medical questionnaire that a network can rewrite is one the
// reader has no way to check. http:// and the script-bearing schemes are all
// refused the same way.
test("a footer website must be https, and a bad field drops only itself", () => {
  for (const bad of ["http://numiahealth.ca/", "javascript:alert(1)", "data:text/html,x", "numiahealth.ca"]) {
    const w = parseInstitutionBranding(JSON.stringify({
      numia: {
        name: "Numia Health",
        logo: "brand/numia-health-colour.svg",
        codes: ["EGNUMEDJ"],
        footer: { website: bad }
      }
    }));
    assert.match(w.problems.join(" | "), /footer website must be an https/, `accepted ${bad}`);
    // The partner survives -- a bad footer field must not cost them their logo.
    const brand = brandForSlug(w, "numia");
    assert(brand, `${bad} took the whole partner down`);
    assert.equal(brand.footer.website, undefined);
    assert.equal(applyInstitutionBranding(FOOTER_MARKER, brand).includes("<a "), false);
  }
});

test("a footer email and phone are validated too", () => {
  const w = parseInstitutionBranding(JSON.stringify({
    numia: {
      name: "Numia Health",
      logo: "brand/numia-health-colour.svg",
      codes: ["EGNUMEDJ"],
      footer: { email: "not an address", phone: "call us <script>" }
    }
  }));
  assert.match(w.problems.join(" | "), /footer email is not a usable address/);
  assert.match(w.problems.join(" | "), /footer phone contains characters/);
  const brand = brandForSlug(w, "numia");
  assert.equal(brand.footer.email, undefined);
  assert.equal(brand.footer.phone, undefined);
});

test("footer text is escaped", () => {
  const html = applyInstitutionBranding(FOOTER_MARKER, {
    slug: "x",
    name: '<script>alert(1)</script>',
    logo: "brand/a.svg",
    footer: { summary: '"><img onerror=alert(1)>' }
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img onerror"), false);
  assert.match(html, /&lt;script&gt;/);
});

test("a partner name is escaped into the alt attribute", () => {
  const html = applyInstitutionBranding(
    BRAND_MARKER,
    { slug: "x", name: '"><script>alert(1)</script>', logo: "brand/a.svg" }
  );
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
});

// ---------------------------------------------------------------------------
// Against a running server.
//
// Everything above is about the module. These are about the two things that
// are decided by where the code sits rather than by what it says: that the
// page strangers see carries no marker and no logo, and that a browser cannot
// award itself a brand by editing its own cookie.

const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ACCESS_GATE_MODE: "enforced",
      ACCESS_GATE_SESSION_SECRET: "institution-branding-test-secret",
      SUBMISSION_MODE: "postgres",
      DATABASE_URL: "",
      INSTITUTION_BRANDING: NUMIA
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start within 20s")), 20000);
    const ready = () => { clearTimeout(timer); resolve(child); };
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("listening")) ready(); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
  });
}

let server;
let base;

test.before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = await startServer(port);
});

test.after(() => { if (server) server.kill(); });

test("the gate view carries neither the marker nor a partner logo", async () => {
  const response = await fetch(`${base}/`, { redirect: "manual" });
  const body = await response.text();

  assert.equal(response.status, 403);
  // A comment left in the HTML tells anyone who views source that there is a
  // branding mechanism and what it is called. It costs nothing to remove.
  assert.equal(body.includes(BRAND_MARKER), false);
  // And no partner logo, because nobody has entered through their door yet.
  assert.equal(body.includes("numia-health-white.svg"), false);
  // no-store is what makes per-session branding safe at all: without it a
  // cache could hand one partner's page to the next visitor.
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a browser cannot award itself a brand by editing its cookie", async () => {
  // What a forged cookie would say, without the HMAC that would make it true.
  // The gate refuses it, so the brand never comes up -- which is the point:
  // the slug rides inside the signature, not beside it.
  const forged = Buffer.from(JSON.stringify({
    grantId: 48, mode: "public", inst: null, brd: "numia",
    sid: "0".repeat(32), exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");

  const response = await fetch(`${base}/`, {
    redirect: "manual",
    headers: { cookie: `eg_access_session=${forged}.notavalidsignature` }
  });
  const body = await response.text();

  assert.equal(response.status, 403);
  assert.equal(body.includes("numia-health-white.svg"), false);
});

test("a partner asset is not served to strangers", async () => {
  // /brand/ is deliberately absent from the gate's exemption list, unlike
  // /assets/, which the gate view itself needs. Nobody without a session ever
  // sees a branded page, so nobody without a session needs the logo -- and a
  // partner's mark sitting on an open path is their asset being hosted for
  // anyone who guesses the filename.
  const response = await fetch(`${base}/brand/numia-health-white.svg`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/");
});

test("the page we ship still marks the half of our name that can be dropped", () => {
  // The markers are HTML comments. Edit the hero line without them and the
  // page keeps rendering perfectly -- for every partner, in both languages,
  // including the one who asked for the Chinese to come off. Nothing else
  // would fail, which is why this is asserted against the file itself.
  const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const ourName = `EG BioMed${HOST_LOCAL_MARKERS[0]} 愛立基生醫${HOST_LOCAL_MARKERS[1]}`;
  assert.equal(indexHtml.includes(`<span>${ourName}</span>`), true, "the hero line is unmarked");
  assert.equal(
    indexHtml.includes(`<p class="site-footer__brand">${ourName}</p>`),
    true,
    "the footer line is unmarked"
  );
  // Every unpaired marker is a place our name silently stops being trimmed.
  assert.equal(indexHtml.split(HOST_LOCAL_MARKERS[0]).length, indexHtml.split(HOST_LOCAL_MARKERS[1]).length);
});

test("the stylesheet still multiplies by the partner scale", () => {
  // Replace either calc() with a plain height and every page keeps rendering;
  // the only thing that changes is that a partner who asked for a larger mark
  // quietly stops getting one.
  const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.equal(css.includes("height: calc(26px * var(--brand-partner-scale, 1))"), true, "the desktop row stopped multiplying");
  assert.equal(css.includes("height: calc(22px * var(--brand-partner-scale, 1))"), true, "the phone row stopped multiplying");
});

test("the QR we ship is a square PNG large enough to stay sharp", () => {
  // Drawn at 140px and downscaled from this file, so it has to be bigger than
  // it is shown. The dimensions come out of the IHDR rather than a library:
  // this is a guard against the file being replaced by something small or by
  // something that is not a PNG at all.
  const file = path.join(__dirname, "brand", "hwakang-qr.png");
  assert.equal(fs.existsSync(file), true);
  const head = fs.readFileSync(file).subarray(0, 24);
  assert.deepEqual([...head.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "not a PNG");
  const width = head.readUInt32BE(16);
  const height = head.readUInt32BE(20);
  assert.equal(width, height, "a QR is square");
  assert(width >= 320, `shipped at ${width}px, which will look soft`);
});

test("the configured logo is actually on disk", () => {
  // The boot-time check in server.js drops a partner whose file is missing,
  // which is the right behaviour and also a silent one. This is the assertion
  // that the file this repository ships matches the path it configures.
  for (const file of ["numia-health-colour.svg", "numia-health-white.svg"]) {
    assert.equal(fs.existsSync(path.join(__dirname, "brand", file)), true, file);
  }
});
