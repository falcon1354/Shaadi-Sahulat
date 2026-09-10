/**
 * Inventory helpers — decrement stock when an order is placed (sale),
 * restore when an order is cancelled before fulfillment.
 *
 * Marketplace listings live in MongoDB `seller_products` (seller uploads /
 * thrift). Older catalog rows may also exist in `products`.
 */
const mongoose = require("mongoose");

const PRODUCT_COLLECTIONS = ["seller_products", "products"];

function _qtyByProduct(items) {
  const map = new Map();
  for (const it of items || []) {
    const pid = it.product_id;
    if (!pid) continue;
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    map.set(pid, (map.get(pid) || 0) + qty);
  }
  return map;
}

function _col(name) {
  if (!mongoose.connection?.db) {
    throw new Error("Database not connected");
  }
  return mongoose.connection.db.collection(name);
}

/** Native driver findOneAndUpdate — returns the updated doc (or null). */
async function _findOneAndUpdate(col, filter, update) {
  const result = await col.findOneAndUpdate(filter, update, {
    returnDocument: "after",
  });
  // Driver v4 returns { value }, v6+ may return the doc directly
  if (result == null) return null;
  if (result.value !== undefined) return result.value;
  return result;
}

async function _findProduct(product_id) {
  for (const name of PRODUCT_COLLECTIONS) {
    const doc = await _col(name).findOne({ product_id });
    if (doc) return { doc, collection: name };
  }
  return null;
}

/**
 * Atomically deduct stock for each product line.
 * On insufficient stock / missing product, rolls back prior deductions and throws.
 *
 * When stock hits 0 → is_available=false, availability_status="sold".
 */
async function deductStockForOrderItems(items) {
  const byPid = _qtyByProduct(items);
  const deducted = [];

  try {
    for (const [product_id, qty] of byPid.entries()) {
      const found = await _findProduct(product_id);
      if (!found) {
        throw new Error(`Product ${product_id} is no longer listed`);
      }

      const { collection } = found;
      const col = _col(collection);

      // Treat missing stock_quantity as in-stock (legacy rows)
      const stockFilter = {
        product_id,
        $or: [
          { stock_quantity: { $gte: qty } },
          { stock_quantity: { $exists: false } },
          { stock_quantity: null },
        ],
      };

      let prod = await _findOneAndUpdate(col, stockFilter, {
        $inc: {
          stock_quantity: -qty,
          total_sold: qty,
          orders_count: 1,
        },
      });

      // If stock was null/missing, $inc may create negative from null in some cases —
      // re-read and normalize.
      if (!prod) {
        const available = Number(found.doc.stock_quantity);
        const avail = Number.isFinite(available) ? available : 0;
        throw new Error(
          `Insufficient stock for "${found.doc.title || found.doc.name || product_id}". ` +
            `Available: ${avail}, requested: ${qty}`
        );
      }

      // If stock was missing, $inc from null can yield NaN/null — coerce
      if (prod.stock_quantity == null || Number.isNaN(prod.stock_quantity)) {
        const next = Math.max(0, (Number(found.doc.stock_quantity) || qty) - qty);
        await col.updateOne(
          { product_id },
          { $set: { stock_quantity: next } }
        );
        prod = { ...prod, stock_quantity: next };
      }

      if (prod.stock_quantity <= 0) {
        await col.updateOne(
          { product_id },
          {
            $set: {
              stock_quantity: 0,
              is_available: false,
              availability_status: "sold",
            },
          }
        );
      }

      deducted.push({ product_id, qty, collection });
    }
  } catch (err) {
    if (deducted.length) {
      await restoreStockForOrderItems(deducted).catch((e) =>
        console.warn("[inventory] rollback failed:", e.message)
      );
    }
    throw err;
  }

  return deducted;
}

/**
 * Restore stock after a cancelled / rejected sale.
 * Re-opens listing as available when stock becomes > 0.
 */
async function restoreStockForOrderItems(items) {
  // Prefer collection recorded during deduct; otherwise resolve by product_id
  const byPid = new Map();
  for (const it of items || []) {
    const pid = it.product_id;
    if (!pid) continue;
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    const prev = byPid.get(pid) || { qty: 0, collection: it.collection || null };
    prev.qty += qty;
    if (it.collection) prev.collection = it.collection;
    byPid.set(pid, prev);
  }

  for (const [product_id, { qty, collection: knownCol }] of byPid.entries()) {
    let collection = knownCol;
    if (!collection) {
      const found = await _findProduct(product_id);
      if (!found) continue;
      collection = found.collection;
    }
    const col = _col(collection);

    const prod = await _findOneAndUpdate(
      col,
      { product_id },
      {
        $inc: {
          stock_quantity: qty,
          total_sold: -qty,
          orders_count: -1,
        },
      }
    );
    if (!prod) continue;

    const patch = {};
    if ((prod.total_sold || 0) < 0) patch.total_sold = 0;
    if ((prod.orders_count || 0) < 0) patch.orders_count = 0;

    if (prod.stock_quantity > 0) {
      patch.is_available = true;
      if (prod.availability_status === "sold") {
        patch.availability_status = "available";
      }
    }

    if (Object.keys(patch).length) {
      await col.updateOne({ product_id }, { $set: patch });
    }
  }
}

module.exports = {
  deductStockForOrderItems,
  restoreStockForOrderItems,
};
