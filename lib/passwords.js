/**
 * Password hashing / verification.
 *
 *   New hashes : bcrypt (bcryptjs), cost BCRYPT_ROUNDS (default 12, clamped 10–15).
 *   Verifies   : bcrypt ($2a/$2b/$2y) and legacy werkzeug hashes written by the Flask
 *                seller service ("scrypt:N:r:p$salt$hex", "pbkdf2:<hash>:<iter>$salt$hex").
 *   verifyPassword() reports `needsRehash` so callers can upgrade legacy/weak hashes
 *   to bcrypt after a successful login.
 *
 * Nothing here logs passwords or hashes.
 */

const crypto = require("crypto");
const { promisify } = require("util");
const bcrypt = require("bcryptjs");

const scryptAsync = promisify(crypto.scrypt);
const pbkdf2Async = promisify(crypto.pbkdf2);

const MIN_LENGTH = 8;
const MAX_BYTES = 72; // bcrypt ignores bytes beyond 72 — reject instead of truncating
const WERKZEUG_PBKDF2_DEFAULT_ITERATIONS = 600000; // werkzeug 3.0 default when omitted

function bcryptRounds() {
  const n = parseInt(process.env.BCRYPT_ROUNDS, 10);
  if (!Number.isInteger(n)) return 12;
  return Math.min(15, Math.max(10, n));
}

async function hashPassword(plain) {
  if (typeof plain !== "string" || !plain) throw new Error("password required");
  return bcrypt.hash(plain, bcryptRounds());
}

/**
 * Server-side password policy. Returns { ok, errors[] }.
 */
function validatePasswordPolicy(password, { email } = {}) {
  const errors = [];
  if (typeof password !== "string") return { ok: false, errors: ["Password is required."] };
  const bytes = Buffer.byteLength(password, "utf8");
  if (password.length < MIN_LENGTH) errors.push(`Password must be at least ${MIN_LENGTH} characters.`);
  if (bytes > MAX_BYTES) errors.push(`Password must be at most ${MAX_BYTES} bytes.`);
  if (!/[A-Za-z]/.test(password)) errors.push("Password must contain a letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a digit.");
  if (email && password.trim().toLowerCase() === String(email).trim().toLowerCase())
    errors.push("Password must not be the same as your email.");
  return { ok: errors.length === 0, errors };
}

function _safeEqualHex(aHex, bHex) {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function _verifyWerkzeug(plain, stored) {
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [method, salt, expectedHex] = parts;
  if (!/^[0-9a-f]+$/i.test(expectedHex)) return false;
  const [name, ...args] = method.split(":");
  const pw = Buffer.from(plain, "utf8");
  const saltBuf = Buffer.from(salt, "utf8");

  if (name === "scrypt") {
    const [N, r, p] = args.length ? args.map(Number) : [32768, 8, 1];
    if (![N, r, p].every(Number.isInteger) || N < 2 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
    const derived = await scryptAsync(pw, saltBuf, 64, { N, r, p, maxmem: 256 * N * r * p });
    return _safeEqualHex(derived.toString("hex"), expectedHex);
  }

  if (name === "pbkdf2") {
    const digest = args[0] || "sha256";
    const iterations = args[1] !== undefined ? Number(args[1]) : WERKZEUG_PBKDF2_DEFAULT_ITERATIONS;
    if (!crypto.getHashes().includes(digest) || !Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
    const keylen = crypto.createHash(digest).digest().length;
    const derived = await pbkdf2Async(pw, saltBuf, iterations, keylen, digest);
    return _safeEqualHex(derived.toString("hex"), expectedHex);
  }

  return false;
}

/**
 * Verify a password against a stored hash.
 * Returns { ok, algorithm, needsRehash }. Never throws for bad input.
 */
async function verifyPassword(plain, stored) {
  if (typeof plain !== "string" || !plain || typeof stored !== "string" || !stored) {
    return { ok: false, algorithm: null, needsRehash: false };
  }
  try {
    if (/^\$2[aby]\$\d{2}\$/.test(stored)) {
      const ok = await bcrypt.compare(plain, stored);
      const rounds = bcrypt.getRounds(stored);
      return { ok, algorithm: "bcrypt", needsRehash: ok && rounds < bcryptRounds() };
    }
    if (/^(scrypt|pbkdf2)[:$]/.test(stored)) {
      const ok = await _verifyWerkzeug(plain, stored);
      return { ok, algorithm: "werkzeug", needsRehash: ok };
    }
  } catch {
    // malformed hash → treat as a failed verification
  }
  return { ok: false, algorithm: null, needsRehash: false };
}

let _dummyHash = null;
/**
 * Burn comparable CPU time when the account does not exist, so response timing
 * does not reveal whether an email is registered.
 */
async function dummyVerify(plain) {
  if (!_dummyHash) _dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), bcryptRounds());
  await bcrypt.compare(typeof plain === "string" ? plain : "", _dummyHash);
  return { ok: false, algorithm: null, needsRehash: false };
}

module.exports = {
  MIN_LENGTH, MAX_BYTES,
  bcryptRounds, hashPassword, validatePasswordPolicy, verifyPassword, dummyVerify,
};
