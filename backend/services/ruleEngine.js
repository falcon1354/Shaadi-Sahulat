/**
 * Rule-Based Engine for ShaadiSahulat Dowry Estimation
 * ======================================================
 * Pure function — no DB, no network. Import anywhere.
 *
 * 7 Categories:
 *   1. wedding_dress  — 25%  (was bridal_dress 15% + groom_dress 10%, merged per spec §2.1)
 *   2. furniture      — 20%
 *   3. electronics    — 15%
 *   4. jewelry        — 20%
 *   5. kitchen_items  — 12%
 *   6. decoration     —  5%
 *   7. miscellaneous  —  3%
 */

const BASE_ALLOCATION = {
  wedding_dress: 0.25,   // merged bridal + groom
  furniture:     0.20,
  electronics:   0.15,
  jewelry:       0.20,
  kitchen_items: 0.12,
  decoration:    0.05,
  miscellaneous: 0.03,
};

// Per spec §2.2 — 4 priority options
const PRIORITY_MULTIPLIERS = {
  High:       1.2,
  Medium:     1.0,
  Low:        0.8,
  Not_Wanted: 0,     // zero weight → zero allocation
};

const MIN_BUDGET          = 50000;
const MAX_INCOME_RATIO    = 0.4;   // 40% of annual income
const MAX_SAVINGS_RATIO   = 0.8;   // 80% of savings
const MIN_CATEGORY_AMOUNT = 5000;

/**
 * Run the rule-based estimation engine.
 *
 * @param {Object} inputs
 * @param {number} inputs.monthly_household_income
 * @param {number} inputs.total_savings_available
 * @param {number} [inputs.expected_contribution=0]
 * @param {number} [inputs.total_family_members=4]
 * @param {number} [inputs.married_children_count=0]
 * @param {number} inputs.unmarried_children_count
 * @param {number[]} [inputs.age_of_each_unmarried_child=[]]
 * @param {Object} [inputs.priorities={}]          e.g. { priority_wedding_dress: 'High', ... }
 * @param {Object} [inputs.redistributions={}]      e.g. { priority_furniture: false } — false = don't add back to pool
 * @returns {Object}
 */
