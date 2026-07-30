/**
 * thrift.js — Thrift Marketplace Routes (V3)
 *
 * Endpoints:
 *   GET  /api/thrift/products          — Public: browse thrift products
 *   GET  /api/thrift/products/:id      — Public: single thrift product
 *   POST /api/thrift/products/:id/review — Admin: approve/reject thrift listing
 *   GET  /api/thrift/pending           — Admin: list pending thrift approvals
 *   GET  /api/thrift/stats             — Admin: thrift marketplace stats
 */

const express = require("express");
const router = express.Router();
const Product = require("../models/Product");

// ── Public: Browse thrift products ───────────────────────────────────────

router.get("/products", async (req, res) => {
  try {
    const {
      category_id, subcategory, min_price, max_price,
      condition, city, sort_by, page, limit,
    } = req.query;

    const filter = {
      marketplace_type: "thrift",
      is_available: true,
      thrift_approval_status: "approved",
    };

    if (category_id) filter.major_category = category_id;
    if (subcategory) filter.subcategory = subcategory;
    if (condition && condition !== "all") filter.condition = condition;
    if (city) filter.city = { $regex: city, $options: "i" };

    if (min_price || max_price) {
      filter.price_pkr = {};
      if (min_price) filter.price_pkr.$gte = parseFloat(min_price);
      if (max_price) filter.price_pkr.$lte = parseFloat(max_price);
    }

    const sortMap = {
      newest: { created_at: -1 },
      price_asc: { price_pkr: 1 },
      price_desc: { price_pkr: -1 },
    };
    const sort = sortMap[sort_by] || sortMap.newest;

    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 20;
    const skip = (p - 1) * l;

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(l).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({ success: true, products, total, page: p, limit: l });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Public: Single thrift product ────────────────────────────────────────

router.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findOne({
      $or: [{ product_id: req.params.id }, { _id: req.params.id }],
      marketplace_type: "thrift",
    }).lean();

    if (!product) return res.status(404).json({ success: false, error: "Thrift product not found" });

    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: List pending thrift approvals ─────────────────────────────────

router.get("/pending", async (req, res) => {
  try {
    const products = await Product.find({
      thrift_approval_status: "pending",
      marketplace_type: "thrift",
    }).sort({ created_at: -1 }).lean();

    res.json({ success: true, products, total: products.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: Approve/reject thrift listing ─────────────────────────────────

router.post("/products/:id/review", async (req, res) => {
  try {
    const { action, suggested_price, rejection_reason } = req.body;
    const product = await Product.findOne({ product_id: req.params.id });
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });

    if (action === "approve") {
      product.thrift_approval_status = "approved";
      product.is_available = true;
      if (suggested_price) {
        product.admin_suggested_price = parseFloat(suggested_price);
        // Optionally update the price to suggested
        // product.price_pkr = parseFloat(suggested_price);
      }
    } else if (action === "reject") {
      product.thrift_approval_status = "rejected";
      product.is_available = false;
      product.admin_rejection_reason = rejection_reason || "";
    } else {
      return res.status(400).json({ success: false, error: "action must be 'approve' or 'reject'" });
    }

    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: Thrift marketplace stats ──────────────────────────────────────

router.get("/stats", async (req, res) => {
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      Product.countDocuments({ marketplace_type: "thrift" }),
      Product.countDocuments({ marketplace_type: "thrift", thrift_approval_status: "pending" }),
      Product.countDocuments({ marketplace_type: "thrift", thrift_approval_status: "approved" }),
      Product.countDocuments({ marketplace_type: "thrift", thrift_approval_status: "rejected" }),
    ]);

    // Category breakdown
    const categoryBreakdown = await Product.aggregate([
      { $match: { marketplace_type: "thrift", thrift_approval_status: "approved" } },
      { $group: { _id: "$major_category", count: { $sum: 1 }, total_value: { $sum: "$price_pkr" } } },
    ]);

    res.json({
      success: true,
      total,
      pending,
      approved,
      rejected,
      category_breakdown: categoryBreakdown,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
