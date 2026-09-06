/**
 * BNPL partner bank — Habib Bank Limited, MCB Bank, United Bank, etc.
 * Seeded by backend/seeds/seedBnpl.js. The bank officer logs in against
 * a hardcoded dummy account (see backend/bnpl/routes/bank.js) — the
 * bank record itself is the source of truth for IBAN prefix validation
 * and the bank name shown on the buyer application form.
 */
const mongoose = require("mongoose");

const bnplBankSchema = new mongoose.Schema(
  {
    bank_id:     { type: String, required: true, unique: true }, // "hbl", "mcb", "ubl"
    code:        { type: String, required: true, unique: true }, // HBL, MCB, UBL
    name:        { type: String, required: true },               // Habib Bank Limited
    iban_prefix: { type: String, required: true },               // PK36HBL ...
    active:      { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("BnplBank", bnplBankSchema, "bnpl_banks");
