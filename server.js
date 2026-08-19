const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  EXPECTED_VERSIONS,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");
const { buildPowerAutomatePayload } = require("./lib/power-automate-adapter");
const { createPostgresRepository } = require("./lib/postgres-repository");
const { createAzureAccessGateClient } = require("./lib/azure-access-gate-client");
const {
  SESSION_COOKIE_NAME,
  hashToken,
  signSessionCookie,
  verifySessionCookie,
  parseAccessToken,
  normalizeCode,
  getClientIp,
  isExemptFromGate,
  parseCookies,
  buildCookieHeader
} = require("./lib/access-gate");
const { createFixedWindowLimiter } = require("./lib/rate-limiter");

const PORT = Number(process.env.PORT || 3000);
const POWER_AUTOMATE_WEBHOOK_URL = process.env.POWER_AUTOMATE_WEBHOOK_URL || "";
const CONFIGURED_SUBMISSION_MODE = String(
  process.env.SUBMISSION_MODE || (POWER_AUTOMATE_WEBHOOK_URL ? "power-automate" : "postgres")
).toLowerCase();
const SUBMISSION_MODE = CONFIGURED_SUBMISSION_MODE === "local" ? "postgres" : CONFIGURED_SUBMISSION_MODE;
const HOST = process.env.HOST || (SUBMISSION_MODE === "power-automate" ? "0.0.0.0" : "127.0.0.1");
const MAX_BODY_BYTES = 1024 * 1024;
const SUBMISSION_VERSIONS = EXPECTED_VERSIONS;

// Fail-closed by default: any deployment that forgets to set ACCESS_GATE_MODE
// gets the enforced gate, never the fully-open behavior. Local development
// opts into ACCESS_GATE_MODE=open explicitly via .env.
const ACCESS_GATE_MODE = String(process.env.ACCESS_GATE_MODE || "enforced").toLowerCase();
const ACCESS_GATE_SESSION_SECRET = process.env.ACCESS_GATE_SESSION_SECRET || "";
const ACCESS_GATE_SESSION_TTL_SECONDS = Math.max(
  60,
  Math.round(Number(process.env.ACCESS_GATE_SESSION_TTL_HOURS || 0.5) * 3600)
);
const ACCESS_GATE_COOKIE_SECURE = String(process.env.ACCESS_GATE_COOKIE_SECURE ?? "true").toLowerCase() !== "false";
// Which backend answers gate reads/writes -- "postgres" (default, talks to
// Supabase directly) or "azure_mysql" (talks to egbiomed-ai-data-api's API,
// since that MySQL server is VNet-private and unreachable from here
// directly). A single env var flip is the whole rollback lever.
const ACCESS_GATE_BACKEND = String(process.env.ACCESS_GATE_BACKEND || "postgres").toLowerCase();
// Submission storage (research/contact/operations) is the only remaining
// reason this process needs Postgres -- the access gate has its own,
// independently-selected backend above.
const REQUIRES_POSTGRES = ["postgres", "dual"].includes(SUBMISSION_MODE);

// Shared codes are lower-entropy than link tokens and are typed by a human
// (often front-desk staff on behalf of many patients from one shared IP), so
// they get their own rate limiter -- link redemption keeps relying solely on
// 256-bit token entropy, unchanged. 60/10min comfortably covers a busy
// front desk while still throttling scripted guessing against a short code.
const codeRedeemLimiter = createFixedWindowLimiter({ windowMs: 10 * 60 * 1000, maxAttempts: 60 });
setInterval(() => codeRedeemLimiter.sweep(), 30 * 60 * 1000).unref();

// Applies regardless of ACCESS_GATE_MODE -- even with the gate open, a
// submission still writes to Postgres and (in dual mode) forwards to the
// Power Automate webhook, so flooding this endpoint has a real cost either
// way. A real person takes at least several minutes per questionnaire, so
// 20/10min per IP comfortably covers several concurrent kiosks behind one
// shared venue IP while still blocking a scripted flood of fake submissions.
const submitLimiter = createFixedWindowLimiter({ windowMs: 10 * 60 * 1000, maxAttempts: 20 });
setInterval(() => submitLimiter.sweep(), 30 * 60 * 1000).unref();

