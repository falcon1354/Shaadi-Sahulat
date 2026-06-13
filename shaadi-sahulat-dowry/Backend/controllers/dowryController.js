/**
 * Dowry Controller
 * =================
 * Handles all dowry estimation API logic.
 */

const DowryEstimation = require("../models/DowryEstimation");
const { hybridEstimate } = require("../services/hybridEngine");
const { ruleEngine } = require("../services/ruleEngine");
const mlClient = require("../services/mlClient");

/**
 * POST /api/dowry/estimate
 * Preview estimation without saving to DB.
 */
async function estimateDowry(req, res) {
  try {
    const inputs = validateAndNormalizeInputs(req.body);
    const result = await hybridEstimate(inputs, true);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("[dowryController] Estimate error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/dowry/save
 * Run full estimation and save to DB.
 * Also adds user data to ML dataset.
 */
async function saveEstimation(req, res) {
  try {
    const inputs = validateAndNormalizeInputs(req.body);
    const user_id = req.body.user_id || "anonymous";

    // Run full hybrid estimation
    const result = await hybridEstimate(inputs, true);

    // Save to MongoDB
    const estimation = new DowryEstimation({
      user_id,
      total_recommended_budget: result.total_recommended_budget,
      category_breakdown: result.category_breakdown,
      baseline_budget: result.baseline_budget,
      ml_adjustment_factor: result.ml_adjustment_factor,
      responsibility_score: result.responsibility_score,
      income: inputs.monthly_household_income,
      savings: inputs.total_savings_available,
      expected_contribution: inputs.expected_contribution || 0,
      total_family_members: inputs.total_family_members || 4,
      married_children: inputs.married_children_count || 0,
      unmarried_children: inputs.unmarried_children_count,
      ages_of_unmarried: inputs.age_of_each_unmarried_child || [],
      youngest_unmarried_age:
        inputs.age_of_each_unmarried_child && inputs.age_of_each_unmarried_child.length > 0
          ? Math.min(...inputs.age_of_each_unmarried_child)
          : null,
      priorities: inputs.priorities || {},
      notes: result.notes,
      source: result.source,
    });

    const saved = await estimation.save();

    // Add user data to ML dataset (async, don't block response)
    const youngestAge =
      inputs.age_of_each_unmarried_child && inputs.age_of_each_unmarried_child.length > 0
        ? Math.min(...inputs.age_of_each_unmarried_child)
        : 22;

    mlClient
      .addUserToDataset({
        monthly_income: inputs.monthly_household_income,
        total_savings: inputs.total_savings_available,
        expected_contribution: inputs.expected_contribution || 0,
        family_members: inputs.total_family_members || 4,
        married_children: inputs.married_children_count || 0,
        unmarried_children: inputs.unmarried_children_count,
        youngest_unmarried_age: youngestAge,
        ages_of_unmarried: JSON.stringify(inputs.age_of_each_unmarried_child || []),
        ...inputs.priorities,
        estimated_budget: result.total_recommended_budget,
        actual_spent: result.total_recommended_budget, // Will be updated as user purchases
        responsibility_score: result.responsibility_score,
        category_breakdown: JSON.stringify(result.category_breakdown),
      })
      .catch((err) => console.warn("[dowryController] Failed to add to ML dataset:", err.message));

    return res.json({
      success: true,
      estimation_id: saved._id,
      data: result,
    });
  } catch (error) {
    console.error("[dowryController] Save error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/dowry/history/:user_id
 * Get all saved estimations for a user.
 */
async function getEstimationHistory(req, res) {
  try {
    const { user_id } = req.params;
    const estimations = await DowryEstimation.find({ user_id })
      .sort({ created_at: -1 })
      .lean();

    return res.json({ success: true, data: estimations });
  } catch (error) {
    console.error("[dowryController] History error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/dowry/:id
 * Get a single estimation by its ID.
 */
async function getEstimationById(req, res) {
  try {
    const { id } = req.params;
    const estimation = await DowryEstimation.findById(id).lean();
    if (!estimation) {
      return res.status(404).json({ success: false, error: "Estimation not found" });
    }
    return res.json({ success: true, data: estimation });
  } catch (error) {
    console.error("[dowryController] Get by ID error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/dowry/rule-only
 * Run only the rule-based engine (no ML).
 * Useful for comparison or debugging.
 */
async function estimateRuleOnly(req, res) {
  try {
    const inputs = validateAndNormalizeInputs(req.body);
    const result = ruleEngine(inputs);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("[dowryController] Rule-only error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  };
}

/**
 * GET /api/dowry/ml/stats
 * Get ML dataset statistics.
 */
async function getMLStats(req, res) {
  try {
    const stats = await mlClient.getDatasetStats();
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/dowry/ml/init
 * Initialize the ML service (generate dataset + train).
 */
async function initML(req, res) {
  try {
    const numRecords = req.body?.num_records || 150;
    const result = await mlClient.initMLService(numRecords);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── Input Validation ───────────────────────────────────────────────────────

function validateAndNormalizeInputs(body) {
  const {
    monthly_household_income,
    total_savings_available,
    expected_contribution = 0,
    total_family_members = 4,
    married_children_count = 0,
    unmarried_children_count = 0,
    age_of_each_unmarried_child = [],
    priorities = {},
  } = body;

  if (!monthly_household_income || monthly_household_income <= 0) {
    throw new Error("Monthly household income must be greater than 0");
  }
  if (total_savings_available === undefined || total_savings_available < 0) {
    throw new Error("Total savings must be 0 or greater");
  }
  if (unmarried_children_count < 0) {
    throw new Error("Unmarried children count must be 0 or greater");
  }
  if (
    age_of_each_unmarried_child.length > 0 &&
    age_of_each_unmarried_child.length !== unmarried_children_count
  ) {
    throw new Error(
      "Number of ages must match unmarried_children_count"
    );
  }

  return {
    monthly_household_income: Number(monthly_household_income),
    total_savings_available: Number(total_savings_available),
    expected_contribution: Number(expected_contribution),
    total_family_members: Number(total_family_members),
    married_children_count: Number(married_children_count),
    unmarried_children_count: Number(unmarried_children_count),
    age_of_each_unmarried_child: age_of_each_unmarried_child.map(Number),
    priorities,
  };
}

module.exports = {
  estimateDowry,
  saveEstimation,
  getEstimationHistory,
  getEstimationById,
  estimateRuleOnly,
  getMLStats,
  initML,
};
