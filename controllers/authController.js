/**
 * /api/auth controller.
 *   Phase 2A: session endpoints (refresh / logout / logout-all / me)
 *   Phase 2B/2C: buyer / seller login (registration: registrationController.js, OTP-first)
 *   Phase 2D: admin login (portal "admin", no registration) + change-password
 *   Phase 2H: forgot/reset password + email verification (tracking; login policy via EMAIL_VERIFICATION_REQUIRED)
 */

const mongoose = require("mongoose");
const Buyer = require("../models/Buyer");
const Admin = require("../models/Admin");
const passwords = require("../lib/passwords");
const { sanitizeProfile } = require("../lib/auth");
const {
  REFRESH_COOKIE, signAccessToken, setRefreshCookie, clearRefreshCookie, accessTokenTtlSeconds,
  generateOneTimeToken, hashOneTimeToken, isWellFormedOneTimeToken,
} = require("../lib/tokens");
const mailer = require("../lib/mailer");
const { passwordResetEmail, verificationEmail } = require("../lib/emailTemplates");
const {
  SessionError, createSession, rotateSession, revokeByRefreshToken, logoutAll, revokeAllForUser,
} = require("../lib/authSessions");

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const LOGIN_PORTALS = ["buyer", "seller", "admin"]; // there is NO admin registration
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const INVALID_CREDENTIALS = {
  success: false,
  code: "INVALID_CREDENTIALS",
  error: "Invalid email or password.",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function _optionalString(value, max) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length <= max ? v : null;
}

/**
 * True if the email is already used by ANY role (buyers, sellers, admins).
 * One email = one account = one role; this also keeps admin emails admin-only.
 */
async function emailInUse(email) {
  const [buyer, admin, seller] = await Promise.all([
    Buyer.findOne({ email }).select("_id").lean(),
    Admin.findOne({ email }).select("_id").lean(),
    mongoose.connection.collection("sellers").findOne({ email }, { projection: { _id: 1 } }),
  ]);
  return Boolean(buyer || admin || seller);
}

/** Start a session, set the refresh cookie, and send the access token + safe user data. */
async function _sendSession(req, res, status, { kind, id, tokenVersion, profileDoc, emailVerified }) {
  const session = await createSession({ kind, id, req });
  const accessToken = signAccessToken({ sub: id, kind, tv: tokenVersion, sid: session.sessionId });
  setRefreshCookie(res, session.refreshToken, session.expiresAt);
  const profile = sanitizeProfile(profileDoc);
  return res.status(status).json({
    success: true,
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: accessTokenTtlSeconds(accessToken),
    user: {
      role: kind, id, name: profile.name || "", email: profile.email || "",
      // legacy accounts (no auth sub-document) count as verified
      email_verified: emailVerified ?? (profileDoc?.auth?.email_verified !== false),
    },
    profile,
  });
}

// Buyer / seller registration: controllers/registrationController.js (OTP-first).

// ── Login (Phase 2B buyer, Phase 2C seller, Phase 2D admin) ─────────────────

const sellersCollection = () => mongoose.connection.collection("sellers");

/**
 * Per-role credential stores. Node is the only component that verifies
 * passwords; the sellers collection (owned by Flask for business data) is read
 * and its credential/auth fields written directly here.
 */
