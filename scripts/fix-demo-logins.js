/**
 * fix-demo-logins.js — reset demo credentials for local development.
 *
 *   node scripts/fix-demo-logins.js
 *
 * Credentials are NEVER hardcoded. They come from:
 *   ADMIN_SEED_EMAIL + ADMIN_SEED_PASSWORD   (required)
 *   DEMO_BUYER_PASSWORD                      (optional — demo buyers skipped when absent)
 * or an interactive hidden prompt when run in a terminal.
 *
 * Every reset bumps auth.token_version, clears lockout state and revokes all
 * refresh sessions of the affected accounts. Passwords are never printed.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Buyer = require("../models/Buyer");
const Admin = require("../models/Admin");
const AuthSession = require("../models/AuthSession");
const { hashPassword } = require("../lib/passwords");
const { resolveAdminSeedCredentials, resolveDemoBuyerPassword } = require("../lib/seedCredentials");

const DEMO_BUYERS = [
  { buyer_id: "BUY-001", name: "Aisha Khan",  email: "aisha@example.com",  phone: "03001234567", city: "Lahore" },
  { buyer_id: "BUY-002", name: "Usman Ali",   email: "usman@example.com",  phone: "03119876543", city: "Karachi" },
  { buyer_id: "BUY-003", name: "Fatima Noor", email: "fatima@example.com", phone: "03217654321", city: "Islamabad" },
];

const RESET_AUTH = {
  "auth.failed_logins": 0,
};

async function revokeSessions(kind, id) {
  await AuthSession.updateMany(
    { user_kind: kind, user_id: id, revoked_at: null },
    { $set: { revoked_at: new Date(), revoke_reason: "password_reset_script" } }
  );
}

(async () => {
  // Resolve (and validate) credentials BEFORE connecting — fail fast, nothing written.
  const admin = await resolveAdminSeedCredentials();
  const buyerPassword = await resolveDemoBuyerPassword();

  await mongoose.connect(process.env.MONGODB_URI);
  const now = new Date();

  // ── Admin ──────────────────────────────────────────────────────────────────
  const existing = await Admin.findOne({ email: admin.email }).select("admin_id").lean();
  const adminUpdate = {
    $set: { password_hash: await hashPassword(admin.password), "auth.password_changed_at": now, ...RESET_AUTH },
    $inc: { "auth.token_version": 1 },
    $unset: { "auth.lock_until": "" },
  };
  if (existing) {
    await Admin.updateOne({ admin_id: existing.admin_id }, adminUpdate);
    await revokeSessions("admin", existing.admin_id);
    console.log(`admin password reset: ${admin.email} (${existing.admin_id})`);
  } else {
    const idTaken = await Admin.findOne({ admin_id: "admin_001" }).select("_id").lean();
    if (idTaken) throw new Error("ADMIN_SEED_EMAIL does not match the existing admin_001 account.");
    await Admin.create({
      admin_id: "admin_001",
      name: admin.name,
      email: admin.email,
      password_hash: adminUpdate.$set.password_hash,
      auth: { email_verified: true, token_version: 0, failed_logins: 0, password_changed_at: now },
    });
    console.log(`admin created: ${admin.email} (admin_001)`);
  }

  // ── Demo buyers (optional) ─────────────────────────────────────────────────
  if (!buyerPassword) {
    console.log("demo buyers skipped (set DEMO_BUYER_PASSWORD to reset them)");
  } else {
    const hash = await hashPassword(buyerPassword);
    for (const { buyer_id, ...profile } of DEMO_BUYERS) {
      const doc = await Buyer.findOneAndUpdate(
        { email: profile.email },
        {
          $set: { ...profile, password_hash: hash, dowry_done: true, level: "Bronze", "auth.password_changed_at": now, ...RESET_AUTH },
          $inc: { "auth.token_version": 1 },
          $unset: { "auth.lock_until": "" },
          // buyer_id only on insert: never re-key an existing buyer (orders/BNPL/disputes reference it)
          $setOnInsert: { buyer_id, wishlist_items: [], cart_items: [], recently_viewed_items: [], saved_addresses: [] },
        },
        { upsert: true, new: true }
      ).select("buyer_id email").lean();
      await revokeSessions("buyer", doc.buyer_id);
      console.log(`demo buyer reset: ${doc.email}`);
    }
  }

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(`[fix-demo-logins] ${e.message}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
