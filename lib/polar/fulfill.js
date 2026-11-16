/**
 * Turn a paid Polar checkout into marketplace orders.
 * Idempotent: a second webhook or return-page sync reuses orders already
 * stored under this transaction.
 */
const crypto = require("crypto");
const PolarTransaction = require("../../models/PolarTransaction");
const Order = require("../../models/Order");
const Buyer = require("../../models/Buyer");
const DowryEstimation = require("../../models/DowryEstimation");
const { generateOrderId } = require("../helpers");
const { deductStockForOrderItems, restoreStockForOrderItems, findProduct, isOrderable } = require("../inventory");
const { newCheckoutSession, makeSellerToken, groupItemsBySeller, createPackagesForOrder } = require("../checkoutSession");
const { notifyBuyerAndAdmin } = require("../notify");
const { creditPolarReceipt } = require("./wallet");
const { refundPolarCharge } = require("./refund");

function newTransactionId() {
  const tail = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `POL-${new Date().getFullYear()}-${tail}${rand}`;
}

function shippingShares(subtotal, shipping, groups) {
  const shares = [];
  let allocated = 0;
  groups.forEach((group, index) => {
    if (index === groups.length - 1) {
      shares.push(shipping - allocated);
      return;
    }
    const share = subtotal > 0 ? Math.floor(shipping * (group.sub / subtotal)) : 0;
    allocated += share;
    shares.push(share);
  });
  return shares;
}

async function assertStillOrderable(items) {
  for (const item of items) {
    const found = await findProduct(item.product_id);
    if (!found || !(await isOrderable(found.doc))) {
      throw new Error(`Product no longer available: ${item.title || item.product_id}`);
    }
  }
}

async function deductDowry(buyerId, items) {
  try {
    const estimation = await DowryEstimation.findOne({ user_id: buyerId }).sort({ created_at: -1 });
    if (!estimation || !estimation.category_budgets) return;
    for (const item of items) {
      const cat = item.major_category || item.subcategory || "";
      if (cat && estimation.category_budgets[cat]) {
        estimation.category_budgets[cat].spent = (estimation.category_budgets[cat].spent || 0) + item.subtotal;
        estimation.category_budgets[cat].remaining = estimation.category_budgets[cat].estimated - estimation.category_budgets[cat].spent;
      }
    }
    await estimation.save();
  } catch (err) {
    console.warn("[polar] dowry deduction failed:", err.message);
  }
}

async function createOrdersForTransaction(tx) {
  const buyer = await Buyer.findOne({ buyer_id: tx.buyer_id }).lean();
  const bySeller = groupItemsBySeller(tx.items);
  const groups = [...bySeller.entries()].map(([sellerId, sellerItems]) => ({
    sellerId,
    sellerItems,
    sub: sellerItems.reduce((n, i) => n + i.subtotal, 0),
  }));
  const multi = groups.length > 1;
  const { color } = multi ? newCheckoutSession() : { color: "" };
  const shares = shippingShares(tx.subtotal, tx.shipping_total, groups);
  const created = [];

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const orderId = generateOrderId();
    const ship = shares[i];
    const order = await Order.create({
      order_id: orderId,
      buyer_id: tx.buyer_id,
      buyer_name: buyer?.name || tx.buyer_name,
      buyer_email: buyer?.email || tx.buyer_email,
      buyer_phone: buyer?.phone || tx.shipping_address?.phone || "",
      items: group.sellerItems,
      items_count: group.sellerItems.reduce((n, item) => n + item.qty, 0),
      subtotal: group.sub,
      shipping_total: ship,
      total_amount: group.sub + ship,
      bank_processing_fee: 0,
      delivery_method: tx.delivery_method,
      seller_view_token: makeSellerToken(orderId, tx.buyer_id),
      shipping_address: tx.shipping_address,
      payment_method: "POLAR",
      payment_status: "ON_HOLD",
      status: "CONFIRMED",
      primary_seller_id: group.sellerId,
      checkout_session_id: tx.transaction_id,
      checkout_group_color: color,
      polar_transaction_id: tx.transaction_id,
      timeline: [{
        status: "CONFIRMED",
        at: new Date(),
        by: "system",
        by_id: "polar",
        note: `Card payment captured by Polar.sh (${tx.transaction_id}). Funds held until delivery, then released to the seller.`,
      }],
    });
    await createPackagesForOrder(order, { notify: true });
    created.push(order);
  }

  await deductDowry(tx.buyer_id, tx.items);
  await notifyBuyerAndAdmin({
    buyer_id: tx.buyer_id,
    title: "Card payment received",
    message: `Polar confirmed ${tx.transaction_id}. ${created.map((o) => o.order_id).join(", ")} ${created.length > 1 ? "are" : "is"} confirmed.`,
    type: "order",
    ref_id: created[0]?.order_id || tx.transaction_id,
  });
  return created;
}

