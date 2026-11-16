/**
 * Refunds a Polar charge and, when the marketplace order is still unshipped,
 * cancels it, restores stock, and debits the admin wallet receipt.
 */
const Order = require("../../models/Order");
const Package = require("../../models/Package");
const PolarTransaction = require("../../models/PolarTransaction");
const { restoreStockForOrderItems } = require("../inventory");
const { createRefund, findOrderForCheckout } = require("./client");
const { debitPolarAmount } = require("./wallet");

const REFUND_REASONS = new Set([
  "duplicate",
  "fraudulent",
  "customer_request",
  "service_disruption",
  "satisfaction_guarantee",
  "other",
]);

const BLOCKING_PACKAGE = new Set(["SHIPPED", "DELIVERED", "DISPUTED", "RESOLVED", "COMPLETED"]);

function normalizeReason(reason) {
  const value = String(reason || "customer_request");
  if (!REFUND_REASONS.has(value)) {
    const err = new Error("Refund reason is not supported");
    err.status = 400;
    throw err;
  }
  return value;
}

async function ensurePolarOrderId(tx) {
  if (tx.polar_order_id) return tx.polar_order_id;
  const order = await findOrderForCheckout(tx.polar_checkout_id, tx.buyer_id);
  if (!order?.id) return "";
  tx.polar_order_id = order.id;
  if (order.total_amount && !tx.polar_paid_minor) tx.polar_paid_minor = order.total_amount;
  await tx.save();
  return tx.polar_order_id;
}

function capturedMinor(tx) {
  return tx.polar_paid_minor || tx.charge_amount_minor || 0;
}

/**
 * Call Polar for a refund of `amountMinor` and record it on the transaction.
 * Does not touch marketplace orders.
 */
async function refundPolarCharge(tx, { amountMinor, reason, comment, adminId } = {}) {
  const orderId = await ensurePolarOrderId(tx);
  if (!orderId) {
    const err = new Error("Polar has not reported the order id yet. Try again in a moment.");
    err.status = 409;
    throw err;
  }
  const remaining = capturedMinor(tx) - (tx.refunded_minor || 0);
  const amount = Math.min(Number(amountMinor) || remaining, remaining);
  if (amount < 1) {
    return { already: true, transaction: tx };
  }
  let refund;
  try {
    refund = await createRefund({
      order_id: orderId,
      reason: normalizeReason(reason),
      amount,
      comment: comment ? String(comment).slice(0, 500) : null,
      revoke_benefits: false,
      metadata: {
        transaction_id: tx.transaction_id,
        ...(adminId ? { admin_id: String(adminId) } : {}),
      },
    });
  } catch (err) {
    if (err.status === 403) {
      refund = { id: tx.polar_refund_id || "already", status: "succeeded" };
    } else {
      throw err;
    }
  }
  tx.refunded_minor = (tx.refunded_minor || 0) + amount;
  tx.polar_refund_id = refund?.id || tx.polar_refund_id;
  if (tx.refunded_minor >= capturedMinor(tx)) tx.status = "refunded";
  await tx.save();
  return { already: false, amount_minor: amount, refund, transaction: tx };
}

async function cancelMarketplaceOrder(order, { note, adminId, restoreStock }) {
  if (restoreStock) {
    await restoreStockForOrderItems(order.items);
  }
  if (order.status !== "CANCELLED") {
    order.status = "CANCELLED";
    order.timeline.push({
      status: "CANCELLED",
      at: new Date(),
      by: adminId ? "admin" : "system",
      by_id: adminId || "polar",
      note,
    });
  }
  order.payment_status = "REFUNDED";
  await order.save();
  await Package.updateMany({ order_id: order.order_id }, { $set: { status: "CANCELLED" } });
}

async function assertRefundable(order) {
  if (!order) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (order.payment_method !== "POLAR") {
    const err = new Error("This order was not paid with Polar");
    err.status = 400;
    throw err;
  }
  if (order.payment_status === "RELEASED") {
    const err = new Error("Payment was already released to the seller. Refund it manually.");
    err.status = 409;
    throw err;
  }
  const packages = await Package.find({ order_id: order.order_id }).select("status").lean();
  if (packages.some((pkg) => BLOCKING_PACKAGE.has(pkg.status))) {
    const err = new Error("This order has already shipped. It cannot be refunded automatically.");
    err.status = 409;
    throw err;
  }
}

