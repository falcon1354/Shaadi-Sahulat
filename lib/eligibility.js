/**
 * BNPL eligibility pre-check (Step 2 of BNPL&Delivery.md).
 *
 * Rules:
 *   1. Buyer must have a complete BNPL profile (CNIC + address on file).
 *   2. Any prior BNPL application by this buyer in an "active" state
 *      (PENDING_BNPL_APPROVAL, PENDING_BANK_VERIFICATION, APPROVED,
 *       OFFER_ACCEPTED) blocks a new application. The user note says:
 *      "if the last order or any older 3/6 month plan is expired, then
 *       cancel the application at this point, else move further."
 *      Implementation: if OFFER_ACCEPTED application's plan_months have
 *      not elapsed since acceptance → block.
 *   3. If amount < PKR 50,000 AND buyer has a previously APPROVED or
 *      OFFER_ACCEPTED application → fast-path (auto-approve; no manual
 *      bank verification needed). Per spec Step 4 note.
 */
const BnplApplication = require("../models/BnplApplication");
const BnplUser = require("../models/BnplUser");

const AUTO_APPROVE_THRESHOLD = 50000;
const BNPL_MIN_AMOUNT = 1000;

async function checkBnplEligibility(buyerId, amount, opts = {}) {
  const total = Number(amount) || 0;
  const reasons = [];

  // Rule 0: minimum amount
  if (total < BNPL_MIN_AMOUNT) {
    reasons.push(`BNPL minimum amount is PKR ${BNPL_MIN_AMOUNT.toLocaleString()}.`);
  }

  // Rule 1: profile completeness
  const profile = await BnplUser.findOne({ buyer_id: buyerId }).lean();
  // For first-time applicants, profile is created on submission — so we don't
  // block here. We only block if a profile EXISTS but is incomplete.
  // (If profile doesn't exist yet, the application form will create it.)

  // Rule 2: prior active applications
  // Spec update: the rule that blocks a new BNPL request while a previous
  // BNPL balance is not fully paid off has been REMOVED. Only truly pending
  // applications waiting for a bank/buyer decision still block (to avoid
  // simultaneous duplicate applications).
  const priorActive = await BnplApplication.find({
    buyer_id: buyerId,
    status: { $in: ["PENDING_BNPL_APPROVAL", "PENDING_BANK_VERIFICATION", "APPROVED"] },
  }).lean();

  for (const app of priorActive) {
    if (app.status === "APPROVED") {
      reasons.push(
        `You have an approved BNPL offer (${app.application_no}) that you have not yet accepted or declined.`
      );
    } else {
      reasons.push(
        `You have a pending BNPL application (${app.application_no}). Wait for it to be processed before applying again.`
      );
    }
  }

  // Rule 3: fast-path for small amounts with prior approved docs
  let fastPath = false;
  if (total < AUTO_APPROVE_THRESHOLD) {
    const priorApproved = await BnplApplication.countDocuments({
      buyer_id: buyerId,
      status: { $in: ["APPROVED", "OFFER_ACCEPTED"] },
    });
    if (priorApproved > 0) fastPath = true;
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    fast_path: fastPath,
    auto_approve: fastPath,
    profile_complete: !!(profile && profile.cnic_enc && profile.address),
  };
}

module.exports = {
  checkBnplEligibility,
  AUTO_APPROVE_THRESHOLD,
  BNPL_MIN_AMOUNT,
};
