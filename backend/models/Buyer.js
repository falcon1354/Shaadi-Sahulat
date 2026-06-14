const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const buyerSchema = new mongoose.Schema(
  {
    buyer_id:      { type: String, required: true, unique: true },
    name:          { type: String, required: true, trim: true },
    email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    phone:         { type: String, default: "" },
    city:          { type: String, default: "" },
    cart:                 { type: Array,   default: [] },
    dowry_done:           { type: Boolean, default: false },
    dowry_estimation_id:  { type: String,  default: "" },
    // Rich wishlist — stored in DB so new devices/browsers get real data
    wishlist_items: {
      type: [{
        product_id:     { type: String, required: true },
        title:          { type: String, default: "" },
        price:          { type: Number, default: 0 },
        major_category: { type: String, default: "" },
        added_at:       { type: Date,   default: Date.now },
      }],
      default: [],
    },
    // Recently viewed — last 10, stored in DB
    recently_viewed_items: {
      type: [{
        product_id:     { type: String, required: true },
        title:          { type: String, default: "" },
        price:          { type: Number, default: 0 },
        major_category: { type: String, default: "" },
        viewed_at:      { type: Date,   default: Date.now },
      }],
      default: [],
    },
    // Cart items — persisted per buyer so data survives logout/device switch
    cart_items: {
      type: [{
        product_id:     { type: String, required: true },
        title:          { type: String, default: "" },
        price:          { type: Number, default: 0 },
        discount_price: { type: Number, default: null },
        major_category: { type: String, default: "" },
        image_url:      { type: String, default: "" },
        qty:            { type: Number, default: 1 },
        added_at:       { type: Date,   default: Date.now },
      }],
      default: [],
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

buyerSchema.methods.checkPassword = function (plain) {
  return bcrypt.compareSync(plain, this.password_hash);
};

module.exports = mongoose.model("Buyer", buyerSchema);
