const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { execFileSync } = require("child_process");

// The WordPress plugin is the one component of this system that runs
// somewhere we cannot test it, on the host that is most exposed. There is
// no PHP here to lint it and no WordPress to run it, so these check the
// properties that matter by reading the source -- which is still better
// than the nothing it had before.
const PLUGIN = fs.readFileSync(
  path.join(__dirname, "contracts", "purchase", "egbio-access-code.php"),
  "utf8"
);

// Strings and comments hold Chinese punctuation and braces that would
// otherwise be counted. Stripped line by line, never across the whole file:
// this plugin concatenates HTML across several lines, and a whole-file
// string regex swallows from one quote to a quote many lines later, taking
// real braces with it. That produced a phantom imbalance the first time.
//
// This is a heuristic, not a PHP parser -- there is no PHP here to be one.
// It catches the mistake that actually matters (a missing or surplus brace
// while editing), and the real proof is still that WordPress activates the
// file.
function strippedLines(src) {
  let inBlockComment = false;

  return src.split("\n").map((raw) => {
    let line = raw;

    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end < 0) return "";
      line = line.slice(end + 2);
      inBlockComment = false;
    }

    line = line.replace(/\/\*[\s\S]*?\*\//g, "");
    const opensComment = line.indexOf("/*");
    if (opensComment >= 0) {
      inBlockComment = true;
      line = line.slice(0, opensComment);
    }

    return line
      .replace(/\/\/[^\n]*/g, "")
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""');
  });
}

function braceDepth(src) {
  let depth = 0;
  let wentNegative = 0;

  strippedLines(src).forEach((line, index) => {
    for (const ch of line) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth < 0 && !wentNegative) wentNegative = index + 1;
    }
  });

  return { depth, wentNegative };
}

