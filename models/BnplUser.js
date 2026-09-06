/**
 * BNPL buyer profile — extends the host Buyer collection.
 *
 * The Buyer collection itself does NOT carry CNIC (it is a wedding
 * marketplace, not a KYC system). The BNPL profile is the place where
 * sensitive PII (CNIC) is stored, AES-256-GCM encrypted at rest.
 *
 * The `buyer_id` field references Buyer.buyer_id (a string) so the BNPL
 * module stays loosely coupled to the host project.
 */
const mongoose = require("mongoose");

const bnplUserSchema = new mongoose.Schema(
  {
    buyer_id:   { type: String, required: true, unique: true, index: true },
    full_name:  { type: String, default: "" },
    phone:      { type: String, default: "" },
    cnic_enc:   { type: String, default: "" },   // AES-256-GCM ciphertext
    address:    { type: String, default: "" },   // plaintext (already in Buyer)
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("BnplUser", bnplUserSchema, "bnpl_users");
