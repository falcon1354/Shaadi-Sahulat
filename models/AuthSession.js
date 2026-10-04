/**
 * AuthSession — one document per issued refresh token.
 *
 * All tokens issued for one login share a `session_id` (the "family"). Each
 * rotation revokes the presented token (revoke_reason "rotated") and inserts a
 * new document in the same family, linked via `replaced_by`.
 *
 * Only a SHA-256 hash of the refresh token is stored — never the raw token.
 * Documents are purged by MongoDB's TTL monitor once `expires_at` passes.
 */

const mongoose = require("mongoose");

const authSessionSchema = new mongoose.Schema(
  {
    session_id:          { type: String, required: true, index: true },   // family id (JWT "sid")
    token_hash:          { type: String, required: true, unique: true },  // sha256(refresh token)
    user_kind:           { type: String, required: true, enum: ["buyer", "seller", "admin"] },
    user_id:             { type: String, required: true },                // buyer_id / seller_id / admin_id
    expires_at:          { type: Date,   required: true },                // sliding expiry (TTL)
    absolute_expires_at: { type: Date,   required: true },                // family hard cap
    last_used_at:        { type: Date,   default: null },
    revoked_at:          { type: Date,   default: null },
    revoke_reason:       { type: String, default: null },                 // rotated | logout | logout_all | reuse_detected | profile_invalid
    replaced_by:         { type: String, default: null },                 // token_hash of the successor
    user_agent:          { type: String, default: "" },
    ip:                  { type: String, default: "" },
  },
  {
    collection: "auth_sessions",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

authSessionSchema.index({ user_kind: 1, user_id: 1 });
authSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AuthSession", authSessionSchema);
