/**
 * ShaadiSahulat - Visual Recommendation Routes
 * ===============================================
 * Express routes for the visual recommendation module.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const visualController = require("../controllers/visualController");
const { requireAdmin, optionalAuth, authenticate } = require("../lib/auth");
const { requireSelfParam } = require("../lib/authorize");
const { limits } = require("../lib/rateLimits");

// Configure multer for image uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPG, PNG, WebP allowed.`), false);
    }
  },
});

// ── Routes ────────────────────────────────────────────────────────────────

// Upload image and get recommendations
// Public (anonymous allowed); history owner comes from the JWT when present.
router.post(
  "/recommend",
  optionalAuth,
  limits.visualRecommend,
  upload.single("image"),
  visualController.recommend
);

// Get supported categories
router.get("/categories", visualController.getCategories);

// Check ML service health
router.get("/ml-health", visualController.getMLHealth);

// Get dataset status
router.get("/dataset-status", visualController.getDatasetStatus);

// Get index stats
router.get("/index-stats", visualController.getIndexStats);

// Get recommendation history for a user
// Private: own history only (admins may read).
router.get("/history/:user_id", requireSelfParam("user_id", { allowAdmin: true }), visualController.getHistory);

// Seed demo products
router.post("/seed-demo", requireAdmin, visualController.seedDemo);

// Size-aware virtual try-on
// Image generation calls a paid provider → signed-in users only.
router.post(
  "/tryon",
  authenticate,
  limits.tryOn,
  upload.fields([
    { name: "person", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "garment", maxCount: 1 },
  ]),
  visualController.tryOn
);
router.post("/tryon/fit", limits.tryOnFit, visualController.tryOnFit);
router.get("/tryon/health", visualController.tryOnHealth);

module.exports = router;
