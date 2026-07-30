/**
 * AdminWallet — single-row collection that tracks the Admin's dummy balance.
 *
 * The admin module was previously hardcoded (seller list was static).
 * Per user requirement: "the Admin seller module (Hardcoded is already
 * implemented you have to Do chainging in them)" — we extend it with a
 * real wallet balance that decrements every time the admin releases a
 * payment to a seller. The balance itself is dummy (no real money), but
 * the movement is logged so the admin sees the full financial picture.
 */
const mongoose = require("mongoose");

const adminWalletSchema = new mongoose.Schema(
  {
    wallet_id: { type: String, required: true, unique: true, default: "admin_wallet_001" },
    balance:   { type: Number, default: 10_000_000 }, // PKR 10,000,000 dummy starting balance
    currency:  { type: String, default: "PKR" },
    ledger: {
      type: [{
        type:         { type: String, enum: ["CREDIT", "DEBIT"], required: true },
        amount:       { type: Number, required: true },
        description:  { type: String, default: "" },
        ref_order_id: { type: String, default: "" },
        ref_payout_id: { type: String, default: "" },
        at:           { type: Date,   default: Date.now },
        by_admin_id:  { type: String, default: "" },
      }],
      default: [],
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("AdminWallet", adminWalletSchema, "admin_wallets");
