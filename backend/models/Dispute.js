/**
 * Dispute — created when buyer reports "not received" or "received with problem".
 *
 * Per BNPL&Delivery.md Module 2 Step 6 Option B & C:
 *   - "NO, Not Received" → dispute_type = "not_received"
 *   - "YES, but PROBLEM" → dispute_type = one of damaged / missing / wrong / poor_quality / other
 *
 * Each dispute has:
 *   - a chat room (DisputeChat collection) for buyer/seller/admin real-time messaging
 *   - evidence files stored under uploads/disputes/{order_id}/{dispute_id}/
 *   - admin decision: RESOLVED (original deal stands) | CANCELLED (order cancelled)
 */
const mongoose = require("mongoose");

const disputeEvidenceSchema = new mongoose.Schema({
  file_path:     { type: String, required: true },
  original_name: { type: String, default: "" },
  mime_type:     { type: String, default: "" },
  uploaded_by:   { type: String, default: "" }, // buyer / seller / admin
  uploaded_at:   { type: Date,   default: Date.now },
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
      enum: ["not_received", "damaged", "missing", "wrong", "poor_quality", "other"],
      required: true,
    },
    title:         { type: String, default: "" },
    description:   { type: String, default: "" },
    evidence:      { type: [disputeEvidenceSchema], default: [] },

    status: {
      type: String,
      enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "CANCELLED"],
      default: "OPEN",
      index: true,
    },

    // Admin decision (Step 8)
    admin_id:      { type: String, default: "" },
    admin_notes:   { type: String, default: "" },
    decision:      { type: String, enum: ["", "RESOLVED", "CANCELLED"], default: "" },
    decided_at:    { type: Date,   default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Dispute", disputeSchema, "disputes");
