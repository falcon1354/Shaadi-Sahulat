/**
 * ShaadiSahulat - Seller Routes
 * ================================
 * Mounted at /api/seller in server.js
 */

const express        = require("express");
const multer         = require("multer");
const sellerController = require("../controllers/sellerController");


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

// ── Seller registration / auth ────────────────────────────────────────────
router.post("/register",              sellerController.registerSeller);
router.post("/login",                 sellerController.loginSeller);
router.get("/profile/:seller_id",     sellerController.getSellerProfile);
router.get("/by-email",               sellerController.getSellerByEmail);

// ── Category tree ─────────────────────────────────────────────────────────
router.get("/categories",             sellerController.getCategories);

// ── Product search + price suggestion ────────────────────────────────────
router.get("/search",                 sellerController.searchProducts);
router.get("/price-suggestion",       sellerController.getPriceSuggestion);

// ── Product management ────────────────────────────────────────────────────
router.post("/product",               upload.array("images", 5), sellerController.uploadProduct);
router.get("/products",               sellerController.listProducts);
router.get("/products/public",        sellerController.getPublicProducts);
router.get("/product/:product_id",    sellerController.getProduct);
router.put("/product/:product_id",    sellerController.updateProduct);
router.delete("/product/:product_id", sellerController.deleteProduct);

module.exports = router;