const ACCOUNT_STORES = {
  buyer: {
    idField: "buyer_id",
    findByEmail: (email) => Buyer.findOne({ email }).select("+auth").lean(),
    findById: (id) => Buyer.findOne({ buyer_id: id }).select("+auth").lean(),
    update: (id, update) => Buyer.updateOne({ buyer_id: id }, update),
    incFailures: (id) =>
      Buyer.findOneAndUpdate({ buyer_id: id }, { $inc: { "auth.failed_logins": 1 } }, { new: true })
        .select("+auth").lean(),
  },
  seller: {
    idField: "seller_id",
    findByEmail: (email) => sellersCollection().findOne({ email }),
    findById: (id) => sellersCollection().findOne({ seller_id: id }),
    update: (id, update) => sellersCollection().updateOne({ seller_id: id }, update),
    incFailures: (id) =>
      sellersCollection().findOneAndUpdate(
        { seller_id: id },
        { $inc: { "auth.failed_logins": 1 } },
        { returnDocument: "after", projection: { auth: 1 } }
      ),
    // A seller may never authenticate with an email that belongs to an admin
    // (protects admin@shaadisahulat.com vs. the unlinked demo seller).
    blocked: async (doc) => Boolean(await Admin.findOne({ email: doc.email }).select("_id").lean()),
  },
  admin: {
    idField: "admin_id",
    findByEmail: (email) => Admin.findOne({ email }).select("+auth").lean(),
    findById: (id) => Admin.findOne({ admin_id: id }).select("+auth").lean(),
    update: (id, update) => Admin.updateOne({ admin_id: id }, update),
    incFailures: (id) =>
      Admin.findOneAndUpdate({ admin_id: id }, { $inc: { "auth.failed_logins": 1 } }, { new: true })
        .select("+auth").lean(),
  },
};

/** Atomically count a failure; the 5th consecutive failure locks the account for 15 minutes. */
async function _recordFailedLogin(store, id, now) {
  const updated = await store.incFailures(id);
  if ((updated?.auth?.failed_logins || 0) >= MAX_FAILED_LOGINS) {
    await store.update(id, {
      $set: { "auth.failed_logins": 0, "auth.lock_until": new Date(now.getTime() + LOCK_DURATION_MS) },
    });
  }
}

/**
 * Verify credentials for one portal. Every failure is indistinguishable to the
 * caller: { ok: false }. On success returns { ok: true, kind, id, doc, tokenVersion }.
 * Applies lockout, disabled accounts, role-collision rules and hash upgrades.
 */
async function verifyCredentials(portal, rawEmail, rawPassword) {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const fail = { ok: false };
  if (!email || !password) return fail;

  const store = LOGIN_PORTALS.includes(portal) ? ACCOUNT_STORES[portal] : null;
  if (!store) {
    await passwords.dummyVerify(password);
    return fail;
  }

  const doc = await store.findByEmail(email);
  if (!doc) {
    await passwords.dummyVerify(password);
    return fail;
  }

  const now = new Date();
  const authState = doc.auth || {};
  const id = doc[store.idField];

  if (
    authState.login_disabled === true ||
    (store.blocked && (await store.blocked(doc))) ||
    (authState.lock_until && new Date(authState.lock_until) > now) || // locked: never check the password
    typeof doc.password_hash !== "string" || !doc.password_hash       // e.g. system sellers
  ) {
    await passwords.dummyVerify(password);
    return fail;
  }

  const verdict = await passwords.verifyPassword(password, doc.password_hash);
  if (!verdict.ok) {
    await _recordFailedLogin(store, id, now);
    return fail;
  }

  // Success: clear failure state, record login, upgrade weak bcrypt / legacy werkzeug hashes.
  const $set = { "auth.failed_logins": 0, "auth.last_login_at": now };
  if (verdict.needsRehash) $set.password_hash = await passwords.hashPassword(password);
  await store.update(id, { $set, $unset: { "auth.lock_until": "" } });

  const tokenVersion = Number.isInteger(authState.token_version) ? authState.token_version : 0;
  return { ok: true, kind: portal, id, doc, tokenVersion };
}

/** POST /api/auth/login  { portal: "buyer" | "seller" | "admin", email, password } */
async function login(req, res) {
  try {
    const body = req.body || {};
    const result = await verifyCredentials(body.portal, body.email, body.password);
    if (!result.ok) return res.status(401).json(INVALID_CREDENTIALS);
    // Optional policy (the SRS does not require it; default off). Legacy accounts count as verified.
    if (process.env.EMAIL_VERIFICATION_REQUIRED === "true" && result.kind !== "admin" &&
        result.doc?.auth?.email_verified === false) {
      return res.status(403).json({
        success: false, code: "EMAIL_NOT_VERIFIED",
        error: "Please verify your email address first. You can request a new verification link.",
      });
    }
    return _sendSession(req, res, 200, {
      kind: result.kind, id: result.id, tokenVersion: result.tokenVersion, profileDoc: result.doc,
    });
  } catch (err) {
    console.error("[auth] login error:", err.message);
    return res.status(500).json({ success: false, error: "Login failed. Please try again." });
  }
}

