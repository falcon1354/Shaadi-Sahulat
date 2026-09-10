const express = require("express");
const router  = express.Router();
const AdminCategory = require("../models/AdminCategory");
const { filterRetiredCategories } = require("../lib/retiredCategories");
const { publicUrl } = require("../lib/storage");

function enrichCategory(cat) {
  const placeholder = cat.placeholder_image || "";
  const icon = cat.icon || "";
  let placeholder_url = "";
  if (placeholder) {
    placeholder_url = /^https?:\/\//i.test(placeholder) ? placeholder : publicUrl(placeholder);
  } else if (icon && (icon.includes("/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(icon) || /^https?:\/\//i.test(icon))) {
    placeholder_url = /^https?:\/\//i.test(icon) ? icon : publicUrl(icon);
  }
  return {
    ...cat,
    placeholder_url: placeholder_url || null,
    icon_url: placeholder_url || null,
  };
}

// ── GET /api/categories — Public: categories for buyer-facing UI ──────────────
// Query params:
//   storefront=new|thrift|both
//   include_inactive=1  — include soft-deleted cats (for Dowry Fine-Tune / dashboard)
router.get("/", async (req, res) => {
  try {
    const { storefront, include_inactive } = req.query;
    const includeInactive = String(include_inactive || "") === "1" || String(include_inactive || "").toLowerCase() === "true";
    const filter = includeInactive ? {} : { is_active: { $ne: false } };

    if (storefront && storefront !== "both") {
      filter.$or = [
        { storefront: storefront },
        { storefront: "both" },
        { storefront: { $exists: false } },
      ];
    }

    const categories = await AdminCategory.find(filter).lean();
    const filtered = filterRetiredCategories(categories).map(enrichCategory);
    return res.json({ success: true, categories: filtered });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
