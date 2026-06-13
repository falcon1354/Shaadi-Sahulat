/**
 * ShaadiSahulat - Visual Recommendation Routes
 * ===============================================
 * Express routes for the visual recommendation module.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const visualController = require("../controllers/visualController");

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
router.post(
  "/recommend",
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
router.get("/history/:user_id", visualController.getHistory);

// Seed demo products
router.post("/seed-demo", visualController.seedDemo);

module.exports = router;
