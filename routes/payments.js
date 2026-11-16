/**
 * Card payments through Polar.sh.
 *
 *   GET  /api/payments/config
 *   POST /api/payments/checkout          buyer — start a Polar checkout
 *   POST /api/payments/sync              buyer — confirm a checkout after redirect
 *   GET  /api/payments/mine              buyer — own payment list
 *   GET  /api/payments/:transactionId    buyer — one payment
 *   GET  /api/payments/admin             admin — all card payments
 *   POST /api/payments/admin/:transactionId/refund
 *
 * Webhook (raw body, mounted in server.js before JSON parsing):
 *   POST /api/payments/webhook
 */
const express = require("express");
const router = express.Router();

const PolarTransaction = require("../models/PolarTransaction");
const { requireBuyer, requireAdmin } = require("../lib/auth");
const { getPolarConfig } = require("../lib/polar/config");
const { quotePolarCart, QuoteError } = require("../lib/polar/quote");
const { createCheckout, getCheckout } = require("../lib/polar/client");
const { newTransactionId, fulfillPaidCheckout } = require("../lib/polar/fulfill");
const { refundTransaction } = require("../lib/polar/refund");
const { handlePolarEvent } = require("../lib/polar/events");
const { verifyPolarWebhook } = require("../lib/polar/webhook");

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = (typeof forwarded === "string" ? forwarded.split(",")[0] : req.ip || "")
    .trim()
    .replace(/^::ffff:/, "");
  if (!raw || raw === "127.0.0.1" || raw === "::1") return null;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(raw)) return null;
  return raw;
}

function present(tx, { includeUrl = false } = {}) {
  return {
    transaction_id: tx.transaction_id,
    status: tx.status,
    buyer_id: tx.buyer_id,
    buyer_name: tx.buyer_name,
    subtotal: tx.subtotal,
    shipping_total: tx.shipping_total,
    total_amount: tx.total_amount_pkr,
    currency: "PKR",
    order_ids: tx.order_ids || [],
    polar_order_id: tx.polar_order_id || "",
    failure_reason: tx.failure_reason || "",
    review_note: tx.review_note || "",
    created_at: tx.created_at,
    paid_at: tx.paid_at,
    ...(includeUrl ? { checkout_url: tx.polar_checkout_url || "" } : {}),
  };
}

function sendError(res, err) {
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error("[payments]", err);
  return res.status(status).json({ success: false, error: err.message || "Payment request failed" });
}

router.get("/config", (_req, res) => {
  const cfg = getPolarConfig();
  return res.json({ success: true, enabled: cfg.enabled, provider: "polar", currency: "PKR" });
});

