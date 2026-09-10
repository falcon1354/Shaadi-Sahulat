/**
 * Review routes — public read endpoints + AI-powered rating suggestion &
 * review generation proxies to visual-ml-service.
 *
 * Mounted at /api/reviews in server.js.
 *
 * Endpoints:
 *   GET  /product/:product_id             list visible reviews for a product (with buyer names)
 *   GET  /seller/:seller_id               aggregate seller rating
 *   GET  /seller/:seller_id/all           list ALL reviews for a seller's products (seller view)
 *   GET  /admin/all                       admin oversight of all reviews
 *   POST /ai/suggest-rating               AI suggests 0.5-5 star rating from text
 *   POST /ai/generate-reviews             AI generates 3 review drafts
 *
 * Visibility rules (the "AI-Powered Review & Rating Module" spec):
 *   - Buyers can submit reviews successfully (POST /api/orders/:order_id/review)
 *   - Sellers can view ALL reviews associated with their products
 *     (GET /api/reviews/seller/:seller_id/all)
 *   - Admin can view ALL reviews (GET /api/reviews/admin/all)
 *   - Public visitors see visible reviews on ProductDetailPage
 *     (GET /api/reviews/product/:product_id)
 */
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { publicUrl } = require("../lib/storage");

const { suggestRating, generateReviews, isGroqConfigured } = require("../lib/aiReviewClient");
const {
  synthesizeReviewVoice,
  normalizeAgent,
  isReviewTtsEnabled,
  AGENTS,
} = require("../lib/toneVoiceClient");
const { saveReviewVoiceAsync } = require("../lib/storage");

// ── Validate rating is in 0.5 steps between 0.5 and 5 ─────────────────────
function isValidHalfStepRating(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return false;
  if (n < 0.5 || n > 5) return false;
  return Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}

function withVoiceUrl(review) {
  if (!review) return review;
  return {
    ...review,
    voice_url: publicUrl(review.voice_url) || review.voice_url || "",
  };
}

function withVoiceUrlMany(reviews) {
  return (reviews || []).map(withVoiceUrl);
}

// ── AI status endpoint — tells the frontend which AI provider is active
router.get("/ai/status", (req, res) => {
  res.json({
    success: true,
    groq_configured: isGroqConfigured(),
    provider: isGroqConfigured() ? "groq" : "python-vader-fallback",
    rating_scale: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    lengths_supported: ["short", "medium", "long"],
  });
});

