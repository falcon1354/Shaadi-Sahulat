/**
 * Refresh-token session service (rotation + reuse detection).
 *
 *   createSession  → new family (session_id) + first refresh token
 *   rotateSession  → presented token is atomically revoked ("rotated") and replaced
 *                    by a new token in the same family (sliding expiry, capped by the
 *                    family's absolute expiry).
 *   Reuse detection: presenting an already-rotated token is treated as theft and
 *                    revokes ALL of that user's sessions — except within a short grace
 *                    window, so two tabs refreshing at the same moment don't log the
 *                    user out (the grace path issues an access token but no new cookie).
 *
 * Raw refresh tokens are never stored; only hashToken(raw).
 */

const crypto = require("crypto");
const AuthSession = require("../models/AuthSession");
const { resolveProfile } = require("./auth");
const {
  DAY_MS, getAuthConfig, generateRefreshToken, hashToken, signAccessToken,
} = require("./tokens");

const ROTATION_GRACE_MS = 30 * 1000;

class SessionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // REFRESH_INVALID | REFRESH_EXPIRED | REFRESH_REUSED | PROFILE_NOT_FOUND | ACCOUNT_DISABLED
  }
}

function _clientMeta(req) {
  return {
    user_agent: String(req?.headers?.["user-agent"] || "").slice(0, 300),
    ip: String(req?.ip || "").slice(0, 64),
  };
}

function _slidingExpiry(now, absoluteExpiresAt) {
  const { refreshTtlDays } = getAuthConfig();
  return new Date(Math.min(now.getTime() + refreshTtlDays * DAY_MS, absoluteExpiresAt.getTime()));
}

function _issueAccess(kind, id, tokenVersion, sessionId) {
  return signAccessToken({ sub: id, kind, tv: tokenVersion, sid: sessionId });
}

/**
 * Start a new session family. Returns { refreshToken, expiresAt, sessionId }.
 * (Used by the login endpoints added in Phase 2B–2D.)
 */
async function createSession({ kind, id, req }) {
  const now = new Date();
  const { refreshAbsoluteDays } = getAuthConfig();
  const absolute = new Date(now.getTime() + refreshAbsoluteDays * DAY_MS);
  const expiresAt = _slidingExpiry(now, absolute);
  const refreshToken = generateRefreshToken();
  const sessionId = crypto.randomUUID();

  await AuthSession.create({
    session_id: sessionId,
    token_hash: hashToken(refreshToken),
    user_kind: kind,
    user_id: id,
    expires_at: expiresAt,
    absolute_expires_at: absolute,
    last_used_at: now,
    ..._clientMeta(req),
  });

  return { refreshToken, expiresAt, sessionId };
}

/** Revoke every still-active token of one user (all families). */
async function revokeAllForUser(kind, id, reason) {
  await AuthSession.updateMany(
    { user_kind: kind, user_id: id, revoked_at: null },
    { $set: { revoked_at: new Date(), revoke_reason: reason } }
  );
}

/** Revoke every still-active token in one family (single-device logout). */
async function revokeFamily(sessionId, reason) {
  await AuthSession.updateMany(
    { session_id: sessionId, revoked_at: null },
    { $set: { revoked_at: new Date(), revoke_reason: reason } }
  );
}

/**
 * Exchange a refresh token for a new access token (and, normally, a new refresh token).
 * Returns { accessToken, user, refreshToken|null, expiresAt|null, sessionId }.
 * Throws SessionError on any failure.
 */
