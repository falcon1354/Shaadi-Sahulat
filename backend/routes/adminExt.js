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
const router = express.Router();

const Order = require("../models/Order");
const Package = require("../models/Package");
const Dispute = require("../models/Dispute");
const DisputeMessage = require("../models/DisputeMessage");
const SellerPayout = require("../models/SellerPayout");
const AdminWallet = require("../models/AdminWallet");
const BnplApplication = require("../models/BnplApplication");
const Notification = require("../models/Notification");

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
    return res.json({ success: true, count: orders.length, orders });
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

    // Step 11: order → COMPLETED
    order.status = "COMPLETED";
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
    const recentPayouts = await SellerPayout.find()
      .sort({ released_at: -1 })
      .limit(20)
      .lean();
    return res.json({
      success: true,
      wallet: {
        wallet_id: wallet.wallet_id,
        balance: wallet.balance,
        currency: wallet.currency,
        ledger: (wallet.ledger || []).slice(-50).reverse(),
      },
      recent_payouts: recentPayouts,
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

module.exports = router;
