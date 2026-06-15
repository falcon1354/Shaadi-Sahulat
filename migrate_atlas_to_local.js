/**
 * migrate_atlas_to_local.js
 * ─────────────────────────
 * Copies ALL collections from MongoDB Atlas → Local MongoDB (Compass)
 *
 * HOW TO RUN:
 *   1. Make sure MongoDB is running locally (open MongoDB Compass once to start it)
 *   2. cd to this folder
 *   3. npm install mongodb   (only needed once)
 *   4. node migrate_atlas_to_local.js
 *
 * After running, open MongoDB Compass and connect to:
 *   mongodb://localhost:27017
 * You will see the database: shaadi-sahulat
 */

const { MongoClient } = require("mongodb");

const ATLAS_URI = "mongodb+srv://Ahmad:1GhCTKOfd2k9QVvQ@cluster0.p2qcckk.mongodb.net/shaadi-sahulat?appName=Cluster0";
const LOCAL_URI = "mongodb://localhost:27017";
const DB_NAME   = "shaadi-sahulat";

async function migrate() {
  console.log("=".repeat(55));
  console.log("  ShaadiSahulat — Atlas → Local Migration");
  console.log("=".repeat(55));

  const atlasClient = new MongoClient(ATLAS_URI);
  const localClient = new MongoClient(LOCAL_URI);

  try {
    // Connect to both
    console.log("\n[1/4] Connecting to Atlas...");
    await atlasClient.connect();
    console.log("      Atlas connected.");

    console.log("[2/4] Connecting to Local MongoDB...");
    await localClient.connect();
    console.log("      Local connected.");

    const atlasDB = atlasClient.db(DB_NAME);
    const localDB = localClient.db(DB_NAME);

    // Get all collections from Atlas
    console.log("\n[3/4] Fetching collections from Atlas...");
    const collections = await atlasDB.listCollections().toArray();
    console.log(`      Found ${collections.length} collections: ${collections.map(c => c.name).join(", ")}`);

    // Copy each collection
    console.log("\n[4/4] Copying data...\n");
    let totalDocs = 0;

    for (const col of collections) {
      const name = col.name;
      const sourceCol = atlasDB.collection(name);
      const destCol   = localDB.collection(name);

      // Fetch all docs from Atlas
      const docs = await sourceCol.find({}).toArray();

      if (docs.length === 0) {
        console.log(`  [SKIP] ${name} — empty`);
        continue;
      }

      // Drop existing local collection to avoid duplicates
      await destCol.drop().catch(() => {}); // ignore error if doesn't exist

      // Insert all docs into local
      const result = await destCol.insertMany(docs);
      totalDocs += result.insertedCount;
      console.log(`  [OK]   ${name.padEnd(30)} ${result.insertedCount} documents copied`);
    }

    console.log("\n" + "=".repeat(55));
    console.log(`  Migration complete!`);
    console.log(`  Total documents copied: ${totalDocs}`);
    console.log(`  Collections: ${collections.length}`);
    console.log("=".repeat(55));
    console.log("\n  Open MongoDB Compass and connect to:");
    console.log("  mongodb://localhost:27017");
    console.log(`  Database: ${DB_NAME}\n`);

  } catch (err) {
    console.error("\n[ERROR]", err.message);
    if (err.message.includes("ECONNREFUSED")) {
      console.error("  Local MongoDB is not running.");
      console.error("  Open MongoDB Compass first to start the local server.");
    }
    if (err.message.includes("Authentication")) {
      console.error("  Atlas authentication failed. Check the URI.");
    }
  } finally {
    await atlasClient.close();
    await localClient.close();
  }
}

migrate();
