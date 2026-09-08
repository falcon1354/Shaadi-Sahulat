/**
 * Local file storage for BNPL, Order, Dispute, and Review voice uploads.
 * When Cloudinary is configured, files are uploaded there and DB stores the
 * HTTPS URL. Folder layout under cloud:
 *   shaadisahulat/BNPL|Order|Dispute|Reviews|Categories|Banners/...
 *
 * Falls back to disk under <project_root>/Uploads/ if Cloudinary is unset.
 */
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { isConfigured, uploadBuffer } = require("./cloudinary");

const UPLOAD_BASE = path.join(__dirname, "..", "Uploads");
const BNPL_ROOT = path.join(UPLOAD_BASE, "BNPL");
const ORDER_ROOT = path.join(UPLOAD_BASE, "Order");
const DISPUTE_ROOT = path.join(UPLOAD_BASE, "Dispute");
const REVIEW_VOICE_ROOT = path.join(UPLOAD_BASE, "Reviews");
const CATEGORY_ROOT = path.join(UPLOAD_BASE, "Categories");

function _ensure(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function ensureBnplDir(buyerId, applicationId) {
  const dir = path.join(BNPL_ROOT, String(buyerId), String(applicationId));
  _ensure(dir);
  return dir;
}

function ensureOrderDir(orderId) {
  const dir = path.join(ORDER_ROOT, String(orderId));
  _ensure(dir);
  return dir;
}

function ensureDisputeDir(disputeId) {
  const dir = path.join(DISPUTE_ROOT, String(disputeId));
  _ensure(dir);
  return dir;
}

function ensureReviewVoiceDir() {
  _ensure(REVIEW_VOICE_ROOT);
  return REVIEW_VOICE_ROOT;
}

function _localRel(...parts) {
  return parts.join("/").replace(/\\/g, "/");
}

async function _cloudOrLocal(folder, filename, buffer, { publicId, resourceType = "auto" } = {}) {
  if (isConfigured()) {
    const result = await uploadBuffer(buffer, {
      folder,
      publicId,
      resourceType,
      filename,
    });
    return result.secure_url;
  }
  const absDir = path.join(UPLOAD_BASE, ...folder.split("/"));
  _ensure(absDir);
  fs.writeFileSync(path.join(absDir, filename), buffer);
  return _localRel(folder, filename);
}

function saveBnplUpload(buyerId, applicationId, filename, buffer) {
  const folder = _localRel("BNPL", String(buyerId), String(applicationId));
  const localRel = _localRel(folder, filename);
  if (!isConfigured()) {
    const dir = ensureBnplDir(buyerId, applicationId);
    fs.writeFileSync(path.join(dir, filename), buffer);
    return localRel;
  }
  // sync wrapper kept for existing callers — use saveBnplUploadAsync in new code
  throw new Error("Use saveBnplUploadAsync when Cloudinary is enabled");
}

async function saveBnplUploadAsync(buyerId, applicationId, filename, buffer) {
  const folder = _localRel("BNPL", String(buyerId), String(applicationId));
  const base = path.parse(filename).name;
  const isPdf = /\.pdf$/i.test(filename);
  return _cloudOrLocal(folder, filename, buffer, {
    publicId: base,
    resourceType: isPdf ? "raw" : "image",
  });
}

function saveDisputeUpload(disputeId, filename, buffer) {
  if (isConfigured()) {
    throw new Error("Use saveDisputeUploadAsync when Cloudinary is enabled");
  }
  const dir = ensureDisputeDir(disputeId);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return _localRel("Dispute", String(disputeId), filename);
}

async function saveDisputeUploadAsync(disputeId, filename, buffer) {
  const folder = _localRel("Dispute", String(disputeId));
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const isPdf = /\.pdf$/i.test(safeName);
  return _cloudOrLocal(folder, safeName, buffer, {
    resourceType: isPdf ? "raw" : "auto",
  });
}

function saveOrderUpload(orderId, filename, buffer) {
  if (isConfigured()) {
    throw new Error("Use saveOrderUploadAsync when Cloudinary is enabled");
  }
  const dir = ensureOrderDir(orderId);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return _localRel("Order", String(orderId), filename);
}

async function saveOrderUploadAsync(orderId, filename, buffer) {
  const folder = _localRel("Order", String(orderId));
  return _cloudOrLocal(folder, filename, buffer, { resourceType: "auto" });
}

function saveReviewVoice(buyerId, productId, buffer, ext = "mp3") {
  const safeBuyer = String(buyerId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeProduct = String(productId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeBuyer}_${safeProduct}.${ext}`;
  if (isConfigured()) {
    throw new Error("Use saveReviewVoiceAsync when Cloudinary is enabled");
  }
  ensureReviewVoiceDir();
  fs.writeFileSync(path.join(REVIEW_VOICE_ROOT, filename), buffer);
  return _localRel("Reviews", filename);
}

async function saveReviewVoiceAsync(buyerId, productId, buffer, ext = "mp3") {
  const safeBuyer = String(buyerId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeProduct = String(productId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeBuyer}_${safeProduct}.${ext}`;
  return _cloudOrLocal("Reviews", filename, buffer, {
    publicId: `${safeBuyer}_${safeProduct}`,
    resourceType: "video", // audio treated as video/raw; auto works for mp3
  });
}

function reviewVoicePath(buyerId, productId, ext = "mp3") {
  const safeBuyer = String(buyerId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeProduct = String(productId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return _localRel("Reviews", `${safeBuyer}_${safeProduct}.${ext}`);
}

function resolvePath(relativePath) {
  if (!relativePath) return relativePath;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return path.join(UPLOAD_BASE, relativePath);
}

/**
 * Ensure a local filesystem path for OCR / readers.
 * Cloudinary (or other http) URLs are downloaded to a temp file.
 */
async function materializeLocal(fileRef) {
  if (!fileRef) throw new Error("No file path");
  if (!/^https?:\/\//i.test(fileRef)) {
    return resolvePath(fileRef);
  }
  const axios = require("axios");
  const os = require("os");
  const ext = path.extname(new URL(fileRef).pathname) || ".bin";
  const tmp = path.join(os.tmpdir(), `ss-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const res = await axios.get(fileRef, { responseType: "arraybuffer", timeout: 30000 });
  fs.writeFileSync(tmp, Buffer.from(res.data));
  return tmp;
}

function publicUrl(relativePath) {
  if (!relativePath) return "";
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return "/uploads/" + String(relativePath).split(path.sep).join("/");
}

const bnplMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported file type: " + file.mimetype), ok);
  },
});

const disputeMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg", "image/png", "image/webp", "image/jpg",
      "application/pdf",
      "video/mp4",
      "application/zip", "application/x-zip-compressed",
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported file type: " + file.mimetype), ok);
  },
});

function makeBnplUploadMiddleware() {
  return bnplMemoryUpload.fields([
    { name: "cnic_front", maxCount: 1 },
    { name: "cnic_back", maxCount: 1 },
    { name: "utility_bill", maxCount: 1 },
  ]);
}

function makeDisputeUploadMiddleware() {
  return disputeMemoryUpload.array("evidence", 5);
}

function ensureCategoryDir() {
  _ensure(CATEGORY_ROOT);
  return CATEGORY_ROOT;
}

function saveCategoryIcon(filename, buffer) {
  if (isConfigured()) {
    throw new Error("Use saveCategoryIconAsync when Cloudinary is enabled");
  }
  ensureCategoryDir();
  fs.writeFileSync(path.join(CATEGORY_ROOT, filename), buffer);
  return _localRel("Categories", filename);
}

async function saveCategoryIconAsync(filename, buffer) {
  const publicId = path.parse(filename).name;
  return _cloudOrLocal("Categories", filename, buffer, {
    publicId,
    resourceType: "image",
  });
}

async function saveBannerUploadAsync(filename, buffer) {
  return _cloudOrLocal("Banners", filename, buffer, { resourceType: "image" });
}

const categoryIconMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported file type: " + file.mimetype), ok);
  },
});

function makeCategoryIconUploadMiddleware() {
  return categoryIconMemoryUpload.single("icon");
}

module.exports = {
  UPLOAD_BASE,
  BNPL_ROOT,
  ORDER_ROOT,
  DISPUTE_ROOT,
  REVIEW_VOICE_ROOT,
  CATEGORY_ROOT,
  ensureBnplDir,
  ensureOrderDir,
  ensureDisputeDir,
  ensureReviewVoiceDir,
  ensureCategoryDir,
  saveBnplUpload,
  saveBnplUploadAsync,
  saveDisputeUpload,
  saveDisputeUploadAsync,
  saveOrderUpload,
  saveOrderUploadAsync,
  saveReviewVoice,
  saveReviewVoiceAsync,
  saveCategoryIcon,
  saveCategoryIconAsync,
  saveBannerUploadAsync,
  reviewVoicePath,
  resolvePath,
  materializeLocal,
  publicUrl,
  makeBnplUploadMiddleware,
  makeDisputeUploadMiddleware,
  makeCategoryIconUploadMiddleware,
};