/**
 * @param {string} transactionId
 * @param {{ checkoutId?: string, orderId?: string, paidMinor?: number, currency?: string, customerId?: string }} polar
 */
async function fulfillPaidCheckout(transactionId, polar = {}) {
  const current = await PolarTransaction.findOne({ transaction_id: transactionId });
  if (!current) return null;
  if (["paid", "refunded"].includes(current.status)) {
    let dirty = false;
    if (polar.orderId && !current.polar_order_id) {
      current.polar_order_id = polar.orderId;
      dirty = true;
    }
    if (polar.paidMinor && !current.polar_paid_minor) {
      current.polar_paid_minor = polar.paidMinor;
      dirty = true;
    }
    if (dirty) await current.save();
    return current;
  }

  if (polar.currency && String(polar.currency).toLowerCase() !== "pkr") {
    current.status = "failed";
    current.failure_reason = `Polar charged ${polar.currency}, expected pkr`;
    await current.save();
    throw Object.assign(new Error(current.failure_reason), { status: 409 });
  }
  if (Number.isFinite(polar.paidMinor) && polar.paidMinor < current.charge_amount_minor) {
    current.failure_reason = "Paid amount is below the quoted total";
    current.polar_paid_minor = polar.paidMinor;
    await current.save();
    await refundPolarCharge(current, {
      amountMinor: polar.paidMinor,
      reason: "other",
      comment: current.failure_reason,
    }).catch((err) => console.error("[polar] underpay refund failed:", err.message));
    throw Object.assign(new Error(current.failure_reason), { status: 409 });
  }

  const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
  const locked = await PolarTransaction.findOneAndUpdate(
    {
      transaction_id: transactionId,
      $or: [
        { status: { $in: ["open", "confirmed"] } },
        { status: "fulfilling", updated_at: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        status: "fulfilling",
        ...(polar.checkoutId ? { polar_checkout_id: polar.checkoutId } : {}),
        ...(polar.orderId ? { polar_order_id: polar.orderId } : {}),
        ...(polar.customerId ? { polar_customer_id: polar.customerId } : {}),
        ...(Number.isFinite(polar.paidMinor) ? { polar_paid_minor: polar.paidMinor } : {}),
      },
    },
    { new: true }
  );
  if (!locked) return PolarTransaction.findOne({ transaction_id: transactionId });

  const already = await Order.find({ polar_transaction_id: transactionId }).select("order_id").lean();
  if (already.length) {
    locked.order_ids = already.map((o) => o.order_id);
    await creditPolarReceipt(locked);
    locked.status = "paid";
    locked.paid_at = locked.paid_at || new Date();
    locked.failure_reason = "";
    await locked.save();
    await Buyer.updateOne(
      { buyer_id: locked.buyer_id },
      { $inc: { total_orders: already.length } }
    ).catch((incErr) => console.warn("[polar] buyer total_orders increment failed:", incErr.message));
    return locked;
  }

  let stockTaken = false;
  try {
    await assertStillOrderable(locked.items);
    await deductStockForOrderItems(locked.items);
    stockTaken = true;
    const orders = await createOrdersForTransaction(locked);
    locked.order_ids = orders.map((o) => o.order_id);
    await creditPolarReceipt(locked);
    locked.status = "paid";
    locked.paid_at = new Date();
    locked.failure_reason = "";
    await locked.save();
    await Buyer.updateOne(
      { buyer_id: locked.buyer_id },
      { $inc: { total_orders: orders.length } }
    ).catch((incErr) => console.warn("[polar] buyer total_orders increment failed:", incErr.message));
    return locked;
  } catch (err) {
    const partials = await Order.find({ polar_transaction_id: transactionId }).select("order_id").lean();
    if (partials.length) {
      const ids = partials.map((o) => o.order_id);
      const Package = require("../../models/Package");
      await Package.deleteMany({ order_id: { $in: ids } }).catch(() => {});
      await Order.deleteMany({ order_id: { $in: ids } }).catch(() => {});
    }
    if (stockTaken) {
      await restoreStockForOrderItems(locked.items).catch(() => {});
    }
    locked.order_ids = [];
    locked.status = "confirmed";
    locked.failure_reason = err.message || "Could not create the order after payment";
    await locked.save();
    if (locked.polar_order_id || Number.isFinite(polar.paidMinor)) {
      await refundPolarCharge(locked, {
        amountMinor: locked.polar_paid_minor || locked.charge_amount_minor,
        reason: "service_disruption",
        comment: locked.failure_reason,
      }).catch((refundErr) => console.error("[polar] auto-refund failed:", refundErr.message));
    }
    throw err;
  }
}

module.exports = { newTransactionId, fulfillPaidCheckout };