// ── Phase 2D: change password (buyer / seller / admin) ──────────────────────

/**
 * POST /api/auth/change-password  { currentPassword, newPassword }   (Bearer JWT required)
 * On success: new bcrypt hash, token_version++ (every outstanding access token dies
 * immediately), failed-login/lock state cleared, all refresh sessions revoked.
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || !newPassword) {
      return res.status(400).json({
        success: false, code: "VALIDATION_ERROR", error: "Current and new password are required.",
      });
    }

    const { role, id } = req.user;
    const store = ACCOUNT_STORES[role];
    const doc = store ? await store.findById(id) : null;
    if (!doc || typeof doc.password_hash !== "string" || !doc.password_hash) {
      await passwords.dummyVerify(currentPassword);
      return res.status(400).json({ success: false, code: "INVALID_CURRENT_PASSWORD", error: "Current password is incorrect." });
    }

    const verdict = await passwords.verifyPassword(currentPassword, doc.password_hash);
    if (!verdict.ok) {
      return res.status(400).json({ success: false, code: "INVALID_CURRENT_PASSWORD", error: "Current password is incorrect." });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({
        success: false, code: "SAME_PASSWORD", error: "New password must be different from the current password.",
      });
    }
    const policy = passwords.validatePasswordPolicy(newPassword, { email: doc.email });
    if (!policy.ok) {
      return res.status(400).json({ success: false, code: "VALIDATION_ERROR", error: policy.errors[0], errors: policy.errors });
    }

    const now = new Date();
    await store.update(id, {
      $set: {
        password_hash: await passwords.hashPassword(newPassword),
        "auth.password_changed_at": now,
        "auth.failed_logins": 0,
      },
      $inc: { "auth.token_version": 1 },
      $unset: { "auth.lock_until": "" },
    });
    await revokeAllForUser(role, id, "password_changed");
    require("../lib/socket").disconnectUser(role, id); // drop live sockets too
    clearRefreshCookie(res);

    return res.json({ success: true, message: "Password changed. Please sign in again." });
  } catch (err) {
    console.error("[auth] change-password error:", err.message);
    return res.status(500).json({ success: false, error: "Could not change password. Please try again." });
  }
}

// ── Phase 2H: password reset + email verification ───────────────────────────
//
// One-time tokens: 32 CSPRNG bytes (base64url), emailed once; MongoDB stores only a
// purpose-bound SHA-256 (lib/tokens.hashOneTimeToken) + expiry. Consumption is an
// atomic conditional update (hash + expiry must still match), so tokens are single-use.
// Endpoints never reveal whether an email/account exists.

const RESET_TTL_MINUTES = () => Math.min(120, Math.max(5, parseInt(process.env.PASSWORD_RESET_TTL_MINUTES, 10) || 30));
const VERIFY_TTL_HOURS = () => Math.min(168, Math.max(1, parseInt(process.env.EMAIL_VERIFY_TTL_HOURS, 10) || 24));
const MAIL_COOLDOWN_MS = 60 * 1000; // at most one reset / verification email per account per minute

const GENERIC_FORGOT = {
  success: true,
  message: "If an account exists for this email, you will receive password reset instructions.",
};
const GENERIC_RESEND = {
  success: true,
  message: "If this email belongs to an unverified account, a new verification link has been sent.",
};
const INVALID_LINK = {
  success: false,
  code: "INVALID_OR_EXPIRED_TOKEN",
  error: "This link is invalid or has expired. Please request a new one.",
};
// Only a holder of the (256-bit) token can learn that it expired — no enumeration.
const EXPIRED_LINK = {
  success: false,
  code: "TOKEN_EXPIRED",
  error: "This link has expired. Please request a new one.",
};

/** Store helpers for one-time tokens (all three account collections). */
function _findByAuthHash(kind, field, hash) {
  const q = { [`auth.${field}`]: hash };
  if (kind === "seller") return sellersCollection().findOne(q);
  const Model = kind === "buyer" ? Buyer : Admin;
  return Model.findOne(q).select("+auth").lean();
}

