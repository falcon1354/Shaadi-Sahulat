/**
 * Rate limits for expensive endpoints (Phase 2I): ML inference, paid image
 * generation (try-on), LLM calls (Groq review AI), text-to-speech and OCR.
 *
 * Keyed per signed-in account when the request is authenticated (so a shared
 * NAT/campus IP does not lock everyone out), otherwise per client IP.
 * Mount AFTER the auth middleware and BEFORE multer, so over-limit uploads are
 * rejected before the body is buffered.
 */

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const RATE_LIMITED = { success: false, code: "RATE_LIMITED", error: "Too many requests. Please try again in a few minutes." };

function accountOrIpKey(req) {
  return req.user?.role && req.user?.id ? `user:${req.user.role}:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || "")}`;
}

/** One named limiter. Separate names keep separate counters. */
function expensiveLimiter(name, { windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => `${name}|${accountOrIpKey(req)}`,
    message: RATE_LIMITED,
  });
}

const MIN = 60 * 1000;

// Budgets allow normal interactive use but stop scripted abuse / cost blow-ups.
const limits = {
  visualRecommend: expensiveLimiter("visual-recommend", { windowMs: 5 * MIN, limit: 20 }),
  tryOn:           expensiveLimiter("tryon",            { windowMs: 60 * MIN, limit: 10 }),
  tryOnFit:        expensiveLimiter("tryon-fit",        { windowMs: 5 * MIN, limit: 30 }),
  aiSuggestRating: expensiveLimiter("ai-suggest",       { windowMs: 10 * MIN, limit: 30 }),
  aiGenerate:      expensiveLimiter("ai-generate",      { windowMs: 10 * MIN, limit: 15 }),
  reviewVoice:     expensiveLimiter("review-voice",     { windowMs: 10 * MIN, limit: 10 }),
  dowryEstimate:   expensiveLimiter("dowry-estimate",   { windowMs: 10 * MIN, limit: 30 }),
  ocr:             expensiveLimiter("bnpl-ocr",         { windowMs: 10 * MIN, limit: 10 }),
  bnplSubmit:      expensiveLimiter("bnpl-submit",      { windowMs: 10 * MIN, limit: 10 }),
};

module.exports = { expensiveLimiter, accountOrIpKey, limits, RATE_LIMITED };
