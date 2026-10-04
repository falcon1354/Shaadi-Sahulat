const mongoose = require("mongoose");

const bnplBatchSchema = new mongoose.Schema(
  {
    batch_id:     { type: String, required: true, unique: true, index: true }, // e.g. BATCH-2026-001
    release_date: { type: Date, required: true },                             // Date batch covers
    released_at:  { type: Date, default: Date.now },                          // Timestamp of release
    total_amount: { type: Number, required: true },                           // Sum of all order amounts
    order_count:  { type: Number, default: 0 },
    orders: [
      {
        order_id:    { type: String, required: true },
        buyer_id:    { type: String, default: "" },
        buyer_name:  { type: String, default: "" },
        amount:      { type: Number, required: true },
        bnpl_app_no: { type: String, default: "" },
        accepted_at: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["PENDING", "RELEASED"],
      default: "RELEASED",
      index: true,
    },
    notes: { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("BnplBatchRelease", bnplBatchSchema, "bnpl_batch_releases");
