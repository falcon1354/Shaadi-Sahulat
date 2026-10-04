/**
 * A buyer/seller sign-up that has NOT been confirmed by email OTP yet.
 *
 * The real Buyer / Seller account is only created after the 6-digit code sent to
 * the address is verified (POST /api/auth/register/verify). Until then everything
 * lives here:
 *   - password_hash            bcrypt hash (never the plaintext password)
 *   - otp_hash                 HMAC-SHA256 of the OTP (never the plaintext code)
 *   - registration_token_hash  SHA-256 of the handle returned only to the browser
 *                              that submitted the form (binds OTP entry to it)
 * One pending record per normalized email (across portals). Stale records are
 * removed automatically by the TTL index on `expires_at`.
 */
const mongoose = require("mongoose");

const pendingRegistrationSchema = new mongoose.Schema(
  {
    email:            { type: String, required: true },               // as entered (trimmed)
    normalized_email: { type: String, required: true, unique: true },
    portal:           { type: String, required: true, enum: ["buyer", "seller"] },
    name:             { type: String, required: true },
    phone:            { type: String, default: "" },
    city:             { type: String, default: "" },
    seller_type:      { type: String, enum: ["individual", "company", null], default: null },
    password_hash:    { type: String, required: true },

    otp_hash:         { type: String },
    otp_expires_at:   { type: Date },
    otp_attempts:     { type: Number, default: 0 },
    last_otp_sent_at: { type: Date },
    otp_send_count:   { type: Number, default: 0 },

    registration_token_hash: { type: String, required: true },
    status:           { type: String, enum: ["pending", "creating"], default: "pending" },
    expires_at:       { type: Date, required: true },                 // TTL: whole record
  },
  {
    collection: "pending_registrations",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// MongoDB deletes each record once expires_at has passed (checked about every 60 s).
pendingRegistrationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema);
