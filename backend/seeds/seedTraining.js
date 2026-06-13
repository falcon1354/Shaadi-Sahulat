/**
 * Seed 150 synthetic dowry training records into dowry_training collection.
 * Run once from backend folder:
 *   node seeds/seedTraining.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose    = require("mongoose");
const DowryTraining = require("../models/DowryTraining");
const { ruleEngine } = require("../services/ruleEngine");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/shaadi_sahulat";

// Income bands weighted to reflect Pakistani urban distribution
const BANDS = [
  { min: 25000,  max: 50000,  weight: 25 },
  { min: 50000,  max: 100000, weight: 30 },
  { min: 100000, max: 175000, weight: 25 },
  { min: 175000, max: 300000, weight: 15 },
  { min: 300000, max: 500000, weight: 5  },
];
const TOTAL_W = BANDS.reduce((s, b) => s + b.weight, 0);

function rand(min, max)    { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function randPriority(highP, lowP) {
  const r = Math.random();
  if (r < highP)         return "High";
  if (r < highP + lowP)  return "Low";
  return "Medium";
}
function pickBand() {
  let rw = rand(0, TOTAL_W);
  for (const b of BANDS) { rw -= b.weight; if (rw <= 0) return b; }
  return BANDS[BANDS.length - 1];
}

function buildRecords(n) {
  const records = [];
  for (let i = 0; i < n; i++) {
    const band   = pickBand();
    const income = Math.round(rand(band.min, band.max) / 1000) * 1000;
    const savings = Math.round(rand(income * 0.5, income * 3) / 5000) * 5000;
    const family  = randInt(3, 9);
    const married = randInt(0, Math.max(0, family - 3));
    const unmarried = randInt(1, 3);

    const priorities = {
      priority_wedding_dress: randPriority(0.40, 0.15),
      priority_furniture:     randPriority(0.35, 0.20),
      priority_electronics:   randPriority(0.30, 0.20),
      priority_jewelry:       randPriority(0.35, 0.15),
      priority_kitchen_items: randPriority(0.25, 0.25),
      priority_decoration:    randPriority(0.20, 0.30),
      priority_miscellaneous: randPriority(0.15, 0.35),
    };

    let result;
    try {
      result = ruleEngine({
        monthly_household_income: income,
        total_savings_available:  savings,
        expected_contribution:    Math.round(rand(0, income * 0.5) / 1000) * 1000,
        total_family_members:     family,
        married_children_count:   married,
        unmarried_children_count: unmarried,
        age_of_each_unmarried_child: [],
        priorities,
        redistributions: {},
      });
    } catch { continue; }

    if (!result?.baseline_budget) continue;

    records.push({
      is_system:                true,
      income,
      savings,
      total_family_members:     family,
      total_recommended_budget: result.baseline_budget,
      responsibility_score:     result.responsibility_score || 0.5,
      category_breakdown:       result.category_breakdown,
    });
  }
  return records;
}

async function main() {
  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  // Remove old system records
  const deleted = await DowryTraining.deleteMany({ is_system: true });
  console.log(`Removed ${deleted.deletedCount} old system records.`);

  // Build + insert
  const records = buildRecords(150);
  await DowryTraining.insertMany(records);
  console.log(`✓ Seeded ${records.length} training records.`);

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
