/**
 * Admin extensions — order oversight, dispute review, payment release.
 *
 * Mounted at /api/admin via routes/admin.js (which does router.use(adminExtRoutes)).
 *
 * Per spec: "Keep the Admin in Loop Too, in Order, and Delivery. Because the
 * Admin has complete information of each and every thing."
 *
 * Endpoints:
 *   GET  /orders                            all orders (filter by status/search)
 *   GET  /orders/:order_id                  full order detail incl. packages + bnpl + disputes + payout
 *   GET  /disputes                          all disputes
 *   POST /orders/:order_id/release-payment  Step 10 — admin releases payment to seller
 *   GET  /wallet                            AdminWallet balance + recent ledger
 *   GET  /sellers/:seller_id/payouts        list payouts to a seller
 *   GET  /bnpl/applications                 all BNPL applications (admin oversight)
 */
const express = require("express");
const axios = require("axios");
const router = express.Router();

const Order = require("../models/Order");
const Package = require("../models/Package");
const Dispute = require("../models/Dispute");
const DisputeMessage = require("../models/DisputeMessage");
const SellerPayout = require("../models/SellerPayout");
const AdminWallet = require("../models/AdminWallet");
const BnplApplication = require("../models/BnplApplication");
const Notification = require("../models/Notification");

const VISUAL_ML_URL = process.env.VISUAL_ML_URL || "http://localhost:5002";

// Helper: classify whether an order still needs admin-initiated payment release.
// BNPL rejection notification depends on this — admin should see which orders
// have completed delivery but haven't been paid out yet.
function _hasPendingRelease(o) {
  return (
    ["DELIVERED", "RESOLVED"].includes(o.status) &&
    !o.payment_released_at
  );
}

const { requireAdmin } = require("../lib/auth");
const { computeSellerPayout, generateTransactionId, generatePayoutId } = require("../lib/helpers");
const { pushNotification, notifySellerAndAdmin } = require("../lib/notify");

// All admin extension endpoints require admin
router.use(requireAdmin);

