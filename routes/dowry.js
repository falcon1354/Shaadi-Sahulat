const express = require("express");
const router  = express.Router();
const {
  estimateDowry,
  saveEstimation,
  upsertEstimation,
  getEstimationByUser,
  getEstimationHistory,
  getEstimationById,
  estimateRuleOnly,
  getCategoryPrices,
  getMLStats,
  initML,
  seedTrainingData,
  migrateBuyerDowryStatus,
  patchCategoryBudgets,
} = require("../controllers/dowryController");
const { requireAdmin, optionalAuth, authenticate } = require("../lib/auth");
const { limits } = require("../lib/rateLimits");
const { requireSelfParam } = require("../lib/authorize");

// :user_id must be the signed-in buyer (admins may read, never mutate).
const selfRead  = requireSelfParam("user_id", { role: "buyer", allowAdmin: true });
const selfWrite = requireSelfParam("user_id", { role: "buyer" });

// Specific routes before the wildcard /:id
// Public: anonymous estimation keeps working.
router.post("/estimate",           limits.dowryEstimate, estimateDowry);
router.post("/save",               optionalAuth, saveEstimation);   // owner = JWT buyer, else "anonymous"
router.post("/upsert",             optionalAuth, upsertEstimation); // owner = JWT buyer, else "anonymous"
router.post("/rule-only",          limits.dowryEstimate, estimateRuleOnly);
router.post("/ml/init",            requireAdmin, initML);
router.post("/training/seed",      requireAdmin, seedTrainingData);
router.get(  "/migrate-buyer-status",     requireAdmin, migrateBuyerDowryStatus);
router.patch("/budgets/:user_id",         selfWrite, patchCategoryBudgets);
router.get(  "/by-user/:user_id",         selfRead, getEstimationByUser);
router.get( "/history/:user_id",   selfRead, getEstimationHistory);
router.get( "/category-prices",    getCategoryPrices);
router.get( "/ml/stats",           getMLStats);
// Wildcard last
router.get( "/:id",                authenticate, getEstimationById); // owner or admin (checked in controller)

module.exports = router;
