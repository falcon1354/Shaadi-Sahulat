/**
 * Adjust BNPL financing when a financed order/package is cancelled
 * (dispute buyer-win, admin cancel, etc.).
 *
 * - If every linked order is cancelled → cancel application + offer letter,
 *   zero remaining balance, notify bank officer + admin.
 * - If only some linked orders cancel → reduce financed totals / installments
 *   and notify bank that the facility amount changed.
 */
const Order = require("../models/Order");
const BnplApplication = require("../models/BnplApplication");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const { pushNotification } = require("./notify");
const { buildInstallmentSchedule, round2 } = require("./helpers");

async function linkedOrdersForApp(app) {
  const ids = new Set();
  if (app.order_id) ids.add(app.order_id);
  for (const id of app.linked_order_ids || []) {
    if (id) ids.add(id);
  }
  // Also pick up split children that still point at this application
  const extras = await Order.find({
    bnpl_application_id: app.application_no,
    superseded: { $ne: true },
  })
    .select("order_id status total_amount subtotal shipping_total bank_processing_fee")
    .lean();
  for (const o of extras) ids.add(o.order_id);

  const orders = await Order.find({ order_id: { $in: [...ids] } }).lean();
  return orders.filter((o) => !o.superseded);
}

function activeFinancedTotal(orders) {
  return orders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
}

/**
 * @param {object} opts
 * @param {string} opts.applicationNo
 * @param {string} opts.cancelledOrderId
 * @param {string} [opts.byId]
 * @param {string} [opts.reason]
 */
async function adjustBnplAfterOrderCancel({
  applicationNo,
  cancelledOrderId,
  byId = "",
  reason = "Order cancelled",
}) {
  if (!applicationNo) return { adjusted: false };

  const app = await BnplApplication.findOne({ application_no: applicationNo });
  if (!app) return { adjusted: false, error: "application_not_found" };

  // Ensure cancelled order is linked for future lookups
  const linked = new Set([...(app.linked_order_ids || [])]);
  if (app.order_id) linked.add(app.order_id);
  if (cancelledOrderId) linked.add(cancelledOrderId);
  app.linked_order_ids = [...linked];

  const orders = await linkedOrdersForApp(app);
  const remainingTotal = activeFinancedTotal(orders);
  const now = new Date();
  let offer = await BnplOfferLetter.findOne({ application_id: applicationNo });

  if (remainingTotal <= 0) {
    app.status = "CANCELLED";
    await app.save();

    if (offer) {
      offer.status = "DECLINED";
      offer.repayment_status = "CANCELLED";
      offer.amount_remaining = 0;
      offer.payment_history = offer.payment_history || [];
      offer.payment_history.push({
        amount: 0,
        paid_at: now,
        note: `${reason}: facility voided after order ${cancelledOrderId} cancel. All linked packages cancelled.`,
        recorded_by: byId || "system",
        recorded_by_role: "admin",
      });
      await offer.save();
    }

    const notifyTargets = [];
    if (app.officer_id) {
      notifyTargets.push(
        pushNotification({
          recipient_id: app.officer_id,
          recipient_role: "bank_officer",
          title: "BNPL facility cancelled",
          message: `Application ${applicationNo}: all financed packages were cancelled (${reason}). Remaining balance set to PKR 0.`,
          type: "bnpl",
          ref_id: applicationNo,
        })
      );
    }
    notifyTargets.push(
      pushNotification({
        recipient_id: "admin",
        recipient_role: "admin",
        title: "BNPL facility cancelled",
        message: `Application ${applicationNo} voided after cancellations. Bank should treat remaining payable as PKR 0.`,
        type: "bnpl",
        ref_id: applicationNo,
      })
    );
    await Promise.all(notifyTargets);
    return { adjusted: true, mode: "full_cancel", remainingTotal: 0 };
  }

  // Partial cancel — keep app active, shrink offer to remaining active orders
  const paid = Number(offer?.amount_paid) || 0;
  const newRemaining = Math.max(0, round2(remainingTotal - paid));
  const planMonths = app.plan_months || offer?.plan_months || 3;

  if (offer) {
    const feeShare = orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((s, o) => s + (Number(o.bank_processing_fee) || 0), 0);
    const approved = Math.max(0, remainingTotal - feeShare);
    offer.approved_amount = round2(approved);
    offer.processing_fee = round2(feeShare);
    offer.total_payable = round2(remainingTotal);
    offer.monthly_installment = round2(remainingTotal / planMonths);
    offer.amount_remaining = newRemaining;
    // Rebuild only unpaid future schedule proportionally
    const unpaidCount = (offer.installments || []).filter((i) => i.status !== "PAID").length || planMonths;
    const perUnpaid = unpaidCount > 0 ? round2(newRemaining / unpaidCount) : 0;
    offer.installments = (offer.installments || []).map((inst) => {
      const raw = inst.toObject?.() || { ...inst };
      if (raw.status === "PAID") return raw;
      return { ...raw, amount: perUnpaid };
    });
    if (!offer.installments.length) {
      offer.installments = buildInstallmentSchedule(offer.monthly_installment, planMonths);
    }
    offer.payment_history = offer.payment_history || [];
    offer.payment_history.push({
      amount: 0,
      paid_at: now,
      note: `${reason}: order ${cancelledOrderId} cancelled. Financed total reduced to PKR ${remainingTotal.toLocaleString()}.`,
      recorded_by: byId || "system",
      recorded_by_role: "admin",
    });
    if (newRemaining <= 0) {
      offer.repayment_status = "COMPLETED";
    }
    await offer.save();
  }

  // Point application at first still-active order
  const firstActive = orders.find((o) => o.status !== "CANCELLED");
  if (firstActive) app.order_id = firstActive.order_id;
  app.amount = remainingTotal;
  await app.save();

  const notifyTargets = [];
  if (app.officer_id) {
    notifyTargets.push(
      pushNotification({
        recipient_id: app.officer_id,
        recipient_role: "bank_officer",
        title: "BNPL amount reduced",
        message: `Application ${applicationNo}: package/order ${cancelledOrderId} cancelled. New financed total PKR ${remainingTotal.toLocaleString()} (remaining PKR ${newRemaining.toLocaleString()}).`,
        type: "bnpl",
        ref_id: applicationNo,
      })
    );
  }
  notifyTargets.push(
    pushNotification({
      recipient_id: "admin",
      recipient_role: "admin",
      title: "BNPL amount reduced after cancel",
      message: `Application ${applicationNo}: cancelled ${cancelledOrderId}. Active financed total now PKR ${remainingTotal.toLocaleString()}.`,
      type: "bnpl",
      ref_id: applicationNo,
    })
  );
  await Promise.all(notifyTargets);

  return { adjusted: true, mode: "partial", remainingTotal, amountRemaining: newRemaining };
}

module.exports = { adjustBnplAfterOrderCancel, linkedOrdersForApp };
