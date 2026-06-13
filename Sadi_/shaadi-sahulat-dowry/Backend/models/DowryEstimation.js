/**
 * DowryEstimation Model (MongoDB / Mongoose)
 * ============================================
 * Stores the final hybrid estimation output for each user.
 */

const mongoose = require("mongoose");

const dowryEstimationSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    total_recommended_budget: {
      type: Number,
      required: true,
    },
    category_breakdown: {
      bridal_dress: { type: Number, default: 0 },
      groom_dress: { type: Number, default: 0 },
      furniture: { type: Number, default: 0 },
      electronics: { type: Number, default: 0 },
      jewelry: { type: Number, default: 0 },
      kitchen_items: { type: Number, default: 0 },
      decoration: { type: Number, default: 0 },
      miscellaneous: { type: Number, default: 0 },
    },
    baseline_budget: {
      type: Number,
      required: true,
    },
    ml_adjustment_factor: {
      type: Number,
      default: 0,
    },
    responsibility_score: {
      type: Number,
      required: true,
    },
    // User inputs (stored for reference & ML dataset)
    income: {
      type: Number,
      required: true,
    },
    savings: {
      type: Number,
      required: true,
    },
    expected_contribution: {
      type: Number,
      default: 0,
    },
    total_family_members: {
      type: Number,
      default: 4,
    },
    married_children: {
      type: Number,
      default: 0,
    },
    unmarried_children: {
      type: Number,
      required: true,
    },
    ages_of_unmarried: {
      type: [Number],
      default: [],
    },
    youngest_unmarried_age: {
      type: Number,
    },
    // Priority settings
    priorities: {
      priority_bridal_dress: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_groom_dress: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_furniture: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_electronics: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_jewelry: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_kitchen_items: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_decoration: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
      priority_miscellaneous: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    },
    notes: {
      type: [String],
      default: [],
    },
    source: {
      type: String,
      default: "Hybrid Engine",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Index for faster history queries
dowryEstimationSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model("DowryEstimation", dowryEstimationSchema);
