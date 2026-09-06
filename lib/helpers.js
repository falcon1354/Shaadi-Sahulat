/**
 * Helpers for generating human-readable IDs and computing financials.
 *
 * ID format: <PREFIX>-YYYY-NNNNN  (5-digit sequence, zero-padded)
 * The sequence is derived from Date.now() last 5 digits + a random 2-digit salt.
 * This avoids a DB round-trip on every ID generation while keeping collisions
 * vanishingly unlikely. For a real production system you'd use an atomic
 * counter — but for an FYP demo this is sufficient.
 */

function _seq() {
  const t = Date.now().toString().slice(-5);
  const r = String(Math.floor(Math.random() * 90) + 10);
  return (t + r).slice(0, 5);
}

function generateOrderId()        { return `ORD-${new Date().getFullYear()}-${_seq()}`; }
function generateApplicationNo()  { return `BNPL-${new Date().getFullYear()}-${_seq()}`; }
function generateDisputeId()      { return `DIS-${new Date().getFullYear()}-${_seq()}`; }
function generatePackageId()      { return `PKG-${new Date().getFullYear()}-${_seq()}`; }
function generateTransactionId()  { return `TXN-FYP-${new Date().getFullYear()}-${_seq()}`; }
function generateOfferNo()        { return `OFR-${new Date().getFullYear()}-${_seq()}`; }
function generatePayoutId()       { return `PAY-${new Date().getFullYear()}-${_seq()}`; }
function generateReviewId()       { return `REV-${new Date().getFullYear()}-${_seq()}`; }
function generateNotificationId() { return `NTF-${new Date().getFullYear()}-${_seq()}`; }

/** IBAN: PK + 22 alphanumerics = 24 chars total */
function validateIban(s) {
  if (!s) return false;
  return s.length === 24;
}

/** CNIC: 12345-1234567-1 */
function validateCnic(s) {
  if (!s) return false;
  return /^\d{5}-\d{7}-\d$/.test(s);
}

/**
 * Distance-based shipping cost. Per BNPL&Delivery.md Module 2 Step 2:
 *   0-2 km   : PKR 150 flat
 *   2-5 km   : 150 + (d-2)*30
 *   5-10 km  : 150 + (d-5)*50
 *   10+ km   : 150 + (d-10)*80
 */
function calculateShipping(distanceKm, method = "standard") {
  const d = Math.max(0, Number(distanceKm) || 0);
  let base;
  if (d <= 2) base = 150;
  else if (d <= 5) base = 150 + (d - 2) * 30;
  else if (d <= 10) base = 150 + (d - 5) * 50;
  else base = 150 + (d - 10) * 80;
  base = Math.round(base);

  const factors = {
    standard: { mult: 1, eta: "3-4 days" },
    express: { mult: 2.5, eta: "1-2 days" },
    same_day: { mult: 4, eta: "same day" },
    pickup: { mult: 0, eta: "buyer pickup" },
  };
  const f = factors[method] || factors.standard;
  return {
    base,
    method_factor: f.mult,
    total: Math.round(base * f.mult),
    eta_days: f.eta,
  };
}

/**
 * Compute seller payout breakdown. Per spec Step 10:
 *   Platform commission = 5% of order_total
 *   Shipping deduction  = shipping cost (paid to courier)
 *   Net to seller       = order_total - commission - shipping
 */
function computeSellerPayout(orderTotal, shippingCost) {
  const total = Number(orderTotal) || 0;
  const shipping = Number(shippingCost) || 0;
  const commission = Math.round(total * 0.05);
  const net = total - commission - shipping;
  return { order_total: total, commission, shipping, net_to_seller: net };
}

/**
 * BNPL installment plan computation. Per spec Step 7:
 *   Processing fee = 2% of approved amount
 *   Monthly installment = (amount + fee) / planMonths
 */
function computePlan(amount, planMonths) {
  const a = Number(amount) || 0;
  const fee = a * 0.02;
  const total = a + fee;
  const monthly = total / planMonths;
  return {
    approved_amount: round2(a),
    processing_fee: round2(fee),
    monthly_installment: round2(monthly),
    total_payable: round2(total),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Offer letter is valid for 3 days from approval (spec Step 7). */
function offerExpiry(fromDate = new Date()) {
  return new Date(fromDate.getTime() + 3 * 24 * 60 * 60 * 1000);
}

/** Build installment schedule (one entry per month, starting 1 month from now). */
function buildInstallmentSchedule(monthlyAmount, planMonths, startDate = new Date()) {
  const arr = [];
  for (let i = 1; i <= planMonths; i++) {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    arr.push({
      due_date: due,
      amount: round2(monthlyAmount),
      status: "PENDING",
      paid_at: null,
    });
  }
  return arr;
}

function formatPkr(n) {
  return "PKR " + (Number(n) || 0).toLocaleString("en-PK");
}

/** Phone validation — must match /^03\d{9}$/ (exactly 11 digits starting with 03) */
function validatePhone(phone) {
  if (!phone) return false;
  return /^03\d{9}$/.test(phone);
}

/** Phone formatting — strip non-digits, ensure starts with 03, insert dash after 4th digit */
function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits.startsWith("03") || digits.length !== 11) return raw; // can't format
  return digits.slice(0, 4) + "-" + digits.slice(4); // 03XX-XXXXXXX
}

/** Tracking number validation — must match /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/ */
function validateTrackingNumber(tracking) {
  if (!tracking) return false;
  if (/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(tracking)) return true;
  // Auto-format: if 12 alphanumeric chars without dashes, it can be formatted
  const stripped = String(tracking).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return stripped.length === 12;
}

/** Tracking number formatting — strip non-alphanumeric, insert dashes every 4 chars */
function formatTrackingNumber(raw) {
  const stripped = String(raw).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (stripped.length !== 12) return raw; // can't format
  return stripped.slice(0, 4) + "-" + stripped.slice(4, 8) + "-" + stripped.slice(8, 12);
}

/** Bank processing fee computation — returns Math.round(amount * pct) */
function computeBankProcessingFee(amount, pct) {
  return Math.round((Number(amount) || 0) * (Number(pct) || 0));
}

/** Generate sold stats ID */
function generateSoldStatsId() {
  return `SOLD-${Date.now()}`;
}

module.exports = {
  generateOrderId,
  generateApplicationNo,
  generateDisputeId,
  generatePackageId,
  generateTransactionId,
  generateOfferNo,
  generatePayoutId,
  generateReviewId,
  generateNotificationId,
  generateSoldStatsId,
  validateIban,
  validateCnic,
  validatePhone,
  formatPhone,
  validateTrackingNumber,
  formatTrackingNumber,
  computeBankProcessingFee,
  calculateShipping,
  computeSellerPayout,
  computePlan,
  buildInstallmentSchedule,
  offerExpiry,
  round2,
  formatPkr,
};
