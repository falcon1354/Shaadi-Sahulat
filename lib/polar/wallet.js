/**
 * Admin wallet movements for Polar card payments.
 * Credit the captured PKR total when Polar confirms payment.
 * Debit it back when that charge is refunded (before seller release).
 */
const AdminWallet = require("../../models/AdminWallet");

async function getWallet() {
  let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
  if (!wallet) {
    wallet = await AdminWallet.create({ wallet_id: "admin_wallet_001", balance: 10_000_000 });
  }
  return wallet;
}

async function creditPolarReceipt(tx) {
  if (tx.wallet_credited) return;
  const wallet = await getWallet();
  const ref = tx.transaction_id;
  const already = (wallet.ledger || []).some(
    (e) => e.type === "CREDIT" && e.ref_order_id === ref && String(e.description).includes("Polar.sh")
  );
  if (!already) {
    wallet.balance = (wallet.balance || 0) + tx.total_amount_pkr;
    wallet.ledger.push({
      type: "CREDIT",
      amount: tx.total_amount_pkr,
      description: `Polar.sh payment received (${tx.transaction_id})`,
      ref_order_id: ref,
      at: new Date(),
      by_admin_id: "polar",
    });
    await wallet.save();
  }
  tx.wallet_credited = true;
}

async function debitPolarAmount({ amountPkr, refId, description, adminId }) {
  const amount = Math.round(Number(amountPkr) || 0);
  if (amount <= 0) return false;
  const wallet = await getWallet();
  const already = (wallet.ledger || []).some(
    (e) => e.type === "DEBIT" && e.ref_order_id === refId && e.description === description
  );
  if (already) return false;
  wallet.balance = (wallet.balance || 0) - amount;
  wallet.ledger.push({
    type: "DEBIT",
    amount,
    description,
    ref_order_id: refId,
    at: new Date(),
    by_admin_id: adminId || "polar",
  });
  await wallet.save();
  return true;
}

module.exports = { creditPolarReceipt, debitPolarAmount };