/** Atomic conditional update; resolves to the updated doc or null (lost race / expired / reused). */
function _consume(kind, filter, update) {
  if (kind === "seller") {
    return sellersCollection().findOneAndUpdate(filter, update, { returnDocument: "after" });
  }
  const Model = kind === "buyer" ? Buyer : Admin;
  return Model.findOneAndUpdate(filter, update, { new: true }).select("+auth").lean();
}

/**
 * Locate the account that owns an email (emails are unique across roles).
 * Returns { kind, doc } or null. Accounts that can never sign in are excluded:
 * disabled accounts, sellers without a password (system sellers) and sellers
 * sharing an admin's email (the admin record owns that email).
 */
async function _accountByEmail(email) {
  const admin = await ACCOUNT_STORES.admin.findByEmail(email);
  if (admin) return { kind: "admin", doc: admin };
  const buyer = await ACCOUNT_STORES.buyer.findByEmail(email);
  if (buyer) return { kind: "buyer", doc: buyer };
  const seller = await ACCOUNT_STORES.seller.findByEmail(email);
  if (seller) return { kind: "seller", doc: seller };
  return null;
}

function _usable(account) {
  if (!account) return false;
  const { doc } = account;
  return typeof doc.password_hash === "string" && doc.password_hash && doc.auth?.login_disabled !== true;
}

function _recentlySent(date) {
  return date && Date.now() - new Date(date).getTime() < MAIL_COOLDOWN_MS;
}

/** Create + store a verification token and email it (buyer/seller only). */
async function issueVerificationEmail(kind, id, email, name) {
  if (kind !== "buyer" && kind !== "seller") return;
  const raw = generateOneTimeToken();
  const now = new Date();
  await ACCOUNT_STORES[kind].update(id, {
    $set: {
      "auth.verify_token_hash": hashOneTimeToken("verify", raw),
      "auth.verify_expires": new Date(now.getTime() + VERIFY_TTL_HOURS() * 3600 * 1000),
      "auth.verify_sent_at": now,
    },
  });
  mailer.sendMailSafely({ to: email, ...verificationEmail({ name, token: raw, ttlHours: VERIFY_TTL_HOURS() }) });
}

/** POST /api/auth/forgot-password  { email } — always the same generic answer. */
async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body?.email);
  // Respond identically whatever happens below (no existence/role/status leak).
  res.json(GENERIC_FORGOT);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return;
  try {
    const account = await _accountByEmail(email);
    if (!_usable(account)) return;
    if (account.kind === "seller" && (await ACCOUNT_STORES.seller.blocked(account.doc))) return;
    if (_recentlySent(account.doc.auth?.reset_requested_at)) return; // anti mail-spam
    const { kind, doc } = account;
    const id = doc[ACCOUNT_STORES[kind].idField];
    const raw = generateOneTimeToken();
    const now = new Date();
    // Replaces any previous reset token (only the newest link works).
    await ACCOUNT_STORES[kind].update(id, {
      $set: {
        "auth.reset_token_hash": hashOneTimeToken("reset", raw),
        "auth.reset_expires": new Date(now.getTime() + RESET_TTL_MINUTES() * 60 * 1000),
        "auth.reset_requested_at": now,
      },
    });
    await mailer.sendMailSafely({ to: doc.email, ...passwordResetEmail({ name: doc.name, token: raw, ttlMinutes: RESET_TTL_MINUTES() }) });
  } catch (err) {
    console.error(`[auth] forgot-password processing error: ${err.message}`);
  }
}

