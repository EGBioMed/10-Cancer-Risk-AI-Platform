const crypto = require("crypto");

const SESSION_COOKIE_NAME = "eg_access_session";
const ACCESS_TOKEN_PATH_PATTERN = /^\/access\/([A-Za-z0-9_-]{32,64})$/;

function generateRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

function constantTimeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch (error) {
    return false;
  }
}

function signSessionCookie(payload, secret) {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${signature}`;
}

function verifySessionCookie(cookieValue, secret, now) {
  if (typeof cookieValue !== "string") return null;
  const separatorIndex = cookieValue.indexOf(".");
  if (separatorIndex === -1) return null;
  const payloadB64 = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  if (!payloadB64 || !signature) return null;

  const expectedSignature = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  if (!constantTimeEqualHex(expectedSignature, signature)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || now > payload.exp) return null;
  return payload;
}

function parseAccessToken(pathname) {
  const match = ACCESS_TOKEN_PATH_PATTERN.exec(String(pathname || ""));
  return match ? match[1] : null;
}

function isExemptFromGate(method, pathname) {
  if (pathname === "/api/health") return true;
  if (parseAccessToken(pathname)) return true;
  return false;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  for (const part of String(cookieHeader).split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      cookies[trimmed] = "";
      continue;
    }
    const name = decodeURIComponent(trimmed.slice(0, separatorIndex).trim());
    const value = decodeURIComponent(trimmed.slice(separatorIndex + 1).trim());
    cookies[name] = value;
  }
  return cookies;
}

function buildCookieHeader(name, value, { ttlSeconds, secure = true }) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ttlSeconds)}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  SESSION_COOKIE_NAME,
  generateRawToken,
  hashToken,
  constantTimeEqualHex,
  signSessionCookie,
  verifySessionCookie,
  parseAccessToken,
  isExemptFromGate,
  parseCookies,
  buildCookieHeader
};
