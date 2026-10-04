/**
 * Authentication middleware — JWT only (Phase 2I).
 *
 * `Authorization: Bearer <access token>` is the ONLY way to identify a user.
 *    The token is verified (HS256 pinned, iss/aud/exp — see lib/tokens.js), then the
 *    profile is loaded from MongoDB by the token's kind + sub:
 *      buyer  → buyers.buyer_id    seller → sellers.seller_id    admin → admins.admin_id
 *    and checked for token_version (tv) and login_disabled. The role is the collection
 *    the profile was found in.
 *    If an Authorization header is present but invalid, the request is rejected.
 *
 * The pre-JWT identity headers (x-user-id / x-user-role) were removed in Phase 2I:
 * they are ignored everywhere and there is no switch that can turn them back on.
 *
 * Bank officers keep their separate in-memory token (x-officer-token).
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const { verifyAccessToken } = require("./tokens");

const SELLERS_COLLECTION = "sellers"; // owned by visual-ml-service (config.py)

// ── Profile resolution ──────────────────────────────────────────────────────

/** Strip credential / auth-state fields before a profile can reach a client. */
function sanitizeProfile(doc) {
  if (!doc) return null;
  const { password_hash, auth, __v, ...rest } = doc;
  return rest;
}

async function loadProfileDoc(kind, id) {
  if (typeof id !== "string" || !id) return null;
  if (kind === "buyer") {
    const Buyer = require("../models/Buyer");
    return Buyer.findOne({ buyer_id: id }).select("+auth").lean();
  }
  if (kind === "admin") {
    const Admin = require("../models/Admin");
    return Admin.findOne({ admin_id: id }).select("+auth").lean();
  }
  if (kind === "seller") {
    return mongoose.connection
      .collection(SELLERS_COLLECTION)
      .findOne({ seller_id: id }, { projection: { password_hash: 0 } });
  }
  return null;
}

/**
 * Load and validate the profile behind an identity.
 * Pass `tv` to require a matching token_version (omit it to skip that check).
 * Returns { ok: true, user, tokenVersion } or { ok: false, reason }.
 */
async function resolveProfile(kind, id, tv) {
  const doc = await loadProfileDoc(kind, id);
  if (!doc) return { ok: false, reason: "PROFILE_NOT_FOUND" };

  const authState = doc.auth || {};
  if (authState.login_disabled === true) return { ok: false, reason: "ACCOUNT_DISABLED" };

  const tokenVersion = Number.isInteger(authState.token_version) ? authState.token_version : 0;
  if (tv !== undefined && tv !== tokenVersion) return { ok: false, reason: "TOKEN_REVOKED" };

  return {
    ok: true,
    tokenVersion,
    user: {
      role: kind,
      id,
      name: doc.name || "",
      email: doc.email || "",
      email_verified: authState.email_verified !== false, // legacy accounts count as verified
      profile: sanitizeProfile(doc),
    },
  };
}

/**
 * Single source of truth for access-token identity (HTTP and Socket.IO):
 * verify the JWT (signature, HS256, iss, aud, exp, claim shape), then load the
 * profile and check token_version + login_disabled.
 * Returns { ok: true, user, payload } or { ok: false, code }.
 */
async function verifyAndResolveToken(token) {
  if (typeof token !== "string" || !token || token.length > 4096) return { ok: false, code: "INVALID_TOKEN" };
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return { ok: false, code: err.code || "INVALID_TOKEN" };
  }
  const resolved = await resolveProfile(payload.kind, payload.sub, payload.tv);
  if (!resolved.ok) return { ok: false, code: resolved.reason };
  return { ok: true, payload, user: { ...resolved.user, sid: payload.sid, auth_method: "jwt" } };
}

// ── Request authentication ─────────────────────────────────────────────────

/**
 * Returns one of:
 *   { status: "jwt",    user }
 *   { status: "none" }
 *   { status: "error",  code }   (invalid / expired / revoked token)
 */
async function _identify(req) {
  const header = req.headers.authorization;

  if (header !== undefined) {
    const match = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/.exec(String(header).trim());
    if (!match) return { status: "error", code: "INVALID_TOKEN" };

    const verified = await verifyAndResolveToken(match[1]);
    if (!verified.ok) return { status: "error", code: verified.code };
    return { status: "jwt", user: verified.user };
  }

  return { status: "none" };
}