function ruleEngine(inputs) {
  const {
    monthly_household_income,
    total_savings_available,
    expected_contribution   = 0,
    total_family_members    = 4,
    married_children_count  = 0,
    unmarried_children_count,
    age_of_each_unmarried_child = [],
    priorities              = {},
    redistributions         = {},
  } = inputs;

  const notes = [];

  // ── Rule 1: Income Cap ────────────────────────────────────────────────
  const maxFromIncome = monthly_household_income * 12 * MAX_INCOME_RATIO;
  notes.push(`Maximum budget from income (40% of annual): PKR ${maxFromIncome.toLocaleString()}`);

  // ── Rule 2: Savings Cap ───────────────────────────────────────────────
  const maxFromSavings = total_savings_available * MAX_SAVINGS_RATIO;
  notes.push(`Maximum budget from savings (80%): PKR ${maxFromSavings.toLocaleString()}`);

  // ── Rule 3: Base Budget Pool ──────────────────────────────────────────
  const basePool = Math.min(maxFromIncome, maxFromSavings) + expected_contribution;
  notes.push(`Base pool (min of income/savings caps + contribution): PKR ${basePool.toLocaleString()}`);
  if (expected_contribution > 0) {
    notes.push(`Additional contribution: PKR ${expected_contribution.toLocaleString()}`);
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
      `Budget reduced by ${Math.round(reduction * 100)}% due to ${unmarried_children_count} unmarried children.`
    );
  }
  if (youngestAge !== null) {
    if (youngestAge < 18) {
      score -= 0.1;
      notes.push(`Budget reduced 10% — youngest unmarried child is ${youngestAge} (under 18).`);
    } else if (youngestAge <= 22) {
      score -= 0.05;
      notes.push(`Budget reduced 5% — youngest unmarried child is ${youngestAge} (near marriage age).`);
    } else {
      notes.push(`No age reduction — youngest unmarried child is ${youngestAge}.`);
    }
  }
  score = Math.max(score, 0.5);
  notes.push(`Final responsibility score: ${score.toFixed(2)}`);

  // ── Rule 5: Baseline Budget ───────────────────────────────────────────
  let baselineBudget = Math.floor(basePool * score);

  // ── Rule 5b: Reduce baseline for "Not Wanted, no redistribute" ───────
  // Per spec §2.2: if user says "No" to redistribute, that category's
  // share is removed from the total pool entirely (lower total estimate).
  let budgetScale = 1.0;
  for (const [cat, basePct] of Object.entries(BASE_ALLOCATION)) {
    const priKey       = `priority_${cat}`;
    const userPriority = priorities[priKey] || "Medium";
    if (userPriority === "Not_Wanted") {
      const redistribute = redistributions[priKey] !== false; // default true
      if (!redistribute) {
        budgetScale -= basePct;
        notes.push(`${cat.replace(/_/g, " ")} excluded from budget (Not Wanted, no redistribution).`);
      } else {
        notes.push(`${cat.replace(/_/g, " ")} marked Not Wanted — budget redistributed to other categories.`);
      }
    }
  }
  if (budgetScale < 1.0) {
    baselineBudget = Math.floor(baselineBudget * Math.max(budgetScale, 0.1));
  }

  // ── Rule 6: Category Allocation with Priorities ───────────────────────
  const weighted = {};
  for (const [cat, basePct] of Object.entries(BASE_ALLOCATION)) {
    const priKey       = `priority_${cat}`;
    const userPriority = priorities[priKey] || "Medium";
    const multiplier   = PRIORITY_MULTIPLIERS[userPriority] ?? 1.0;
    weighted[cat] = basePct * multiplier;
  }

  const totalWeight = Object.values(weighted).reduce((a, b) => a + b, 0);

  const categoryBreakdown = {};
  for (const [cat, w] of Object.entries(weighted)) {
    const ratio = totalWeight > 0 ? w / totalWeight : 0;
    categoryBreakdown[cat] = Math.floor(baselineBudget * ratio);
  }

  const highPriority = [];
  const lowPriority  = [];
  const notWanted    = [];
  for (const [cat] of Object.entries(BASE_ALLOCATION)) {
    const p = priorities[`priority_${cat}`] || "Medium";
    if (p === "High")       highPriority.push(cat.replace(/_/g, " "));
    else if (p === "Low")   lowPriority.push(cat.replace(/_/g, " "));
    else if (p === "Not_Wanted") notWanted.push(cat.replace(/_/g, " "));
  }
  if (highPriority.length > 0) notes.push(`High priority: ${highPriority.join(", ")}.`);
  if (lowPriority.length > 0)  notes.push(`Low priority: ${lowPriority.join(", ")}.`);
  if (notWanted.length > 0)    notes.push(`Not wanted: ${notWanted.join(", ")}.`);

  // ── Rule 7: Hard Validator ────────────────────────────────────────────
  const totalLiquidAssets = monthly_household_income * 6 + total_savings_available;
  let finalBudget = Math.max(baselineBudget, MIN_BUDGET);
  finalBudget     = Math.min(finalBudget, totalLiquidAssets);

  if (baselineBudget > 0) {
    const scale = finalBudget / baselineBudget;
    for (const cat of Object.keys(categoryBreakdown)) {
      categoryBreakdown[cat] = Math.floor(categoryBreakdown[cat] * scale);
    }
  }

  const adjustedBreakdown = ensureMinimums(categoryBreakdown, priorities);

  return {
    baseline_budget:       finalBudget,
    responsibility_score:  parseFloat(score.toFixed(2)),
    category_breakdown:    adjustedBreakdown,
    notes,
    max_from_income:  maxFromIncome,
    max_from_savings: maxFromSavings,
    base_pool:        basePool,
  };
}

/**
 * Ensure each active category meets the minimum amount.
 * Not_Wanted categories keep their 0 amount — no minimum enforced.
 */
function ensureMinimums(breakdown, priorities = {}) {
  const adjusted = { ...breakdown };
  let deficit = 0;

  for (const cat of Object.keys(adjusted)) {
    const p = priorities[`priority_${cat}`] || "Medium";
    if (p === "Not_Wanted") continue; // leave at 0
    if (adjusted[cat] < MIN_CATEGORY_AMOUNT) {
      deficit += MIN_CATEGORY_AMOUNT - adjusted[cat];
      adjusted[cat] = MIN_CATEGORY_AMOUNT;
    }
  }

  if (deficit === 0) return adjusted;

  // Take from miscellaneous first, then largest category
  const miscPriority = priorities["priority_miscellaneous"] || "Medium";
  if (miscPriority !== "Not_Wanted" && adjusted.miscellaneous > deficit + 1000) {
    adjusted.miscellaneous -= deficit;
  } else {
    const largest = Object.keys(adjusted)
      .filter((k) => (priorities[`priority_${k}`] || "Medium") !== "Not_Wanted")
      .reduce((a, b) => (adjusted[a] > adjusted[b] ? a : b));
    adjusted[largest] = Math.max(0, adjusted[largest] - deficit);
  }

  return adjusted;
}

module.exports = {
  ruleEngine,
  ensureMinimums,
  BASE_ALLOCATION,
  PRIORITY_MULTIPLIERS,
  MIN_BUDGET,
  MAX_INCOME_RATIO,
  MAX_SAVINGS_RATIO,
};