/** POST /api/auth/reset-password  { token, password } */
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body || {};
    if (!isWellFormedOneTimeToken(token)) return res.status(400).json(INVALID_LINK);
    const hash = hashOneTimeToken("reset", token);
    const now = new Date();

    let found = null;
    for (const kind of ["buyer", "seller", "admin"]) {
      const doc = await _findByAuthHash(kind, "reset_token_hash", hash);
      if (doc) { found = { kind, doc }; break; }
    }
    if (!found || found.doc.auth?.login_disabled === true || !found.doc.password_hash) {
      return res.status(400).json(INVALID_LINK);
    }
    if (!found.doc.auth?.reset_expires || new Date(found.doc.auth.reset_expires) <= now) {
      return res.status(400).json(EXPIRED_LINK);
    }
    const { kind, doc } = found;
    const store = ACCOUNT_STORES[kind];
    const id = doc[store.idField];

    // Token stays valid if the chosen password is rejected, so the user can retry.
    const policy = passwords.validatePasswordPolicy(password, { email: doc.email });
    if (!policy.ok) {
      return res.status(400).json({ success: false, code: "VALIDATION_ERROR", error: policy.errors[0], errors: policy.errors });
    }

    const updated = await _consume(kind,
      { [store.idField]: id, "auth.reset_token_hash": hash, "auth.reset_expires": { $gt: now } },
      {
        $set: {
          password_hash: await passwords.hashPassword(password),
          "auth.password_changed_at": now,
          "auth.failed_logins": 0,
          // Completing a reset proves control of the mailbox.
          "auth.email_verified": true,
          "auth.email_verified_at": doc.auth?.email_verified_at || now,
        },
        $inc: { "auth.token_version": 1 },
        // The mailbox is now verified, so any pending verification link is retired too.
        $unset: {
          "auth.reset_token_hash": "", "auth.reset_expires": "", "auth.lock_until": "",
          "auth.verify_token_hash": "", "auth.verify_expires": "",
        },
      });
    if (!updated) return res.status(400).json(INVALID_LINK); // concurrent use / just expired

    await revokeAllForUser(kind, id, "password_reset");
    require("../lib/socket").disconnectUser(kind, id);
    clearRefreshCookie(res);
    return res.json({ success: true, message: "Your password has been reset. Please sign in with your new password." });
  } catch (err) {
    console.error(`[auth] reset-password error: ${err.message}`);
    return res.status(500).json({ success: false, error: "Could not reset password. Please try again." });
  }
}

/** POST /api/auth/verify-email  { token } */
async function verifyEmail(req, res) {
  try {
    const { token } = req.body || {};
    if (!isWellFormedOneTimeToken(token)) return res.status(400).json(INVALID_LINK);
    const hash = hashOneTimeToken("verify", token);
    const now = new Date();
    const ALREADY = { success: true, status: "already_verified", message: "Your email address is already verified." };
    for (const kind of ["buyer", "seller"]) { // admins have no verification flow
      const store = ACCOUNT_STORES[kind];
      const doc = await _findByAuthHash(kind, "verify_token_hash", hash);
      if (!doc) continue;
      if (doc.auth?.login_disabled === true) break;
      if (!doc.auth?.verify_expires || new Date(doc.auth.verify_expires) <= now) {
        return res.status(400).json(EXPIRED_LINK);
      }
      const wasVerified = doc.auth?.email_verified === true;
      const updated = await _consume(kind,
        { [store.idField]: doc[store.idField], "auth.verify_token_hash": hash, "auth.verify_expires": { $gt: now } },
        {
          $set: {
            "auth.email_verified": true,
            "auth.email_verified_at": doc.auth?.email_verified_at || now,
            "auth.verify_used_hash": hash,
          },
          $unset: { "auth.verify_token_hash": "", "auth.verify_expires": "" },
        });
      if (!updated) {
        // Lost a race with another click on the same link: the other request verified it.
        const again = await _findByAuthHash(kind, "verify_used_hash", hash);
        return again ? res.json(ALREADY) : res.status(400).json(INVALID_LINK);
      }
      if (wasVerified) return res.json(ALREADY);
      return res.json({ success: true, status: "verified", message: "Your email address has been verified." });
    }
    // A link that was already used: report it, but it grants nothing.
    for (const kind of ["buyer", "seller"]) {
      const used = await _findByAuthHash(kind, "verify_used_hash", hash);
      if (used && used.auth?.email_verified === true) return res.json(ALREADY);
    }
    return res.status(400).json(INVALID_LINK);
  } catch (err) {
    console.error(`[auth] verify-email error: ${err.message}`);
    return res.status(500).json({ success: false, error: "Could not verify email. Please try again." });
  }
}

