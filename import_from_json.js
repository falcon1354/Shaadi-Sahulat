/**
 * import_from_json.js
 * ────────────────────
 * Restores ALL collections from exports/ folder → local MongoDB
 * Use this on any new PC to restore your database
 *
 * HOW TO RUN:
 *   node import_from_json.js
 */

const { MongoClient } = require("mongodb");
const fs   = require("fs");
const path = require("path");

const LOCAL_URI = "mongodb://localhost:27017";
const DB_NAME   = "shaadi-sahulat";
const IN_DIR    = path.join(__dirname, "exports");

async function importAll() {
  console.log("=".repeat(50));
  console.log("  ShaadiSahulat — Import JSON → Local MongoDB");
  console.log("=".repeat(50));

  if (!fs.existsSync(IN_DIR)) {
    console.error("\n[ERROR] exports/ folder not found. Run export_to_json.js first.");
    process.exit(1);
  }

  const files = fs.readdirSync(IN_DIR).filter(f => f.endsWith(".json"));
  if (!files.length) {
    console.error("\n[ERROR] No JSON files found in exports/ folder.");
    process.exit(1);
  }

  const client = new MongoClient(LOCAL_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log(`\nFound ${files.length} files to import\n`);
    let total = 0;

    for (const file of files) {
      const name = file.replace(".json", "");
      const docs = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), "utf8"));

      if (!docs.length) {
        console.log(`  [SKIP] ${name} — empty file`);
        continue;
      }

      await db.collection(name).drop().catch(() => {});
      const result = await db.collection(name).insertMany(docs);
      total += result.insertedCount;
      console.log(`  [OK] ${name.padEnd(30)} ${result.insertedCount} docs restored`);
    }

    console.log("\n" + "=".repeat(50));
    console.log(`  Done! ${total} total documents restored`);
    console.log(`  Database: ${DB_NAME}`);
    console.log("=".repeat(50));
  } catch (err) {
    console.error("\n[ERROR]", err.message);
    if (err.message.includes("ECONNREFUSED"))
      console.error("  Local MongoDB not running. Open Compass first.");
  } finally {
    await client.close();
  }
}

importAll();
