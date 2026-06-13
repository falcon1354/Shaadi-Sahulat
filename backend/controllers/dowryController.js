/**
 * Dowry Controller — updated for spec §2.1 / §2.2 / §2.3 / §2.4
 * wedding_dress replaces bridal_dress + groom_dress.
 * priorities accept Not_Wanted (4th option).
 * redistributions, adjusted_estimates, wedding_dress_type are new fields.
 */

const axios          = require("axios");
const DowryEstimation = require("../models/DowryEstimation");
const { hybridEstimate } = require("../services/hybridEngine");
const { ruleEngine }     = require("../services/ruleEngine");
const mlClient           = require("../services/mlClient");

const VISUAL_ML_URL = process.env.VISUAL_ML_URL || "http://localhost:5002";

// ── POST /api/dowry/estimate ───────────────────────────────────────────────
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

// ── POST /api/dowry/save ───────────────────────────────────────────────────
async function saveEstimation(req, res) {
  try {
    const inputs  = validateAndNormalizeInputs(req.body);
    const user_id = req.body.user_id || "anonymous";

    const result = await hybridEstimate(inputs, true);

    // Build category_budgets (Contract 1) — use adjusted_estimates if provided
    const adjustedEstimates = req.body.adjusted_estimates || {};
    const categoryBudgets   = {};
    const breakdown         = result.category_breakdown;
    for (const cat of Object.keys(breakdown)) {
      const estimated = adjustedEstimates[cat] !== undefined
        ? Number(adjustedEstimates[cat])
        : breakdown[cat];
      const priKey = `priority_${cat}`;
      const isActive = (inputs.priorities[priKey] || "Medium") !== "Not_Wanted";
      categoryBudgets[cat] = {
        estimated,
        spent:     0,
        remaining: estimated,
        active:    isActive,
      };
    }

    const wasManuallyAdjusted = Object.keys(adjustedEstimates).some(
      (cat) => adjustedEstimates[cat] !== breakdown[cat]
    );

    const estimation = new DowryEstimation({
      user_id,
      total_recommended_budget: result.total_recommended_budget,
      category_breakdown:       result.category_breakdown,
      category_budgets:         categoryBudgets,
      adjusted_estimates:       adjustedEstimates,
      was_manually_adjusted:    wasManuallyAdjusted,
      wedding_dress_type:       inputs.wedding_dress_type || "bridal",
      baseline_budget:          result.baseline_budget,
      ml_adjustment_factor:     result.ml_adjustment_factor,
      responsibility_score:     result.responsibility_score,
      income:                   inputs.monthly_household_income,
      savings:                  inputs.total_savings_available,
      expected_contribution:    inputs.expected_contribution || 0,
      total_family_members:     inputs.total_family_members || 4,
      married_children:         inputs.married_children_count || 0,
      unmarried_children:       inputs.unmarried_children_count,
      ages_of_unmarried:        inputs.age_of_each_unmarried_child || [],
      youngest_unmarried_age:
        inputs.age_of_each_unmarried_child?.length > 0
          ? Math.min(...inputs.age_of_each_unmarried_child)
          : null,
      priorities:     inputs.priorities || {},
      redistributions: inputs.redistributions || {},
      notes:          result.notes,
      source:         result.source,
    });

    const saved = await estimation.save();

    // Async: save training profile to Flask filesystem (§2.5) — don't block
    axios.post(`${VISUAL_ML_URL}/dowry/save-profile`, {
      profile_id:        saved._id.toString(),
      user_id,
      budget:            result.total_recommended_budget,
      baseline_budget:   result.baseline_budget,
      priorities:        inputs.priorities,
      redistributions:   inputs.redistributions,
      wedding_dress_type: inputs.wedding_dress_type,
      category_breakdown: result.category_breakdown,
      adjusted_estimates: adjustedEstimates,
      category_budgets:   categoryBudgets,
      ml_adjustment:      result.ml_adjustment_factor,
      responsibility_score: result.responsibility_score,
      income:            inputs.monthly_household_income,
      savings:           inputs.total_savings_available,
    }, { timeout: 8000 })
      .catch((err) => console.warn("[dowryController] Profile save to Flask failed:", err.message));

    // Async ML dataset update — don't block response
    const youngestAge =
      inputs.age_of_each_unmarried_child?.length > 0
        ? Math.min(...inputs.age_of_each_unmarried_child)
        : 22;
    mlClient
      .addUserToDataset({
        monthly_income:        inputs.monthly_household_income,
        total_savings:         inputs.total_savings_available,
        expected_contribution: inputs.expected_contribution || 0,
        family_members:        inputs.total_family_members || 4,
        married_children:      inputs.married_children_count || 0,
        unmarried_children:    inputs.unmarried_children_count,
        youngest_unmarried_age: youngestAge,
        ages_of_unmarried:     JSON.stringify(inputs.age_of_each_unmarried_child || []),
        ...inputs.priorities,
        estimated_budget:    result.total_recommended_budget,
        actual_spent:        result.total_recommended_budget,
        responsibility_score: result.responsibility_score,
        category_breakdown:  JSON.stringify(result.category_breakdown),
      })
      .catch((err) => console.warn("[dowryController] ML dataset update failed:", err.message));

    return res.json({
      success:       true,
      estimation_id: saved._id,
      data:          result,
    });
  } catch (error) {
    console.error("[dowryController] Save error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
}

// ── GET /api/dowry/history/:user_id ───────────────────────────────────────
async function getEstimationHistory(req, res) {
  try {
    const estimations = await DowryEstimation.find({ user_id: req.params.user_id })
      .sort({ created_at: -1 })
      .lean();
    return res.json({ success: true, data: estimations });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── GET /api/dowry/:id ────────────────────────────────────────────────────
async function getEstimationById(req, res) {
  try {
    const estimation = await DowryEstimation.findById(req.params.id).lean();
    if (!estimation) {
      return res.status(404).json({ success: false, error: "Estimation not found" });
    }
    return res.json({ success: true, data: estimation });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── POST /api/dowry/rule-only ─────────────────────────────────────────────
async function estimateRuleOnly(req, res) {
  try {
    const inputs = validateAndNormalizeInputs(req.body);
    const result = ruleEngine(inputs);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

// ── GET /api/dowry/category-prices ────────────────────────────────────────
async function getCategoryPrices(req, res) {
  try {
    const response = await axios.get(`${VISUAL_ML_URL}/dowry/category-prices`, {
      timeout: 5000,
    });
    return res.json(response.data);
  } catch (error) {
    return res.status(502).json({ success: false, error: "Flask service unavailable" });
  }
}

// ── GET /api/dowry/ml/stats ───────────────────────────────────────────────
async function getMLStats(req, res) {
  try {
    const stats = await mlClient.getDatasetStats();
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── POST /api/dowry/ml/init ───────────────────────────────────────────────
async function initML(req, res) {
  try {
    const result = await mlClient.initMLService(req.body?.num_records || 150);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── Input Validation ──────────────────────────────────────────────────────
function validateAndNormalizeInputs(body) {
  const {
    monthly_household_income,
    total_savings_available,
    expected_contribution        = 0,
    total_family_members         = 4,
    married_children_count       = 0,
    unmarried_children_count     = 0,
    age_of_each_unmarried_child  = [],
    priorities                   = {},
    redistributions              = {},
    wedding_dress_type           = "bridal",
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
    throw new Error("Number of ages must match unmarried_children_count");
  }

  return {
    monthly_household_income:    Number(monthly_household_income),
    total_savings_available:     Number(total_savings_available),
    expected_contribution:       Number(expected_contribution),
    total_family_members:        Number(total_family_members),
    married_children_count:      Number(married_children_count),
    unmarried_children_count:    Number(unmarried_children_count),
    age_of_each_unmarried_child: age_of_each_unmarried_child.map(Number),
    priorities,
    redistributions,
    wedding_dress_type,
  };
}

module.exports = {
  estimateDowry,
  saveEstimation,
  getEstimationHistory,
  getEstimationById,
  estimateRuleOnly,
  getCategoryPrices,
  getMLStats,
  initML,
};
