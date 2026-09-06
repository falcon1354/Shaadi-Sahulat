/**
 * AI Review client — calls Groq (LLM) for review rating suggestion and
 * review generation. Falls back to the Python visual-ml-service's
 * rule-based VADER endpoint if GROQ_API_KEY is not configured.
 *
 * v3.2.0 (Groq integration):
 *   - When GROQ_API_KEY is set in backend/.env, all AI calls go directly
 *     to Groq's OpenAI-compatible /chat/completions endpoint. The
 *     Python VADER service is bypassed entirely.
 *   - When GROQ_API_KEY is NOT set, the client falls back to the
 *     Python visual-ml-service's /review-ai/* endpoints (which use
 *     VADER sentiment + template-based generation). This keeps the
 *     feature working even if the user hasn't signed up for Groq yet.
 *   - Final fallback (if BOTH Groq and Python are unavailable):
 *     suggest-rating returns neutral 3.0; generate-reviews returns 3
 *     hardcoded templates. The UI keeps working.
 *
 * Groq API docs: https://console.groq.com/docs
 *
 * Endpoints consumed:
 *   Groq:
 *     POST https://api.groq.com/openai/v1/chat/completions
 *       Authorization: Bearer <GROQ_API_KEY>
 *       body: { model, messages, temperature, max_tokens }
 *
 *   Python (fallback):
 *     POST {ML_URL}/review-ai/suggest-rating
 *     POST {ML_URL}/review-ai/generate-reviews
 */
const axios = require("axios");

const ML_URL = process.env.VISUAL_ML_URL || "http://localhost:5002";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT = 20000; // 20s — Groq can be slow on first call

// ── System prompts ─────────────────────────────────────────────────────────

const SUGGEST_RATING_SYSTEM = `You are an e-commerce review rating assistant for a Pakistani bridal-wear marketplace (ShaadiSahulat).

Your job: read a buyer's review text and suggest a star rating on the 0.5-step scale: 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, or 5.

Rules:
1. If the review is irrelevant, off-topic, gibberish, or contains random characters that have nothing to do with the product, ALWAYS return rating = 2 and is_relevant = false.
2. If the review is relevant, use sentiment to pick the closest 0.5-step rating:
   - 5.0   = extremely positive ("excellent", "amazing", "outstanding", "perfect")
   - 4.0-4.5 = positive ("good", "nice", "satisfied", "recommend")
   - 3.0-3.5 = neutral-positive ("okay", "fine", "decent", "average")
   - 2.0-2.5 = neutral / mixed ("nothing special", "expected better")
   - 1.0-1.5 = negative ("disappointed", "poor quality", "not worth")
   - 0.5   = very negative ("worst", "hate", "waste of money")
3. Detect Roman Urdu / Pakistani English phrasing (e.g. "bohat acha", "kharab", "mazaa nahi aya") and treat it correctly.
4. Consider negators: "not good" should be negative, "not bad" should be neutral-positive.

You MUST respond with ONLY valid JSON, no markdown fences, no extra commentary. Schema:
{
  "suggested_rating": <number, 0.5 step>,
  "sentiment": "positive" | "neutral" | "negative",
  "is_relevant": <bool>,
  "reason": "<short human-readable explanation>"
}`;

const GENERATE_REVIEWS_SYSTEM = `You are an e-commerce review generator for a Pakistani bridal-wear marketplace (ShaadiSahulat).

Your only job: write review drafts. Do not include greetings like "Here are your reviews:". Do not use hashtags. Output ONLY the reviews themselves, separated by the exact text "---" (three dashes).

Each review must:
- Sound like a real Pakistani buyer (mix of English and occasional Roman Urdu is fine — e.g. "bohat pyara", "good quality").
- Match the chosen star rating's tone (5★ enthusiastic, 3★ neutral, 1★ subdued).
- Reference the product title or its key features naturally.
- Stay within the requested length range.
- Be a different angle from the other two drafts (don't just paraphrase).

Length targets:
- "short"  : 15-30 words, 1 sentence
- "medium" : 35-50 words, 2 sentences
- "long"   : 50-60 words, 3 sentences (HARD CAP — never exceed 60 words)

Output format (exactly three drafts separated by "---"):
<draft 1>
---
<draft 2>
---
<draft 3>

Do NOT number the drafts. Do NOT add "Review 1:" prefixes. Just the text of each draft, separated by "---".`;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Quick JSON extraction — Groq sometimes wraps JSON in ```json fences
 * or appends trailing commentary. This pulls the first {...} block.
 */
function extractJson(text) {
  if (!text) return null;
  // Strip markdown code fences
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Find the first {...} block
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/**
 * Parse the 3-draft output from Groq into an array of {text, length}.
 * The model is instructed to separate drafts with "---" but we also
 * tolerate blank-line separation as a fallback.
 */
function parseDrafts(text, length) {
  if (!text) return [];
  let parts = text.split(/\n*---\n*/).map(s => s.trim()).filter(Boolean);
  // Fallback: if the model didn't use ---, split on double newlines
  if (parts.length < 3) {
    const alt = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (alt.length >= 3) parts = alt;
  }
  // Take the first 3 (model may add a closing remark)
  return parts.slice(0, 3).map((t, i) => ({
    text: t.replace(/^Review\s*\d+\s*[:.)]\s*/i, "").trim(),
    length,
    variant: i,
  }));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Suggest a star rating (0.5-5 in 0.5 steps) for the given review text.
 * If the text is irrelevant/gibberish, returns 2.0 per spec.
 */
async function suggestRating({ text, product_title = "", product_description = "" }) {
  // ── Groq path ───────────────────────────────────────────────────────
  if (GROQ_API_KEY) {
    try {
      const userPrompt = `Product title: ${product_title || "(not provided)"}
