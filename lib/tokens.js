/**
 * Token primitives for custom JWT authentication.
 *
 *   Access token : JWT, HS256 (pinned), iss/aud checked, short-lived (JWT_ACCESS_TTL, default 15m)
 *                  payload { sub, kind, tv, sid, iss, aud, iat, exp }
 *   Refresh token: opaque 32 random bytes (base64url), sent only as the HttpOnly `ss_rt`
 *                  cookie; only its SHA-256 hash is stored (models/AuthSession).
 *
 * Config is read from process.env at call time. Secret values are never logged.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ISSUER = "shaadisahulat-api";
const AUDIENCE = "shaadisahulat-web";
const ALGORITHM = "HS256";
const KINDS = ["buyer", "seller", "admin"];

const REFRESH_COOKIE = "ss_rt";
const REFRESH_COOKIE_PATH = "/api/auth";
const MIN_SECRET_LENGTH = 32;
const DAY_MS = 24 * 60 * 60 * 1000;

class TokenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // TOKEN_EXPIRED | INVALID_TOKEN
  }
}

function _positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function getAuthConfig() {
  return {
    accessSecret:  process.env.JWT_ACCESS_SECRET || "",
    accessTtl:     process.env.JWT_ACCESS_TTL || "15m",
    refreshTtlDays:      _positiveInt("REFRESH_TTL_DAYS", 7),
    refreshAbsoluteDays: _positiveInt("REFRESH_ABSOLUTE_DAYS", 30),
    frontendOrigin: process.env.FRONTEND_ORIGIN || "",
    secureCookies:  process.env.NODE_ENV === "production",
  };
}

/**
 * Startup validation. Returns a list of problems (variable NAMES only, never values).
 */
function validateAuthConfig() {
  const cfg = getAuthConfig();
  const problems = [];

  if (!cfg.accessSecret) problems.push("JWT_ACCESS_SECRET is missing");
  else if (cfg.accessSecret.length < MIN_SECRET_LENGTH)
    problems.push(`JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);

  if (!process.env.INTERNAL_API_SECRET) problems.push("INTERNAL_API_SECRET is missing");

  if (!cfg.frontendOrigin) problems.push("FRONTEND_ORIGIN is missing");
  else {
    try {
      const u = new URL(cfg.frontendOrigin);
      if (u.origin !== cfg.frontendOrigin.replace(/\/$/, ""))
        problems.push("FRONTEND_ORIGIN must be an origin only, e.g. http://localhost:3000");
    } catch {
      problems.push("FRONTEND_ORIGIN is not a valid URL");
    }
  }

  if (Number.isNaN(cfg.refreshTtlDays)) problems.push("REFRESH_TTL_DAYS must be a positive integer");
  if (Number.isNaN(cfg.refreshAbsoluteDays)) problems.push("REFRESH_ABSOLUTE_DAYS must be a positive integer");
  if (cfg.refreshTtlDays > cfg.refreshAbsoluteDays)
    problems.push("REFRESH_TTL_DAYS must not exceed REFRESH_ABSOLUTE_DAYS");

  try {
    jwt.sign({}, "x".repeat(MIN_SECRET_LENGTH), { algorithm: ALGORITHM, expiresIn: cfg.accessTtl });
  } catch {
    problems.push("JWT_ACCESS_TTL is not a valid duration (e.g. 15m)");
  }

  return problems;
}

// ── Access token ─────────────────────────────────────────────────────────────

function signAccessToken({ sub, kind, tv = 0, sid }) {
  const { accessSecret, accessTtl } = getAuthConfig();
  if (!accessSecret) throw new Error("JWT_ACCESS_SECRET is not configured");
  if (!KINDS.includes(kind)) throw new Error("invalid token kind");
  if (typeof sub !== "string" || !sub) throw new Error("invalid token subject");
  if (typeof sid !== "string" || !sid) throw new Error("invalid session id");

  return jwt.sign({ kind, tv, sid }, accessSecret, {
    algorithm: ALGORITHM,
    expiresIn: accessTtl,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: sub,
  });
}

/** Verify signature, algorithm, issuer, audience and expiry; returns the payload. */
function verifyAccessToken(token) {
  const { accessSecret } = getAuthConfig();
  if (!accessSecret) throw new TokenError("INVALID_TOKEN", "Authentication is not configured");

  let payload;
  try {
    payload = jwt.verify(token, accessSecret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch (err) {
    if (err.name === "TokenExpiredError") throw new TokenError("TOKEN_EXPIRED", "Access token expired");
    throw new TokenError("INVALID_TOKEN", "Invalid access token");
  }

  const shapeOk =
    payload &&
    typeof payload.sub === "string" && payload.sub &&
    KINDS.includes(payload.kind) &&
    Number.isInteger(payload.tv) &&
    typeof payload.sid === "string" && payload.sid;
  if (!shapeOk) throw new TokenError("INVALID_TOKEN", "Invalid access token");

  return payload;
}

/** Seconds until an access token issued now expires (for client scheduling). */
function accessTokenTtlSeconds(token) {
  const decoded = jwt.decode(token);
  return decoded?.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : 0;
}

// ── Refresh token ────────────────────────────────────────────────────────────

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw), "utf8").digest("hex");
}

// ── One-time account tokens (password reset / email verification) ───────────

const ONE_TIME_PURPOSES = ["reset", "verify"];
const ONE_TIME_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

/** 32 bytes from the CSPRNG, base64url. The raw value is only ever emailed. */
function generateOneTimeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Purpose-bound SHA-256 of a one-time token (what is stored in MongoDB).
 * Binding the purpose means a reset token can never match a verify hash and vice versa.
 */
function hashOneTimeToken(purpose, raw) {
  if (!ONE_TIME_PURPOSES.includes(purpose)) throw new Error("invalid token purpose");
  return crypto.createHash("sha256").update(`${purpose}:${String(raw)}`, "utf8").digest("hex");
}

function isWellFormedOneTimeToken(raw) {
  return typeof raw === "string" && ONE_TIME_TOKEN_RE.test(raw);
}

function refreshCookieOptions(expiresAt) {
  const { secureCookies } = getAuthConfig();
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies,
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  };
}

function setRefreshCookie(res, raw, expiresAt) {
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res) {
  const { secureCookies } = getAuthConfig();
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true, sameSite: "strict", secure: secureCookies, path: REFRESH_COOKIE_PATH,
  });
}

module.exports = {
  ISSUER, AUDIENCE, ALGORITHM, KINDS, DAY_MS,
  REFRESH_COOKIE, REFRESH_COOKIE_PATH, MIN_SECRET_LENGTH,
  TokenError,
  getAuthConfig, validateAuthConfig,
  signAccessToken, verifyAccessToken, accessTokenTtlSeconds,
  generateRefreshToken, hashToken,
  generateOneTimeToken, hashOneTimeToken, isWellFormedOneTimeToken,
  refreshCookieOptions, setRefreshCookie, clearRefreshCookie,
};
