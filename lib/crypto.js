/**
 * AES-256-GCM encryption for PII fields (CNIC, IBAN) at rest.
 *
 * Per BNPL&Delivery.md §3.5: encrypt the extracted `cnic_number` and `iban`
 * columns, not just the file paths.
 *
 * Ported from the SQLite-based bnpl/ folder. Uses a 32-byte key from
 * process.env.BNPL_CRYPTO_KEY (hex). Falls back to a stable dev key derived
 * from a constant so the demo works out of the box. REPLACE IN PRODUCTION.
 */
const crypto = require("crypto");

const FALLBACK_SECRET = "shaadi_sahulat_bnpl_dev_secret_v1";
const KEY_HEX =
  process.env.BNPL_CRYPTO_KEY ||
  crypto.createHash("sha256").update("bnpl::" + FALLBACK_SECRET).digest("hex");
const KEY = Buffer.from(KEY_HEX, "hex");

if (KEY.length !== 32) {
  throw new Error(`BNPL crypto key must be 32 bytes (got ${KEY.length}).`);
}

const IV_LEN = 12;

/**
 * Encrypt arbitrary UTF-8 string.
 * Returns `iv:tag:ciphertext` (all hex). Returns null for empty input.
 */
function encrypt(plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

/**
 * Decrypt a string produced by encrypt(). Returns null if input is empty.
 * Throws on tamper (auth tag mismatch).
 */
function decrypt(payload) {
  if (!payload) return null;
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Malformed ciphertext");
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/** Mask CNIC for display: 35202-*******-1 */
function maskCnic(cnic) {
  if (!cnic || cnic.length < 13) return cnic;
  return cnic.slice(0, 5) + "-" + "*".repeat(7) + "-" + cnic.slice(-1);
}

/** Mask IBAN for display: PK36****...****3456 */
function maskIban(iban) {
  if (!iban || iban.length < 10) return iban;
  return iban.slice(0, 6) + "*".repeat(4) + iban.slice(-4);
}

module.exports = { encrypt, decrypt, maskCnic, maskIban };
