/**
 * Seed AdminWallet with starting balance PKR 10,000,000 (dummy, FYP only).
 *
 * Run: node seeds/seedAdminWallet.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const AdminWallet = require("../models/AdminWallet");

async function run() {
  await connectDB();
  const wallet = await AdminWallet.findOneAndUpdate(
    { wallet_id: "admin_wallet_001" },
    {
      $setOnInsert: {
        wallet_id: "admin_wallet_001",
        balance: 10_000_000,
        currency: "PKR",
        ledger: [{
          type: "CREDIT",
          amount: 10_000_000,
          description: "Initial dummy balance for FYP",
          at: new Date(),
          by_admin_id: "seed",
        }],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`[seed] AdminWallet ready. Balance: PKR ${(wallet.balance || 0).toLocaleString()}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
