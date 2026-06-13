/**
 * Dowry Routes
 * =============
 */

const express = require("express");
const router = express.Router();
const {
  estimateDowry,
  saveEstimation,
  getEstimationHistory,
  getEstimationById,
  estimateRuleOnly,
  getMLStats,
  initML,
} = require("../controllers/dowryController");

// Estimation endpoints
router.post("/estimate", estimateDowry);           // Preview (no save)
router.post("/save", saveEstimation);              // Estimate + save to DB + add to ML dataset
router.get("/history/:user_id", getEstimationHistory); // Get user's estimation history
router.get("/:id", getEstimationById);             // Get single estimation by ID

// Rule-only endpoint (for comparison)
router.post("/rule-only", estimateRuleOnly);

// ML management endpoints
router.get("/ml/stats", getMLStats);
router.post("/ml/init", initML);

module.exports = router;
