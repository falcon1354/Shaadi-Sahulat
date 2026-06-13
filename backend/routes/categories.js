const express       = require("express");
const router        = express.Router();
const AdminCategory = require("../models/AdminCategory");

// Public — no auth required. Used by Buyer, Seller, and Admin frontends.
router.get("/", async (req, res) => {
  try {
    const cats = await AdminCategory.find({ is_active: true }).lean();
    return res.json({ success: true, categories: cats });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
