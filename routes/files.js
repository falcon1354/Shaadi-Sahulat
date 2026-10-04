/**
 * Private file delivery (Phase 2I).
 *
 *   GET /api/files/private?ref=&exp=&sig=   signed, short-lived link (lib/privateFiles.js)
 *
 * Links are only ever issued inside responses that were already authorized for the
 * viewer (BNPL owner / admin / bank officer, dispute participants). Unsigned, forged,
 * tampered or expired links get 404 / 410 — guessing a filename reveals nothing.
 */
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { privateFileHandler } = require("../lib/privateFiles");

const router = express.Router();

const fileLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "RATE_LIMITED", error: "Too many requests. Please slow down." },
});

router.get("/private", fileLimiter, privateFileHandler);

module.exports = router;
