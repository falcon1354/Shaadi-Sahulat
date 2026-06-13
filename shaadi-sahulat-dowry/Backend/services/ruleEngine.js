/**
 * Rule-Based Engine for ShaadiSahulat Dowry Estimation
 * ======================================================
 * Pure function module — no DB, no network calls.
 * Can be imported independently by other modules.
 *
 * 8 Categories:
 *   1. bridal_dress   — 15%
 *   2. groom_dress    — 10%
 *   3. furniture      — 20%  (bedroom_furniture + bedding_linens)
 *   4. electronics    — 15%  (large_electronics + small_appliances)
 *   5. jewelry        — 20%
 *   6. kitchen_items  — 12%  (kitchen_appliances + crockery_sets)
 *   7. decoration     — 5%   (decoration + suitcase_sets)
 *   8. miscellaneous  — 3%
 */

// ── Constants ──────────────────────────────────────────────────────────────
const BASE_ALLOCATION = {
  bridal_dress: 0.15,
  groom_dress: 0.10,
  furniture: 0.20,
  electronics: 0.15,
  jewelry: 0.20,
  kitchen_items: 0.12,
  decoration: 0.05,
  miscellaneous: 0.03,
};

const PRIORITY_MULTIPLIERS = {
  High: 1.2,
  Medium: 1.0,
  Low: 0.8,
};

const MIN_BUDGET = 50000;
const MAX_INCOME_RATIO = 0.4; // 40% of annual income
const MAX_SAVINGS_RATIO = 0.8; // 80% of savings
const MIN_CATEGORY_AMOUNT = 5000;

// ── Rule Engine (pure function) ────────────────────────────────────────────

/**
 * Run the rule-based estimation engine.
 *
 * @param {Object} inputs - User inputs from the wizard
 * @returns {Object} Estimation result with breakdown and notes
 */
