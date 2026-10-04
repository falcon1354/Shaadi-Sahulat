/**
 * Stock Service — manages product inventory reduction and restoration.
 * Wraps inventory routines for orders, cancellations, and disputes.
 */
const Order = require("../models/Order");
const { deductStockForOrderItems, restoreStockForOrderItems } = require("../lib/inventory");

/**
 * Deduct stock for an array of order items (called during checkout).
 * @param {Array} items
 */
async function reduceStock(items) {
  if (!items || !items.length) return [];
  return await deductStockForOrderItems(items);
}

/**
 * Restore stock for all items in an order by order_id.
 * Called when:
 * - Admin cancels an order
 * - Seller cancels an order before shipment
 * - BNPL application is rejected or expired or declined
 * - Dispute outcome is BUYER_WINS (with order cancellation)
 * @param {string} orderId
 */
async function restoreStock(orderId) {
  if (!orderId) return;
  try {
    const order = await Order.findOne({ order_id: orderId }).lean();
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      return;
    }
    await restoreStockForOrderItems(order.items);
    console.log(`[stockService] Restored stock for order ${orderId} (${order.items.length} items).`);
  } catch (err) {
    console.error(`[stockService] Failed to restore stock for order ${orderId}:`, err.message);
  }
}

module.exports = {
  reduceStock,
  restoreStock,
};
