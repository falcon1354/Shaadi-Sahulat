/**
 * Hybrid Engine for ShaadiSahulat Dowry Estimation
 * ==================================================
 * Combines Rule-Based baseline with ML personalization.
 *
 * Flow: User Inputs → Rule Engine → ML Adjustment → Hybrid Merge → Final Output
 *
 * Can be imported independently by other modules.
 */

const { ruleEngine, ensureMinimums } = require("./ruleEngine");
const mlClient = require("./mlClient");

/**
 * Run the full hybrid estimation pipeline.
 *
 * @param {Object} inputs - User inputs from the wizard
 * @param {boolean} useML - Whether to apply ML adjustment (default: true)
 * @returns {Promise<Object>} Final estimation result
 */
async function hybridEstimate(inputs, useML = true) {
  // Step 1: Run Rule-Based Engine
  const ruleResult = ruleEngine(inputs);

  let mlResult = {
    adjustment_factor: 0,
    cluster_id: -1,
    similar_users_count: 0,
    cluster_mean_deviation: 0,
  };

  // Step 2: Get ML Adjustment Factor
  if (useML) {
    const youngestAge =
      inputs.age_of_each_unmarried_child &&
      inputs.age_of_each_unmarried_child.length > 0
        ? Math.min(...inputs.age_of_each_unmarried_child)
        : 22;

    mlResult = await mlClient.getAdjustmentFactor({
      income: inputs.monthly_household_income,
      savings: inputs.total_savings_available,
      unmarried_children: inputs.unmarried_children_count || 0,
      youngest_age: youngestAge,
    });
  }

  // Step 3: Hybrid Merge
  const finalResult = hybridMerge(
    ruleResult.baseline_budget,
    mlResult.adjustment_factor,
    ruleResult.category_breakdown,
    ruleResult.responsibility_score,
    inputs,
    ruleResult.notes
  );

  // Attach ML metadata
  finalResult.ml_metadata = {
    adjustment_factor: mlResult.adjustment_factor,
    cluster_id: mlResult.cluster_id,
    similar_users_count: mlResult.similar_users_count,
    cluster_mean_deviation: mlResult.cluster_mean_deviation,
  };

  // Attach rule engine metadata
  finalResult.rule_metadata = {
    max_from_income: ruleResult.max_from_income,
    max_from_savings: ruleResult.max_from_savings,
    base_pool: ruleResult.base_pool,
  };

  return finalResult;
}

/**
 * Merge rule-based budget with ML adjustment factor.
 *
 * @param {number} baselineBudget - From rule engine
 * @param {number} adjustmentFactor - From ML model (-0.20 to +0.20)
 * @param {Object} categoryBreakdown - From rule engine
 * @param {number} responsibilityScore - From rule engine
 * @param {Object} userInputs - Original user inputs
 * @param {Array} notes - Notes from rule engine
 * @returns {Object} Final merged result
 */
function hybridMerge(
  baselineBudget,
  adjustmentFactor,
  categoryBreakdown,
  responsibilityScore,
  userInputs,
  notes = []
) {
  // Apply ML adjustment
  let finalBudget = Math.floor(baselineBudget * (1 + adjustmentFactor));

  // Re-apply validators
  const liquidAssets =
    userInputs.monthly_household_income * 6 +
    userInputs.total_savings_available;
  finalBudget = Math.max(finalBudget, 50000);
  finalBudget = Math.min(finalBudget, liquidAssets);

  // Adjust category breakdown proportionally
  const ratio = baselineBudget > 0 ? finalBudget / baselineBudget : 1;
  const adjustedBreakdown = {};
  for (const cat of Object.keys(categoryBreakdown)) {
    adjustedBreakdown[cat] = Math.floor(categoryBreakdown[cat] * ratio);
  }

  // Ensure minimums again
  const finalBreakdown = ensureMinimums(adjustedBreakdown);

  // Add ML notes
  if (adjustmentFactor !== 0) {
    const direction = adjustmentFactor > 0 ? "increased" : "decreased";
    notes.push(
      `Budget ${direction} by ${Math.abs(adjustmentFactor * 100).toFixed(1)}% based on ML analysis of ${Math.abs(adjustmentFactor) > 0 ? "similar" : ""} user spending patterns.`
    );
  }

  // Calculate budget sources
  const incomePortion = Math.min(
    userInputs.monthly_household_income * 12 * 0.4,
    finalBudget
  );
  const savingsPortion = finalBudget - incomePortion;

  return {
    total_recommended_budget: finalBudget,
    category_breakdown: finalBreakdown,
    baseline_budget: baselineBudget,
    ml_adjustment_factor: adjustmentFactor,
    responsibility_score: responsibilityScore,
    budget_sources: {
      from_income: Math.floor(incomePortion),
      from_savings: Math.floor(savingsPortion),
      from_contribution: userInputs.expected_contribution || 0,
      income_percentage: parseFloat(((incomePortion / finalBudget) * 100).toFixed(1)),
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
