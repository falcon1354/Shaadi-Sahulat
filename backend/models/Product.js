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
    price_pkr: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_price: {
      type: Number,
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    seller_name: {
      type: String,
      default: "",
    },
    image_url: {
      type: String,
      default: "",
    },
    thumbnail_url: {
      type: String,
      default: "",
    },
    seller_id: {
      type: String,
      default: "",
    },
    is_available: {
      type: Boolean,
      default: true,
    },
    total_sold: {
      type: Number,
      default: 0,
    },
    stock_quantity: {
      type: Number,
      default: 1,
    },
    images: {
      type: [String],
      default: [],
    },
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
    // Optional: embedding vector stored directly in DB
    embedding_128: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast category lookups
productSchema.index({ category: 1 });
productSchema.index({ product_id: 1 });
productSchema.index({ price_pkr: 1 });

module.exports = mongoose.model("Product", productSchema);