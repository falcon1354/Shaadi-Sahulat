/**
 * Dowry Controller — updated for spec §2.1 / §2.2 / §2.3 / §2.4
 * wedding_dress replaces bridal_dress + groom_dress.
 * priorities accept Not_Wanted (4th option).
 * redistributions, adjusted_estimates, wedding_dress_type are new fields.
 */

const axios           = require("axios");
const DowryEstimation = require("../models/DowryEstimation");
const DowryTraining   = require("../models/DowryTraining");
const Buyer           = require("../models/Buyer");
const { hybridEstimate } = require("../services/hybridEngine");
const { ruleEngine }     = require("../services/ruleEngine");
const mlClient           = require("../services/mlClient");

const VISUAL_ML_URL = process.env.VISUAL_ML_URL || "http://localhost:5002";

// ── Training match helper ─────────────────────────────────────────────────
async function findSimilarTrainingProfiles(income, myBudget) {
  try {
    const lo = income * 0.4, hi = income * 2.5;
    const profiles = await DowryTraining.find({ income: { $gte: lo, $lte: hi } })
      .select("income total_family_members total_recommended_budget responsibility_score category_breakdown")
      .lean();
    if (!profiles.length) return [];
    return profiles
      .map((p) => ({ ...p, _d: Math.abs(p.income - income) / income }))
      .sort((a, b) => a._d - b._d)
      .slice(0, 5)
      .map(({ _d, _id, is_system, created_at, __v, ...p }) => ({
        ...p,
        deviation_pct: Number(
          (((p.total_recommended_budget - myBudget) / myBudget) * 100).toFixed(1)
        ),
      }));
  } catch {
    return [];
  }
}

