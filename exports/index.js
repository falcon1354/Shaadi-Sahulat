/**
 * Export Module for ShaadiSahulat
 * =================================
 * This module exports all core logic so other modules
 * (BNPL, Spending Analytics, etc.) can import and use them.
 *
 * Usage in other modules:
 *   const { ruleEngine, hybridEstimate, visualClient } = require('./exports');
 */

// ── Dowry Estimation Module ─────────────────────────────────────────────
const {
  ruleEngine,
  ensureMinimums,
  BASE_ALLOCATION,
  PRIORITY_MULTIPLIERS,
  MIN_BUDGET,
  MAX_INCOME_RATIO,
  MAX_SAVINGS_RATIO,
} = require("../services/ruleEngine");

const { hybridEstimate, hybridMerge } = require("../services/hybridEngine");
const mlClient = require("../services/mlClient");
const DowryEstimation = require("../models/DowryEstimation");
const UserProfile = require("../models/UserProfile");

// ── Visual Recommendation Module ────────────────────────────────────────
const visualClient = require("../services/visualClient");
const Product = require("../models/Product");
const VisualRecommendation = require("../models/VisualRecommendation");

module.exports = {
  // Dowry Estimation
  ruleEngine,
  ensureMinimums,
  BASE_ALLOCATION,
  PRIORITY_MULTIPLIERS,
  MIN_BUDGET,
  MAX_INCOME_RATIO,
  MAX_SAVINGS_RATIO,
  hybridEstimate,
  hybridMerge,
  mlClient,

  // Dowry Models
  DowryEstimation,
  UserProfile,

  // Visual Recommendation
  visualClient,

  // Visual Models
  Product,
  VisualRecommendation,
};
