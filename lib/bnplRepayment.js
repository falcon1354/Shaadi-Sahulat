/**
 * BNPL repayment tracking helpers — extends BnplOfferLetter (no parallel system).
 */
const BnplApplication = require("../models/BnplApplication");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const Buyer = require("../models/Buyer");
const BnplBank = require("../models/BnplBank");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Ensure repayment fields exist on an accepted offer. */
function ensureRepaymentFields(offer) {
  if (!offer) return offer;
  const total = round2(offer.total_payable || 0);
  if (offer.amount_paid == null) offer.amount_paid = 0;
  if (offer.amount_remaining == null) {
    offer.amount_remaining = round2(Math.max(0, total - (offer.amount_paid || 0)));
  }
  if (!offer.repayment_status) {
    offer.repayment_status =
      (offer.amount_remaining || 0) <= 0.009 ? "COMPLETED" : "ACTIVE";
  }
  if (!Array.isArray(offer.payment_history)) offer.payment_history = [];
  if (!Array.isArray(offer.installments)) offer.installments = [];
  return offer;
}

function nextDueDate(offer) {
  const pending = (offer.installments || [])
    .filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  return pending[0]?.due_date || null;
}

/** Apply a payment to oldest unpaid installments; update running totals. */
function applyPaymentToOffer(offer, { amount, paid_at, note, recorded_by, recorded_by_role }) {
  ensureRepaymentFields(offer);
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error("Payment amount must be greater than 0");
  if (amt > offer.amount_remaining + 0.009) {
    throw new Error(
      `Payment PKR ${amt.toLocaleString()} exceeds remaining PKR ${offer.amount_remaining.toLocaleString()}`
    );
  }

  let leftover = amt;
  const installments = [...(offer.installments || [])].sort(
    (a, b) => new Date(a.due_date) - new Date(b.due_date)
  );

  for (const inst of installments) {
    if (leftover <= 0.009) break;
    if (inst.status === "PAID") continue;
    const due = round2(inst.amount || 0);
    if (leftover + 0.009 >= due) {
      leftover = round2(leftover - due);
      inst.status = "PAID";
      inst.paid_at = paid_at || new Date();
    } else {
      // Partial: leave installment PENDING but record payment in history
      leftover = 0;
    }
  }
  offer.installments = installments;

  offer.amount_paid = round2((offer.amount_paid || 0) + amt);
  offer.amount_remaining = round2(
    Math.max(0, (offer.total_payable || 0) - offer.amount_paid)
  );
  offer.repayment_status = offer.amount_remaining <= 0.009 ? "COMPLETED" : "ACTIVE";
  if (offer.repayment_status === "COMPLETED") {
    offer.installments = offer.installments.map((i) =>
      i.status === "PAID" ? i : { ...i.toObject?.() || i, status: "PAID", paid_at: paid_at || new Date() }
    );
  }

  offer.payment_history = [
    ...(offer.payment_history || []),
    {
      amount: amt,
      paid_at: paid_at || new Date(),
      note: note || "",
      recorded_by: recorded_by || "",
      recorded_by_role: recorded_by_role || "bank",
    },
  ];

  return offer;
}

function serializeRepayment(app, offer, buyer, bank) {
  ensureRepaymentFields(offer);
  const total = round2(offer.total_payable || app.amount || 0);
  const paid = round2(offer.amount_paid || 0);
  const remaining = round2(offer.amount_remaining ?? Math.max(0, total - paid));
  return {
    application_no: app.application_no,
    order_id: app.order_id,
    buyer_id: app.buyer_id,
    buyer_name: buyer?.name || "",
    buyer_email: buyer?.email || "",
    bank_id: app.bank_id,
    bank_name: bank?.name || bank?.code || app.bank_id,
    status: app.status,
    repayment_status: offer.repayment_status || (remaining <= 0 ? "COMPLETED" : "ACTIVE"),
    plan_months: offer.plan_months || app.plan_months,
    approved_amount: offer.approved_amount || app.amount,
    processing_fee: offer.processing_fee || 0,
    monthly_installment: offer.monthly_installment || 0,
    total_amount: total,
    amount_paid: paid,
    amount_remaining: remaining,
    next_due_date: nextDueDate(offer),
    installments: (offer.installments || []).map((i) => ({
      due_date: i.due_date,
      amount: i.amount,
      status: i.status,
      paid_at: i.paid_at,
    })),
    payment_history: [...(offer.payment_history || [])]
      .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))
      .map((p) => ({
        amount: p.amount,
        paid_at: p.paid_at,
        note: p.note || "",
        recorded_by: p.recorded_by || "",
        recorded_by_role: p.recorded_by_role || "",
      })),
    decision_at: app.decision_at,
    accepted_at: offer.accepted_at,
    created_at: app.created_at,
  };
}