if (ACCESS_GATE_MODE === "enforced" && !ACCESS_GATE_SESSION_SECRET) {
  throw new Error(
    "ACCESS_GATE_SESSION_SECRET must be set when ACCESS_GATE_MODE=enforced. " +
    "Set ACCESS_GATE_MODE=open for local development instead."
  );
}

const PUBLIC_DIR = __dirname;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

let postgresRepository = null;
let postgresRepositoryError = null;
let postgresReady = Promise.resolve();
if (REQUIRES_POSTGRES) {
  postgresRepository = createPostgresRepository();
  postgresReady = postgresRepository.initialize().catch((error) => {
    postgresRepositoryError = error;
  });
}

// Separate from the submission-storage repository above: the gate can be
// on a different backend than submission storage, and today's production
// config (SUBMISSION_MODE=power-automate, ACCESS_GATE_BACKEND unset) needs
// this block active with REQUIRES_POSTGRES false -- proof the two were
// wrongly coupled together before this change.
let accessGateClient = null;
let accessGateClientError = null;
let accessGateReady = Promise.resolve();
if (ACCESS_GATE_MODE === "enforced") {
  accessGateClient = ACCESS_GATE_BACKEND === "azure_mysql"
    ? createAzureAccessGateClient()
    : createPostgresRepository({ requireAccessGateSchema: true });
  accessGateReady = accessGateClient.initialize().catch((error) => {
    accessGateClientError = error;
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let received = 0;

    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function findAnswer(rows, questionId) {
  if (!Array.isArray(rows)) return "";
  const row = rows.find((item) => item && item.question_id === questionId);
  return row && row.answer != null ? String(row.answer) : "";
}

function buildFallbackExcelRow(submission) {
  const recentDiscomfortText = findAnswer(submission.rows, "recent_discomfort");
  const personalCancerTypes = findAnswer(submission.rows, "personal_cancer_types");
  const noSymptom = /^(無|沒有|無不適|沒有不舒服|目前沒有|none|no|no symptoms|no discomfort)$/iu.test(recentDiscomfortText.trim());
  const researchFeatureRow = submission.research_feature_row && typeof submission.research_feature_row === "object"
    ? submission.research_feature_row
    : {};
  const researchExcelFields = Object.fromEntries(
    Object.entries(researchFeatureRow).map(([column, value]) => [`research_${column}`, value])
  );

  return {
    ...submission.optimized_feature_row,
    ...(submission.symptom_feature_row && typeof submission.symptom_feature_row === "object" ? submission.symptom_feature_row : {}),
    ...(submission.vnext_feature_row && typeof submission.vnext_feature_row === "object" ? submission.vnext_feature_row : {}),
    ...(submission.rule_input_row && typeof submission.rule_input_row === "object" ? submission.rule_input_row : {}),
    ...researchExcelFields,
    submitted_at: submission.submitted_at || new Date().toISOString(),
    language: submission.language || "zh",
    report_language: submission.report_language || submission.language || "zh-Hant",
    personal_cancer_types: personalCancerTypes,
    recent_discomfort_text: recentDiscomfortText,
    recent_discomfort_no_symptom: noSymptom ? 1 : 0,
    recent_discomfort_body_parts: "",
    recent_discomfort_symptoms: "",
    recent_discomfort_duration: "",
    recent_discomfort_severity: "",
    recent_discomfort_care_seeking: "",
    recent_discomfort_follow_up: "",
    recent_discomfort_ready_to_close: noSymptom ? 1 : 0
  };
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildAiApiFeatureRow(submission) {
  const row = {
    ...submission.optimized_feature_row
  };
  row.quit_smoking = Math.max(0, normalizeNumber(row.quit_smoking) ?? 0);
  return row;
}

function normalizeSubmission(submission) {
  if (!submission.excel_row || typeof submission.excel_row !== "object") {
    submission.excel_row = buildFallbackExcelRow(submission);
  }
  if (!submission.ai_api_feature_row || typeof submission.ai_api_feature_row !== "object") {
    submission.ai_api_feature_row = buildAiApiFeatureRow(submission);
  }
  return submission;
}

function buildContactRow(submission, email) {
  const recordId = String(
    submission.optimized_feature_row?.record_id
    || submission.excel_row?.record_id
    || ""
  ).trim();

  return {
    record_id: recordId,
    email,
    submitted_at: submission.submitted_at || new Date().toISOString(),
    language: submission.language || "zh",
    report_language: submission.report_language || submission.language || "zh-Hant"
  };
}

function validateAiApiFeatureRow(row) {
  const rules = [
    { field: "age", min: 0, max: 120 },
    { field: "height_cm", min: 100, max: 250 },
    { field: "weight_kg", min: 20, max: 300 },
    { field: "bmi", min: 10, max: 100 }
  ];

  for (const rule of rules) {
    const value = normalizeNumber(row?.[rule.field]);
    if (value == null || value < rule.min || value > rule.max) {
      return {
        field: rule.field,
        value: row?.[rule.field],
        min: rule.min,
        max: rule.max
      };
    }
  }
  return null;
}

function getValidSubmissionEmail(submission) {
  const email = String(submission.email || findAnswer(submission.rows, "email") || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function receiveSubmission(req, res) {
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { ok: false, error: "Content-Type must be application/json." });
    return;
  }
  let submission;
  try {
    const rawBody = await readRequestBody(req);
    submission = JSON.parse(rawBody);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
    return;
  }

  const contractErrors = validateTransitionalSubmission(submission);
  if (contractErrors.length > 0) {
    sendJson(res, 422, {
      ok: false,
      error: "Submission does not match the frozen frontend contract.",
      contract_version: SUBMISSION_VERSIONS.contract_version,
      details: contractErrors.slice(0, 20)
    });
    return;
  }
  submission = normalizeSubmission(submission);

  // Security/data-integrity: record_id is the primary key for research.assessments
  // and must not be derived from client-controlled input (see DATA_CONTRACT.md).
  // The client still sends a placeholder id for offline/display use, but the
  // server overwrites it here with a collision-resistant UUID before any
  // downstream persistence, forwarding, or contact_row derivation happens.
  const recordId = crypto.randomUUID();
  if (submission.optimized_feature_row && typeof submission.optimized_feature_row === "object") {
    submission.optimized_feature_row.record_id = recordId;
  }
  if (submission.excel_row && typeof submission.excel_row === "object") {
    submission.excel_row.record_id = recordId;
  }
  if (submission.ai_api_feature_row && typeof submission.ai_api_feature_row === "object") {
    submission.ai_api_feature_row.record_id = recordId;
  }

  const validEmail = getValidSubmissionEmail(submission);
  if (!validEmail) {
    sendJson(res, 422, {
      ok: false,
      error: "A valid email address is required."
    });
    return;
  }
  submission.email = validEmail;
  submission.contact_row = buildContactRow(submission, validEmail);
  if (Array.isArray(submission.rows)) {
    submission.rows = submission.rows
      .filter((row) => row && row.question_id !== "email")
      .map((row) => {
        const deidentifiedRow = { ...row };
        delete deidentifiedRow.email;
        return deidentifiedRow;
      });
  }
  if (submission.excel_row && typeof submission.excel_row === "object") {
    delete submission.excel_row.email;
  }
  const featureValidationError = validateAiApiFeatureRow(submission.ai_api_feature_row);
  if (featureValidationError) {
    sendJson(res, 422, {
      ok: false,
      error: "Invalid core measurement.",
      detail: featureValidationError
    });
    return;
  }

  let postgresResult = null;
  if (["postgres", "dual"].includes(SUBMISSION_MODE)) {
    await postgresReady;
    if (!postgresRepository || postgresRepositoryError) {
      sendJson(res, 503, {
        ok: false,
        error: "PostgreSQL storage is not ready.",
        detail: postgresRepositoryError?.message || "PostgreSQL repository initialization failed."
      });
      return;
    }
    try {
      postgresResult = await postgresRepository.saveSubmission(submission);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "Could not persist the submission in PostgreSQL.",
        detail: error.message
      });
      return;
    }
  }

  if (SUBMISSION_MODE === "postgres") {
    sendJson(res, 202, {
      ok: true,
      record_id: postgresResult.recordId,
      duplicate: postgresResult.duplicate,
      storage: "postgresql",
      processing_status: "stored_postgresql",
      report_status: "pending_model_migration"
    });
    return;
  }

  if (!["power-automate", "dual"].includes(SUBMISSION_MODE)) {
    sendJson(res, 503, { ok: false, error: "Unsupported SUBMISSION_MODE configuration." });
    return;
  }
  if (!POWER_AUTOMATE_WEBHOOK_URL) {
    sendJson(res, 503, { ok: false, error: "POWER_AUTOMATE_WEBHOOK_URL is not configured." });
    return;
  }

  try {
    const powerAutomatePayload = buildPowerAutomatePayload(submission);
    const response = await fetch(POWER_AUTOMATE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(powerAutomatePayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, 502, {
        ok: false,
        error: "Power Automate rejected the submission.",
        status: response.status,
        detail: errorText.slice(0, 500)
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      record_id: postgresResult?.recordId,
      storage: postgresResult ? "postgresql_and_power_automate" : "power_automate",
      processing_status: "forwarded",
      report_status: "processing"
    });
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: "Could not forward submission."
    });
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR) || filePath === __filename) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// index.html doubles as the access-gate entry page: an unauthenticated
// visitor gets the SAME file with three regions swapped out server-side,
// marked by HTML comment pairs (invisible, and a no-op for the normal
// authorized path, which streams index.html untouched via serveStatic).
// See GATE_FORM_HTML below for what replaces the removed call-to-action.
const GATE_MARKERS = {
  langswitch: ["<!--GATE:LANGSWITCH_START-->", "<!--GATE:LANGSWITCH_END-->"],
  cta: ["<!--GATE:CTA_START-->", "<!--GATE:CTA_END-->"],
  workspace: ["<!--GATE:WORKSPACE_START-->", "<!--GATE:WORKSPACE_END-->"],
  scripts: ["<!--GATE:SCRIPTS_START-->", "<!--GATE:SCRIPTS_END-->"]
};

const GATE_FORM_HTML = `
          <section class="validation-card access-gate-panel" aria-labelledby="accessGateTitle">
            <h2 id="accessGateTitle">需要授權才能使用 / Authorization required</h2>
            <p>本服務採付費使用制。請透過購買方案取得您的專屬連結，或在下方輸入所屬機構提供的存取代碼以繼續。</p>
            <p>This assessment requires payment to access. Purchase a plan to receive your personal link, or enter the access code provided by your organization below to continue.</p>
            <form class="access-gate-form" id="code-form">
              <label for="code-input">存取代碼 / Access code</label>
              <div class="access-gate-row">
                <input class="access-gate-input" id="code-input" name="code" type="text" autocomplete="off" required minlength="6" placeholder="存取代碼 / Access code" />
                <button class="primary-action" type="submit">繼續 / Continue</button>
              </div>
              <p class="access-gate-error" id="code-error" role="alert" hidden></p>
            </form>
            <p class="access-gate-support">
              已經有專屬連結卻無法開啟？請聯繫 <a href="mailto:egbiomedai@eg-bio.com">egbiomedai@eg-bio.com</a>。
              Trouble with a personal link? Contact <a href="mailto:egbiomedai@eg-bio.com">egbiomedai@eg-bio.com</a>.
            </p>
          </section>
          <script>
            document.getElementById("code-form").addEventListener("submit", async function (event) {
              event.preventDefault();
              var button = event.target.querySelector("button");
              var errorEl = document.getElementById("code-error");
              var input = document.getElementById("code-input");
              errorEl.hidden = true;
              button.disabled = true;
              try {
                var response = await fetch("/api/access/redeem-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({ code: input.value })
                });
                if (response.ok) {
                  window.location.href = "/";
                  return;
                }
                errorEl.textContent = "代碼無法辨識，請確認後再試一次。 / Code not recognized. Please check it and try again.";
                errorEl.hidden = false;
              } catch (error) {
                errorEl.textContent = "網路錯誤，請再試一次。 / Network error. Please try again.";
                errorEl.hidden = false;
              } finally {
                button.disabled = false;
              }
            });
          </script>`;

function stripMarkerRegion(html, [startMarker, endMarker], replacement = "") {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) return html;
  return html.slice(0, start) + replacement + html.slice(end + endMarker.length);
}

