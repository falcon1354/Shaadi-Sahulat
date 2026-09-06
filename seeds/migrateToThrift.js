/**
 * Migrate Products to Thrift Marketplace
 * ========================================
 * 1. Changes condition "Used" → "Thrift" in all products
 * 2. Adds marketplace_type: "new" to all products that don't have it
 * 3. For products with condition "Thrift"/"Like New"/"Used", sets:
 *    - marketplace_type: "thrift"
 *    - is_final_sale: true
 *    - admin_approval_status: "approved" (existing products are already live)
 * 4. For categories without thrift items, shifts 1-2 products to thrift
 *    by changing their marketplace_type and condition
 * 5. Sets original_price for thrift items (original = price * 1.3-1.5)
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/shaadi-sahulat';
const MONGO_DB  = process.env.MONGO_DB   || 'shaadi-sahulat';
const PRODUCTS_COLLECTION = 'seller_products';

async function migrate() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  
  try {
    await client.connect();
    console.log('[MigrateThrift] Connected to MongoDB');
    const db = client.db(MONGO_DB);
    const col = db.collection(PRODUCTS_COLLECTION);

    // Step 1: Update all "Used" condition to "Thrift"
    const usedResult = await col.updateMany(
      { condition: 'Used' },
      { $set: { condition: 'Thrift' } }
    );
    console.log(`[MigrateThrift] Step 1: Changed ${usedResult.modifiedCount} products from "Used" → "Thrift"`);

    // Step 2: Set marketplace_type = "new" for all products that don't have it
    const newResult = await col.updateMany(
      { marketplace_type: { $exists: false } },
      { $set: { marketplace_type: 'new' } }
    );
    console.log(`[MigrateThrift] Step 2: Set marketplace_type="new" for ${newResult.modifiedCount} products`);

    // Step 3: Set thrift-specific fields for all thrift/like-new/used products
    const thriftResult = await col.updateMany(
      { condition: { $in: ['Thrift', 'Like New', 'Used'] } },
      {
        $set: {
          marketplace_type: 'thrift',
          is_final_sale: true,
          admin_approval_status: 'approved',
        },
      }
    );
    console.log(`[MigrateThrift] Step 3: Set thrift fields for ${thriftResult.modifiedCount} products`);

    // Step 4: Set original_price for thrift items that don't have one
    const thriftProducts = await col.find({
      marketplace_type: 'thrift',
      $or: [
        { original_price: { $exists: false } },
        { original_price: null },
      ],
    }).toArray();

    let originalPriceUpdated = 0;
    for (const product of thriftProducts) {
      const multiplier = 1.3 + Math.random() * 0.2; // 1.3x to 1.5x
      const originalPrice = Math.round(product.price * multiplier);
      await col.updateOne(
        { product_id: product.product_id },
        { $set: { original_price: originalPrice } }
      );
      originalPriceUpdated++;
    }
    console.log(`[MigrateThrift] Step 4: Set original_price for ${originalPriceUpdated} thrift products`);

    // Step 5: For categories without any thrift items, shift some products to thrift
    const categories = await col.distinct('major_category', { availability_status: 'available' });
    let shiftedCount = 0;

    for (const category of categories) {
      const thriftCount = await col.countDocuments({
        major_category: category,
        marketplace_type: 'thrift',
        availability_status: 'available',
      });

      if (thriftCount === 0) {
        // Find the cheapest products in this category to shift to thrift
        const candidates = await col.find({
          major_category: category,
          marketplace_type: 'new',
          availability_status: 'available',
          condition: 'New',
        }).sort({ price: 1 }).limit(2).toArray();

        for (const product of candidates) {
          const multiplier = 1.3 + Math.random() * 0.2;
          const originalPrice = Math.round(product.price * multiplier);
          const discountPrice = Math.round(product.price * 0.7); // 30% off for thrift

          await col.updateOne(
            { product_id: product.product_id },
            {
              $set: {
                marketplace_type: 'thrift',
                condition: 'Thrift',
                is_final_sale: true,
                admin_approval_status: 'approved',
                original_price: originalPrice,
                discount_price: discountPrice,
                stock_quantity: 1,
              },
            }
          );
          shiftedCount++;
          console.log(`[MigrateThrift] Shifted "${product.title}" (${product.product_id}) to thrift in ${category}`);
        }
      }
    }
    console.log(`[MigrateThrift] Step 5: Shifted ${shiftedCount} products to thrift for category coverage`);

    // Summary
    const totalNew = await col.countDocuments({ marketplace_type: 'new' });
    const totalThrift = await col.countDocuments({ marketplace_type: 'thrift' });
    console.log(`\n[MigrateThrift] Migration complete!`);
    console.log(`  New products:    ${totalNew}`);
    console.log(`  Thrift products:  ${totalThrift}`);

  } catch (err) {
    console.error('[MigrateThrift] Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
