/**
 * PolarTransaction — one card checkout through Polar.sh.
 *
 * The marketplace order is NOT created here. Stock is held only after Polar
 * reports the checkout as paid (webhook or the buyer's return-page sync).
 * order_ids is filled at that moment and links the Polar charge to the
 * Shaadi Sahulat order rows (one per seller, same as COD).
 */
const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  product_id:     { type: String, required: true },
  seller_id:      { type: String, required: true },
  title:          { type: String, default: "" },
  major_category: { type: String, default: "" },
  subcategory:    { type: String, default: "" },
  item_type:      { type: String, default: "" },
  image_url:      { type: String, default: "" },
  price:          { type: Number, required: true },
  discount_price: { type: Number, default: null },
  qty:            { type: Number, required: true, default: 1 },
  subtotal:       { type: Number, required: true },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  line1:        { type: String, default: "" },
  city:         { type: String, default: "" },
  province:     { type: String, default: "" },
  house_number: { type: String, default: "" },
  phone:        { type: String, default: "" },
  notes:        { type: String, default: "" },
}, { _id: false });

const polarTransactionSchema = new mongoose.Schema(
  {
    transaction_id: { type: String, required: true, unique: true, index: true },
    buyer_id:       { type: String, required: true, index: true },
    buyer_name:     { type: String, default: "" },
    buyer_email:    { type: String, default: "" },

    items:            { type: [itemSchema], default: [] },
    shipping_address: { type: addressSchema, default: () => ({}) },
    delivery_method:  { type: String, default: "standard" },

    subtotal:          { type: Number, required: true },
    shipping_total:    { type: Number, required: true },
    total_amount_pkr:  { type: Number, required: true },
    // Minor units sent to Polar (paisa for PKR).
    charge_currency:     { type: String, default: "pkr" },
    charge_amount_minor: { type: Number, required: true },
    // What Polar actually captured (may include tax on top of the quote).
    polar_paid_minor:    { type: Number, default: 0 },
    refunded_minor:      { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["open", "confirmed", "fulfilling", "paid", "failed", "expired", "refunded"],
      default: "open",
      index: true,
    },
    failure_reason: { type: String, default: "" },
    review_note:    { type: String, default: "" },

    polar_checkout_id:  { type: String, default: "", index: true },
    polar_checkout_url: { type: String, default: "" },
    polar_order_id:     { type: String, default: "", index: true },
    polar_customer_id:  { type: String, default: "" },
    polar_refund_id:    { type: String, default: "" },
    expires_at:         { type: Date, default: null },
    paid_at:            { type: Date, default: null },

    order_ids:        { type: [String], default: [] },
    wallet_credited:  { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("PolarTransaction", polarTransactionSchema, "polar_transactions");