async function rotateSession(rawToken, req) {
  if (typeof rawToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
    throw new SessionError("REFRESH_INVALID", "Invalid refresh token.");
  }
  const now = new Date();
  const tokenHash = hashToken(rawToken);
  const doc = await AuthSession.findOne({ token_hash: tokenHash });
  if (!doc) throw new SessionError("REFRESH_INVALID", "Invalid refresh token.");

  // Already used / revoked?
  if (doc.revoked_at) {
    const withinGrace =
      doc.revoke_reason === "rotated" &&
      now.getTime() - new Date(doc.revoked_at).getTime() <= ROTATION_GRACE_MS;

    if (withinGrace) {
      const active = await AuthSession.findOne({ session_id: doc.session_id, revoked_at: null });
      if (active && new Date(active.expires_at) > now) {
        const resolved = await resolveProfile(doc.user_kind, doc.user_id);
        if (!resolved.ok) {
          await revokeFamily(doc.session_id, "profile_invalid");
          throw new SessionError(resolved.reason, "Account unavailable.");
        }
        return {
          accessToken: _issueAccess(doc.user_kind, doc.user_id, resolved.tokenVersion, doc.session_id),
          user: resolved.user,
          refreshToken: null, // the browser already holds the successor cookie
          expiresAt: null,
          sessionId: doc.session_id,
        };
      }
    }

    if (doc.revoke_reason === "rotated") {
      // A rotated token came back outside the grace window → treat as stolen.
      await revokeAllForUser(doc.user_kind, doc.user_id, "reuse_detected");
      throw new SessionError("REFRESH_REUSED", "Session reuse detected. Please sign in again.");
    }
    throw new SessionError("REFRESH_INVALID", "Session has been revoked.");
  }

  if (new Date(doc.expires_at) <= now || new Date(doc.absolute_expires_at) <= now) {
    throw new SessionError("REFRESH_EXPIRED", "Session expired. Please sign in again.");
  }

  const resolved = await resolveProfile(doc.user_kind, doc.user_id);
  if (!resolved.ok) {
    await revokeFamily(doc.session_id, "profile_invalid");
    throw new SessionError(resolved.reason, "Account unavailable.");
  }

  // Atomically claim the presented token so concurrent requests cannot both rotate it.
  const newRefresh = generateRefreshToken();
  const newHash = hashToken(newRefresh);
  const claimed = await AuthSession.findOneAndUpdate(
    { _id: doc._id, revoked_at: null },
    { $set: { revoked_at: now, revoke_reason: "rotated", replaced_by: newHash, last_used_at: now } },
    { new: true }
  );
  if (!claimed) {
    // Lost a race with a parallel refresh — retry once through the grace path.
    return rotateSession(rawToken, req);
  }

  const absolute = new Date(doc.absolute_expires_at);
  const expiresAt = _slidingExpiry(now, absolute);
  await AuthSession.create({
    session_id: doc.session_id,
    token_hash: newHash,
    user_kind: doc.user_kind,
    user_id: doc.user_id,
    expires_at: expiresAt,
    absolute_expires_at: absolute,
    last_used_at: now,
    ..._clientMeta(req),
  });

  return {
    accessToken: _issueAccess(doc.user_kind, doc.user_id, resolved.tokenVersion, doc.session_id),
    user: resolved.user,
    refreshToken: newRefresh,
    expiresAt,
    sessionId: doc.session_id,
  };
}

/** Logout: revoke the family of the presented refresh token (idempotent). */
async function revokeByRefreshToken(rawToken, reason = "logout") {
  if (typeof rawToken !== "string" || !rawToken) return false;
  const doc = await AuthSession.findOne({ token_hash: hashToken(rawToken) });
  if (!doc) return false;
  await revokeFamily(doc.session_id, reason);
  return true;
}

/**
 * Logout everywhere: revoke all refresh tokens and bump token_version so every
 * outstanding access token is rejected immediately by the middleware.
 */
async function logoutAll(kind, id) {
  await revokeAllForUser(kind, id, "logout_all");
  if (kind === "buyer") {
    const Buyer = require("../models/Buyer");
    await Buyer.updateOne({ buyer_id: id }, { $inc: { "auth.token_version": 1 } });
  } else if (kind === "admin") {
    const Admin = require("../models/Admin");
    await Admin.updateOne({ admin_id: id }, { $inc: { "auth.token_version": 1 } });
  } else if (kind === "seller") {
    const mongoose = require("mongoose");
    await mongoose.connection.collection("sellers").updateOne(
      { seller_id: id }, { $inc: { "auth.token_version": 1 } }
    );
  }
}

module.exports = {
  ROTATION_GRACE_MS,
  SessionError,
  createSession,
  rotateSession,
  revokeFamily,
  revokeAllForUser,
  revokeByRefreshToken,
  logoutAll,
};