/**
 * Refund one order's share of a Polar charge (used when a dispute is decided
 * for the buyer). Stock restore is skipped when the caller already did it.
 */
async function refundOrderShare(order, { reason, comment, adminId, stockAlreadyRestored = false } = {}) {
  const fresh = await Order.findOne({ order_id: order.order_id });
  if (!fresh) return { refunded: false, error: "Order not found" };
  if (fresh.payment_status === "REFUNDED") return { refunded: true, already: true };
  if (fresh.payment_status === "RELEASED") {
    return { refunded: false, error: "Payment was already released to the seller" };
  }
  const tx = await PolarTransaction.findOne({
    $or: [
      { transaction_id: fresh.polar_transaction_id },
      { order_ids: fresh.order_id },
    ],
  });
  if (!tx) return { refunded: false, error: "No Polar payment is linked to this order" };

  const { toMinor } = require("./money");
  await refundPolarCharge(tx, {
    amountMinor: toMinor(fresh.total_amount, "pkr"),
    reason: reason || "customer_request",
    comment,
    adminId,
  });
  if (tx.wallet_credited) {
    await debitPolarAmount({
      amountPkr: fresh.total_amount,
      refId: fresh.order_id,
      description: `Polar refund ${fresh.order_id}`,
      adminId,
    });
  }
  fresh.payment_status = "REFUNDED";
  if (!stockAlreadyRestored && fresh.status !== "CANCELLED") {
    await cancelMarketplaceOrder(fresh, {
      note: `Polar refunded this order (${tx.transaction_id}).`,
      adminId,
      restoreStock: true,
    });
  } else {
    fresh.timeline.push({
      status: fresh.status,
      at: new Date(),
      by: adminId ? "admin" : "system",
      by_id: adminId || "polar",
      note: `Polar refunded PKR ${fresh.total_amount.toLocaleString()} for ${tx.transaction_id}.`,
    });
    await fresh.save();
  }
  order.payment_status = "REFUNDED";
  return { refunded: true, amount_pkr: fresh.total_amount, transaction_id: tx.transaction_id };
}

/**
 * Refund the whole Polar checkout and cancel every linked order that has
 * not shipped and has not had its payout released.
 */
async function refundTransaction(transactionId, { reason, comment, adminId } = {}) {
  const tx = await PolarTransaction.findOne({ transaction_id: transactionId });
  if (!tx) {
    const err = new Error("Payment not found");
    err.status = 404;
    throw err;
  }
  if (!["paid", "refunded", "confirmed"].includes(tx.status) && !tx.polar_order_id) {
    const err = new Error("This payment has not been captured");
    err.status = 409;
    throw err;
  }
  const orders = await Order.find({
    $or: [
      { polar_transaction_id: tx.transaction_id },
      { order_id: { $in: tx.order_ids || [] } },
    ],
  });
  for (const order of orders) {
    await assertRefundable(order);
  }
  const result = await refundPolarCharge(tx, {
    amountMinor: capturedMinor(tx) - (tx.refunded_minor || 0),
    reason,
    comment,
    adminId,
  });
  for (const order of orders) {
    if (order.payment_status === "REFUNDED") continue;
    if (tx.wallet_credited) {
      await debitPolarAmount({
        amountPkr: order.total_amount,
        refId: order.order_id,
        description: `Polar refund ${order.order_id}`,
        adminId,
      });
    }
    await cancelMarketplaceOrder(order, {
      note: `Full Polar refund of ${tx.transaction_id}.`,
      adminId,
      restoreStock: true,
    });
  }
  tx.review_note = "";
  await tx.save();
  return { transaction: tx, polar: result.refund || null, already: !!result.already };
}

module.exports = {
  refundPolarCharge,
  refundOrderShare,
  refundTransaction,
};
