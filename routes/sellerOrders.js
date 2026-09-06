/**
 * Seller-side order/package management routes.
 *
 * Mounted at /api/seller/orders via routes/seller.js.
 *
 * Endpoints (all require seller auth):
 *   GET  /                       seller's packages (with order info)
 *   GET  /:package_id            single package detail
 *   GET  /:package_id/detail     full package + order + buyer + dispute/BNPL context
 *   GET  /:package_id/location   GET convenience for customer location
 */
const express = require("express");
const router = express.Router();

const Package = require("../models/Package");
const Order = require("../models/Order");
const Dispute = require("../models/Dispute");
const BnplApplication = require("../models/BnplApplication");

const { requireSeller } = require("../lib/auth");
const { calculateShipping } = require("../lib/helpers");

router.use(requireSeller);

// ---------- seller's packages ----------
router.get("/", async (req, res) => {
  try {
    const packages = await Package.find({ seller_id: req.user.id })
      .sort({ created_at: -1 })
      .lean();
    const orderIds = [...new Set(packages.map(p => p.order_id))];
    const orders = await Order.find({ order_id: { $in: orderIds } }).lean();
    const orderMap = Object.fromEntries(orders.map(o => [o.order_id, o]));
    const enriched = packages.map(p => ({ ...p, order: orderMap[p.order_id] || null }));
    return res.json({ success: true, count: enriched.length, packages: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- single package ----------
router.get("/:package_id", async (req, res) => {
  try {
    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    }).lean();
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found" });
    const order = await Order.findOne({ order_id: pkg.order_id }).lean();
    return res.json({ success: true, package: pkg, order });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- package detail (replaces "Get Customer Location") ----------
router.get("/:package_id/detail", async (req, res) => {
  try {
    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    }).lean();
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found" });

    const order = await Order.findOne({ order_id: pkg.order_id }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    // Fetch dispute if any
    const dispute = await Dispute.findOne({ order_id: order.order_id }).lean();

    // Fetch BNPL context if applicable
    let bnplContext = null;
    if (order.payment_method === "BNPL" && order.bnpl_application_id) {
      bnplContext = await BnplApplication.findOne({ application_no: order.bnpl_application_id }).lean();
    }

    return res.json({
      success: true,
      package: pkg,
      order,
      dispute: dispute || null,
      bnpl_context: bnplContext || null,
      buyer: {
        buyer_id: order.buyer_id,
        buyer_name: order.buyer_name,
        buyer_email: order.buyer_email,
        buyer_phone: order.buyer_phone,
        shipping_address: order.shipping_address,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- customer location (GET convenience) ----------
router.get("/:package_id/location", async (req, res) => {
  try {
    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    }).lean();
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found" });
    const order = await Order.findOne({ order_id: pkg.order_id }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    const cityDistances = {
      Lahore: 5.0, Karachi: 12.5, Islamabad: 8.0, Rawalpindi: 7.8,
      Faisalabad: 6.2, Multan: 9.5, Peshawar: 11.0, Quetta: 14.5,
    };
    const distanceKm = cityDistances[order.shipping_address.city] || 5.0;
    const shippingOptions = ["standard", "express", "same_day"].map(m => {
      const calc = calculateShipping(distanceKm, m);
      return { method: m, cost: calc.total, eta_days: calc.eta_days };
    });

    return res.json({
      success: true,
      order_id: order.order_id,
      package_id: pkg.package_id,
      buyer_name: order.buyer_name,
      buyer_phone: order.buyer_phone,
      shipping_address: order.shipping_address,
      distance_km: distanceKm,
      shipping_options: shippingOptions,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
