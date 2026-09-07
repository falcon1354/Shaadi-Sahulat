const express = require("express");
const router  = express.Router();
const AdminCategory = require("../models/AdminCategory");

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
    const RETIRED = ["jewelry", "jewellery", "accessories", "second_hand", "second_hand_gear", "second-hand", "jweley"];
    const filtered = (categories || []).filter(c => !RETIRED.includes(c.category_id));
    return res.json({ success: true, categories: filtered });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
