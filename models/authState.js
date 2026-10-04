/**
 * Shared `auth` sub-document schema (not a model) embedded in Buyer and Admin.
 * The Flask-owned `sellers` collection stores the same shape under `auth`.
 */

const mongoose = require("mongoose");

module.exports = new mongoose.Schema(
  {
    email_verified:      { type: Boolean },   // absent on legacy accounts = treated as verified
    email_verified_at:   { type: Date },
    token_version:       { type: Number, default: 0 },
    failed_logins:       { type: Number, default: 0 },
    lock_until:          { type: Date },
    // One-time tokens: ONLY purpose-bound SHA-256 hashes are stored (lib/tokens.js).
    verify_token_hash:   { type: String },
    verify_expires:      { type: Date },
    verify_sent_at:      { type: Date },
    // Hash of the last CONSUMED verification token — lets a re-opened link show
    // "already verified" instead of "invalid". It can never verify anything again.
    verify_used_hash:    { type: String },
    reset_token_hash:    { type: String },
    reset_expires:       { type: Date },
    reset_requested_at:  { type: Date },
    password_changed_at: { type: Date },
    last_login_at:       { type: Date },
    login_disabled:      { type: Boolean },
  },
  { _id: false }
);
