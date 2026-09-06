/**
 * Seed BNPL partner banks.
 *
 * Per spec: HBL (Habib Bank Limited) and MCB (MCB Bank Limited).
 * IBAN prefixes:
 *   HBL → PK36HBL
 *   MCB → PK36MCB
 *
 * Run: node seeds/seedBnplBanks.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const BnplBank = require("../models/BnplBank");

const BANKS = [
  {
    bank_id: "hbl",
    code: "HBL",
    name: "Habib Bank Limited",
    iban_prefix: "PK36HBL",
    active: true,
  },
  {
    bank_id: "mcb",
    code: "MCB",
    name: "MCB Bank Limited",
    iban_prefix: "PK36MCB",
    active: true,
  },
];

async function run() {
  await connectDB();
  for (const b of BANKS) {
    await BnplBank.findOneAndUpdate(
      { bank_id: b.bank_id },
      { $set: b },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`[seed] bank upserted: ${b.code} — ${b.name} (prefix ${b.iban_prefix})`);
  }
  console.log("[seed] Done. Bank officer login: officer@bank.com / bank123");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