// ── Public: list visible reviews for a product ──────────────────────────────
router.get("/product/:product_id", async (req, res) => {
  try {
    const reviews = await Review.find({
      product_id: req.params.product_id,
      visible: true,
    })
      .sort({ created_at: -1 })
      .lean();
    const avg =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
        : 0;
    return res.json({
      success: true,
      count: reviews.length,
      average_rating: Math.round(avg * 10) / 10,
      reviews: withVoiceUrlMany(reviews),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Public: aggregate seller rating ─────────────────────────────────────────
router.get("/seller/:seller_id", async (req, res) => {
  try {
    const reviews = await Review.find({
      seller_id: req.params.seller_id,
      visible: true,
    }).lean();
    const avg =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
        : 0;
    // Distribution histogram (5, 4.5, 4, ... 0.5)
    const distribution = {};
    for (let star = 5; star >= 0.5; star -= 0.5) distribution[star] = 0;
    for (const r of reviews) {
      const key = Math.round(r.rating * 2) / 2;
      if (distribution[key] !== undefined) distribution[key]++;
    }
    return res.json({
      success: true,
      seller_id: req.params.seller_id,
      count: reviews.length,
      average_rating: Math.round(avg * 10) / 10,
      distribution,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Seller: list ALL reviews for the seller's products ──────────────────────
//   Returns both visible=true and visible=false so the seller can see
//   moderated comments. Admin can also see the same set via /admin/all.
router.get("/seller/:seller_id/all", async (req, res) => {
  try {
    const sellerId = req.params.seller_id;
    if (!sellerId) {
      return res.status(400).json({ success: false, error: "seller_id is required" });
    }
    const reviews = await Review.find({ seller_id: sellerId })
      .sort({ created_at: -1 })
      .lean();
    const avg =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
        : 0;
    return res.json({
      success: true,
      count: reviews.length,
      average_rating: Math.round(avg * 10) / 10,
      reviews: withVoiceUrlMany(reviews),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: list ALL reviews across the platform ─────────────────────────────
router.get("/admin/all", async (req, res) => {
  try {
    const { q, min_rating, max_rating } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { comment:   { $regex: q, $options: "i" } },
        { title:     { $regex: q, $options: "i" } },
        { buyer_name:{ $regex: q, $options: "i" } },
        { product_id:{ $regex: q, $options: "i" } },
      ];
    }
    if (min_rating) filter.rating = { ...filter.rating, $gte: Number(min_rating) };
    if (max_rating) filter.rating = { ...filter.rating, $lte: Number(max_rating) };

    const reviews = await Review.find(filter)
      .sort({ created_at: -1 })
      .limit(500)
      .lean();
    const avg =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
        : 0;
    return res.json({
      success: true,
      count: reviews.length,
      average_rating: Math.round(avg * 10) / 10,
      reviews: withVoiceUrlMany(reviews),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── AI: suggest a star rating from review text ──────────────────────────────
//   body: { text, product_title?, product_description? }
//   returns: { success, suggested_rating, sentiment, is_relevant, reason }
router.post("/ai/suggest-rating", async (req, res) => {
  try {
    const { text, product_title, product_description } = req.body || {};
    if (!text || typeof text !== "string" || text.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: "text is required (at least 1-2 words)",
      });
    }
    const result = await suggestRating({
      text: text.trim(),
      product_title: product_title || "",
      product_description: product_description || "",
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── AI: generate 3 review drafts ────────────────────────────────────────────
//   body: { product_title, product_description?, rating, length }
//   length: "short" | "medium" | "long"
//   returns: { success, reviews: [{text, length} x3] }
router.post("/ai/generate-reviews", async (req, res) => {
  try {
    const { product_title, product_description, rating, length } = req.body || {};
    if (!product_title || !product_title.trim()) {
      return res.status(400).json({ success: false, error: "product_title is required" });
    }
    if (!isValidHalfStepRating(rating)) {
      return res.status(400).json({
        success: false,
        error: "rating must be 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, or 5",
      });
    }
    if (!["short", "medium", "long"].includes(length)) {
      return res.status(400).json({
        success: false,
        error: "length must be 'short', 'medium', or 'long'",
      });
    }
    const result = await generateReviews({
      product_title: product_title.trim(),
      product_description: (product_description || "").trim(),
      rating: Number(rating),
      length,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Preview / convert review text → voice (4 agents, same as tone-voice) ─────
// Body: { text, rating, agent, buyer_id?, product_id?, order_id?, persist? }
// Returns audio as base64 data URL for immediate playback; optionally uploads to Cloudinary.
router.post("/preview-voice", async (req, res) => {
  try {
    if (!isReviewTtsEnabled()) {
      return res.status(503).json({
        success: false,
        error: "Review TTS is disabled. Set REVIEW_TTS_ENABLED=true and run tone-voice on port 8000.",
      });
    }
    const { text, rating, agent, buyer_id, product_id, order_id, persist } = req.body || {};
    const trimmed = String(text || "").trim();
    if (!trimmed || trimmed.length < 2) {
      return res.status(400).json({ success: false, error: "Review text is required (min 2 characters)" });
    }
    const voiceAgent = normalizeAgent(agent);
    const synth = await synthesizeReviewVoice({
      text: trimmed,
      rating: rating != null ? Number(rating) : 3,
      agent: voiceAgent,
      buyerId: buyer_id || "preview",
      productId: product_id || "preview",
      orderId: order_id || "",
    });
    if (!synth?.buffer) {
      return res.status(502).json({ success: false, error: "Tone-voice returned empty audio" });
    }

    let voice_url = null;
    if (persist) {
      voice_url = await saveReviewVoiceAsync(
        buyer_id || "preview",
        product_id || `preview_${Date.now()}`,
        synth.buffer,
        "wav",
        voiceAgent
      );
    }

    const b64 = synth.buffer.toString("base64");
    return res.json({
      success: true,
      agent: voiceAgent,
      voice_gender: synth.meta.voice_gender,
      voice_language: synth.meta.voice_language,
      spoken_text: synth.spoken_text || trimmed,
      audio_data_url: `data:audio/wav;base64,${b64}`,
      voice_url,
      agents: AGENTS,
    });
  } catch (err) {
    console.warn("[reviews/preview-voice]", err.message);
    return res.status(502).json({
      success: false,
      error: err.message || "Tone-voice synthesize failed. Is tone-voice running on :8000?",
    });
  }
});

module.exports = router;
