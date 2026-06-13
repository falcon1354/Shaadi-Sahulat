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
} = require("../controllers/dowryController");

// Specific routes before the wildcard /:id
router.post("/estimate",           estimateDowry);
router.post("/save",               saveEstimation);
router.post("/upsert",             upsertEstimation);
router.post("/rule-only",          estimateRuleOnly);
router.post("/ml/init",            initML);
router.post("/training/seed",      seedTrainingData);
router.get( "/by-user/:user_id",   getEstimationByUser);
router.get( "/history/:user_id",   getEstimationHistory);
router.get( "/category-prices",    getCategoryPrices);
router.get( "/ml/stats",           getMLStats);
// Wildcard last
router.get( "/:id",                getEstimationById);

module.exports = router;
