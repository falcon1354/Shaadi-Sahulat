/**
 * ShaadiSahulat - Seller Routes
 * ================================
 * Mounted at /api/seller in server.js
 */

const express        = require("express");
const multer         = require("multer");
const sellerController = require("../controllers/sellerController");
const sellerClient     = require("../services/sellerClient");
const { requireSeller, requireAdmin } = require("../lib/auth");
const { requireRoles, forbid, sameOrAbsent, endpointRemoved } = require("../lib/authorize");

const router = express.Router();

// Multer: accept up to 5 images in memory (forwarded as buffers to Flask)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files:    5,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Use JPG/PNG/WebP.`), false);
    }
  },
});

// ── Authorization helpers (identity = verified JWT in req.user) ─────────────

/** Product create: the owner is ALWAYS the signed-in seller, never a body seller_id. */
function forceOwnSellerId(req, res, next) {
  req.body = req.body || {};
  req.body.seller_id = req.user.id;
  next();
}

/** Seller product list: a seller only sees their own; admins may pass any seller_id. */
function scopeProductList(req, res, next) {
  if (req.user.role === "admin") return next();
  if (!sameOrAbsent(req.query.seller_id, req.user.id)) return forbid(res);
  req.query.seller_id = req.user.id;
  next();
}

/** Load the product and require the caller to own it (admins pass). */
async function requireProductOwner(req, res, next) {
  try {
    const result = await sellerClient.getProduct(req.params.product_id);
    const product = result?.product;
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    if (req.user.role !== "admin" && String(product.seller_id) !== String(req.user.id)) return forbid(res);
    req.product = product;
    next();
  } catch (err) {
    next(err);
  }
}

// Fields a seller may change on their own product. Admin-only state
// (thrift approval, admin freeze, marketplace type) is never seller-writable.
const SELLER_EDITABLE_FIELDS = new Set([
  "title", "description", "color", "fabric", "embroidery_type", "size", "material",
  "brand", "condition", "city", "price", "discount_price", "discount_pct",
  "stock_quantity", "availability_status", "original_price", "is_final_sale",
]);
const SELLER_STATUS_VALUES = new Set(["available", "out_of_stock", "hidden", "processing", "freeze"]);

function sanitizeSellerProductUpdate(req, res, next) {
  if (req.user.role === "admin") return next();
  const body = req.body || {};
  const safe = {};
  for (const [k, v] of Object.entries(body)) if (SELLER_EDITABLE_FIELDS.has(k)) safe[k] = v;
  if ("availability_status" in safe) {
    const p = req.product || {};
    const lockedByAdmin = p.availability_status === "frozen";
    const awaitingApproval = ["pending", "rejected"].includes(p.admin_approval_status);
    if (!SELLER_STATUS_VALUES.has(safe.availability_status) || lockedByAdmin ||
        (awaitingApproval && safe.availability_status === "available")) {
      delete safe.availability_status;
    }
  }
  req.body = safe;
  next();
}

// ── Seller registration / auth ────────────────────────────────────────────
// Legacy auth endpoints were removed in Phase 2I (all methods → 410 Gone).
router.all("/register", endpointRemoved("POST /api/auth/seller/register"));
router.all("/login",    endpointRemoved("POST /api/auth/login"));
// Public profile is sanitized.
router.get("/profile/:seller_id",     sellerController.getSellerProfile);
router.get("/by-email",               requireAdmin, sellerController.getSellerByEmail);

// ── Category tree ─────────────────────────────────────────────────────────
router.get("/categories",             sellerController.getCategories);

// ── Product search + price suggestion ────────────────────────────────────
router.get("/search",                 sellerController.searchProducts);
router.get("/price-suggestion",       sellerController.getPriceSuggestion);

// ── Product management ────────────────────────────────────────────────────
// Auth runs BEFORE multer so unauthenticated uploads are rejected up front.
router.post("/product",               requireSeller, upload.array("images", 5), forceOwnSellerId, sellerController.uploadProduct);
router.get("/products",               requireRoles("seller", "admin"), scopeProductList, sellerController.listProducts);
router.get("/products/public",        sellerController.getPublicProducts);
router.get("/product/:product_id",    sellerController.getProduct);
router.put("/product/:product_id",    requireRoles("seller", "admin"), requireProductOwner, sanitizeSellerProductUpdate, sellerController.updateProduct);
router.delete("/product/:product_id", requireRoles("seller", "admin"), requireProductOwner, sellerController.deleteProduct);

// ── BNPL + Order Processing: seller-side order management ──────────────────
router.use("/orders", require("./sellerOrders"));

// ── Admin: Thrift product approval ──────────────────────────────────────────
// Admin approves/rejects a thrift product listing
router.patch("/product/:product_id/thrift-approve", requireAdmin, async (req, res) => {
  try {
    const { product_id } = req.params;
    const { approved, suggested_price, rejection_reason } = req.body || {};
    const VISUAL_ML_URL = process.env.VISUAL_ML_URL || "http://localhost:5002";
    const axios = require("axios");

    if (approved) {
      // Update product to available + admin_approved
      await axios.put(`${VISUAL_ML_URL}/seller/product/${product_id}`, {
        availability_status: "available",
        admin_approval_status: "approved",
        ...(suggested_price ? { price: Number(suggested_price) } : {}),
      });
      return res.json({ success: true, message: "Thrift product approved and now live" });
    } else {
      // Reject: keep in processing or set to hidden
      await axios.put(`${VISUAL_ML_URL}/seller/product/${product_id}`, {
        availability_status: "hidden",
        admin_approval_status: "rejected",
      });
      return res.json({ success: true, message: "Thrift product rejected" });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
