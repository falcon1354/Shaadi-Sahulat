/**
 * seedThriftMarketplace.js — V3 Seed: Update existing products to Thrift
 *
 * This script does NOT create new products. Instead, it updates EXISTING
 * products in the seller_products collection to mark them as "thrift":
 *   - Sets marketplace_type: "thrift"
 *   - Sets condition: "Thrift" or "Like New" or "Good" or "Fair"
 *   - Sets condition_detail: "Like New" | "Good" | "Fair"
 *   - Sets stock_quantity: 1 (thrift items are always 1 unit)
 *   - Sets is_final_sale: true
 *   - Sets thrift_approval_status: "approved" (for demo data)
 *   - Optionally sets original_price (for "was PKR X" display)
 *   - Reduces price by 30-60% for thrift items
 *
 * Run from backend/ folder:
 *   node seeds/seedThriftMarketplace.js
 *
 * Must run AFTER seed_all_categories.py (which creates the products)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/shaadi-sahulat";

// ── Thrift conversion rules ──────────────────────────────────────────────
// For each category, we'll convert some products to thrift.
// The condition_detail and price reduction are based on the category.

const THRIFT_RULES = [
  {
    category: "wedding_dress",
    convertCount: 3,  // convert 3 wedding dress products to thrift
    conditions: ["Like New", "Good", "Fair"],
    priceReduction: [0.4, 0.5, 0.6],  // 40%, 50%, 60% off original price
    originalPriceRatio: 1.0, // original_price = original price before reduction
  },
  {
    category: "furniture",
    convertCount: 2,
    conditions: ["Like New", "Good"],
    priceReduction: [0.35, 0.5],
    originalPriceRatio: 1.0,
  },
  {
    category: "electronics",
    convertCount: 2,
    conditions: ["Good", "Fair"],
    priceReduction: [0.45, 0.6],
    originalPriceRatio: 1.0,
  },
  {
    category: "kitchen_items",
    convertCount: 2,
    conditions: ["Like New", "Good"],
    priceReduction: [0.3, 0.45],
    originalPriceRatio: 1.0,
  },
  {
    category: "decoration",
    convertCount: 1,
    conditions: ["Good"],
    priceReduction: [0.5],
    originalPriceRatio: 1.0,
  },
  {
    category: "miscellaneous",
    convertCount: 1,
    conditions: ["Fair"],
    priceReduction: [0.55],
    originalPriceRatio: 1.0,
  },
];

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  ShaadiSahulat — Thrift Marketplace Seed (V3)");
  console.log("  Converting existing products to Thrift");
  console.log("=".repeat(70));

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const db = mongoose.connection.db;
  const products = db.collection("seller_products");

  let totalConverted = 0;

  for (const rule of THRIFT_RULES) {
    // Find products in this category that are NOT already thrift
    const candidates = await products.find({
      major_category: rule.category,
      marketplace_type: { $ne: "thrift" },
      availability_status: "available",
    }).limit(rule.convertCount).toArray();

    if (candidates.length === 0) {
      console.log(`  [${rule.category}] No products found to convert.`);
      continue;
    }

    for (let i = 0; i < candidates.length && i < rule.convertCount; i++) {
      const product = candidates[i];
      const conditionDetail = rule.conditions[i % rule.conditions.length];
      const priceReduction = rule.priceReduction[i % rule.priceReduction.length];
      const originalPrice = product.price;
      const newPrice = Math.round(originalPrice * (1 - priceReduction));
      const discountPrice = newPrice; // thrift price IS the discount price

      await products.updateOne(
        { product_id: product.product_id },
        {
          $set: {
            marketplace_type: "thrift",
            condition: "Thrift",
            condition_detail: conditionDetail,
            stock_quantity: 1,
            is_final_sale: true,
            thrift_approval_status: "approved",
            original_price: originalPrice,
            price: newPrice,
            discount_price: null,
            discount_pct: null,
            updated_at: new Date(),
          },
        }
      );

      console.log(`  ✓ [${rule.category}] ${product.title?.slice(0, 40) || product.product_id} → Thrift (${conditionDetail}) PKR ${originalPrice} → PKR ${newPrice} (-${Math.round(priceReduction * 100)}%)`);
      totalConverted++;
    }
  }

  // Also ensure all remaining "New" products have marketplace_type set
  const newResult = await products.updateMany(
    { marketplace_type: { $exists: false } },
    { $set: { marketplace_type: "new", thrift_approval_status: "approved", is_final_sale: false, condition_detail: "New" } }
  );
  console.log(`\n  Set ${newResult.modifiedCount} remaining products to marketplace_type: "new".`);

  // Count thrift vs new
  const thriftCount = await products.countDocuments({ marketplace_type: "thrift" });
  const newCount = await products.countDocuments({ marketplace_type: "new" });
  const totalCount = await products.countDocuments({});

  console.log("\n" + "=".repeat(70));
  console.log(`  THRIFT SEED COMPLETE!`);
  console.log(`  Total converted to thrift: ${totalConverted}`);
  console.log(`  New products: ${newCount}`);
  console.log(`  Thrift products: ${thriftCount}`);
  console.log(`  Total products: ${totalCount}`);
  console.log("=".repeat(70) + "\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seedThrift] Error:", err.message);
  process.exit(1);
});
