/**
 * BNPL Batch Service — aggregates accepted BNPL orders and releases the batch funds to Admin Wallet.
 * Runs on a 24h cycle or can be manually triggered by the Bank Officer / Admin.
 */
const BnplApplication = require("../models/BnplApplication");
const BnplBatchRelease = require("../models/BnplBatchRelease");
const AdminWallet = require("../models/AdminWallet");
const Order = require("../models/Order");
const Buyer = require("../models/Buyer");

async function generateBatchId() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  const count = await BnplBatchRelease.countDocuments({
    batch_id: { $regex: `^BATCH-${dateStr}` },
  });
  const seq = String(count + 1).padStart(2, "0");
  return `BATCH-${dateStr}-${seq}`;
}

/**
 * Executes a BNPL batch release:
 * 1. Finds unbatched applications in OFFER_ACCEPTED status
 * 2. Creates a BnplBatchRelease
 * 3. Credits AdminWallet with the total amount
 * 4. Updates each application with the batch_id
 */
async function runBnplBatchRelease() {
  try {
    // Find applications that are accepted and not yet assigned to any batch
    const pendingApps = await BnplApplication.find({
      status: { $in: ["OFFER_ACCEPTED", "APPROVED"] },
      $or: [{ batch_id: { $exists: false } }, { batch_id: "" }, { batch_id: null }],
    }).lean();

    if (!pendingApps || pendingApps.length === 0) {
      return { success: true, message: "No unbatched BNPL orders found", batch: null };
    }

    const orderIds = pendingApps.map((a) => a.order_id);
    const buyerIds = pendingApps.map((a) => a.buyer_id);

    const [orders, buyers] = await Promise.all([
      Order.find({ order_id: { $in: orderIds } }).lean(),
      Buyer.find({ buyer_id: { $in: buyerIds } }).lean(),
    ]);

    const orderMap = Object.fromEntries(orders.map((o) => [o.order_id, o]));
    const buyerMap = Object.fromEntries(buyers.map((b) => [b.buyer_id, b.name]));

    let totalAmount = 0;
    const batchOrders = [];

    for (const app of pendingApps) {
      const order = orderMap[app.order_id];
      const amount = order?.total_amount || app.amount || 0;
      totalAmount += amount;

      batchOrders.push({
        order_id: app.order_id,
        buyer_id: app.buyer_id,
        buyer_name: order?.buyer_name || buyerMap[app.buyer_id] || "Customer",
        amount,
        bnpl_app_no: app.application_no,
        accepted_at: app.updatedAt || app.created_at || new Date(),
      });
    }

    if (totalAmount <= 0) {
      return { success: true, message: "Batch total is 0", batch: null };
    }

    const batchId = await generateBatchId();
    const batch = await BnplBatchRelease.create({
      batch_id: batchId,
      release_date: new Date(),
      released_at: new Date(),
      total_amount: totalAmount,
      order_count: batchOrders.length,
      orders: batchOrders,
      status: "RELEASED",
      notes: `24-hour batch release of ${batchOrders.length} BNPL order(s) transferred from Bank to Admin.`,
    });

    // Mark applications with batch_id
    const appNos = pendingApps.map((a) => a.application_no);
    await BnplApplication.updateMany(
      { application_no: { $in: appNos } },
      { $set: { batch_id: batchId } }
    );

    // Credit AdminWallet
    let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
    if (!wallet) {
      wallet = await AdminWallet.create({ wallet_id: "admin_wallet_001", balance: 10_000_000 });
    }

    wallet.balance = (wallet.balance || 0) + totalAmount;
    wallet.ledger.push({
      type: "CREDIT",
      amount: totalAmount,
      description: `BNPL Batch Receipt from Bank (${batchId}) — ${batchOrders.length} order(s)`,
      ref_order_id: "",
      ref_payout_id: batchId,
      at: new Date(),
      by_admin_id: "bank_system",
    });
    await wallet.save();

    console.log(`[bnplBatchService] Successfully released batch ${batchId} for PKR ${totalAmount} (${batchOrders.length} orders).`);

    return {
      success: true,
      message: `Batch ${batchId} released with PKR ${totalAmount.toLocaleString()} across ${batchOrders.length} orders.`,
      batch,
    };
  } catch (err) {
    console.error("[bnplBatchService] Batch release failed:", err.message);
    throw err;
  }
}

module.exports = {
  runBnplBatchRelease,
};
