/**
 * DisputeMessage — chat message between buyer / seller / admin in a dispute room.
 *
 * The chat is real-time over Socket.io (room name = dispute_id) but every
 * message is also persisted here so the history loads on page refresh.
 *
 * Module 2 Step 7.
 */
const mongoose = require("mongoose");

const disputeMessageSchema = new mongoose.Schema(
  {
    dispute_id: { type: String, required: true, index: true },
    order_id:   { type: String, required: true, index: true },
    sender_id:  { type: String, required: true },
    sender_role: {
      type: String,
      enum: ["buyer", "seller", "admin"],
      required: true,
    },
    sender_name: { type: String, default: "" },
    message:     { type: String, default: "" },
    is_system:   { type: Boolean, default: false },
    read_by:     { type: [String], default: [] },
    attachment_path: { type: String, default: "" },
    attachment_name: { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model(
  "DisputeMessage",
  disputeMessageSchema,
  "dispute_messages"
);
