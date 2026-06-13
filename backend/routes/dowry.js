const express = require("express");
const router  = express.Router();
const {
  estimateDowry,
  saveEstimation,
  getEstimationHistory,
  getEstimationById,
  estimateRuleOnly,
  getCategoryPrices,
  getMLStats,
  initML,
} = require("../controllers/dowryController");

router.post("/estimate",           estimateDowry);
router.post("/save",               saveEstimation);
router.get( "/history/:user_id",   getEstimationHistory);
router.get( "/category-prices",    getCategoryPrices);
router.get( "/:id",                getEstimationById);
router.post("/rule-only",          estimateRuleOnly);
router.get( "/ml/stats",           getMLStats);
router.post("/ml/init",            initML);

module.exports = router;