router.post("/checkout", requireBuyer, async (req, res) => {
  try {
    const cfg = getPolarConfig();
    if (!cfg.enabled) {
      return res.status(503).json({
        success: false,
        error: "Card payments are not configured. Add POLAR_ACCESS_TOKEN and POLAR_PRODUCT_ID.",
      });
    }
    const quote = await quotePolarCart({
      buyerId: req.user.id,
      items: req.body?.items,
      shippingAddress: req.body?.shipping_address,
      deliveryMethod: req.body?.delivery_method,
    });
    const transactionId = newTransactionId();
    const tx = await PolarTransaction.create({
      transaction_id: transactionId,
      buyer_id: req.user.id,
      buyer_name: quote.buyer.name || "",
      buyer_email: quote.buyer.email || "",
      items: quote.items,
      shipping_address: quote.shipping_address,
      delivery_method: quote.delivery_method,
      subtotal: quote.subtotal,
      shipping_total: quote.shipping_total,
      total_amount_pkr: quote.total_amount_pkr,
      charge_currency: "pkr",
      charge_amount_minor: quote.charge_amount_minor,
      status: "open",
    });

    const ip = clientIp(req);
    let checkout;
    try {
      checkout = await createCheckout({
        products: [cfg.productId],
        prices: {
          [cfg.productId]: [{
            amount_type: "fixed",
            price_amount: quote.charge_amount_minor,
            price_currency: "pkr",
          }],
        },
        currency: "pkr",
        allow_discount_codes: false,
        allow_trial: false,
        external_customer_id: req.user.id,
        customer_email: quote.buyer.email || undefined,
        customer_name: quote.buyer.name || undefined,
        ...(ip ? { customer_ip_address: ip } : {}),
        success_url: `${cfg.frontendOrigin}/buyer/payments/return?checkout_id={CHECKOUT_ID}`,
        return_url: `${cfg.frontendOrigin}/buyer/checkout`,
        metadata: {
          transaction_id: transactionId,
          buyer_id: req.user.id,
        },
      });
    } catch (err) {
      tx.status = "failed";
      tx.failure_reason = err.message || "Polar checkout was not created";
      await tx.save();
      err.status = err.status && err.status < 500 ? 400 : err.status;
      throw err;
    }

    tx.polar_checkout_id = checkout.id || "";
    tx.polar_checkout_url = checkout.url || "";
    tx.polar_customer_id = checkout.customer_id || "";
    tx.expires_at = checkout.expires_at ? new Date(checkout.expires_at) : null;
    await tx.save();

    if (!tx.polar_checkout_url) {
      return res.status(502).json({ success: false, error: "Polar did not return a checkout URL" });
    }
    return res.status(201).json({
      success: true,
      checkout_url: tx.polar_checkout_url,
      transaction: present(tx),
    });
  } catch (err) {
    if (err instanceof QuoteError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return sendError(res, err);
  }
});

router.post("/sync", requireBuyer, async (req, res) => {
  try {
    const checkoutId = String(req.body?.checkout_id || "").trim();
    if (!checkoutId) return res.status(400).json({ success: false, error: "checkout_id is required" });
    const tx = await PolarTransaction.findOne({ polar_checkout_id: checkoutId, buyer_id: req.user.id });
    if (!tx) return res.status(404).json({ success: false, error: "Payment not found" });
    if (tx.status === "paid" || tx.status === "refunded") {
      return res.json({ success: true, transaction: present(tx) });
    }
    const checkout = await getCheckout(checkoutId);
    const metaBuyer = checkout?.metadata?.buyer_id;
    const metaTx = checkout?.metadata?.transaction_id;
    if (metaTx && metaTx !== tx.transaction_id) {
      return res.status(409).json({ success: false, error: "Checkout does not match this payment" });
    }
    if (metaBuyer && metaBuyer !== req.user.id) {
      return res.status(403).json({ success: false, error: "This checkout belongs to another customer" });
    }
    if (checkout.status === "succeeded") {
      const updated = await fulfillPaidCheckout(tx.transaction_id, {
        checkoutId,
        orderId: checkout.order_id || checkout.order?.id || "",
        paidMinor: Number.isFinite(checkout.total_amount) ? checkout.total_amount : undefined,
        currency: checkout.currency,
        customerId: checkout.customer_id,
      });
      return res.json({ success: true, transaction: present(updated || tx) });
    }
    if (checkout.status === "expired" && tx.status !== "paid") tx.status = "expired";
    else if (checkout.status === "failed" && tx.status !== "paid") {
      tx.status = "failed";
      tx.failure_reason = tx.failure_reason || "Polar checkout failed";
    } else if (checkout.status === "confirmed" && tx.status === "open") tx.status = "confirmed";
    await tx.save();
    return res.json({ success: true, transaction: present(tx) });
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/mine", requireBuyer, async (req, res) => {
  try {
    const rows = await PolarTransaction.find({ buyer_id: req.user.id }).sort({ created_at: -1 }).limit(50).lean();
    return res.json({ success: true, transactions: rows.map((row) => present(row)) });
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/admin", requireAdmin, async (req, res) => {
  try {
    const rows = await PolarTransaction.find().sort({ created_at: -1 }).limit(100).lean();
    return res.json({ success: true, transactions: rows.map((row) => present(row)) });
  } catch (err) {
    return sendError(res, err);
  }
});

router.post("/admin/:transactionId/refund", requireAdmin, async (req, res) => {
  try {
    const result = await refundTransaction(req.params.transactionId, {
      reason: req.body?.reason || "customer_request",
      comment: req.body?.comment || "",
      adminId: req.user.id,
    });
    return res.json({
      success: true,
      message: result.already ? "This charge was already refunded" : "Refund sent to Polar",
      transaction: present(result.transaction),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/:transactionId", requireBuyer, async (req, res) => {
  try {
    const tx = await PolarTransaction.findOne({
      transaction_id: req.params.transactionId,
      buyer_id: req.user.id,
    }).lean();
    if (!tx) return res.status(404).json({ success: false, error: "Payment not found" });
    return res.json({ success: true, transaction: present(tx) });
  } catch (err) {
    return sendError(res, err);
  }
});

async function handlePolarWebhook(req, res) {
  const cfg = getPolarConfig();
  if (!cfg.webhookSecret) {
    return res.status(503).json({ success: false, error: "POLAR_WEBHOOK_SECRET is not set" });
  }
  const raw = req.body;
  if (!verifyPolarWebhook(raw, req.headers, cfg.webhookSecret)) {
    return res.status(403).send("");
  }
  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    return res.status(400).send("");
  }
  try {
    await handlePolarEvent(event);
    return res.status(202).send("");
  } catch (err) {
    console.error("[polar] webhook error:", err.message);
    return res.status(500).send("");
  }
}

router.handlePolarWebhook = handlePolarWebhook;

module.exports = router;
