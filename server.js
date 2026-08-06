const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  EXPECTED_VERSIONS,
  validateTransitionalSubmission
} = require("./lib/transitional-contract");
const { buildPowerAutomatePayload } = require("./lib/power-automate-adapter");

const PORT = Number(process.env.PORT || 3000);
const POWER_AUTOMATE_WEBHOOK_URL = process.env.POWER_AUTOMATE_WEBHOOK_URL || "";
const MAX_BODY_BYTES = 1024 * 1024;
const SUBMISSION_VERSIONS = EXPECTED_VERSIONS;

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

async function forwardSubmission(req, res) {
  if (!POWER_AUTOMATE_WEBHOOK_URL) {
    sendJson(res, 503, {
      ok: false,
      error: "POWER_AUTOMATE_WEBHOOK_URL is not configured."
    });
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

    sendJson(res, 200, { ok: true });
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

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  if (req.method === "POST" && req.url === "/api/submit") {
    await forwardSubmission(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed." });
});

server.listen(PORT, () => {
  console.log(`EG BioMed assessment server listening on port ${PORT}`);
});
