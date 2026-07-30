/**
 * AI Review API client — wraps the /api/reviews/ai/* endpoints.
 *
 * Used by ReviewForm.jsx to:
 *   1. Suggest a star rating based on what the buyer has typed so far
 *      (debounced — only fires after the buyer stops typing for ~800ms).
 *   2. Generate 3 review drafts (Short / Medium / Long) based on
 *      product title + description + the buyer's selected rating.
 */
const BASE = 'http://localhost:5000/api/reviews/ai';

export async function suggestRating({ text, product_title, product_description }) {
  const res = await fetch(`${BASE}/suggest-rating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, product_title, product_description }),
  });
  return res.json();
}

export async function generateReviews({ product_title, product_description, rating, length }) {
  const res = await fetch(`${BASE}/generate-reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_title, product_description, rating, length }),
  });
  return res.json();
}

export async function getAiStatus() {
  try {
    const res = await fetch(`${BASE.replace('/ai', '')}/ai/status`);
    return res.json();
  } catch {
    return { success: false, groq_configured: false, provider: 'unknown' };
  }
}

export default { suggestRating, generateReviews, getAiStatus };
