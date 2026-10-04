/**
 * BNPL eligibility pre-check.
 *
 * Auto-approve rule (updated):
 *   - Requested amount < PKR 5,000 → auto-approve (no banker action)
 *   - Amount ≥ PKR 5,000 → banker must manually approve or reject
 */
const BnplApplication = require("../models/BnplApplication");
const BnplUser = require("../models/BnplUser");

const AUTO_APPROVE_THRESHOLD = 5000;
const BNPL_MIN_AMOUNT = 1000;

async function checkBnplEligibility(buyerId, amount) {
  const total = Number(amount) || 0;
  const reasons = [];

  if (total < BNPL_MIN_AMOUNT) {
    reasons.push(`BNPL minimum amount is PKR ${BNPL_MIN_AMOUNT.toLocaleString()}.`);
  }

  const profile = await BnplUser.findOne({ buyer_id: buyerId }).lean();

  // Block only truly pending banker/buyer-decision apps (no offer-accept wait).
  const priorActive = await BnplApplication.find({
    buyer_id: buyerId,
    status: { $in: ["PENDING_BNPL_APPROVAL", "PENDING_BANK_VERIFICATION"] },
  }).lean();

  for (const app of priorActive) {
    reasons.push(
      `You have a pending BNPL application (${app.application_no}). Wait for it to be processed before applying again.`
    );
  }

  // Threshold-only auto-approve: below PKR 5,000
  const autoApprove = reasons.length === 0 && total > 0 && total < AUTO_APPROVE_THRESHOLD;

  return {
    eligible: reasons.length === 0,
    reasons,
    fast_path: autoApprove,
    auto_approve: autoApprove,
    auto_approve_threshold: AUTO_APPROVE_THRESHOLD,
    profile_complete: !!(profile && profile.cnic_enc && profile.address),
  };
}

module.exports = {
  checkBnplEligibility,
  AUTO_APPROVE_THRESHOLD,
  BNPL_MIN_AMOUNT,
};