/**
 * POST /api/auth/resend-verification
 *   signed in (Bearer)  → resends for the caller
 *   { email } (anonymous) → generic answer, never reveals whether the email exists
 */
async function resendVerification(req, res) {
  res.json(GENERIC_RESEND);
  try {
    let account = null;
    if (req.user) {
      const store = ACCOUNT_STORES[req.user.role];
      const doc = store ? await store.findById(req.user.id) : null;
      account = doc ? { kind: req.user.role, doc } : null;
    } else {
      const email = normalizeEmail(req.body?.email);
      if (!email || email.length > 254 || !EMAIL_RE.test(email)) return;
      account = await _accountByEmail(email);
    }
    if (!_usable(account) || !["buyer", "seller"].includes(account.kind)) return;
    const { kind, doc } = account;
    if (doc.auth?.email_verified !== false) return;            // verified or legacy account
    if (kind === "seller" && (await ACCOUNT_STORES.seller.blocked(doc))) return;
    if (_recentlySent(doc.auth?.verify_sent_at)) return;       // anti mail-spam
    await issueVerificationEmail(kind, doc[ACCOUNT_STORES[kind].idField], doc.email, doc.name); // replaces the old token
  } catch (err) {
    console.error(`[auth] resend-verification error: ${err.message}`);
  }
}

const SESSION_ERROR_STATUS = {
  REFRESH_INVALID: 401,
  REFRESH_EXPIRED: 401,
  REFRESH_REUSED: 401,
  PROFILE_NOT_FOUND: 401,
  ACCOUNT_DISABLED: 401,
};

function _publicUser(user) {
  return { role: user.role, id: user.id, name: user.name, email: user.email, email_verified: user.email_verified !== false };
}

/** POST /api/auth/refresh — rotate the HttpOnly refresh cookie, return a new access token. */
async function refresh(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) {
    return res.status(401).json({ success: false, code: "NO_SESSION", error: "Not signed in." });
  }
  try {
    const result = await rotateSession(raw, req);
    if (result.refreshToken) setRefreshCookie(res, result.refreshToken, result.expiresAt);
    return res.json({
      success: true,
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: accessTokenTtlSeconds(result.accessToken),
      user: _publicUser(result.user),
    });
  } catch (err) {
    if (err instanceof SessionError) {
      clearRefreshCookie(res);
      return res.status(SESSION_ERROR_STATUS[err.code] || 401).json({
        success: false, code: err.code, error: err.message,
      });
    }
    console.error("[auth] refresh error:", err.message);
    return res.status(500).json({ success: false, error: "Could not refresh session." });
  }
}

/** POST /api/auth/logout — revoke this browser's session family; always clears the cookie. */
async function logout(req, res) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await revokeByRefreshToken(raw, "logout");
  } catch (err) {
    console.error("[auth] logout error:", err.message);
  }
  clearRefreshCookie(res);
  return res.json({ success: true });
}

/** POST /api/auth/logout-all — requires a valid JWT; revokes every session + bumps token_version. */
async function logoutEverywhere(req, res) {
  try {
    await logoutAll(req.user.role, req.user.id);
    require("../lib/socket").disconnectUser(req.user.role, req.user.id); // drop live sockets too
    clearRefreshCookie(res);
    return res.json({ success: true });
  } catch (err) {
    console.error("[auth] logout-all error:", err.message);
    return res.status(500).json({ success: false, error: "Could not sign out everywhere." });
  }
}

/** GET /api/auth/me — the verified identity + sanitized profile (no password_hash / auth). */
function me(req, res) {
  return res.json({ success: true, user: { ..._publicUser(req.user), profile: req.user.profile } });
}

module.exports = {
  refresh, logout, logoutEverywhere, me,
  login, changePassword,
  forgotPassword, resetPassword, verifyEmail, resendVerification, issueVerificationEmail,
  verifyCredentials,
  // shared with later phases
  normalizeEmail, emailInUse, MAX_FAILED_LOGINS, LOCK_DURATION_MS,
  // used by controllers/registrationController.js (OTP-first sign-up)
  EMAIL_RE, optionalString: _optionalString, sendSession: _sendSession,
};