let cachedGatedIndexHtml = null;
function buildGatedIndexHtml() {
  if (cachedGatedIndexHtml) return cachedGatedIndexHtml;
  let html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
  html = stripMarkerRegion(html, GATE_MARKERS.langswitch);
  html = stripMarkerRegion(html, GATE_MARKERS.cta, GATE_FORM_HTML);
  html = stripMarkerRegion(html, GATE_MARKERS.workspace);
  html = stripMarkerRegion(html, GATE_MARKERS.scripts);
  cachedGatedIndexHtml = html;
  return html;
}

function serveGatedIndex(res, statusCode) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(buildGatedIndexHtml());
}

function redirectToHome(res) {
  res.writeHead(302, { Location: "/" });
  res.end();
}

function buildAccessSessionCookie(grantId) {
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ACCESS_GATE_SESSION_TTL_SECONDS;
  const cookieValue = signSessionCookie({ grantId, exp: expiresAtSeconds }, ACCESS_GATE_SESSION_SECRET);
  return buildCookieHeader(SESSION_COOKIE_NAME, cookieValue, {
    secure: ACCESS_GATE_COOKIE_SECURE
  });
}

async function handleAccessRedemption(req, res, rawToken) {
  if (ACCESS_GATE_MODE !== "enforced") {
    redirectToHome(res);
    return;
  }

  await accessGateReady;
  if (!accessGateClient || accessGateClientError) {
    redirectToHome(res);
    return;
  }

  let result;
  try {
    result = await accessGateClient.redeemAccessGrant({ tokenHash: hashToken(rawToken) });
  } catch (error) {
    redirectToHome(res);
    return;
  }

  if (!result.ok) {
    // Same generic denial for every failure reason (not_found/expired/
    // already_used/revoked) so the response never tells a caller which
    // one applies; the real reason is only in operations.access_events.
    // The homepage itself is the gate view for an unauthenticated visitor,
    // so redirecting there (rather than a dedicated error page) already
    // shows the code-entry form with no further detail.
    redirectToHome(res);
    return;
  }

  res.writeHead(302, {
    "Set-Cookie": buildAccessSessionCookie(result.grantId),
    Location: "/"
  });
  res.end();
}

