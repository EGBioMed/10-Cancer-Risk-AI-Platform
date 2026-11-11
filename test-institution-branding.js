const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRAND_MARKER,
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

test("the configured logo is actually on disk", () => {
  // The boot-time check in server.js drops a partner whose file is missing,
  // which is the right behaviour and also a silent one. This is the assertion
  // that the file this repository ships matches the path it configures.
  for (const file of ["numia-health-colour.svg", "numia-health-white.svg"]) {
    assert.equal(fs.existsSync(path.join(__dirname, "brand", file)), true, file);
  }
});
