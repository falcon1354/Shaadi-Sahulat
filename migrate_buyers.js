/**
 * migrate_buyers.js — Run once from backend/
 *   node migrate_buyers.js
 *
 * Stamps dowry_done: true on every Buyer who has a DowryEstimation.
 * No server needed — connects directly to MongoDB.
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const Estimation = mongoose.connection.collection("dowryestimations");
  const Buyer      = mongoose.connection.collection("buyers");

  const estimations = await Estimation.find({}).toArray();
  console.log(`Found ${estimations.length} estimation(s).`);

  let fixed = 0;
  for (const est of estimations) {
    const uid = est.user_id;
    if (!uid) continue;

    const result = await Buyer.updateOne(
      { buyer_id: uid },
      { $set: { dowry_done: true, dowry_estimation_id: est._id.toString() } }
    );

    if (result.modifiedCount > 0) {
      console.log(`  ✓ Stamped buyer: ${uid}`);
      fixed++;
    } else if (result.matchedCount === 0) {
      console.log(`  ⚠ No buyer found for user_id: ${uid}`);
    }
  }

  console.log(`\nDone. ${fixed} buyer(s) updated.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