async function handleCodeRedemption(req, res) {
  const clientIp = getClientIp(req.headers["x-forwarded-for"], req.socket.remoteAddress, req.headers["cf-connecting-ip"]);
  if (!codeRedeemLimiter.check(clientIp)) {
    sendJson(res, 429, { ok: false, error: "Too many attempts. Please wait and try again." });
    return;
  }

  if (ACCESS_GATE_MODE !== "enforced") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { ok: false, error: "Content-Type must be application/json." });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readRequestBody(req));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
    return;
  }

  const normalized = normalizeCode(body && body.code);
  if (!normalized) {
    // Same generic wording as every other denial reason -- don't reveal
    // whether the issue was format/length vs. simply not found.
    sendJson(res, 403, { ok: false, error: "Code not recognized. Please check it and try again." });
    return;
  }

  await accessGateReady;
  if (!accessGateClient || accessGateClientError) {
    sendJson(res, 503, { ok: false, error: "Service unavailable." });
    return;
  }

  let result;
  try {
    result = await accessGateClient.redeemAccessGrant({ tokenHash: hashToken(normalized) });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: "Service unavailable." });
    return;
  }

  if (!result.ok) {
    sendJson(res, 403, { ok: false, error: "Code not recognized. Please check it and try again." });
    return;
  }

  res.setHeader("Set-Cookie", buildAccessSessionCookie(result.grantId));
  sendJson(res, 200, { ok: true });
}

