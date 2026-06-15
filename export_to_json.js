/**
 * export_to_json.js
 * ─────────────────
 * Exports ALL collections from local MongoDB → JSON files
 * No extra tools needed — just Node.js
 *
 * HOW TO RUN:
 *   node export_to_json.js
 *
 * Output: exports/ folder with one .json file per collection
 * To re-import on any PC: node import_from_json.js
 */

const { MongoClient } = require("mongodb");
const fs   = require("fs");
const path = require("path");

const LOCAL_URI = "mongodb://localhost:27017";
const DB_NAME   = "shaadi-sahulat";
const OUT_DIR   = path.join(__dirname, "exports");

async function exportAll() {
  console.log("=".repeat(50));
  console.log("  ShaadiSahulat — Export Local DB to JSON");
  console.log("=".repeat(50));

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const client = new MongoClient(LOCAL_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const collections = await db.listCollections().toArray();
    console.log(`\nFound ${collections.length} collections\n`);

    let total = 0;
    for (const col of collections) {
      const name = col.name;
      const docs = await db.collection(name).find({}).toArray();
      const file = path.join(OUT_DIR, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2), "utf8");
      total += docs.length;
      console.log(`  [OK] ${name.padEnd(30)} ${docs.length} docs  →  exports/${name}.json`);
    }

    console.log("\n" + "=".repeat(50));
    console.log(`  Done! ${total} total documents exported`);
    console.log(`  Folder: ${OUT_DIR}`);
    console.log("=".repeat(50));
  } catch (err) {
    console.error("\n[ERROR]", err.message);
    if (err.message.includes("ECONNREFUSED"))
      console.error("  Local MongoDB not running. Open Compass first.");
  } finally {
    await client.close();
  }
}

exportAll();
