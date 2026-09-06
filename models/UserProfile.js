/**
 * UserProfile Model (MongoDB / Mongoose)
 * ========================================
 * Stores user registration and profile data.
 * This is a lightweight model — the full Buyer/Seller models
 * will be added in other modules.
 */

const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
    },
    full_name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    city: {
      type: String,
    },
    address: {
      type: String,
    },
    role: {
      type: String,
      enum: ["buyer", "seller", "admin"],
      default: "buyer",
    },
    has_completed_dowry: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("UserProfile", userProfileSchema);