function isSessionAuthorized(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  if (!sessionCookie) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Boolean(verifySessionCookie(sessionCookie, ACCESS_GATE_SESSION_SECRET, nowSeconds));
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);

  if (req.method === "GET" || req.method === "HEAD") {
    const accessToken = parseAccessToken(pathname);
    if (accessToken) {
      await handleAccessRedemption(req, res, accessToken);
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/access/redeem-code") {
    await handleCodeRedemption(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/health") {
    await postgresReady;
    let databaseReady = false;
    if (postgresRepository && !postgresRepositoryError) {
      try {
        await postgresRepository.health();
        databaseReady = true;
      } catch (error) {
        postgresRepositoryError = error;
      }
    }

    await accessGateReady;
    let accessGateReadyNow = false;
    if (accessGateClient && !accessGateClientError) {
      try {
        await accessGateClient.health();
        accessGateReadyNow = true;
      } catch (error) {
        accessGateClientError = error;
      }
    }

    const ok = (!REQUIRES_POSTGRES || databaseReady)
      && (ACCESS_GATE_MODE !== "enforced" || accessGateReadyNow);
    sendJson(res, ok ? 200 : 503, {
      ok,
      service: "eg-biomed-cancer-risk-platform",
      submission_mode: SUBMISSION_MODE,
      access_gate_mode: ACCESS_GATE_MODE,
      database: REQUIRES_POSTGRES ? "postgresql" : undefined,
      database_ready: REQUIRES_POSTGRES ? databaseReady : undefined,
      access_gate_backend: ACCESS_GATE_MODE === "enforced" ? ACCESS_GATE_BACKEND : undefined,
      access_gate_ready: ACCESS_GATE_MODE === "enforced" ? accessGateReadyNow : undefined
    });
    return;
  }

  if (ACCESS_GATE_MODE === "enforced" && !isExemptFromGate(req.method, pathname) && !isSessionAuthorized(req)) {
    if (req.method === "GET" || req.method === "HEAD") {
      if (pathname === "/" || pathname === "/index.html") {
        serveGatedIndex(res, 403);
      } else {
        // Any other unauthenticated GET/HEAD lands on the same gate view.
        redirectToHome(res);
      }
    } else {
      sendJson(res, 403, { ok: false, error: "Access requires a valid payment confirmation link." });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/submit") {
    const clientIp = getClientIp(req.headers["x-forwarded-for"], req.socket.remoteAddress, req.headers["cf-connecting-ip"]);
    if (!submitLimiter.check(clientIp)) {
      sendJson(res, 429, { ok: false, error: "Too many submissions from this network. Please wait and try again." });
      return;
    }
    await receiveSubmission(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed." });
});

server.listen(PORT, HOST, () => {
  console.log(`EG BioMed assessment server listening on ${HOST}:${PORT} (${SUBMISSION_MODE} mode)`);
});

function shutdown() {
  server.close(async () => {
    await postgresRepository?.close();
    await accessGateClient?.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
