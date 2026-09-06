/**
 * SellerPayout — record of every payment released from Admin → Seller.
 *
 * The Admin maintains a "dummy" wallet balance (per user requirement:
 * "keep the Amount Dummy, not the real one"). When admin releases payment
 * for a completed order, a SellerPayout row is created AND the Admin's
 * wallet balance is decremented by the same amount.
 *
 * This way the admin "complete information" loop is satisfied: every
 * payout is traceable to the order, package, and bank transaction.
 */
const mongoose = require("mongoose");

const sellerPayoutSchema = new mongoose.Schema(
  {
    payout_id:        { type: String, required: true, unique: true, index: true },
    transaction_id:   { type: String, required: true, unique: true }, // TXN-FYP-2026-001
    order_id:         { type: String, required: true, index: true },
    package_id:       { type: String, default: "",    index: true },
    seller_id:        { type: String, required: true, index: true },
    seller_name:      { type: String, default: "" },

    order_amount:     { type: Number, required: true },
    platform_fee:     { type: Number, required: true },   // 5% of order_amount
    shipping_deduction: { type: Number, default: 0 },     // courier cost
    net_to_seller:    { type: Number, required: true },

    // Source of funds — always the Admin wallet in this FYP
    from_account:     { type: String, default: "WeddingPlatform Admin Account" },
    payout_method:    { type: String, enum: ["BANK_TRANSFER", "CASH", "WALLET"], default: "BANK_TRANSFER" },

    released_by:      { type: String, default: "" },     // admin_id
    released_at:      { type: Date,   default: Date.now },
    notes:            { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("SellerPayout", sellerPayoutSchema, "seller_payouts");