function ruleEngine(inputs) {
  const {
    monthly_household_income,
    total_savings_available,
    expected_contribution = 0,
    total_family_members = 4,
    married_children_count = 0,
    unmarried_children_count,
    age_of_each_unmarried_child = [],
    priorities = {},
  } = inputs;

  const notes = [];

  // ── Rule 1: Income Cap ────────────────────────────────────────────────
  const maxFromIncome = monthly_household_income * 12 * MAX_INCOME_RATIO;
  notes.push(
    `Maximum budget from income (40% of annual): PKR ${maxFromIncome.toLocaleString()}`
  );

  // ── Rule 2: Savings Cap ───────────────────────────────────────────────
  const maxFromSavings = total_savings_available * MAX_SAVINGS_RATIO;
  notes.push(
    `Maximum budget from savings (80%): PKR ${maxFromSavings.toLocaleString()}`
  );

  // ── Rule 3: Base Budget Pool ──────────────────────────────────────────
  const basePool =
    Math.min(maxFromIncome, maxFromSavings) + expected_contribution;
  notes.push(
    `Base pool (min of income/savings caps + contribution): PKR ${basePool.toLocaleString()}`
  );

  if (expected_contribution > 0) {
    notes.push(
      `Additional contribution from relatives/parents: PKR ${expected_contribution.toLocaleString()}`
    );
  }

  // ── Rule 4: Responsibility Score ──────────────────────────────────────
  let score = 1.0;
  const youngestAge =
    age_of_each_unmarried_child.length > 0
      ? Math.min(...age_of_each_unmarried_child)
      : null;

  if (unmarried_children_count > 1) {
    const reduction = 0.15 * (unmarried_children_count - 1);
    score -= reduction;
    notes.push(
      `Budget reduced by ${Math.round(reduction * 100)}% due to ${unmarried_children_count} unmarried children (future financial obligations).`
    );
  }

  if (youngestAge !== null) {
    if (youngestAge < 18) {
      score -= 0.1;
      notes.push(
        `Budget reduced by 10% — youngest unmarried child is ${youngestAge} (under 18, long-term obligation).`
      );
    } else if (youngestAge >= 18 && youngestAge <= 22) {
      score -= 0.05;
      notes.push(
        `Budget reduced by 5% — youngest unmarried child is ${youngestAge} (near marriage age).`
      );
    } else {
      notes.push(
        `No age-based reduction — youngest unmarried child is ${youngestAge} (immediate planning allowed).`
      );
    }
  }

  // Floor the score at 0.50
  score = Math.max(score, 0.5);
  notes.push(`Final responsibility score: ${score.toFixed(2)}`);

  // ── Rule 5: Baseline Budget ───────────────────────────────────────────
  const baselineBudget = Math.floor(basePool * score);

  // ── Rule 6: Category Allocation with Priorities ───────────────────────
  const weighted = {};
  for (const [cat, basePct] of Object.entries(BASE_ALLOCATION)) {
    const priKey = `priority_${cat}`;
    const userPriority = priorities[priKey] || "Medium";
    const multiplier = PRIORITY_MULTIPLIERS[userPriority] || 1.0;
    weighted[cat] = basePct * multiplier;
  }

  const totalWeight = Object.values(weighted).reduce((a, b) => a + b, 0);

  const categoryBreakdown = {};
  for (const [cat, w] of Object.entries(weighted)) {
    const ratio = w / totalWeight;
    categoryBreakdown[cat] = Math.floor(baselineBudget * ratio);
  }

  // Track which categories are High/Low priority for notes
  const highPriority = [];
  const lowPriority = [];
  for (const [cat, basePct] of Object.entries(BASE_ALLOCATION)) {
    const priKey = `priority_${cat}`;
    const p = priorities[priKey] || "Medium";
    if (p === "High") highPriority.push(cat.replace(/_/g, " "));
    if (p === "Low") lowPriority.push(cat.replace(/_/g, " "));
  }
  if (highPriority.length > 0) {
    notes.push(`High priority given to: ${highPriority.join(", ")}.`);
  }
  if (lowPriority.length > 0) {
    notes.push(`Low priority given to: ${lowPriority.join(", ")}.`);
  }

  // ── Rule 7: Hard Validator ────────────────────────────────────────────
  const totalLiquidAssets =
    monthly_household_income * 6 + total_savings_available;

  let finalBudget = Math.max(baselineBudget, MIN_BUDGET);
  finalBudget = Math.min(finalBudget, totalLiquidAssets);

  // Re-scale categories to final budget
  if (baselineBudget > 0) {
    const scale = finalBudget / baselineBudget;
    for (const cat of Object.keys(categoryBreakdown)) {
      categoryBreakdown[cat] = Math.floor(categoryBreakdown[cat] * scale);
    }
  }

  // Ensure per-category minimums
  const adjustedBreakdown = ensureMinimums(categoryBreakdown);

  // ── Build output ──────────────────────────────────────────────────────
  return {
    baseline_budget: finalBudget,
    responsibility_score: parseFloat(score.toFixed(2)),
    category_breakdown: adjustedBreakdown,
    notes,
    // Extra info for other modules
    max_from_income: maxFromIncome,
    max_from_savings: maxFromSavings,
    base_pool: basePool,
  };
}

/**
 * Ensure each category meets the minimum amount.
 * First tries to take from miscellaneous, then from the largest category.
 */
function ensureMinimums(breakdown) {
  const adjusted = { ...breakdown };
  let deficit = 0;

  // Calculate deficit
  for (const cat of Object.keys(adjusted)) {
    if (adjusted[cat] < MIN_CATEGORY_AMOUNT) {
      deficit += MIN_CATEGORY_AMOUNT - adjusted[cat];
      adjusted[cat] = MIN_CATEGORY_AMOUNT;
    }
  }

  if (deficit === 0) return adjusted;

  // Try to take from miscellaneous
  if (adjusted.miscellaneous > deficit + 1000) {
    adjusted.miscellaneous -= deficit;
  } else {
    // Take from the largest category
    const largest = Object.keys(adjusted).reduce((a, b) =>
      adjusted[a] > adjusted[b] ? a : b
    );
    adjusted[largest] -= deficit;
  }

  return adjusted;
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  ruleEngine,
  ensureMinimums,
  BASE_ALLOCATION,
  PRIORITY_MULTIPLIERS,
  MIN_BUDGET,
  MAX_INCOME_RATIO,
  MAX_SAVINGS_RATIO,
};