const ERROR_MESSAGES = {
  TOKEN_EXPIRED:     "Access token expired.",
  INVALID_TOKEN:     "Invalid access token.",
  TOKEN_REVOKED:     "Session has been revoked. Please sign in again.",
  PROFILE_NOT_FOUND: "Account not found. Please sign in again.",
  ACCOUNT_DISABLED:  "This account cannot sign in.",
};

function _sendAuthError(res, code) {
  return res.status(401).json({
    success: false,
    code,
    error: ERROR_MESSAGES[code] || "Authentication required.",
  });
}

function _wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Any authenticated identity (verified JWT). */
const authenticate = _wrap(async (req, res, next) => {
  const r = await _identify(req);
  if (r.status === "error") return _sendAuthError(res, r.code);
  if (r.status === "none") {
    return res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: "Authentication required." });
  }
  req.user = r.user;
  next();
});

/** Kept as a named export for /api/auth routes; identical to authenticate (JWT only). */
const authenticateJwt = authenticate;

/** Attach req.user when credentials are present; anonymous requests continue. */
const optionalAuth = _wrap(async (req, res, next) => {
  const r = await _identify(req);
  if (r.status === "error") return _sendAuthError(res, r.code);
  if (r.status !== "none") req.user = r.user;
  next();
});

const ROLE_REQUIRED_MESSAGES = {
  buyer:  "Buyer authentication required.",
  seller: "Seller authentication required.",
  admin:  "Admin authentication required.",
};

function _requireRole(role) {
  return _wrap(async (req, res, next) => {
    const r = await _identify(req);
    if (r.status === "error") return _sendAuthError(res, r.code);
    if (r.status === "none") {
      return res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: ROLE_REQUIRED_MESSAGES[role] });
    }
    if (r.user.role !== role) {
      return res.status(403).json({ success: false, code: "FORBIDDEN_ROLE", error: "You do not have access to this resource." });
    }
    req.user = r.user;
    next();
  });
}

const requireBuyer  = _requireRole("buyer");
const requireSeller = _requireRole("seller");
const requireAdmin  = _requireRole("admin");

/** Attach req.user only if the caller is a buyer (kept for existing imports). */
const optionalBuyer = _wrap(async (req, res, next) => {
  const r = await _identify(req);
  if (r.status === "error") return _sendAuthError(res, r.code);
  if (r.status === "jwt" && r.user.role === "buyer") req.user = r.user;
  next();
});

// ── Bank officer (CSPRNG tokens since Phase 2I) ────────────────────────────────────────────────

/**
 * Bank officer middleware. Validates x-officer-token against the in-memory
 * token registry populated by /api/bank/login. Tokens expire after 8 hours.
 */
const OFFICER_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const _officerTokens = new Map(); // token -> { officer_id, bank_id, name, expires_at }

function issueOfficerToken(officer) {
  // 256 bits from the OS CSPRNG (base64url, 43 chars) — unguessable, unlike Math.random().
  const token = crypto.randomBytes(32).toString("base64url");
  // Drop expired entries so the in-memory registry cannot grow without bound.
  const now = Date.now();
  for (const [t, e] of _officerTokens) if (e.expires_at < now) _officerTokens.delete(t);
  _officerTokens.set(token, {
    officer_id: officer.officer_id,
    bank_id: officer.bank_id,
    name: officer.name,
    expires_at: Date.now() + OFFICER_TOKEN_TTL_MS,
  });
  return token;
}

function requireBankOfficer(req, res, next) {
  const token = req.header("x-officer-token");
  if (!token || typeof token !== "string" || token.length > 200) {
    return res.status(401).json({ success: false, error: "Bank officer token required (x-officer-token header)." });
  }
  const entry = _officerTokens.get(token);
  if (!entry || entry.expires_at < Date.now()) {
    _officerTokens.delete(token);
    return res.status(401).json({ success: false, error: "Bank officer token expired or invalid." });
  }
  req.officer = entry;
  next();
}

module.exports = {
  // existing exports
  requireBuyer,
  requireSeller,
  requireAdmin,
  requireBankOfficer,
  optionalBuyer,
  issueOfficerToken,
  // Phase 2A
  authenticate,
  authenticateJwt,
  optionalAuth,
  resolveProfile,
  sanitizeProfile,
  verifyAndResolveToken,
};
