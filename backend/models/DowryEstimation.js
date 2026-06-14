/**
 * DowryEstimation Model — updated for spec §2.1, §2.2, §2.3
 * wedding_dress replaces separate bridal_dress / groom_dress.
 * priorities now allow Not_Wanted.
 * category_budgets stores the full Contract-1 object (estimated/spent/remaining).
 */

const mongoose = require("mongoose");

const priorityEnum = ["High", "Medium", "Low", "Not_Wanted"];

const categoryBudgetSchema = new mongoose.Schema(
  {
    estimated:  { type: Number, default: 0 },
    spent:      { type: Number, default: 0 },
    remaining:  { type: Number, default: 0 },
    active:     { type: Boolean, default: true },
  },
  { _id: false }
);

const dowryEstimationSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },

    total_recommended_budget: { type: Number, required: true },
    baseline_budget:          { type: Number, required: true },
    ml_adjustment_factor:     { type: Number, default: 0 },
    responsibility_score:     { type: Number, required: true },

    // Per-category breakdown (raw amounts from hybrid engine)
    category_breakdown: {
      wedding_dress: { type: Number, default: 0 },
      furniture:     { type: Number, default: 0 },
      electronics:   { type: Number, default: 0 },
      kitchen_items: { type: Number, default: 0 },
      decoration:    { type: Number, default: 0 },
      miscellaneous: { type: Number, default: 0 },
    },

    // Full budget tracking object (Contract 1) — Mixed to support dynamic admin-added categories
    category_budgets: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Budget source split (income vs savings) — used by Result Dashboard cards
    budget_sources: {
      from_income:        { type: Number, default: 0 },
      from_savings:       { type: Number, default: 0 },
      from_contribution:  { type: Number, default: 0 },
      income_percentage:  { type: Number, default: 0 },
      savings_percentage: { type: Number, default: 0 },
    },

    // Buyer's manually adjusted amounts (post slider — §2.4)
    adjusted_estimates: {
      type: Map,
      of: Number,
      default: {},
    },
    was_manually_adjusted: { type: Boolean, default: false },

    // Wedding dress type chosen in Step 3 (§2.1)
    wedding_dress_type: {
      type: String,
      enum: ["bridal", "groom"],
      default: "bridal",
    },

    // User inputs (stored for ML re-training)
    income:                { type: Number, required: true },
    savings:               { type: Number, required: true },
    expected_contribution: { type: Number, default: 0 },
    total_family_members:  { type: Number, default: 4 },
    married_children:      { type: Number, default: 0 },
    unmarried_children:    { type: Number, required: true },
    ages_of_unmarried:     { type: [Number], default: [] },
    youngest_unmarried_age:{ type: Number },

    // Priority settings (§2.2 — 4 options)
    priorities: {
      priority_wedding_dress: { type: String, enum: priorityEnum, default: "Medium" },
      priority_furniture:     { type: String, enum: priorityEnum, default: "Medium" },
      priority_electronics:   { type: String, enum: priorityEnum, default: "Medium" },
      priority_kitchen_items: { type: String, enum: priorityEnum, default: "Medium" },
      priority_decoration:    { type: String, enum: priorityEnum, default: "Medium" },
      priority_miscellaneous: { type: String, enum: priorityEnum, default: "Medium" },
    },

    // Which Not_Wanted categories chose NOT to redistribute
    redistributions: { type: Map, of: Boolean, default: {} },

    notes:  { type: [String], default: [] },
    source: { type: String, default: "Hybrid Engine" },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

dowryEstimationSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model("DowryEstimation", dowryEstimationSchema);
