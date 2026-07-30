/**
 * Local file storage for BNPL, Order, Dispute, and Review voice uploads.
 *
 * Layout (per BNPL&Delivery.md §3.4 + Module 2 Step 8 + v3.2 voice spec):
 *   <project_root>/Uploads/BNPL/{buyer_id}/{application_id}/cnic_front.jpg
 *   <project_root>/Uploads/BNPL/{buyer_id}/{application_id}/cnic_back.jpg
 *   <project_root>/Uploads/BNPL/{buyer_id}/{application_id}/utility_bill.pdf
 *   <project_root>/Uploads/Order/{order_id}/<evidence>
 *   <project_root>/Uploads/Dispute/{dispute_id}/<evidence>
 *   <project_root>/Uploads/Reviews/<buyer_id>_<product_id>.mp3   (v3.2 voice)
 *
 * Paths stored in the DB are RELATIVE to the Uploads root so the entire
 * folder can be moved without DB updates.
 *
 * Per user spec (v3.2): "save the Voice at Local Storage with Id like
 * Buyer+product". So voice files are keyed by (buyer_id, product_id)
 * — regenerating a voice for the same buyer+product overwrites the file.
 */
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_BASE = path.join(__dirname, "..", "..", "Uploads");
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

function saveBnplUpload(buyerId, applicationId, filename, buffer) {
  const dir = ensureBnplDir(buyerId, applicationId);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return path
    .join("BNPL", String(buyerId), String(applicationId), filename)
    .split(path.sep)
    .join("/");
}

function saveDisputeUpload(disputeId, filename, buffer) {
  const dir = ensureDisputeDir(disputeId);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return path
    .join("Dispute", String(disputeId), filename)
    .split(path.sep)
    .join("/");
}

function saveOrderUpload(orderId, filename, buffer) {
  const dir = ensureOrderDir(orderId);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return path
    .join("Order", String(orderId), filename)
    .split(path.sep)
    .join("/");
}

/**
 * Save a review voice MP3 (or other audio) to Uploads/Reviews/.
 * Filename is `<buyer_id>_<product_id>.<ext>` so the same buyer's
 * voice for the same product is overwritten on regeneration.
 *
 * @param {string} buyerId
 * @param {string} productId
 * @param {Buffer} buffer  audio bytes
 * @param {string} ext     file extension without dot, e.g. "mp3"
 * @returns {string} relative path under Uploads/ (e.g. "Reviews/BUY-123_sp-abc.mp3")
 */
function saveReviewVoice(buyerId, productId, buffer, ext = "mp3") {
  ensureReviewVoiceDir();
  // Sanitize IDs — they may contain characters that are unsafe in filenames
  const safeBuyer   = String(buyerId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeProduct = String(productId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeBuyer}_${safeProduct}.${ext}`;
  fs.writeFileSync(path.join(REVIEW_VOICE_ROOT, filename), buffer);
  return path
    .join("Reviews", filename)
    .split(path.sep)
    .join("/");
}

/**
 * Compute the expected relative path for a review voice without saving.
 * Useful for checking if a cached file already exists before regenerating.
 */
function reviewVoicePath(buyerId, productId, ext = "mp3") {
  const safeBuyer   = String(buyerId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeProduct = String(productId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path
    .join("Reviews", `${safeBuyer}_${safeProduct}.${ext}`)
    .split(path.sep)
    .join("/");
}

function resolvePath(relativePath) {
  return path.join(UPLOAD_BASE, relativePath);
}

function publicUrl(relativePath) {
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
      "image/jpeg", "image/png", "image/webp", "application/pdf",
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

// ── Category icon upload helpers ──────────────────────────────────────────

function ensureCategoryDir() {
  _ensure(CATEGORY_ROOT);
  return CATEGORY_ROOT;
}

function saveCategoryIcon(filename, buffer) {
  ensureCategoryDir();
  fs.writeFileSync(path.join(CATEGORY_ROOT, filename), buffer);
  return path
    .join("Categories", filename)
    .split(path.sep)
    .join("/");
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
  saveDisputeUpload,
  saveOrderUpload,
  saveReviewVoice,
  saveCategoryIcon,
  reviewVoicePath,
  resolvePath,
  publicUrl,
  makeBnplUploadMiddleware,
  makeDisputeUploadMiddleware,
  makeCategoryIconUploadMiddleware,
};
