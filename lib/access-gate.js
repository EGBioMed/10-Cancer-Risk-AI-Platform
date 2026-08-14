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

const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 64;

// Shared codes are staff-chosen and may be venue names in Chinese, so this
// deliberately does not restrict to ASCII/alphanumeric -- only control
// characters are rejected. toLowerCase() is a no-op on CJK text and only
// affects Latin text, so case-folding is safe either way.
function normalizeCode(raw) {
  if (typeof raw !== "string") return null;
  const collapsed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!collapsed) return null;
  const hasControlChar = [...collapsed].some((ch) => {
    const code = ch.codePointAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (hasControlChar) return null;
  if (collapsed.length < MIN_CODE_LENGTH || collapsed.length > MAX_CODE_LENGTH) return null;
  return collapsed;
}

// On-prem (Caddy) is a single reverse proxy directly in front of this
// process, so it appends the true client IP as the LAST hop of
// X-Forwarded-For -- trusting the first (client-supplied) entry there would
// let a caller spoof an arbitrary rate-limit key.
//
// Render is NOT a single hop: it sits behind Cloudflare, which is itself an
// anycast network of many edge nodes. The X-Forwarded-For chain there is
// "<real client>, <cloudflare edge node>" -- taking the last hop picks a
// Cloudflare edge IP that differs per request (confirmed empirically: two
// requests from the same real client, seconds apart, showed two different
// trailing IPs), which silently defeated per-IP rate limiting entirely
// rather than just being imprecise. Cloudflare's own CF-Connecting-IP
// header exists specifically to solve this -- it is set by Cloudflare
// itself (overwriting anything a client tried to pre-supply) and always
// reflects the true original client IP regardless of how many further
// internal hops Render adds after Cloudflare. Prefer it when present.
function getClientIp(forwardedForHeader, socketRemoteAddress, cfConnectingIp) {
  if (typeof cfConnectingIp === "string" && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }
  if (typeof forwardedForHeader === "string" && forwardedForHeader.trim()) {
    const parts = forwardedForHeader.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return socketRemoteAddress || "unknown";
}

// The denial/code-entry page itself must render without a session, so its
// own static assets (stylesheet, logo) have to stay reachable even when the
// gate is enforced -- otherwise the page that explains "you're blocked" is
// partly blocked too. These are non-sensitive, no-user-data files.
const GATE_EXEMPT_STATIC_PATHS = new Set(["/styles.css"]);

function isExemptFromGate(method, pathname) {
  if (pathname === "/api/health") return true;
  if (parseAccessToken(pathname)) return true;
  if (method === "POST" && pathname === "/api/access/redeem-code") return true;
  if (GATE_EXEMPT_STATIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/assets/")) return true;
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

// Deliberately a browser session cookie (no Max-Age/Expires): closing the
// browser clears it, so the next person at a shared front-desk computer
// must enter their own code/link rather than silently riding an earlier
// visitor's session. The signed payload's own `exp` claim (see
// signSessionCookie/verifySessionCookie) is still the real, server-enforced
// expiry -- this only removes the *extra* persistence a Max-Age cookie
// would otherwise have beyond the current browser session.
function buildCookieHeader(name, value, { secure = true } = {}) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  SESSION_COOKIE_NAME,
  MIN_CODE_LENGTH,
  MAX_CODE_LENGTH,
  generateRawToken,
  hashToken,
  constantTimeEqualHex,
  signSessionCookie,
  verifySessionCookie,
  parseAccessToken,
  normalizeCode,
  getClientIp,
  isExemptFromGate,
  parseCookies,
  buildCookieHeader
};
