/**
 * migrateDowryBuyers.js
 * =====================
 * One-time migration: links existing DowryEstimation records to their Buyer
 * documents by stamping dowry_done + dowry_estimation_id on each Buyer.
 *
 * Handles two cases:
 *   1. Estimation already has a correct buyer_id as user_id  → stamp Buyer directly.
 *   2. Estimation has old random user_id (user-xxxxx)        → cannot auto-link.
 *      In this case the script marks the Buyer as done=true
 *      IF there is exactly one estimation in the DB and exactly one buyer
 *      with no dowry_done yet (safe single-user assumption for dev/testing).
 *
 * Run from backend/ folder:
 *   node seeds/migrateDowryBuyers.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose        = require("mongoose");
const Buyer           = require("../models/Buyer");
const DowryEstimation = require("../models/DowryEstimation");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/shaadi_sahulat";

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const estimations = await DowryEstimation.find({}).lean();
  const buyers      = await Buyer.find({ dowry_done: { $ne: true } }).lean();

  console.log(`Found ${estimations.length} estimation(s).`);
  console.log(`Found ${buyers.length} buyer(s) without dowry_done.\n`);

  let linked   = 0;
  let orphaned = 0;

  for (const est of estimations) {
    const userId = est.user_id;

    // Case 1: user_id is a real buyer_id (starts with "buyer_")
    if (userId && userId.startsWith("buyer_")) {
      const result = await Buyer.updateOne(
        { buyer_id: userId },
        { $set: { dowry_done: true, dowry_estimation_id: est._id.toString() } }
      );
      if (result.modifiedCount > 0) {
        console.log(`  Linked estimation ${est._id} → buyer ${userId}`);
        linked++;
      } else {
        console.log(`  No buyer found for user_id=${userId} (skipped)`);
      }
      continue;
    }

    // Case 2: old random user_id (user-xxxxx) — cannot auto-map to a buyer
    console.log(`  Orphaned estimation ${est._id} (user_id="${userId}" is a random ID)`);
    orphaned++;
  }

  // If there are orphaned estimations and exactly one buyer still not linked,
  // we can safely assume they belong together (common in dev/testing with one account).
  if (orphaned > 0) {
    const unlinkedBuyers = await Buyer.find({ dowry_done: { $ne: true } }).lean();
    const orphanedEsts   = estimations.filter(e => !e.user_id?.startsWith("buyer_"));

    if (unlinkedBuyers.length === 1 && orphanedEsts.length === 1) {
      const buyer = unlinkedBuyers[0];
      const est   = orphanedEsts[0];
      await Buyer.updateOne(
        { buyer_id: buyer.buyer_id },
        { $set: { dowry_done: true, dowry_estimation_id: est._id.toString() } }
      );
      // Fix the stale user_id on the estimation too
      await DowryEstimation.updateOne(
        { _id: est._id },
        { $set: { user_id: buyer.buyer_id } }
      );
      console.log(`\n  Auto-linked orphaned estimation ${est._id} → buyer ${buyer.buyer_id}`);
      console.log(`  (single buyer + single orphaned estimation — safe assumption)`);
      linked++;
      orphaned--;
    } else if (orphaned > 0) {
      console.log(`\n  ${orphaned} estimation(s) could not be auto-linked.`);
      console.log(`  Those buyers need to re-save their estimation from the app.`);
    }
  }

  console.log(`\nDone. Linked: ${linked}  |  Still orphaned: ${orphaned}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
