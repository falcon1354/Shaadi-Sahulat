/**
 * Email OTP for sign-up (buyer / seller).
 *
 *  - 6 numeric digits from the OS CSPRNG (crypto.randomInt).
 *  - Stored ONLY as HMAC-SHA256(key, portal + email + code). The key is derived
 *    from JWT_ACCESS_SECRET, so a leaked database row cannot be brute-forced
 *    offline (a plain hash of a 6-digit code could be, in milliseconds).
 *  - Compared in constant time.
 *  - Expires after OTP_TTL_MINUTES; at most MAX_ATTEMPTS guesses per code; a new
 *    code replaces (invalidates) the previous one; resend cooldown applies.
 */
const crypto = require("crypto");

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const PENDING_TTL_HOURS = 24;
const OTP_RE = /^\d{6}$/;
const REG_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function _key() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update("shaadisahulat:registration-otp:v1").digest();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000)); // exactly 6 digits
}

function hashOtp(portal, normalizedEmail, otp) {
  return crypto.createHmac("sha256", _key()).update(`${portal}\n${normalizedEmail}\n${otp}`).digest("hex");
}

function otpMatches(storedHash, portal, normalizedEmail, otp) {
  if (typeof storedHash !== "string" || !OTP_RE.test(String(otp))) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashOtp(portal, normalizedEmail, String(otp)), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isWellFormedOtp = (otp) => typeof otp === "string" && OTP_RE.test(otp);

/** Opaque handle returned only to the browser that submitted the form. */
function generateRegistrationToken() {
  return crypto.randomBytes(32).toString("base64url");
}
function hashRegistrationToken(token) {
  return crypto.createHash("sha256").update(`registration:${String(token)}`, "utf8").digest("hex");
}
const isWellFormedRegistrationToken = (t) => typeof t === "string" && REG_TOKEN_RE.test(t);
function registrationTokenMatches(storedHash, token) {
  if (typeof storedHash !== "string" || !isWellFormedRegistrationToken(token)) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashRegistrationToken(token), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  OTP_TTL_MINUTES, MAX_ATTEMPTS, RESEND_COOLDOWN_SECONDS, PENDING_TTL_HOURS,
  generateOtp, hashOtp, otpMatches, isWellFormedOtp,
  generateRegistrationToken, hashRegistrationToken, registrationTokenMatches, isWellFormedRegistrationToken,
};