test("the plugin's braces balance, as they do in the deployed version", () => {
  const { depth, wentNegative } = braceDepth(PLUGIN);

  assert.equal(wentNegative, 0, `a closing brace with nothing open at line ${wentNegative}`);
  assert.equal(depth, 0, `${depth > 0 ? depth + " unclosed" : -depth + " surplus closing"} brace(s)`);

  // The same method on the version in git, which is running in production:
  // if it disagreed there, the method would be what is wrong, not the file.
  const deployed = execFileSync("git", ["show", "HEAD:contracts/purchase/egbio-access-code.php"], {
    cwd: __dirname,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  assert.equal(braceDepth(deployed).depth, 0, "the checker disagrees with a known-good file");
});

test("every hook points at a function the file defines", () => {
  const hooks = [...PLUGIN.matchAll(/add_(?:action|filter)\(\s*'([^']+)',\s*'([^']+)'/g)];
  const defined = new Set(
    [...PLUGIN.matchAll(/function\s+(egbio_[a-z_]+)\s*\(/g)].map((m) => m[1])
  );

  assert(hooks.length >= 8, "expected the plugin to register several hooks");
  for (const [, hook, fn] of hooks) {
    assert(defined.has(fn), `${hook} points at ${fn}, which is not defined here`);
  }
});

// The secret that signs tickets stays on the questionnaire platform and the
// data API. WordPress carries the ticket; it never validates one. Holding
// the secret here would mean a WordPress compromise could forge a paid
// report for any assessment.
test("the plugin holds no ticket-signing secret", () => {
  assert.doesNotMatch(PLUGIN, /REPORT_TICKET_SECRET/);
  assert.doesNotMatch(PLUGIN, /ACCESS_GATE_SESSION_SECRET/);
  assert.doesNotMatch(PLUGIN, /ACCESS_GATE_API_KEY/);
  // It reuses the one key it already had, rather than being given a second.
  assert.match(PLUGIN, /EGBIO_PURCHASE_API_KEY/);
});

// Shape only -- the signature is checked by the data API, which has the
// secret. Rejecting malformed input here just stops junk travelling all the
// way to checkout before failing.
test("the ticket shape check matches what the platform signs", () => {
  const match = PLUGIN.match(/preg_match\(\s*'([^']+)'/);
  assert(match, "ticket shape pattern not found");

  // Translate the PHP delimiters into a JS regex and try real tickets.
  const pattern = new RegExp(match[1].replace(/^\//, "").replace(/\/$/, ""));

  const real = "eyJ2IjoicnQxIiwicmlkIjoiZmRlNzRhMGItMWY1OC00NzFjLWIwNjEtYTdkM2I5NjVkOWU5IiwiZXhwIjoxNzkyMjkyODgwfQ.b52a873143173e19e898cee6347e91c9eead56e8c852bc01f23ba86113bd00a9";
  assert.equal(pattern.test(real), true, "a real ticket must pass");

  for (const bad of ["", "no-separator", "abc.short", `abc.${"g".repeat(64)}`, "abc.def"]) {
    assert.equal(pattern.test(bad), false, `${bad || "(empty)"} must not pass`);
  }
});

// WooCommerce registers WC_Form_Handler::add_to_cart_action on wp_loaded at
// priority 20. The ticket has to be in the session before that runs. Equal
// priorities are resolved by plugin load order, which this plugin does not
// control -- and if the order ever flips, the guard below refuses the very
// customers who arrived from their own email link.
test("the ticket is captured before WooCommerce handles add-to-cart", () => {
  const hook = PLUGIN.match(
    /add_action\(\s*'wp_loaded',\s*'egbio_capture_report_ticket',\s*(\d+)\s*\)/
  );
  assert(hook, "the capture hook is not registered on wp_loaded");
  assert(
    Number(hook[1]) < 20,
    `priority ${hook[1]} ties WooCommerce's own handler, so plugin load order decides`
  );
});

// The guard that matters most commercially: without a ticket the report
// cannot be produced at all, so the sale must be refused before the money
// is taken, not after.
test("the report cannot be bought without a ticket", () => {
  assert.match(PLUGIN, /woocommerce_add_to_cart_validation/);
  const fnStart = PLUGIN.indexOf("function egbio_require_ticket_for_report");
  assert(fnStart > 0, "the add-to-cart guard is not defined");
  const fn = PLUGIN.slice(fnStart, PLUGIN.indexOf("\n}\n", fnStart));

  assert.match(fn, /EGBIO_REPORT_PRODUCT_SKU/);
  assert.match(fn, /egbio_is_report_ticket_shaped/);
  assert.match(fn, /return false;/, "it must actually block the add to cart");
});

// A silent early return makes "the plugin did not load", "the hook did not
// fire" and "this order had no such product" look identical from the order
// screen -- which is exactly what made an earlier investigation drag on.
test("every failure in the delivery handler leaves an order note", () => {
  const fnStart = PLUGIN.indexOf("function egbio_request_report_delivery");
  assert(fnStart > 0, "the delivery handler is not defined");
  const fn = PLUGIN.slice(fnStart, PLUGIN.indexOf("\n\t}\n}", fnStart));

  const returns = (fn.match(/\n\t\t\treturn;/g) || []).length;
  const notes = (fn.match(/add_order_note/g) || []).length;

  // Two returns are deliberately quiet and documented in the source: the
  // order has no report product (every code-only order reaches that line),
  // and delivery was already requested.
  assert(
    notes >= returns - 2,
    `${returns} early returns but only ${notes} order notes -- a silent failure is hiding`
  );
  assert.match(fn, /沒有票券/, "a missing ticket must be explained on the order");
  assert.match(fn, /EGBIO_PURCHASE_API_KEY 未設定/, "a missing key must be explained on the order");
});

// A failed delivery has to stay retryable: an order that paid and received
// nothing must not be marked done.
test("the delivery flag is set only after the request succeeds", () => {
  const fnStart = PLUGIN.indexOf("function egbio_request_report_delivery");
  const fn = PLUGIN.slice(fnStart, PLUGIN.indexOf("\n\t}\n}", fnStart));

  const flagAt = fn.indexOf("update_meta_data( EGBIO_REPORT_DELIVERY_META_KEY");
  const errorAt = fn.lastIndexOf("$code < 200");
  assert(flagAt > 0, "the delivery flag is never written");
  assert(errorAt > 0, "the error branch is missing");
  assert(flagAt > errorAt, "the flag must be written after the error check, not before");
});

// The data API keys idempotency on this string; WooCommerce retries
// webhooks and an order passes through more than one paid status.
test("the order reference is the one the API deduplicates on", () => {
  assert.match(PLUGIN, /'order_reference' => 'wc-order-' \. \$order->get_id\(\)/);
});

test("the two products stay on their own paths", () => {
  // Same hooks, same priority, different SKUs: one order may contain both.
  assert.match(PLUGIN, /define\( 'EGBIO_PRODUCT_SKU', 'AI-CANCER-RISK' \)/);
  assert.match(PLUGIN, /define\( 'EGBIO_REPORT_PRODUCT_SKU', 'AI-CANCER-REPORT' \)/);

  const codeHandler = PLUGIN.indexOf("function egbio_issue_ai_access_code");
  const reportHandler = PLUGIN.indexOf("function egbio_request_report_delivery");
  assert(codeHandler > 0 && reportHandler > 0);
  assert.notEqual(codeHandler, reportHandler);

  // The report path must never mint an access code: its buyer already
  // completed the questionnaire.
  const fn = PLUGIN.slice(reportHandler, PLUGIN.indexOf("\n\t}\n}", reportHandler));
  assert.doesNotMatch(fn, /egbio_get_ai_access_code|egbio_request_ai_access_code/);
});

// Buying only the report is an ordinary order, not an anomaly. The note it
// used to leave said "skipped" on every one of them, and a warning that
// fires on every normal order teaches support to stop reading the notes --
// which is the opposite of what that note was added for.
test("a report-only order leaves no access-code warning", () => {
  const fnStart = PLUGIN.indexOf("function egbio_issue_ai_access_code");
  const fn = PLUGIN.slice(fnStart, PLUGIN.indexOf("\n\t}\n}", fnStart));

  const noMatch = fn.indexOf("if ( ! egbio_order_has_ai_cancer_risk( $order ) ) {");
  const quiet = fn.indexOf("egbio_order_has_report_product( $order )", noMatch);
  const note = fn.indexOf("add_order_note", noMatch);

  assert(noMatch > 0, "the no-matching-product branch is gone");
  assert(quiet > noMatch, "the report-only case is not recognised");
  assert(quiet < note, "the quiet return must come before the note is written");

  // The note still has to exist for an order with neither product: that is
  // the case it was added to make visible.
  assert(note > 0, "an order with neither product must still be explained");
});

// The link in the free email lands on the site root, so without this the
// buyer is left looking at the homepage after pressing "取得完整報告".
// The redirect also drops the add-to-cart parameter from the address, so a
// refresh cannot add a second copy of a report that can only be delivered
// once.
test("adding the report to the cart goes straight to checkout", () => {
  assert.match(PLUGIN, /add_filter\(\s*'woocommerce_add_to_cart_redirect'/);

  const fnStart = PLUGIN.indexOf("function egbio_report_redirect_to_checkout");
  assert(fnStart > 0, "the redirect is not defined");
  const fn = PLUGIN.slice(fnStart, PLUGIN.indexOf("\n\t}\n}", fnStart));

  assert.match(fn, /wc_get_checkout_url/);

  // It must not redirect every product: the access-code product keeps the
  // store's own behaviour.
  const skuAt = fn.indexOf("EGBIO_REPORT_PRODUCT_SKU");
  const checkoutAt = fn.indexOf("wc_get_checkout_url");
  assert(skuAt > 0, "the redirect does not check which product was added");
  assert(skuAt < checkoutAt, "the SKU must be checked before the redirect is chosen");
  assert.match(fn, /return \$url;/, "a non-report product must keep the original url");
});
