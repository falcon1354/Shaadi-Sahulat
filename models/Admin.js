const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const authStateSchema = require("./authState");

const adminSchema = new mongoose.Schema(
  {
    admin_id:      { type: String, required: true, unique: true },
    name:          { type: String, required: true },
    email:         { type: String, required: true, unique: true, lowercase: true },
    password_hash: { type: String, required: true },
    // Auth state (JWT auth). Hidden unless explicitly selected ("+auth").
    auth:          { type: authStateSchema, select: false, default: undefined },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

adminSchema.methods.checkPassword = function (plain) {
  return bcrypt.compareSync(plain, this.password_hash);
};

// One-time token lookups (password reset / email verification) — sparse, hashes only.
adminSchema.index({ "auth.reset_token_hash": 1 }, { sparse: true });
adminSchema.index({ "auth.verify_token_hash": 1 }, { sparse: true });

module.exports = mongoose.model("Admin", adminSchema);
