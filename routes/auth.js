/**
 * /api/auth — JWT authentication endpoints.
 *
 *   POST /buyer/register  validate + email a 6-digit OTP → 202 { verification_required, registration_token }
 *   POST /seller/register (NO account is created yet; same answer if the email is already registered)
 *   POST /register/verify { portal, email, otp, registration_token } → creates the account → session (201)
 *   POST /register/resend { portal, email, registration_token } → new OTP (cooldown), generic answer
 *   POST /login           (2B/2C/2D) { portal:"buyer"|"seller"|"admin", email, password } → session
 *                         (there is NO admin registration endpoint)
 *   POST /change-password (2D, Bearer JWT) { currentPassword, newPassword } → revokes all sessions
 *   POST /forgot-password     (2H) { email } → generic answer; emails a one-time reset link
 *   POST /reset-password      (2H) { token, password } → new password, all sessions + sockets revoked
 *   POST /verify-email        (2H) { token } → marks the account's email verified
 *   POST /resend-verification (2H) Bearer JWT or { email } → generic answer
 *   POST /refresh     cookie ss_rt → new access token (+ rotated cookie)
 *   POST /logout      revoke this browser's session, clear cookie
 *   POST /logout-all  (Bearer JWT) revoke all sessions + invalidate access tokens
 *   GET  /me          (Bearer JWT) verified identity + sanitized profile
 *
 * Cookie-setting / cookie-authenticated endpoints (register, login, refresh, logout) are CSRF-hardened:
 *   SameSite=Strict cookie + required X-Requested-With header + Origin check.
 */

const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { authenticateJwt } = require("../lib/auth");
const { getAuthConfig } = require("../lib/tokens");
const authController = require("../controllers/authController");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

const CSRF_HEADER_VALUE = "ShaadiSahulat";

function requireSameSiteRequest(req, res, next) {
  if (req.get("x-requested-with") !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ success: false, code: "CSRF_REJECTED", error: "Missing request header." });
  }
  const origin = req.get("origin");
  if (origin) {
    const clean = origin.replace(/\/$/, "");
    const configured = (getAuthConfig().frontendOrigin || "").replace(/\/$/, "");
    const isDev = process.env.NODE_ENV !== "production";
    const isLocal = isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean);
    if (clean !== configured && !isLocal) {
      return res.status(403).json({ success: false, code: "CSRF_REJECTED", error: "Origin not allowed." });
    }
  }
  next();
}

const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "RATE_LIMITED", error: "Too many requests. Please slow down." },
});

const RATE_LIMITED = { success: false, code: "RATE_LIMITED", error: "Too many attempts. Please try again later." };

// Per IP + email: same response whether or not the email exists (no enumeration).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip || "")}|${String(req.body?.email || "").trim().toLowerCase().slice(0, 254)}`,
  message: RATE_LIMITED,
});

// Per IP: caps password spraying across many emails and bulk sign-ups.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: RATE_LIMITED,
});
// Per IP: sign-ups that were accepted (and emailed). Rejected submissions (400/403)
// are cheap — they fail before any hashing, DB write or email — so they don't count.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipFailedRequests: true,
  message: RATE_LIMITED,
});

// ── OTP-first registration: no account exists until the emailed code is verified ──
const regEmailKey = (req) =>
  `${ipKeyGenerator(req.ip || "")}|${String(req.body?.email || "").trim().toLowerCase().slice(0, 254)}`;
const regLimiter = (windowMs, limit, keyGenerator, extra = {}) => rateLimit({
  windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false, message: RATE_LIMITED,
  ...(keyGenerator ? { keyGenerator } : {}), ...extra,
});
// Emails sent per address: only requests that actually send (2xx) count; rejected
// (400/403) submissions are still capped by the per-IP registerLimiter.
const registerEmailLimiter = regLimiter(60 * 60 * 1000, 5, regEmailKey, { skipFailedRequests: true });
const verifyOtpLimiter     = regLimiter(15 * 60 * 1000, 60);              // per IP (attempts are also capped per code)
const resendOtpIpLimiter   = regLimiter(60 * 60 * 1000, 30);
const resendOtpEmailLimiter = regLimiter(60 * 60 * 1000, 5, regEmailKey);

router.post("/buyer/register",  registerLimiter, registerEmailLimiter, requireSameSiteRequest, registrationController.registerBuyer);
router.post("/seller/register", registerLimiter, registerEmailLimiter, requireSameSiteRequest, registrationController.registerSeller);
router.post("/register/verify", verifyOtpLimiter, requireSameSiteRequest, registrationController.verifyRegistration);
router.post("/register/resend", resendOtpIpLimiter, resendOtpEmailLimiter, requireSameSiteRequest, registrationController.resendRegistrationOtp);
router.post("/login",          loginIpLimiter, loginLimiter, requireSameSiteRequest, authController.login);
router.post("/refresh",    sessionLimiter, requireSameSiteRequest, authController.refresh);
router.post("/logout",     sessionLimiter, requireSameSiteRequest, authController.logout);
router.post("/logout-all", authenticateJwt, authController.logoutEverywhere);

// Per authenticated account: limits guessing the current password with a stolen access token.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user.role}:${req.user.id}`,
  message: RATE_LIMITED,
});
router.post("/change-password", authenticateJwt, changePasswordLimiter, authController.changePassword);

// ── Phase 2H: password reset + email verification ────────────────────────────
// Limits are per IP and per IP+email (or per account). Responses for forgot /
// resend are generic, and 429s apply equally to known and unknown emails.
const hour = 60 * 60 * 1000;
const emailKey = (req) =>
  `${ipKeyGenerator(req.ip || "")}|${String(req.body?.email || "").trim().toLowerCase().slice(0, 254)}`;
const limiter = (windowMs, limit, keyGenerator) => rateLimit({
  windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false, message: RATE_LIMITED,
  ...(keyGenerator ? { keyGenerator } : {}),
});
const forgotIpLimiter    = limiter(hour, 30);
const forgotEmailLimiter = limiter(hour, 5, emailKey);
const resetLimiter       = limiter(15 * 60 * 1000, 20);
const verifyLimiter      = limiter(15 * 60 * 1000, 30);
const resendIpLimiter    = limiter(hour, 30);
const resendKeyLimiter   = limiter(hour, 5, (req) =>
  req.user ? `user|${req.user.role}:${req.user.id}` : emailKey(req));

/** Bearer token is optional here; if sent it must be a valid JWT (never legacy headers). */
function optionalJwt(req, res, next) {
  return req.headers.authorization ? authenticateJwt(req, res, next) : next();
}

router.post("/forgot-password",     forgotIpLimiter, forgotEmailLimiter, requireSameSiteRequest, authController.forgotPassword);
router.post("/reset-password",      resetLimiter, requireSameSiteRequest, authController.resetPassword);
router.post("/verify-email",        verifyLimiter, requireSameSiteRequest, authController.verifyEmail);
router.post("/resend-verification", resendIpLimiter, requireSameSiteRequest, optionalJwt, resendKeyLimiter, authController.resendVerification);
router.get("/me",          authenticateJwt, authController.me);

module.exports = router;
