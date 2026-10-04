const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
  {
    seller_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    business_name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    city: { type: String, default: "" },
    seller_type: { type: String, default: "individual" },
    wallet_balance: { type: Number, default: 0 },
    product_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "sellers", strict: false }
);

module.exports = mongoose.models.Seller || mongoose.model("Seller", sellerSchema, "sellers");
