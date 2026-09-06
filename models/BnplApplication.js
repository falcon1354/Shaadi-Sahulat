/**
 * BNPL application — one row per BNPL checkout attempt.
 *
 * Lifecycle (per BNPL&Delivery.md Module 1 Steps 4-7):
 *   PENDING_BNPL_APPROVAL     → order placed, awaiting app submission
 *   PENDING_BANK_VERIFICATION → app + docs submitted, awaiting officer
 *   APPROVED                  → officer approved, offer letter generated
 *   REJECTED                  → officer rejected
 *   OFFER_EXPIRED             → 3-day window elapsed without buyer action
 *   OFFER_ACCEPTED            → buyer accepted the offer, plan activated
 *   OFFER_DECLINED            → buyer declined the offer
 *   CANCELLED                 → admin/seller cancelled (Module 2 Step 9)
 *
 * Field reference:
 *   application_no  : "BNPL-2026-001"
 *   buyer_id        : host Buyer.buyer_id (string)
 *   order_id        : host Order.order_id (string, created by /api/orders)
 *   bank_id         : BnplBank.bank_id (string)
 *   iban_enc        : AES-256-GCM ciphertext
 *   plan_months     : 3 or 6
 *   amount          : order total at the moment of application
 */
const mongoose = require("mongoose");

const bnplApplicationSchema = new mongoose.Schema(
  {
    application_no:   { type: String, required: true, unique: true, index: true },
    buyer_id:         { type: String, required: true, index: true },
    order_id:         { type: String, required: true, index: true },
    bank_id:          { type: String, required: true, ref: "BnplBank" },
    iban_enc:         { type: String, default: "" },
    account_title:    { type: String, default: "" },
    plan_months:      { type: Number, enum: [3, 6], default: 3 },
    amount:           { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "PENDING_BNPL_APPROVAL",
        "PENDING_BANK_VERIFICATION",
        "APPROVED",
        "REJECTED",
        "OFFER_EXPIRED",
        "OFFER_ACCEPTED",
        "OFFER_DECLINED",
        "CANCELLED",
      ],
      default: "PENDING_BNPL_APPROVAL",
      index: true,
    },
    // @deprecated risk_score and risk_category — kept in model for backward compat,
    // but excluded from API responses per v3.2 spec
    risk_score:       { type: Number, default: null },
    risk_category:    { type: String, default: null },

    // Verification checklist (v3.2) — bank officer marks each check before APPROVE
    verification_checks: {
      cnic_match:          { type: Boolean, default: false },
      iban_valid:          { type: Boolean, default: false },
      identity_confirmed:  { type: Boolean, default: false },
      documents_complete:  { type: Boolean, default: false },
    },
    officer_id:       { type: String, default: null },
    officer_comment:  { type: String, default: "" },
    decision_at:      { type: Date,   default: null },
    offer_expires_at: { type: Date,   default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model(
  "BnplApplication",
  bnplApplicationSchema,
  "bnpl_applications"
);
