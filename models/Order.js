/**
 * Order — created when buyer checks out from the cart.
 *
 * Payment methods (per BNPL&Delivery.md):
 *   - COD         : cash on delivery
 *   - BNPL        : Buy Now Pay Later installment plan
 *
 * Status lifecycle (per BNPL&Delivery.md Module 2 Steps 1-11):
 *   PENDING_BNPL_APPROVAL  → BNPL only, awaiting bank decision
 *   CONFIRMED              → ready for seller to prepare (COD or BNPL-approved)
 *   PREPARING              → seller is preparing the package(s)
 *   SHIPPED                → seller handed to courier, tracking # recorded
 *   DELIVERED              → seller confirmed delivery to buyer
 *   DISPUTED               → buyer raised an issue (not received / damaged)
 *   RESOLVED               → admin closed dispute in favor of original deal
 *   CANCELLED              → admin cancelled (seller gets nothing)
 *   COMPLETED              → admin released payment to seller
 *
 * An Order has 1..N "packages". Each package corresponds to items from
 * ONE seller (so a multi-seller order splits into multiple packages).
 * The seller interacts with packages, not orders — that is how the
 * platform keeps each seller's flow independent.
 */
const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
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

const orderSchema = new mongoose.Schema(
  {
    order_id:        { type: String, required: true, unique: true, index: true },
    buyer_id:        { type: String, required: true, index: true },
    buyer_name:      { type: String, default: "" },
    buyer_email:     { type: String, default: "" },
    buyer_phone:     { type: String, default: "" },

    items:           { type: [orderItemSchema], default: [] },
    items_count:     { type: Number, default: 0 },
    subtotal:        { type: Number, required: true },
    shipping_total:  { type: Number, default: 0 },
    total_amount:    { type: Number, required: true },

    shipping_address: { type: addressSchema, default: () => ({}) },

    payment_method:  { type: String, enum: ["COD", "BNPL"], required: true },
    payment_status:  {
      type: String,
      enum: ["UNPAID", "PENDING", "PAID", "REFUNDED", "CANCELLED"],
      default: "UNPAID",
    },
    status: {
      type: String,
      enum: [
        "PENDING_BNPL_APPROVAL",
        "CONFIRMED",
        "PREPARING",
        "SHIPPED",
        "DELIVERED",
        "DISPUTED",
        "RESOLVED",
        "CANCELLED",
        "COMPLETED",
      ],
      default: "CONFIRMED",
      index: true,
    },

    // BNPL link (only when payment_method === "BNPL")
    bnpl_application_id: { type: String, default: "", index: true },

    bank_processing_fee:     { type: Number, default: 0 },
    buyer_confirmed_receipt: { type: Boolean, default: false },
    buyer_confirmed_at:      { type: Date,   default: null },
    delivery_method:         { type: String, default: "standard" },

    // When the order was delivered — used by the 24-hour auto-release
    // payment countdown on the Admin Orders page.
    delivered_at:            { type: Date,   default: null },
    // When payment was released to the seller (null = still pending).
    payment_released_at:     { type: Date,   default: null },

    // Seller-facing hashed token for the order-detail URL.
    // Allows /orders/ORD-2026-31207?t=<token> style URLs so a buyer
    // cannot guess a seller's order-detail view.
    seller_view_token:       { type: String, default: "", index: true },

    // Seller who needs to fulfill (single-seller order; multi-seller uses packages)
    primary_seller_id:   { type: String, default: "" },

    // Timeline events — every status transition appends here so the admin
    // can see "complete information of each and every thing".
    timeline: {
      type: [{
        status:      { type: String, required: true },
        at:          { type: Date,   default: Date.now },
        by:          { type: String, default: "system" },  // buyer/seller/admin/bank
        by_id:       { type: String, default: "" },
        note:        { type: String, default: "" },
      }],
      default: [],
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Order", orderSchema, "orders");
