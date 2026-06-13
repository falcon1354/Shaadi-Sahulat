/**
 * Export Module for ShaadiSahulat Dowry Estimation
 * ==================================================
 * This module exports all core logic so other modules
 * (BNPL, Spending Analytics, etc.) can import and use them.
 *
 * Usage in other modules:
 *   const { ruleEngine, hybridEstimate, BASE_ALLOCATION } = require('./exports');
 */

// Re-export all rule engine components
const {
  ruleEngine,
  ensureMinimums,
  BASE_ALLOCATION,
  PRIORITY_MULTIPLIERS,
  MIN_BUDGET,
  MAX_INCOME_RATIO,
  MAX_SAVINGS_RATIO,
} = require("../services/ruleEngine");

// Re-export hybrid engine
const { hybridEstimate, hybridMerge } = require("../services/hybridEngine");

// Re-export ML client
const mlClient = require("../services/mlClient");

// Re-export models
const DowryEstimation = require("../models/DowryEstimation");
const UserProfile = require("../models/UserProfile");

module.exports = {
  // Rule Engine
  ruleEngine,
  ensureMinimums,
  BASE_ALLOCATION,
  PRIORITY_MULTIPLIERS,
  MIN_BUDGET,
  MAX_INCOME_RATIO,
  MAX_SAVINGS_RATIO,

  // Hybrid Engine
  hybridEstimate,
  hybridMerge,

  // ML Client
  mlClient,

  // Models
  DowryEstimation,
  UserProfile,
};
