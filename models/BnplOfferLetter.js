/**
 * BNPL offer letter — generated when the bank officer approves an
 * application. The buyer has 3 days to accept or decline; after that
 * the offer auto-expires on next accept attempt.
 *
 * Payment schedule is also stored here so the buyer's "My BNPL" page
 * can render the installment timeline.
 */
const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema({
  due_date:    { type: Date,   required: true },
  amount:      { type: Number, required: true },
  status:      { type: String, enum: ["PENDING", "PAID", "OVERDUE"], default: "PENDING" },
  paid_at:     { type: Date,   default: null },
}, { _id: false });

const bnplOfferLetterSchema = new mongoose.Schema(
  {
    application_id:      { type: String, required: true, unique: true, index: true },
    offer_no:            { type: String, required: true, unique: true },
    buyer_id:            { type: String, required: true, index: true },
    approved_amount:     { type: Number, required: true },
    plan_months:         { type: Number, required: true, enum: [3, 6] },
    processing_fee:      { type: Number, required: true },
    monthly_installment: { type: Number, required: true },
    total_payable:       { type: Number, required: true },
    valid_until:         { type: Date,   required: true },   // 3 days from approval
    accepted_at:         { type: Date,   default: null },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"],
      default: "PENDING",
    },
    installments:        { type: [installmentSchema], default: [] },
    pdf_path:            { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model(
  "BnplOfferLetter",
  bnplOfferLetterSchema,
  "bnpl_offer_letters"
);