Product description: ${product_description || "(not provided)"}

Review text:
"""
${text}
"""

Return ONLY the JSON object described in the system prompt.`;

      const { data } = await axios.post(
        GROQ_URL,
        {
          model: GROQ_MODEL,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            { role: "system", content: SUGGEST_RATING_SYSTEM },
            { role: "user",   content: userPrompt },
          ],
        },
        {
          timeout: TIMEOUT,
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const raw = data?.choices?.[0]?.message?.content || "";
      const parsed = extractJson(raw);
      if (parsed && typeof parsed.suggested_rating === "number") {
        // Clamp to 0.5-step between 0.5 and 5
        let r = parsed.suggested_rating;
        r = Math.max(0.5, Math.min(5, Math.round(r * 2) / 2));
        return {
          success: true,
          provider: "groq",
          suggested_rating: r,
          sentiment: parsed.sentiment || "neutral",
          sentiment_score: 0,
          is_relevant: parsed.is_relevant !== false,
          reason: parsed.reason || "Groq analysis complete.",
        };
      }
      console.warn("[aiReviewClient] Groq returned unparseable JSON:", raw.slice(0, 200));
    } catch (err) {
      console.error("[aiReviewClient] Groq suggest-rating failed:", err.response?.data || err.message);
      // fall through to Python fallback
    }
  }

  // ── Python fallback (VADER) ─────────────────────────────────────────
  try {
    const { data } = await axios.post(
      `${ML_URL}/review-ai/suggest-rating`,
      { text, product_title, product_description },
      { timeout: 8000 }
    );
    return { ...data, provider: data.provider || "python-vader" };
  } catch (err) {
    console.error("[aiReviewClient] Python suggest-rating failed:", err.message);
  }

  // ── Final fallback (neutral 3.0) ────────────────────────────────────
  return {
    success: false,
    fallback: true,
    provider: "fallback",
    suggested_rating: 3.0,
    sentiment: "neutral",
    sentiment_score: 0,
    is_relevant: true,
    reason: "AI service unavailable — returning neutral 3.0 fallback.",
  };
}

/**
 * Generate three review drafts for the buyer to choose from.
 * @param {object} args
 * @param {string} args.product_title
 * @param {string} args.product_description
 * @param {number} args.rating   0.5–5
 * @param {string} args.length   "short" | "medium" | "long"
 */
async function generateReviews({ product_title, product_description, rating, length }) {
  // ── Groq path ───────────────────────────────────────────────────────
  if (GROQ_API_KEY) {
    try {
      const lengthHint = {
        short:  "15-30 words (1 sentence)",
        medium: "35-50 words (2 sentences)",
        long:   "50-60 words (3 sentences, NEVER exceed 60 words)",
      }[length] || "35-50 words";

      const userPrompt = `Generate exactly 3 different review drafts separated by "---".

Product title: ${product_title}
Product description: ${product_description || "(no description provided)"}
Star rating: ${rating} / 5
Length: ${length} — ${lengthHint}

Output ONLY the three drafts, separated by "---". No numbering, no prefixes, no commentary.`;

      const { data } = await axios.post(
        GROQ_URL,
        {
          model: GROQ_MODEL,
          temperature: 0.8,
          max_tokens: 700,
          messages: [
            { role: "system", content: GENERATE_REVIEWS_SYSTEM },
            { role: "user",   content: userPrompt },
          ],
        },
        {
          timeout: TIMEOUT,
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const raw = data?.choices?.[0]?.message?.content || "";
      const drafts = parseDrafts(raw, length);
      if (drafts.length >= 1) {
        return {
          success: true,
          provider: "groq",
          rating: Number(rating),
          length,
          reviews: drafts,
        };
      }
      console.warn("[aiReviewClient] Groq returned no parseable drafts:", raw.slice(0, 200));
    } catch (err) {
      console.error("[aiReviewClient] Groq generate-reviews failed:", err.response?.data || err.message);
      // fall through to Python fallback
    }
  }

  // ── Python fallback (templates) ─────────────────────────────────────
  try {
    const { data } = await axios.post(
      `${ML_URL}/review-ai/generate-reviews`,
      { product_title, product_description, rating, length },
      { timeout: 8000 }
    );
    return { ...data, provider: data.provider || "python-templates" };
  } catch (err) {
    console.error("[aiReviewClient] Python generate-reviews failed:", err.message);
  }

  // ── Final fallback (hardcoded templates) ────────────────────────────
  const safeTitle = product_title || "this product";
  return {
    success: false,
    fallback: true,
    provider: "fallback",
    rating: Number(rating),
    length,
    reviews: [
      { text: `Great quality ${safeTitle.toLowerCase()}. Highly recommended.`, length: length || "short", variant: 0 },
      { text: `I am satisfied with my purchase of ${safeTitle.toLowerCase()}. The quality matches the description and delivery was on time.`, length: length || "medium", variant: 1 },
      { text: `My experience with ${safeTitle.toLowerCase()} has been very positive. The product arrived well-packaged, the quality is good for the price, and it matches the seller's description. I would definitely recommend it to anyone looking for a similar item.`, length: length || "long", variant: 2 },
    ],
  };
}

module.exports = {
  suggestRating,
  generateReviews,
  // Exposed for diagnostics
  isGroqConfigured: () => !!GROQ_API_KEY,
  getGroqModel: () => GROQ_MODEL,
};
