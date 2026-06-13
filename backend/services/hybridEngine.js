/**
 * Hybrid Engine for ShaadiSahulat Dowry Estimation
 * ==================================================
 * Two-layer hybrid:
 *   Layer 1 — Per-category DB grounding (§2.3):
 *             final_cat = 0.6 × rule_cat + 0.4 × db_avg_top5_cheapest
 *   Layer 2 — K-Means ML total adjustment (existing):
 *             finalBudget = baselineBudget × (1 + ml_adjustment_factor)
 *
 * Falls back gracefully if Flask is unavailable.
 */

const axios            = require("axios");
const { ruleEngine, ensureMinimums } = require("./ruleEngine");
const mlClient         = require("./mlClient");

const VISUAL_ML_URL = process.env.VISUAL_ML_URL || "http://localhost:5002";

/**
 * Fetch avg price of top-5 cheapest products per category from Flask.
 * Returns {} on any failure so the engine falls back to rule-only.
 */
async function fetchCategoryPrices() {
  try {
    const response = await axios.get(`${VISUAL_ML_URL}/dowry/category-prices`, {
      timeout: 5000,
    });
    if (response.data && response.data.success) {
      return response.data.data || {};
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Run the full hybrid estimation pipeline.
 *
 * @param {Object}  inputs  — Full wizard inputs
 * @param {boolean} useML   — Whether to apply K-Means ML adjustment
 * @returns {Promise<Object>}
 */
async function hybridEstimate(inputs, useML = true) {
  // Step 1 — Rule engine baseline
  const ruleResult = ruleEngine(inputs);

  // Step 2 — Fetch DB avg prices per category (§2.3)
  const categoryPrices = await fetchCategoryPrices();

  // Step 3 — Per-category DB grounding
  const groundedBreakdown = {};
  const estimateSources   = {};
  for (const [cat, ruleAmt] of Object.entries(ruleResult.category_breakdown)) {
    const dbInfo = categoryPrices[cat];
    if (dbInfo && dbInfo.avg_top5_cheapest && dbInfo.count >= 1) {
      groundedBreakdown[cat] = Math.floor(
        0.6 * ruleAmt + 0.4 * dbInfo.avg_top5_cheapest
      );
      estimateSources[cat] = dbInfo.count >= 5 ? "hybrid" : "partial_hybrid";
    } else {
      groundedBreakdown[cat] = ruleAmt;
      estimateSources[cat]   = "rule_only";
    }
  }

  // Re-normalize so total stays equal to rule baseline
  // (DB grounding may shift the sum slightly)
  const groundedTotal = Object.values(groundedBreakdown).reduce((a, b) => a + b, 0);
  const targetTotal   = ruleResult.baseline_budget;
  if (groundedTotal > 0 && targetTotal > 0) {
    const scale = targetTotal / groundedTotal;
    for (const cat of Object.keys(groundedBreakdown)) {
      groundedBreakdown[cat] = Math.floor(groundedBreakdown[cat] * scale);
    }
  }

  // Step 4 — K-Means ML total adjustment
  let mlResult = {
    adjustment_factor:     0,
    cluster_id:            -1,
    similar_users_count:   0,
    cluster_mean_deviation: 0,
  };
  if (useML) {
    const youngestAge =
      inputs.age_of_each_unmarried_child &&
      inputs.age_of_each_unmarried_child.length > 0
        ? Math.min(...inputs.age_of_each_unmarried_child)
        : 22;
    mlResult = await mlClient.getAdjustmentFactor({
      income:              inputs.monthly_household_income,
      savings:             inputs.total_savings_available,
      unmarried_children:  inputs.unmarried_children_count || 0,
      youngest_age:        youngestAge,
    });
  }

  // Step 5 — Merge everything
  const finalResult = hybridMerge(
    ruleResult.baseline_budget,
    mlResult.adjustment_factor,
    groundedBreakdown,
    ruleResult.responsibility_score,
    inputs,
    ruleResult.notes,
    estimateSources
  );

  finalResult.ml_metadata = {
    adjustment_factor:      mlResult.adjustment_factor,
    cluster_id:             mlResult.cluster_id,
    similar_users_count:    mlResult.similar_users_count,
    cluster_mean_deviation: mlResult.cluster_mean_deviation,
  };

  finalResult.rule_metadata = {
    max_from_income:  ruleResult.max_from_income,
    max_from_savings: ruleResult.max_from_savings,
    base_pool:        ruleResult.base_pool,
  };

  finalResult.estimate_sources = estimateSources;

  return finalResult;
}

function hybridMerge(
  baselineBudget,
  adjustmentFactor,
  categoryBreakdown,
  responsibilityScore,
  userInputs,
  notes = [],
  estimateSources = {}
) {
  let finalBudget = Math.floor(baselineBudget * (1 + adjustmentFactor));

  const liquidAssets =
    userInputs.monthly_household_income * 6 + userInputs.total_savings_available;
  finalBudget = Math.max(finalBudget, 50000);
  finalBudget = Math.min(finalBudget, liquidAssets);

  const ratio = baselineBudget > 0 ? finalBudget / baselineBudget : 1;
  const adjusted = {};
  for (const cat of Object.keys(categoryBreakdown)) {
    adjusted[cat] = Math.floor(categoryBreakdown[cat] * ratio);
  }

  const priorities = userInputs.priorities || {};
  const finalBreakdown = ensureMinimums(adjusted, priorities);

  if (adjustmentFactor !== 0) {
    const dir = adjustmentFactor > 0 ? "increased" : "decreased";
    notes.push(
      `Budget ${dir} by ${Math.abs(adjustmentFactor * 100).toFixed(1)}% based on ML analysis of similar users.`
    );
  }

  const hybridCount = Object.values(estimateSources).filter(
    (s) => s === "hybrid" || s === "partial_hybrid"
  ).length;
  if (hybridCount > 0) {
    notes.push(
      `${hybridCount} categories grounded against real seller prices (60% rule + 40% DB average).`
    );
  }

  const incomePortion  = Math.min(userInputs.monthly_household_income * 12 * 0.4, finalBudget);
  const savingsPortion = finalBudget - incomePortion;

  return {
    total_recommended_budget: finalBudget,
    category_breakdown:       finalBreakdown,
    baseline_budget:          baselineBudget,
    ml_adjustment_factor:     adjustmentFactor,
    responsibility_score:     responsibilityScore,
    budget_sources: {
      from_income:        Math.floor(incomePortion),
      from_savings:       Math.floor(savingsPortion),
      from_contribution:  userInputs.expected_contribution || 0,
      income_percentage:  parseFloat(((incomePortion / finalBudget) * 100).toFixed(1)),
      savings_percentage: parseFloat(((savingsPortion / finalBudget) * 100).toFixed(1)),
    },
    notes,
    source: "Hybrid Engine",
  };
}

module.exports = {
  hybridEstimate,
  hybridMerge,
};