// ---------- list all orders ----------
router.get("/orders", async (req, res) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      filter.$or = [
        { order_id: { $regex: q, $options: "i" } },
        { buyer_name: { $regex: q, $options: "i" } },
        { buyer_email: { $regex: q, $options: "i" } },
      ];
    }
    const orders = await Order.find(filter).sort({ created_at: -1 }).limit(200).lean();
    // Task 4: per-order has_pending_release flag so the admin orders listing
    // can surface BNPL rejection / pending payment-release state inline.
    const enriched = (orders || []).map((o) => ({
      ...o,
      has_pending_release: _hasPendingRelease(o),
    }));
    return res.json({ success: true, count: enriched.length, orders: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Task 1b: orders awaiting payment release ----------
// Returns all orders where status is DELIVERED or RESOLVED AND
// payment_released_at is null. Includes release_due_at = delivered_at + 24h
// and overdue flag.
// IMPORTANT: registered BEFORE /orders/:order_id so the parameter route
// does not capture "pending-release" as an order_id.
router.get("/orders/pending-release", async (req, res) => {
  try {
    const now = new Date();
    const orders = await Order.find({
      status: { $in: ["DELIVERED", "RESOLVED"] },
      payment_released_at: null,
    })
      .sort({ delivered_at: 1 })
      .lean();

    const enriched = (orders || []).map((o) => {
      const deliveredAt = o.delivered_at ? new Date(o.delivered_at) : null;
      const release_due_at = deliveredAt
        ? new Date(deliveredAt.getTime() + 24 * 60 * 60 * 1000)
        : null;
      return {
        ...o,
        release_due_at,
        overdue: release_due_at ? now > release_due_at : false,
      };
    });

    return res.json({
      success: true,
      count: enriched.length,
      now,
      orders: enriched,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- single order full detail ----------
router.get("/orders/:order_id", async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.order_id }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    const [packages, disputes, payout, bnpl] = await Promise.all([
      Package.find({ order_id: order.order_id }).lean(),
      Dispute.find({ order_id: order.order_id }).lean(),
      SellerPayout.findOne({ order_id: order.order_id }).lean(),
      order.bnpl_application_id
        ? BnplApplication.findOne({ application_no: order.bnpl_application_id }).lean()
        : Promise.resolve(null),
    ]);

    return res.json({
      success: true,
      order,
      packages,
      disputes,
      payout,
      bnpl,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- list all disputes ----------
router.get("/disputes", async (req, res) => {
  try {
    const disputes = await Dispute.find().sort({ created_at: -1 }).limit(200).lean();
    return res.json({ success: true, count: disputes.length, disputes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 10: release payment to seller ----------
router.post("/orders/:order_id/release-payment", async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.order_id });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    if (order.status === "COMPLETED") {
      return res.status(400).json({ success: false, error: "Order already completed" });
    }
    if (!["DELIVERED", "RESOLVED"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Order must be DELIVERED or RESOLVED before payment release (current: ${order.status})`,
      });
    }

    // Already paid out?
    const existing = await SellerPayout.findOne({ order_id: order.order_id });
    if (existing) {
      return res.status(400).json({ success: false, error: "Payment already released for this order.", payout: existing });
    }

    // Compute payout breakdown per spec Step 10:
    //   - Platform commission = 5% of order_total
    //   - Shipping deduction = shipping_total (paid to courier)
    //   - Net to seller = order_total - commission - shipping
    const breakdown = computeSellerPayout(order.total_amount, order.shipping_total || 0);
    const txnId = generateTransactionId();
    const payoutId = generatePayoutId();

    const payout = await SellerPayout.create({
      payout_id: payoutId,
      transaction_id: txnId,
      order_id: order.order_id,
      package_id: "",
      seller_id: order.primary_seller_id,
      seller_name: "",
      order_amount: breakdown.order_total,
      platform_fee: breakdown.commission,
      shipping_deduction: breakdown.shipping,
      net_to_seller: breakdown.net_to_seller,
      from_account: "WeddingPlatform Admin Account",
      payout_method: "BANK_TRANSFER",
      released_by: req.user.id,
      released_at: new Date(),
      notes: "Payment released by admin after order completion.",
    });

    // Update all packages of this order to COMPLETED + record payout
    await Package.updateMany(
      { order_id: order.order_id },
      {
        $set: {
          status: "COMPLETED",
          payout_released: true,
          payout_released_at: new Date(),
          transaction_id: txnId,
          platform_fee: breakdown.commission,
          net_to_seller: breakdown.net_to_seller,
        },
      }
    );

    // Step 11: order → COMPLETED + record payment release timestamp
    order.status = "COMPLETED";
    order.payment_released_at = new Date();
    order.timeline.push({
      status: "COMPLETED",
      at: new Date(),
      by: "admin",
      by_id: req.user.id,
      note: `Payment released to seller. TXN ${txnId}. Net to seller: PKR ${breakdown.net_to_seller.toLocaleString()} (after 5% commission PKR ${breakdown.commission.toLocaleString()} + shipping PKR ${breakdown.shipping.toLocaleString()}).`,
    });
    await order.save();

    // Update AdminWallet ledger
    let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
    if (!wallet) {
      wallet = await AdminWallet.create({ wallet_id: "admin_wallet_001", balance: 10_000_000 });
    }
    // DEBIT the net_to_seller from admin wallet (admin pays seller)
    wallet.balance = (wallet.balance || 0) - breakdown.net_to_seller;
    wallet.ledger.push({
      type: "DEBIT",
      amount: breakdown.net_to_seller,
      description: `Seller payout for order ${order.order_id} (TXN ${txnId})`,
      ref_order_id: order.order_id,
      ref_payout_id: payoutId,
      at: new Date(),
      by_admin_id: req.user.id,
    });
    // CREDIT the platform commission back to admin wallet (admin earns commission)
    wallet.balance = (wallet.balance || 0) + breakdown.commission;
    wallet.ledger.push({
      type: "CREDIT",
      amount: breakdown.commission,
      description: `Platform commission for order ${order.order_id}`,
      ref_order_id: order.order_id,
      ref_payout_id: payoutId,
      at: new Date(),
      by_admin_id: req.user.id,
    });
    await wallet.save();

    // Notify buyer + seller + admin
    await notifySellerAndAdmin({
      seller_id: order.primary_seller_id,
      title: "Payment Released to Seller",
      message: `Payment of PKR ${breakdown.net_to_seller.toLocaleString()} (TXN ${txnId}) has been transferred to your account for order ${order.order_id}. Order COMPLETED.`,
      type: "payout",
      ref_id: order.order_id,
    });
    await pushNotification({
      recipient_id: order.buyer_id,
      recipient_role: "buyer",
      title: "Order Completed",
      message: `Your order ${order.order_id} is now COMPLETE. Thank you for shopping!`,
      type: "order",
      ref_id: order.order_id,
    });

    return res.json({
      success: true,
      message: "Payment released. Order marked as COMPLETED.",
      payout,
      breakdown,
      wallet_balance: wallet.balance,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- admin wallet ----------
router.get("/wallet", async (req, res) => {
  try {
    let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
    if (!wallet) {
      wallet = await AdminWallet.create({ wallet_id: "admin_wallet_001", balance: 10_000_000 });
    }
    const ledgerAll = [...(wallet.ledger || [])].reverse();
    const recentPayouts = await SellerPayout.find()
      .sort({ released_at: -1 })
      .limit(50)
      .lean();

    // Group ledger lines by order for order-centric history
    const byOrder = {};
    for (const entry of ledgerAll) {
      const oid = (entry.ref_order_id || "").trim();
      if (!oid) continue;
      if (!byOrder[oid]) {
        byOrder[oid] = {
          order_id: oid,
          entries: [],
          credit_total: 0,
          debit_total: 0,
          last_at: entry.at,
        };
      }
      byOrder[oid].entries.push(entry);
      if (entry.type === "CREDIT") byOrder[oid].credit_total += entry.amount || 0;
      if (entry.type === "DEBIT") byOrder[oid].debit_total += entry.amount || 0;
      if (new Date(entry.at) > new Date(byOrder[oid].last_at)) {
        byOrder[oid].last_at = entry.at;
      }
    }
    const order_groups = Object.values(byOrder).sort(
      (a, b) => new Date(b.last_at) - new Date(a.last_at)
    );

    const other_entries = ledgerAll.filter((e) => !(e.ref_order_id || "").trim()).slice(0, 30);

    return res.json({
      success: true,
      wallet: {
        wallet_id: wallet.wallet_id,
        balance: wallet.balance,
        currency: wallet.currency,
        ledger: ledgerAll.slice(0, 200),
      },
      order_groups,
      other_entries,
      recent_payouts: recentPayouts,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Ledger lines for one order (additions + subtractions)
router.get("/wallet/orders/:order_id", async (req, res) => {
  try {
    const orderId = req.params.order_id;
    let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
    if (!wallet) {
      return res.json({ success: true, order_id: orderId, entries: [], payout: null });
    }
    const entries = (wallet.ledger || [])
      .filter((e) => (e.ref_order_id || "") === orderId)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const payout = await SellerPayout.findOne({ order_id: orderId }).lean();
    const credit_total = entries.filter((e) => e.type === "CREDIT").reduce((s, e) => s + (e.amount || 0), 0);
    const debit_total = entries.filter((e) => e.type === "DEBIT").reduce((s, e) => s + (e.amount || 0), 0);
    return res.json({
      success: true,
      order_id: orderId,
      entries,
      credit_total,
      debit_total,
      net: credit_total - debit_total,
      payout: payout || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- payouts for a seller ----------
router.get("/sellers/:seller_id/payouts", async (req, res) => {
  try {
    const payouts = await SellerPayout.find({ seller_id: req.params.seller_id })
      .sort({ released_at: -1 })
      .lean();
    const total = payouts.reduce((s, p) => s + (p.net_to_seller || 0), 0);
    return res.json({
      success: true,
      seller_id: req.params.seller_id,
      count: payouts.length,
      total_payout: total,
      payouts,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- all BNPL applications (admin oversight) ----------
router.get("/bnpl/applications", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const apps = await BnplApplication.find(filter)
      .sort({ created_at: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, count: apps.length, applications: apps });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Task 1a: remove a seller (only if zero products) ----------
// Admin removes a seller from the wallet/sellers list. The seller must have
// zero active product listings — otherwise the platform would orphan products.
router.delete("/sellers/:seller_id", async (req, res) => {
  try {
    const { seller_id } = req.params;

    // Check the Flask ML service for the seller's product count.
    let productCount = 0;
    try {
      const resp = await axios.get(`${VISUAL_ML_URL}/seller/products`, {
        params: { seller_id, limit: 1 },
        timeout: 10000,
      });
      // The Flask /seller/products endpoint returns {total, products:[...]}.
      productCount = resp?.data?.total ?? (resp?.data?.products?.length || 0);
    } catch (err) {
      // If ML service is unreachable, fall back to a defensive non-zero
      // response so we never accidentally delete a seller with live products.
      return res.status(502).json({
        success: false,
        error: "Cannot verify seller product count — ML service unavailable.",
      });
    }

    if (productCount > 0) {
      return res.status(403).json({
        success: false,
        error: "Cannot remove seller with active product listings",
        product_count: productCount,
      });
    }

    // Flag the seller as removed in the AdminWallet ledger (audit trail) —
    // we don't physically delete a wallet row, but we log a DEBIT entry of
    // 0 so the admin sees "seller removed" in the ledger feed.
    let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
    if (!wallet) {
      wallet = await AdminWallet.create({ wallet_id: "admin_wallet_001", balance: 10_000_000 });
    }
    wallet.ledger.push({
      type: "DEBIT",
      amount: 0,
      description: `Seller ${seller_id} removed by admin (no active products).`,
      ref_order_id: "",
      ref_payout_id: "",
      at: new Date(),
      by_admin_id: req.user.id,
    });
    await wallet.save();

    return res.json({
      success: true,
      message: `Seller ${seller_id} removed from sellers list.`,
      seller_id,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Task 1d: aggregate sales timeline (past 30 days) ----------
// Groups completed/delivered/resolved orders by day; zero-fills missing days.
router.get("/sales-timeline", async (req, res) => {
  try {
    const days = 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);

    const rows = await Order.aggregate([
      {
        $match: {
          status: { $in: ["DELIVERED", "COMPLETED", "RESOLVED"] },
          created_at: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$created_at" },
          },
          order_count: { $sum: 1 },
          revenue: { $sum: "$total_amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byDate = Object.fromEntries(
      rows.map((r) => [r._id, { order_count: r.order_count, revenue: r.revenue }])
    );

    const timeline = [];
    let orders_total = 0;
    let revenue_total = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = byDate[key] || { order_count: 0, revenue: 0 };
      orders_total += row.order_count;
      revenue_total += row.revenue;
      timeline.push({
        date: key,
        order_count: row.order_count,
        revenue: row.revenue,
      });
    }

    return res.json({
      success: true,
      count: timeline.length,
      orders_total,
      revenue_total,
      timeline,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Task 1e: marketplace breakdown stats ----------
//   - top 10 buyers by order_count
//   - top 10 sellers by completed_orders
//   - products sold per category (sum items_count grouped by items.major_category)
//   - top selling products (top 10 by total_sold)
router.get("/breakdown", async (req, res) => {
  try {
    const completedStatuses = ["DELIVERED", "COMPLETED", "RESOLVED"];

    const [topBuyers, topSellers, categoryAgg, topProductsAgg] = await Promise.all([
      // Top 10 buyers by order_count (using completed/sold orders)
      Order.aggregate([
        { $match: { status: { $in: completedStatuses } } },
        { $group: { _id: "$buyer_id", order_count: { $sum: 1 }, revenue: { $sum: "$total_amount" } } },
        { $sort: { order_count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, buyer_id: "$_id", order_count: 1, revenue: 1 } },
      ]),
      // Top 10 sellers by completed_orders
      Order.aggregate([
        { $match: { status: "COMPLETED", primary_seller_id: { $ne: "" } } },
        { $group: { _id: "$primary_seller_id", completed_orders: { $sum: 1 }, revenue: { $sum: "$total_amount" } } },
        { $sort: { completed_orders: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, seller_id: "$_id", completed_orders: 1, revenue: 1 } },
      ]),
      // Products sold per category (sum items_count grouped by items.major_category)
      Order.aggregate([
        { $match: { status: { $in: completedStatuses } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.major_category",
            items_count: { $sum: "$items.qty" },
            order_count: { $sum: 1 },
            revenue: { $sum: { $multiply: ["$items.subtotal", 1] } },
          },
        },
        { $sort: { items_count: -1 } },
        { $project: { _id: 0, major_category: { $ifNull: ["$_id", "unknown"] }, items_count: 1, order_count: 1, revenue: 1 } },
      ]),
      // Top selling products (top 10 by total_sold)
      Order.aggregate([
        { $match: { status: { $in: completedStatuses } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product_id",
            total_sold: { $sum: "$items.qty" },
            revenue: { $sum: "$items.subtotal" },
            title: { $first: "$items.title" },
            major_category: { $first: "$items.major_category" },
          },
        },
        { $sort: { total_sold: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, product_id: "$_id", total_sold: 1, revenue: 1, title: 1, major_category: 1 } },
      ]),
    ]);

    return res.json({
      success: true,
      top_buyers: topBuyers,
      top_sellers: topSellers,
      categories: categoryAgg,
      top_products: topProductsAgg,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