// ── POST /api/dowry/estimate ───────────────────────────────────────────────
async function estimateDowry(req, res) {
  try {
    const inputs  = validateAndNormalizeInputs(req.body);
    const result  = await hybridEstimate(inputs, true);
    // Append top-5 similar training profiles (BUYER 7)
    result.training_matches = await findSimilarTrainingProfiles(
      inputs.monthly_household_income,
      result.total_recommended_budget
    );
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

// ── GET /api/dowry/by-user/:user_id ──────────────────────────────────────
async function getEstimationByUser(req, res) {
  try {
    const { user_id } = req.params;

    // Primary lookup by user_id stored on the estimation
    let estimation = await DowryEstimation.findOne({ user_id }).sort({ created_at: -1 }).lean();

    // Fallback: old estimations were saved with a random user_id (before the userId bug fix).
    // Look up the Buyer document — if it has dowry_estimation_id, fetch by _id directly.
    if (!estimation) {
      const buyer = await Buyer.findOne({ buyer_id: user_id }).lean();
      if (buyer?.dowry_estimation_id) {
        estimation = await DowryEstimation.findById(buyer.dowry_estimation_id).lean();
        // Fix the stale user_id on the old estimation so future lookups work
        if (estimation) {
          await DowryEstimation.updateOne(
            { _id: estimation._id },
            { $set: { user_id } }
          );
          estimation.user_id = user_id;
        }
      }
    }

    if (!estimation) return res.json({ success: true, data: null });
    return res.json({ success: true, data: estimation });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── POST /api/dowry/upsert ─────────────────────────────────────────────────
async function upsertEstimation(req, res) {
  try {
    const inputs  = validateAndNormalizeInputs(req.body);
    const user_id = req.body.user_id || "anonymous";

    const result = await hybridEstimate(inputs, true);

    const adjustedEstimates = req.body.adjusted_estimates || {};
    const categoryBudgets   = {};
    const breakdown         = result.category_breakdown;
    for (const cat of Object.keys(breakdown)) {
      const estimated = adjustedEstimates[cat] !== undefined
        ? Number(adjustedEstimates[cat])
        : breakdown[cat];
      const priKey   = `priority_${cat}`;
      const isActive = (inputs.priorities[priKey] || "Medium") !== "Not_Wanted";
      categoryBudgets[cat] = { estimated, spent: 0, remaining: estimated, active: isActive };
    }

    const wasManuallyAdjusted = Object.keys(adjustedEstimates).some(
      (cat) => adjustedEstimates[cat] !== breakdown[cat]
    );

    const update = {
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
      priorities:               inputs.priorities || {},
      redistributions:          inputs.redistributions || {},
      notes:                    result.notes,
      source:                   result.source,
      updated_at:               new Date(),
    };

    const saved = await DowryEstimation.findOneAndUpdate(
      { user_id },
      { $set: update, $setOnInsert: { user_id, created_at: new Date() } },
      { upsert: true, new: true, lean: true }
    );

    // Stamp buyer so locked-mode check works even if old estimation had wrong user_id
    Buyer.findOneAndUpdate(
      { buyer_id: user_id },
      { $set: { dowry_done: true, dowry_estimation_id: saved._id.toString() } }
    ).catch((e) => console.warn("[dowryController] Buyer stamp failed:", e.message));

    // Async: save anonymized record to training collection (BUYER 7)
    DowryTraining.create({
      is_system:                false,
      income:                   inputs.monthly_household_income,
      savings:                  inputs.total_savings_available,
      total_family_members:     inputs.total_family_members || 4,
      total_recommended_budget: result.total_recommended_budget,
      responsibility_score:     result.responsibility_score,
      category_breakdown:       result.category_breakdown,
    }).catch((err) => console.warn("[dowryController] Training record save failed:", err.message));

    return res.json({
      success:       true,
      estimation_id: saved._id,
      data:          result,
      is_update:     !!saved.created_at,
    });
  } catch (error) {
    console.error("[dowryController] Upsert error:", error.message);
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

// ── POST /api/dowry/training/seed ────────────────────────────────────────
async function seedTrainingData(req, res) {
  try {
    const count = Number(req.body?.count || 150);
    if (count < 1 || count > 500) {
      return res.status(400).json({ success: false, error: "count must be 1–500" });
    }

    // Remove old system records before re-seeding
    await DowryTraining.deleteMany({ is_system: true });

    const records = buildSyntheticRecords(count);
    await DowryTraining.insertMany(records);

    return res.json({ success: true, seeded: records.length });
  } catch (error) {
    console.error("[dowryController] Seed training error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

function buildSyntheticRecords(n) {
  const records = [];
  // Income bands (PKR/month) — weighted to reflect Pakistani urban distribution
  const bands = [
    { min: 25000,  max: 50000,  weight: 25 },
    { min: 50000,  max: 100000, weight: 30 },
    { min: 100000, max: 175000, weight: 25 },
    { min: 175000, max: 300000, weight: 15 },
    { min: 300000, max: 500000, weight: 5  },
  ];
  const totalW = bands.reduce((s, b) => s + b.weight, 0);

  for (let i = 0; i < n; i++) {
    // Weighted random band
    let rw = rand(0, totalW), band = bands[bands.length - 1];
    for (const b of bands) { rw -= b.weight; if (rw <= 0) { band = b; break; } }

    const income  = Math.round(rand(band.min, band.max) / 1000) * 1000;
    const savings = Math.round(rand(income * 0.5, income * 3) / 5000) * 5000;
    const family  = randInt(3, 9);

    // Use ruleEngine for realistic budget calculation
    const priorities = {
      priority_wedding_dress: randPriority(0.40, 0.15),
      priority_furniture:     randPriority(0.35, 0.20),
      priority_electronics:   randPriority(0.30, 0.20),
      priority_kitchen_items: randPriority(0.25, 0.25),
      priority_decoration:    randPriority(0.20, 0.30),
      priority_miscellaneous: randPriority(0.15, 0.35),
    };

    const inputs = {
      monthly_household_income: income,
      total_savings_available:  savings,
      expected_contribution:    Math.round(rand(0, income * 0.5) / 1000) * 1000,
      total_family_members:     family,
      married_children_count:   randInt(0, Math.max(0, family - 3)),
      unmarried_children_count: randInt(1, 3),
      age_of_each_unmarried_child: [],
      priorities,
      redistributions: {},
    };

    let result;
    try { result = ruleEngine(inputs); }
    catch { continue; }

    records.push({
      is_system:                true,
      income,
      savings,
      total_family_members:     family,
      total_recommended_budget: result.baseline_budget,   // ruleEngine returns baseline_budget
      responsibility_score:     result.responsibility_score || 0.5,
      category_breakdown:       result.category_breakdown,
    });
  }
  return records;
}

function rand(min, max)          { return min + Math.random() * (max - min); }
function randInt(min, max)       { return Math.floor(rand(min, max + 1)); }
function randPriority(highProb, lowProb) {
  const r = Math.random();
  if (r < highProb) return "High";
  if (r < highProb + lowProb) return "Low";
  return "Medium";
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

// ── GET /api/dowry/migrate-buyer-status ───────────────────────────────────
// One-time endpoint: stamps dowry_done + dowry_estimation_id on every Buyer
// that already has a saved DowryEstimation. Open in browser once, then forget.
async function migrateBuyerDowryStatus(req, res) {
  try {
    const estimations = await DowryEstimation.find({}).lean();
    let linked = 0, orphaned = 0;
    const report = [];

    for (const est of estimations) {
      const userId = est.user_id;

      // Already correct buyer_id format
      if (userId && userId.startsWith("buyer_")) {
        const result = await Buyer.findOneAndUpdate(
          { buyer_id: userId },
          { $set: { dowry_done: true, dowry_estimation_id: est._id.toString() } },
          { new: true }
        );
        if (result) {
          linked++;
          report.push({ estimation_id: est._id, buyer_id: userId, status: "linked" });
        } else {
          report.push({ estimation_id: est._id, buyer_id: userId, status: "no_buyer_found" });
        }
        continue;
      }

      // Old random user_id — try auto-link if only 1 unlinked buyer exists
      orphaned++;
      const unlinked = await Buyer.find({ dowry_done: { $ne: true } }).lean();
      const orphanEsts = estimations.filter(e => !e.user_id?.startsWith("buyer_"));

      if (unlinked.length === 1 && orphanEsts.length === 1) {
        const buyer = unlinked[0];
        await Buyer.updateOne(
          { buyer_id: buyer.buyer_id },
          { $set: { dowry_done: true, dowry_estimation_id: est._id.toString() } }
        );
        await DowryEstimation.updateOne(
          { _id: est._id },
          { $set: { user_id: buyer.buyer_id } }
        );
        linked++; orphaned--;
        report.push({ estimation_id: est._id, buyer_id: buyer.buyer_id, status: "auto_linked" });
      } else {
        report.push({ estimation_id: est._id, user_id: userId, status: "orphaned_cannot_link" });
      }
    }

    return res.json({ success: true, linked, orphaned, report });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── PATCH /api/dowry/budgets/:user_id ─────────────────────────────────────
// Persist updated category_budgets (after shift or checkout) to MongoDB.
async function patchCategoryBudgets(req, res) {
  try {
    const { user_id } = req.params;
    const { category_budgets } = req.body;
    if (!category_budgets || typeof category_budgets !== "object") {
      return res.status(400).json({ success: false, error: "category_budgets object required" });
    }

    const updated = await DowryEstimation.findOneAndUpdate(
      { user_id },
      { $set: { category_budgets } },
      { sort: { created_at: -1 }, new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: "No estimation found for this user" });

    return res.json({ success: true, category_budgets: updated.category_budgets });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  estimateDowry,
  saveEstimation,
  upsertEstimation,
  getEstimationByUser,
  getEstimationHistory,
  getEstimationById,
  estimateRuleOnly,
  getCategoryPrices,
  getMLStats,
  initML,
  seedTrainingData,
  migrateBuyerDowryStatus,
  patchCategoryBudgets,
};
