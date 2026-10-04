/**
 * Private uploads (Phase 2I): BNPL identity documents (CNIC, utility bill),
 * dispute evidence and order attachments.
 *
 * These files are NEVER served by the public /uploads static mount and their
 * storage location (local path or Cloudinary URL) is never sent to a client.
 * Instead, an API response that is already authorized for the viewer (the buyer
 * who owns the application, the dispute participants, an admin, or a bank
 * officer) contains a short-lived signed link:
 *
 *   /api/files/private?ref=<base64url ref>&exp=<unix seconds>&sig=<HMAC-SHA256>
 *
 * The HMAC key is derived from JWT_ACCESS_SECRET, so links cannot be forged or
 * extended, and guessing a filename gives nothing. Links expire after
 * PRIVATE_FILE_URL_TTL_SECONDS (default 10 minutes). Plain <a href>/<img src>
 * work because the link itself is the capability.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { UPLOAD_BASE } = require("./storage");

const ROUTE = "/api/files/private";
const PRIVATE_DIRS = ["bnpl", "dispute", "order"]; // first path segment, case-insensitive (Windows FS)
const CLOUDINARY_HOST = "res.cloudinary.com";
const MAX_TTL_SECONDS = 24 * 60 * 60;

function ttlSeconds() {
  const n = parseInt(process.env.PRIVATE_FILE_URL_TTL_SECONDS, 10);
  return Number.isInteger(n) && n >= 30 && n <= MAX_TTL_SECONDS ? n : 600;
}

function _key() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update("shaadisahulat:private-file-url:v1").digest();
}

const _b64 = (buf) => Buffer.from(buf).toString("base64url");
const _sign = (ref, exp) => _b64(crypto.createHmac("sha256", _key()).update(`${ref}\n${exp}`).digest());

/** Local relative path inside a private upload folder? (no traversal, no absolute paths) */
function _isPrivateLocalRef(ref) {
  if (typeof ref !== "string" || !ref || ref.length > 1024) return false;
  if (/^[a-z]+:/i.test(ref) || ref.startsWith("/") || ref.startsWith("\\")) return false;
  const parts = ref.split(/[\\/]+/);
  if (parts.some((p) => p === ".." || p === "." || p === "")) return false;
  return PRIVATE_DIRS.includes(parts[0].toLowerCase());
}

function _isCloudinaryRef(ref) {
  if (typeof ref !== "string") return false;
  try {
    const u = new URL(ref);
    return u.protocol === "https:" && u.hostname === CLOUDINARY_HOST && !u.username && !u.password;
  } catch {
    return false;
  }
}

function isPrivateRef(ref) {
  return _isPrivateLocalRef(ref) || _isCloudinaryRef(ref);
}

/** Short-lived signed link for a stored private file ("" if the reference is not a private file). */
function signPrivateFileUrl(ref, { ttl = ttlSeconds(), now = Date.now() } = {}) {
  if (!isPrivateRef(ref)) return "";
  const exp = Math.floor(now / 1000) + Math.min(Math.max(30, ttl), MAX_TTL_SECONDS);
  const params = new URLSearchParams({ ref: _b64(ref), exp: String(exp), sig: _sign(ref, exp) });
  return `${ROUTE}?${params.toString()}`;
}

/** Verify query params → { ok: true, ref } or { ok: false, status }. */
function verifyPrivateFileParams({ ref, exp, sig } = {}, now = Date.now()) {
  if (typeof ref !== "string" || typeof exp !== "string" || typeof sig !== "string") return { ok: false, status: 404 };
  if (!/^\d{1,12}$/.test(exp) || sig.length > 100 || ref.length > 2048) return { ok: false, status: 404 };
  let decoded;
  try { decoded = Buffer.from(ref, "base64url").toString("utf8"); } catch { return { ok: false, status: 404 }; }
  const expected = Buffer.from(_sign(decoded, Number(exp)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, status: 404 };
  const nowSec = Math.floor(now / 1000);
  if (Number(exp) < nowSec) return { ok: false, status: 410 };
  if (Number(exp) - nowSec > MAX_TTL_SECONDS) return { ok: false, status: 404 };
  if (!isPrivateRef(decoded)) return { ok: false, status: 404 };
  return { ok: true, ref: decoded };
}

const SAFE_TYPES = /^(image\/(jpeg|png|webp|gif)|application\/pdf|video\/mp4|audio\/(mpeg|wav|x-wav)|application\/(zip|x-zip-compressed|octet-stream))$/i;

function _privateHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Disposition", "inline");
}

/**
 * Stream a stored private file (local disk or Cloudinary) to the response. The
 * caller must already have authorized the request (signed link or role check).
 */
async function sendPrivateFile(res, ref) {
  if (_isPrivateLocalRef(ref)) {
    const base = path.resolve(UPLOAD_BASE);
    const abs = path.resolve(base, ref);
    if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    _privateHeaders(res);
    return res.sendFile(abs, { dotfiles: "deny" });
  }
  if (_isCloudinaryRef(ref)) {
    try {
      const upstream = await axios.get(ref, { responseType: "stream", timeout: 30000, maxRedirects: 0 });
      const type = String(upstream.headers["content-type"] || "").split(";")[0].trim();
      _privateHeaders(res);
      res.setHeader("Content-Type", SAFE_TYPES.test(type) ? type : "application/octet-stream");
      if (upstream.headers["content-length"]) res.setHeader("Content-Length", upstream.headers["content-length"]);
      upstream.data.on("error", () => res.destroy());
      return upstream.data.pipe(res);
    } catch {
      return res.status(502).json({ success: false, error: "File temporarily unavailable" });
    }
  }
  return res.status(404).json({ success: false, error: "File not found" });
}

/** Express handler for GET /api/files/private */
async function privateFileHandler(req, res) {
  const v = verifyPrivateFileParams(req.query);
  if (!v.ok) {
    const error = v.status === 410 ? "This link has expired. Reload the page to get a new one." : "File not found";
    return res.status(v.status).json({ success: false, error });
  }
  return sendPrivateFile(res, v.ref);
}

/** Replace raw storage paths of dispute evidence with signed links (never expose file_path). */
function presentEvidence(list) {
  return (Array.isArray(list) ? list : []).map((e) => {
    const plain = e && typeof e.toObject === "function" ? e.toObject() : { ...(e || {}) };
    const { file_path, ...rest } = plain;
    return { ...rest, url: signPrivateFileUrl(file_path) };
  });
}

/** Copy of a dispute (doc or plain object) whose evidence carries signed links only. */
function presentDispute(dispute) {
  if (!dispute) return dispute;
  const plain = typeof dispute.toObject === "function" ? dispute.toObject() : { ...dispute };
  if (Array.isArray(plain.evidence)) plain.evidence = presentEvidence(plain.evidence);
  return plain;
}

/** Random, unguessable suffix for private Cloudinary public_ids / filenames. */
const randomSuffix = () => crypto.randomBytes(16).toString("hex");

module.exports = {
  ROUTE,
  PRIVATE_DIRS,
  isPrivateRef,
  signPrivateFileUrl,
  verifyPrivateFileParams,
  sendPrivateFile,
  privateFileHandler,
  presentEvidence,
  presentDispute,
  randomSuffix,
};
