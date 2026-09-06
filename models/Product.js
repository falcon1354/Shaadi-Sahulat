/**
 * ShaadiSahulat - Product Model
 * ================================
 * MongoDB schema for wedding dress products in the catalog.
 * Each product belongs to one of 8 categories.
 */

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: BRD-001, GRM-001, etc.
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Title alias used by Flask ML service & frontend
    title: {
      type: String,
      default: "",
      trim: true,
    },
    // Category is now a plain String — seller products can be any category from AdminCategory
    category: {
      type: String,
      required: true,
      trim: true,
    },
    major_category: {
      type: String,
      default: "",
      trim: true,
    },
    subcategory: {
      type: String,
      default: "",
      trim: true,
    },
    item_type: {
      type: String,
      default: "",
      trim: true,
    },
    wedding_dress_type: {
      type: String,
      default: "",
      trim: true,
    },
    // ── Marketplace type ("new" | "thrift") ──────────────────────────────
    // Replaces the old "used"/"not new" labels.  Drives Thrift vs Retail split.
    marketplace_type: {
      type: String,
      enum: ["new", "thrift"],
      default: "new",
      index: true,
    },
    is_thrift: {
      type: Boolean,
      default: false,
      index: true,
    },
    // ── Pricing ──────────────────────────────────────────────────────────
    price_pkr: {
      type: Number,
      required: true,
      min: 0,
    },
    // Alias used by Flask ML service & frontend (price in PKR)
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Original (pre-discount) price for thrift items
    original_price: {
      type: Number,
      default: null,
    },
    discount_price: {
      type: Number,
      default: null,
    },
    discount_pct: {
      type: Number,
      default: 0,
    },
    // ── Descriptive fields ───────────────────────────────────────────────
    description: {
      type: String,
      default: "",
    },
    color:        { type: String, default: "" },
    fabric:       { type: String, default: "" },
    embroidery_type: { type: String, default: "" },
    size:         { type: String, default: "" },
    material:     { type: String, default: "" },
    brand:        { type: String, default: "" },
    condition: {
      type: String,
      enum: ["", "New", "Like New", "Used", "Thrift"],
      default: "New",
    },
    city:         { type: String, default: "" },

    // ── Seller info ──────────────────────────────────────────────────────
    seller_id: {
      type: String,
      default: "",
      index: true,
    },
    seller_name: {
      type: String,
      default: "",
    },

    // ── Images ───────────────────────────────────────────────────────────
    image_url: {
      type: String,
      default: "",
    },
    thumbnail_url: {
      type: String,
      default: "",
    },
    primary_image_url: {
      type: String,
      default: "",
    },
    images: {
      type: [String],
      default: [],
    },

    // ── Status / availability ────────────────────────────────────────────
    is_available: {
      type: Boolean,
      default: true,
    },
    availability_status: {
      type: String,
      enum: ["available", "sold", "processing", "frozen", "freeze"],
      default: "available",
      index: true,
    },
    total_sold: {
      type: Number,
      default: 0,
    },
    completed_orders: {
      type: Number,
      default: 0,
    },
    orders_count: {
      type: Number,
      default: 0,
    },
    stock_quantity: {
      type: Number,
      default: 1,
    },

    // ── Flags ────────────────────────────────────────────────────────────
    is_hot_deal: {
      type: Boolean,
      default: false,
    },
    is_best_seller: {
      type: Boolean,
      default: false,
    },
    tags: [{
      type: String,
    }],

    // ── Custom fields (admin-defined per category) ───────────────────────
    custom_field_values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ── ML / embeddings ──────────────────────────────────────────────────
    embedding_128: {
      type: [Number],
      default: [],
    },
    // Sparse TF-IDF vector — { term: weight }
    tfidf_vector: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
    // Allow Flask ML service to write fields not explicitly declared above
    // without Mongoose silently stripping them.
    strict: false,
  }
);

// Index for fast category lookups
productSchema.index({ category: 1 });
productSchema.index({ product_id: 1 });
productSchema.index({ price_pkr: 1 });
productSchema.index({ major_category: 1, marketplace_type: 1 });
productSchema.index({ seller_id: 1, availability_status: 1 });

module.exports = mongoose.model("Product", productSchema);
