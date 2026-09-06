/**
 * Notification — used to keep buyer / seller / admin in the loop across
 * every status transition in the Order + BNPL + Dispute flows.
 *
 * Per BNPL&Delivery.md the admin "has complete information of each and
 * every thing", so a Notification row is created for the admin on every
 * seller-side or buyer-side action.
 */
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    notification_id: { type: String, required: true, unique: true, index: true },
    recipient_id:    { type: String, required: true, index: true }, // buyer_id / seller_id / "admin"
    recipient_role:  {
      type: String,
      enum: ["buyer", "seller", "admin", "bank_officer"],
      required: true,
    },
    title:           { type: String, default: "" },
    message:         { type: String, default: "" },
    type:            {
      type: String,
      enum: ["order", "package", "delivery", "bnpl", "dispute", "payout", "review", "system"],
      default: "system",
    },
    ref_id:          { type: String, default: "" }, // order_id / package_id / dispute_id / etc.
    read:            { type: Boolean, default: false },
    read_at:         { type: Date,   default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Notification", notificationSchema, "notifications");
