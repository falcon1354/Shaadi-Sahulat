/**
 * Package — a seller-side fulfillment unit within an Order.
 *
 * A single Order splits into 1..N Packages (one per seller). The seller
 * interacts ONLY with their package(s): they update its status, attach a
 * tracking number, mark it delivered, etc. The buyer sees the order as a
 * whole but the package-level status is the granular truth.
 *
 * Status lifecycle (per BNPL&Delivery.md Module 2):
 *   PENDING    → created, waiting for seller to start preparing
 *   PREPARING  → seller acknowledged and is packing
 *   SHIPPED    → courier picked up, tracking # recorded
 *   DELIVERED  → seller confirmed buyer received the package
 *   DISPUTED   → buyer raised an issue on this package
 *   RESOLVED   → admin closed dispute, original deal stands
 *   CANCELLED  → admin cancelled the package (seller gets nothing)
 *   COMPLETED  → admin released payment, package closed
 */
const mongoose = require("mongoose");

const packageItemSchema = new mongoose.Schema({
  product_id: { type: String, required: true },
  title:      { type: String, default: "" },
  price:      { type: Number, required: true },
  qty:        { type: Number, required: true, default: 1 },
  subtotal:   { type: Number, required: true },
}, { _id: false });

const packageSchema = new mongoose.Schema(
  {
    package_id:     { type: String, required: true, unique: true, index: true },
    order_id:       { type: String, required: true, index: true },
    seller_id:      { type: String, required: true, index: true },
    seller_name:    { type: String, default: "" },

    items:          { type: [packageItemSchema], default: [] },
    items_count:    { type: Number, default: 0 },
    subtotal:       { type: Number, required: true },

    // Shipping method chosen by seller (Module 2 Step 2)
    shipping_method: {
      type: String,
      enum: ["standard", "express", "same_day", "pickup"],
      default: "standard",
    },
    shipping_cost:   { type: Number, default: 0 },
    distance_km:     { type: Number, default: 0 },

    // Courier details (Module 2 Step 3)
    courier_company: { type: String, default: "" },
    tracking_number: { type: String, default: "" },
    shipped_at:      { type: Date,   default: null },

    // Delivery confirmation (Module 2 Step 5)
    delivered_at:    { type: Date,   default: null },
    delivery_note:   { type: String, default: "" },
    recipient_name:  { type: String, default: "" },

    status: {
      type: String,
      enum: ["PENDING", "PREPARING", "SHIPPED", "DELIVERED",
             "DISPUTED", "RESOLVED", "CANCELLED", "COMPLETED"],
      default: "PENDING",
      index: true,
    },

    // Admin is always in the loop — these flags show on the admin dashboard
    admin_notified:  { type: Boolean, default: false },

    // Net amount the seller will receive once status === COMPLETED
    // (subtotal - platform commission - shipping deduction)
    platform_fee:    { type: Number, default: 0 },
    net_to_seller:   { type: Number, default: 0 },
    payout_released: { type: Boolean, default: false },
    payout_released_at: { type: Date, default: null },
    transaction_id:  { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Package", packageSchema, "packages");