/**
 * List active BNPL repayments (approved / offer accepted with ACCEPTED offer).
 * @param {{ bank_id?: string, buyer_id?: string }} filters
 */
async function listRepayments(filters = {}) {
  const appFilter = {
    status: { $in: ["OFFER_ACCEPTED", "APPROVED"] },
  };
  if (filters.bank_id) appFilter.bank_id = filters.bank_id;
  if (filters.buyer_id) appFilter.buyer_id = filters.buyer_id;

  const apps = await BnplApplication.find(appFilter).sort({ decision_at: -1, created_at: -1 }).lean();
  if (!apps.length) {
    return { summary: { total_disbursed: 0, total_recovered: 0, total_outstanding: 0 }, rows: [] };
  }

  const appNos = apps.map((a) => a.application_no);
  const buyerIds = [...new Set(apps.map((a) => a.buyer_id))];
  const bankIds = [...new Set(apps.map((a) => a.bank_id))];

  const [offers, buyers, banks] = await Promise.all([
    BnplOfferLetter.find({
      application_id: { $in: appNos },
      status: { $in: ["ACCEPTED", "PENDING"] },
    }).lean(),
    Buyer.find({ buyer_id: { $in: buyerIds } }).lean(),
    BnplBank.find({ bank_id: { $in: bankIds } }).lean(),
  ]);

  const offerMap = {};
  for (const o of offers) offerMap[o.application_id] = o;
  const buyerMap = {};
  for (const b of buyers) buyerMap[b.buyer_id] = b;
  const bankMap = {};
  for (const b of banks) bankMap[b.bank_id] = b;

  const rows = [];
  let total_disbursed = 0;
  let total_recovered = 0;
  let total_outstanding = 0;

  for (const app of apps) {
    const offer = offerMap[app.application_no];
    if (!offer) continue;
    // Track once BNPL is finalized (approval completes → OFFER_ACCEPTED + ACCEPTED offer)
    if (app.status !== "OFFER_ACCEPTED" && offer.status !== "ACCEPTED") continue;

    const row = serializeRepayment(app, offer, buyerMap[app.buyer_id], bankMap[app.bank_id]);
    rows.push(row);
    total_disbursed += row.total_amount;
    total_recovered += row.amount_paid;
    total_outstanding += row.amount_remaining;
  }

  return {
    summary: {
      total_disbursed: round2(total_disbursed),
      total_recovered: round2(total_recovered),
      total_outstanding: round2(total_outstanding),
    },
    rows,
  };
}

async function getRepaymentDetail(applicationNo) {
  const app = await BnplApplication.findOne({ application_no: applicationNo }).lean();
  if (!app) return null;
  const [offer, buyer, bank] = await Promise.all([
    BnplOfferLetter.findOne({ application_id: applicationNo }),
    Buyer.findOne({ buyer_id: app.buyer_id }).lean(),
    BnplBank.findOne({ bank_id: app.bank_id }).lean(),
  ]);
  if (!offer) return null;
  ensureRepaymentFields(offer);
  return serializeRepayment(app, offer.toObject ? offer.toObject() : offer, buyer, bank);
}

async function recordPayment(applicationNo, { amount, paid_at, note, recorded_by, recorded_by_role }) {
  const app = await BnplApplication.findOne({ application_no: applicationNo });
  if (!app) throw new Error("Application not found");
  if (!["OFFER_ACCEPTED", "APPROVED"].includes(app.status)) {
    throw new Error(`Cannot record payment for application in status ${app.status}`);
  }

  const offer = await BnplOfferLetter.findOne({ application_id: applicationNo });
  if (!offer) throw new Error("Offer letter not found");
  if (offer.status !== "ACCEPTED") {
    offer.status = "ACCEPTED";
    offer.accepted_at = offer.accepted_at || new Date();
  }

  applyPaymentToOffer(offer, {
    amount,
    paid_at: paid_at ? new Date(paid_at) : new Date(),
    note,
    recorded_by,
    recorded_by_role,
  });
  offer.markModified("installments");
  offer.markModified("payment_history");
  await offer.save();

  return getRepaymentDetail(applicationNo);
}

module.exports = {
  ensureRepaymentFields,
  applyPaymentToOffer,
  nextDueDate,
  serializeRepayment,
  listRepayments,
  getRepaymentDetail,
  recordPayment,
};
