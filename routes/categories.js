const express = require("express");
const router  = express.Router();
const AdminCategory = require("../models/AdminCategory");
const { filterRetiredCategories } = require("../lib/retiredCategories");

// ── GET /api/categories — Public: active categories for buyer-facing UI ──────
// Query params: storefront=new|thrift|both (default: all active)
router.get("/", async (req, res) => {
  try {
    const { storefront } = req.query;
    const filter = { is_active: { $ne: false } };

    // Filter by storefront
    if (storefront && storefront !== "both") {
      filter.$or = [
        { storefront: storefront },
        { storefront: "both" },
        { storefront: { $exists: false } }, // backward compat for old categories
      ];
    }

    const categories = await AdminCategory.find(filter).lean();
    return res.json({ success: true, categories: filterRetiredCategories(categories) });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
