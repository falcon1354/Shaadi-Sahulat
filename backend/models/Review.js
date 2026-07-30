/**
 * Review — buyer rating + comment on a product after delivery.
 *
 * Per BNPL&Delivery.md Module 2 Step 11:
 *   "when the order is Complete and the review and rating is added to
 *    Order, means the item that was in stock/marketplace get the rating.
 *    and when open the that Product we receive Comment and rating and
 *    Buyer Name, and review like it was happen in real E-commerce websites"
 *
 * So reviews are tied to BOTH:
 *   - product_id  (so ProductDetailPage can list them)
 *   - order_id    (so the buyer's "My Orders" can show what they reviewed)
 *
 * v3.1 updates:
 *   - rating is now a decimal 0.5–5.0 in 0.5 steps (was integer 1–5)
 *   - new ai_suggested_rating + ai_used flags for the AI Review module
 *   - new ai_generated flag for reviews created from AI Review Generator
 *
 * v3.2 updates (Voice AI agent):
 *   - new voice_url         — relative path to the .mp3 in Uploads/Reviews/
 *   - new voice_gender      — "male" | "female" | null
 *   - new voice_language    — "en" | "ur" | null
 *   - new voice_duration_s  — audio duration in seconds (for the UI player)
 *
 *   Voice files are stored at:
 *     <project_root>/Uploads/Reviews/<buyer_id>_<product_id>.mp3
 *   per the user's instruction: "save the Voice at Local Storage with
 *   Id like Buyer+product". The buyer+product ID pair uniquely identifies
 *   a voice clip (one per buyer per product, overwriting on regeneration).
 */
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    review_id:   { type: String, required: true, unique: true, index: true },
    product_id:  { type: String, required: true, index: true },
    order_id:    { type: String, required: true, index: true },
    package_id:  { type: String, default: "" },
    buyer_id:    { type: String, required: true, index: true },
    buyer_name:  { type: String, default: "" },
    seller_id:   { type: String, default: "",    index: true },

    // 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5  (saved as Decimal128)
    rating:      { type: Number, required: true, min: 0.5, max: 5 },

    // Title (short headline) + comment (long body) — supports the
    // "comment Box contain atleast 1-2 Word of Descition or title"
    // requirement from the AI review spec.
    title:       { type: String, default: "" },
    comment:     { type: String, default: "" },
    would_recommend: { type: Boolean, default: true },

    // AI metadata (v3.1)
    ai_suggested_rating: { type: Number, default: null }, // 0.5-5 if AI suggested
    ai_used:             { type: Boolean, default: false }, // buyer accepted AI suggestion
    ai_generated:        { type: Boolean, default: false }, // comment came from generator
    ai_provider:         { type: String, default: "" },     // "groq" | "python-vader" | "fallback"

    // Admin moderation flag — defaults to visible
    visible:     { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// One review per (product_id, order_id, buyer_id) — buyer can review the
// same product in a different order, but only once per order.
reviewSchema.index({ product_id: 1, order_id: 1, buyer_id: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema, "reviews");
