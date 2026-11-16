/**
 * Polar webhook events we act on:
 *   checkout.updated  — paid, expired, or failed
 *   order.paid        — capture confirmed; creates marketplace orders
 *   order.refunded / refund.created — record a refund made in the Polar dashboard
 */
const Order = require("../../models/Order");
const PolarTransaction = require("../../models/PolarTransaction");
const { fulfillPaidCheckout } = require("./fulfill");
const { debitPolarAmount } = require("./wallet");
const { toMinor } = require("./money");
const { restoreStockForOrderItems } = require("../inventory");
const Package = require("../../models/Package");

async function findTransaction({ transactionId, checkoutId, polarOrderId }) {
  if (transactionId) {
    const byId = await PolarTransaction.findOne({ transaction_id: transactionId });
    if (byId) return byId;
  }
  if (checkoutId) {
    const byCheckout = await PolarTransaction.findOne({ polar_checkout_id: checkoutId });
    if (byCheckout) return byCheckout;
  }
  if (polarOrderId) {
    return PolarTransaction.findOne({ polar_order_id: polarOrderId });
  }
  return null;
}

async function applyCheckoutState(data) {
  const tx = await findTransaction({
    transactionId: data?.metadata?.transaction_id,
    checkoutId: data?.id,
  });
  if (!tx) return { ignored: true };
  if (data?.id && tx.polar_checkout_id !== data.id) {
    tx.polar_checkout_id = data.id;
  }
  if (data?.customer_id && !tx.polar_customer_id) tx.polar_customer_id = data.customer_id;
  const status = String(data?.status || "");
  if (status === "succeeded") {
    await tx.save();
    await fulfillPaidCheckout(tx.transaction_id, {
      checkoutId: data.id,
      orderId: data.order_id || data.order?.id || "",
      paidMinor: Number.isFinite(data.total_amount) ? data.total_amount : undefined,
      currency: data.currency,
      customerId: data.customer_id,
    });
    return { fulfilled: true };
  }
  if (["paid", "refunded", "fulfilling"].includes(tx.status)) {
    await tx.save();
    return { ignored: true };
  }
  if (status === "expired") tx.status = "expired";
  else if (status === "failed") {
    tx.status = "failed";
    tx.failure_reason = tx.failure_reason || "Polar checkout failed";
  } else if (status === "confirmed") tx.status = "confirmed";
  await tx.save();
  return { updated: tx.status };
}

async function applyPaidOrder(data) {
  const tx = await findTransaction({
    transactionId: data?.metadata?.transaction_id,
    checkoutId: data?.checkout_id,
    polarOrderId: data?.id,
  });
  if (!tx) return { ignored: true };
  if (data?.metadata?.buyer_id && data.metadata.buyer_id !== tx.buyer_id) {
    tx.failure_reason = "Polar buyer id does not match this payment";
    tx.status = tx.status === "paid" ? tx.status : "failed";
    await tx.save();
    return { rejected: true };
  }
  await fulfillPaidCheckout(tx.transaction_id, {
    checkoutId: data.checkout_id || tx.polar_checkout_id,
    orderId: data.id,
    paidMinor: Number.isFinite(data.total_amount) ? data.total_amount : undefined,
    currency: data.currency,
    customerId: data.customer_id,
  });
  return { fulfilled: true };
}

const BLOCKING = new Set(["SHIPPED", "DELIVERED", "DISPUTED", "RESOLVED", "COMPLETED"]);

async function applyExternalRefund(data) {
  const tx = await findTransaction({
    transactionId: data?.metadata?.transaction_id,
    checkoutId: data?.checkout_id,
    polarOrderId: data?.order_id || data?.id,
  });
  if (!tx) return { ignored: true };
  if (data?.id && data?.order_id && !tx.polar_refund_id) tx.polar_refund_id = data.id;

  const captured = tx.polar_paid_minor || tx.charge_amount_minor || 0;
  const reported = Number(data.refunded_amount ?? data.amount);
  if (Number.isFinite(reported) && reported > 0) {
    tx.refunded_minor = Math.max(tx.refunded_minor || 0, reported);
  }
  const full = !Number.isFinite(reported) || reported <= 0 || (captured > 0 && reported >= captured - 1);

  const orders = await Order.find({
    $or: [
      { polar_transaction_id: tx.transaction_id },
      { order_id: { $in: tx.order_ids || [] } },
    ],
  });
  let blocked = false;
  for (const order of orders) {
    // Dispute handling and the admin refund route cancel the order themselves.
    // A webhook for that same refund must not restore stock a second time.
    if (order.payment_status === "REFUNDED" || order.status === "CANCELLED") continue;
    if (!full && order.total_amount > 0) {
      const orderMinor = toMinor(order.total_amount, "pkr");
      if (Math.abs(orderMinor - reported) > 1) continue;
    }
    const packages = await Package.find({ order_id: order.order_id }).select("status").lean();
    if (packages.length && packages.every((pkg) => pkg.status === "CANCELLED")) continue;
    if (order.payment_status === "RELEASED" || packages.some((pkg) => BLOCKING.has(pkg.status))) {
      blocked = true;
      continue;
    }
    if (tx.wallet_credited) {
      await debitPolarAmount({
        amountPkr: order.total_amount,
        refId: order.order_id,
        description: `Polar refund ${order.order_id}`,
        adminId: "polar",
      });
    }
    await restoreStockForOrderItems(order.items).catch((err) => {
      console.warn("[polar] stock restore on external refund failed:", err.message);
    });
    order.status = "CANCELLED";
    order.payment_status = "REFUNDED";
    order.timeline.push({
      status: "CANCELLED",
      at: new Date(),
      by: "system",
      by_id: "polar",
      note: "Refund recorded from Polar.",
    });
    await order.save();
    await Package.updateMany({ order_id: order.order_id }, { $set: { status: "CANCELLED" } });
  }
  if (full || (captured > 0 && (tx.refunded_minor || 0) >= captured - 1)) {
    tx.status = blocked ? tx.status : "refunded";
  }
  if (blocked) tx.review_note = "Polar refunded a charge whose order already shipped or was released. Review the wallet.";
  await tx.save();
  return { refunded: tx.status === "refunded", needs_review: blocked };
}

async function handlePolarEvent(event) {
  const type = String(event?.type || "");
  const data = event?.data || {};
  if (type === "checkout.updated" || type === "checkout.created") return applyCheckoutState(data);
  if (type === "order.paid" || (type === "order.updated" && data.paid === true)) return applyPaidOrder(data);
  if (type === "order.refunded" || type === "refund.created" || type === "refund.updated") {
    if (type !== "order.refunded" && data.status && data.status !== "succeeded") return { ignored: true };
    return applyExternalRefund(data);
  }
  return { ignored: true };
}

module.exports = { handlePolarEvent };
