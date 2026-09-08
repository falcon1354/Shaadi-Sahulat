/**
 * Dispute — buyer confirmation / seller 48h window / admin resolution.
 * Spec: Dispute & Order Confirmation System (condensed).
 */
const mongoose = require("mongoose");

const disputeEvidenceSchema = new mongoose.Schema({
  file_path:     { type: String, required: true },
  original_name: { type: String, default: "" },
  mime_type:     { type: String, default: "" },
  uploaded_by:   { type: String, default: "" }, // buyer / seller / admin
  uploaded_at:   { type: Date,   default: Date.now },
  description:   { type: String, default: "" },
}, { _id: false });

const disputeSchema = new mongoose.Schema(
  {
    dispute_id:    { type: String, required: true, unique: true, index: true },
    order_id:      { type: String, required: true, index: true },
    package_id:    { type: String, default: "",    index: true },
    buyer_id:      { type: String, required: true, index: true },
    seller_id:     { type: String, required: true, index: true },

    dispute_type:  {
      type: String,
      enum: [
        "not_received",
        "item_not_as_described",
        "damaged",
        "wrong",
        "missing",
        "quality_issue",
        "other",
        "poor_quality", // legacy
      ],
      required: true,
    },
    title:         { type: String, default: "" },
    description:   { type: String, default: "" },
    evidence:      { type: [disputeEvidenceSchema], default: [] },

    status: {
      type: String,
      enum: [
        "OPEN",
        "SELLER_RESPONSE_PENDING",
        "SELLER_RESPONDED",
        "BUYER_REVIEW_PENDING",
        "ADMIN_REVIEW_PENDING",
        "UNDER_REVIEW",
        "RESOLVED",
        "CANCELLED",
        "APPEALED",
      ],
      default: "SELLER_RESPONSE_PENDING",
      index: true,
    },

    // SLA deadlines
    opened_at:                 { type: Date, default: Date.now },
    seller_response_deadline:  { type: Date, default: null },
    seller_responded_at:       { type: Date, default: null },
    seller_response_action:    { type: String, default: "" },
    seller_response_note:      { type: String, default: "" },
    seller_offer_percent:      { type: Number, default: null },
    seller_replacement_tracking: { type: String, default: "" },
    seller_non_responsive:     { type: Boolean, default: false },
    escalated_at:              { type: Date, default: null },
    escalation_reason:         { type: String, default: "" },
    admin_resolution_deadline: { type: Date, default: null },
    appeal_deadline:           { type: Date, default: null },
    chat_locked:               { type: Boolean, default: false },
    muted_roles:               { type: [String], default: [] },

    // Admin decision
    admin_id:      { type: String, default: "" },
    admin_notes:   { type: String, default: "" },
    decision:      { type: String, default: "" },
    outcome_code:  { type: String, default: "" },
    refund_percent:{ type: Number, default: null },
    decided_at:    { type: Date,   default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Dispute", disputeSchema, "disputes");
