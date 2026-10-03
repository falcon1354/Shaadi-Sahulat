/**
 * Shared BNPL approval finalization.
 *
 * On bank approve (or small-amount auto-approve):
 *   - Application → OFFER_ACCEPTED (no separate buyer accept step)
 *   - Offer letter → ACCEPTED
 *   - Order → CONFIRMED for fulfillment (never regress status)
 *   - payment_status stays PENDING until admin releases funds (not PAID)
 *   - Packages created so sellers see "Orders to Fulfill"
 */
const BnplApplication = require("../models/BnplApplication");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const Order = require("../models/Order");
const Package = require("../models/Package");
const {
  generateOfferNo,
  computePlan,
  buildInstallmentSchedule,
} = require("./helpers");
const { notifySellerAndAdmin } = require("./notify");

/** Statuses that must not be overwritten by a late BNPL finalize. */
const POST_CONFIRM_STATUSES = new Set([
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "DISPUTED",
  "RESOLVED",
  "COMPLETED",
  "CANCELLED",
]);

async function ensurePackagesForOrder(order, { notify = true } = {}) {
  const existing = await Package.countDocuments({ order_id: order.order_id });
  if (existing > 0) return [];

  const bySeller = new Map();
  for (const it of order.items || []) {
    if (!bySeller.has(it.seller_id)) bySeller.set(it.seller_id, []);
    bySeller.get(it.seller_id).push(it);
  }

  const created = [];
  for (const [sellerId, sellerItems] of bySeller.entries()) {
    const pkgSubtotal = sellerItems.reduce((n, i) => n + (i.subtotal || 0), 0);
    const pkg = await Package.create({
      package_id: `PEND-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      order_id: order.order_id,
      seller_id: sellerId,
      seller_name: sellerItems[0].seller_name || "",
      items: sellerItems.map((i) => ({
        product_id: i.product_id,
        title: i.title,
        price: i.price,
        qty: i.qty,
        subtotal: i.subtotal,
        major_category: i.major_category || "",
        subcategory: i.subcategory || "",
      })),
      items_count: sellerItems.reduce((n, i) => n + (i.qty || 1), 0),
      subtotal: pkgSubtotal,
      shipping_method: order.delivery_method || "standard",
      shipping_cost: 0,
      distance_km: 0,
      status: "PENDING",
      admin_notified: true,
    });
    created.push(pkg);

    if (notify) {
      await notifySellerAndAdmin({
        seller_id: sellerId,
        title: "New Order Received (BNPL Approved)",
        message: `You have received a new order ${order.order_id} (package ${pkg.package_id}). ${sellerItems.length} item(s), PKR ${pkgSubtotal.toLocaleString()}.`,
        type: "order",
        ref_id: order.order_id,
      }).catch(() => {});
    }
  }
  return created;
}

/**
 * Finalize BNPL after approval (manual bank or auto).
 * @param {object} opts
 * @param {string} opts.applicationNo
 * @param {number} opts.planMonths
 * @param {string} [opts.comment]
 * @param {string} opts.by - bank|system
 * @param {string} [opts.byId]
 * @param {boolean} [opts.createOfferIfMissing=true]
 */
async function finalizeBnplApproval({
  applicationNo,
  planMonths,
  comment = "",
  by = "bank",
  byId = "",
  createOfferIfMissing = true,
}) {
  const app = await BnplApplication.findOne({ application_no: applicationNo });
  if (!app) throw new Error("BNPL application not found");

  const plan = parseInt(planMonths || app.plan_months, 10);
  if (![3, 6].includes(plan)) throw new Error("plan_months must be 3 or 6");

  const planCalc = computePlan(app.amount, plan);
  const now = new Date();

  let offer = await BnplOfferLetter.findOne({ application_id: applicationNo });
  if (!offer && createOfferIfMissing) {
    offer = await BnplOfferLetter.create({
      application_id: applicationNo,
      offer_no: generateOfferNo(),
      buyer_id: app.buyer_id,
      approved_amount: planCalc.approved_amount,
      plan_months: plan,
      processing_fee: planCalc.processing_fee,
      monthly_installment: planCalc.monthly_installment,
      total_payable: planCalc.total_payable,
      valid_until: now,
      status: "ACCEPTED",
      accepted_at: now,
      installments: buildInstallmentSchedule(planCalc.monthly_installment, plan),
      amount_paid: 0,
      amount_remaining: planCalc.total_payable,
      repayment_status: "ACTIVE",
      payment_history: [],
    });
  } else if (offer) {
    offer.status = "ACCEPTED";
    offer.accepted_at = offer.accepted_at || now;
    offer.plan_months = plan;
    offer.approved_amount = planCalc.approved_amount;
    offer.processing_fee = planCalc.processing_fee;
    offer.monthly_installment = planCalc.monthly_installment;
    offer.total_payable = planCalc.total_payable;
    if (!offer.installments?.length) {
      offer.installments = buildInstallmentSchedule(planCalc.monthly_installment, plan);
    }
    // Initialize repayment tracking
    if (offer.amount_paid == null) offer.amount_paid = 0;
    if (offer.amount_remaining == null) {
      offer.amount_remaining = planCalc.total_payable - (offer.amount_paid || 0);
    }
    if (!offer.repayment_status) offer.repayment_status = "ACTIVE";
    if (!Array.isArray(offer.payment_history)) offer.payment_history = [];
    await offer.save();
  }

  app.status = "OFFER_ACCEPTED";
  app.plan_months = plan;
  app.decision_at = app.decision_at || now;
  app.offer_expires_at = null;
  app.officer_comment = comment || app.officer_comment || "BNPL approved — ready for seller fulfillment.";
  await app.save();

  const order = await Order.findOne({ order_id: app.order_id });
  if (!order) {
    return { app, offer, order: null, packages: [] };
  }

  // Never mark PAID here — funds have not moved to the seller yet.
  if (!["RELEASED", "REFUNDED", "CANCELLED"].includes(order.payment_status)) {
    order.payment_status = "PENDING";
  }
  order.payment_method = "BNPL";
  order.bnpl_application_id = applicationNo;

  if (!POST_CONFIRM_STATUSES.has(order.status)) {
    order.status = "CONFIRMED";
    order.timeline.push({
      status: "CONFIRMED",
      at: now,
      by,
      by_id: byId,
      note: `BNPL application ${applicationNo} approved. Order released for seller fulfillment (no buyer offer-accept step).`,
    });
  } else {
    order.timeline.push({
      status: order.status,
      at: now,
      by,
      by_id: byId,
      note: `BNPL application ${applicationNo} finalized (OFFER_ACCEPTED). Existing order status ${order.status} preserved.`,
    });
  }
  await order.save();

  // Multi-seller BNPL: split combined cart into independent per-seller orders
  const sellerIds = new Set((order.items || []).map((i) => i.seller_id).filter(Boolean));
  if (sellerIds.size > 1) {
    const { splitCombinedBnplOrder } = require("./checkoutSession");
    const children = await splitCombinedBnplOrder(order, { by, byId });
    return { app, offer, order, packages: [], split_orders: children };
  }

  const packages = await ensurePackagesForOrder(order);
  return { app, offer, order, packages };
}

module.exports = {
  finalizeBnplApproval,
  ensurePackagesForOrder,
  POST_CONFIRM_STATUSES,
};
