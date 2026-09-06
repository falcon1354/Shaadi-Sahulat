/**
 * ShaadiSahulat - Visual Recommendation Log Model
 * ==================================================
 * Stores each visual recommendation request and its results.
 * Useful for analytics, tracking popular categories, and improving the model.
 */

const mongoose = require("mongoose");

const visualRecommendationSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      default: "anonymous",
    },
    predicted_category: {
      type: String,
      enum: [
        "bridal_lehenga",
        "bridal_sharara",
        "bridal_gown",
        "bridal_saree",
        "bridal_maxi",
        "groom_sherwani",
        "groom_kurta",
        "groom_waistcoat",
      ],
    },
    confidence: {
      type: Number,
      default: 0,
    },
    stage1_passed: {
      type: Boolean,
      default: false,
    },
    stage2_passed: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["success", "rejected", "error"],
      default: "success",
    },
    rejection_stage: {
      type: String,
      default: null,
    },
    rejection_reason: {
      type: String,
      default: null,
    },
    results_count: {
      type: Number,
      default: 0,
    },
    top_results: [{
      product_id: String,
      similarity_score: Number,
      match_percentage: Number,
    }],
    search_time_ms: {
      type: Number,
      default: 0,
    },
    preferred_category: {
      type: String,
      default: null,
    },
    image_size_kb: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

visualRecommendationSchema.index({ user_id: 1 });
visualRecommendationSchema.index({ predicted_category: 1 });
visualRecommendationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("VisualRecommendation", visualRecommendationSchema);
