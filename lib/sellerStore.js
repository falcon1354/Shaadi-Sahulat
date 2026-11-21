/**
 * Direct MongoDB seller creation, used when visual-ml-service is NOT deployed
 * (VISUAL_ML_URL unset) — the same condition as lib/productCatalog.js.
 *
 * Mirrors visual-ml-service POST /seller/internal/create exactly
 * (seller_routes.internal_create_seller + mongo_seller.create_seller):
 *   - seller_id  "sel_" + 12 hex chars; email trimmed + lowercased; name/phone/city trimmed
 *   - seller_type "individual" | "company" (anything else → individual);
 *     max_listings 5 for individual, null (unlimited) for company; category_restriction null
 *   - password_hash must be a bcrypt hash computed by Node (never a plain password)
 *   - auth sub-document whitelisted with the same types as Flask's _clean_auth_state
 *   - duplicate email → { success:false, code:"EMAIL_IN_USE" } (same shape as Flask's 409)
 *   - the returned seller never contains password_hash, auth or _id
 * It does not create indexes (no schema changes in production). Duplicate sign-ups are already
 * prevented upstream (atomic claim of the pending registration + cross-role email check);
 * this adds an email lookup and maps a duplicate-key error to EMAIL_IN_USE.
 */
const crypto = require("crypto");
const mongoose = require("mongoose");

const SELLERS_COLLECTION = "sellers";
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const AUTH_BOOL_FIELDS = ["email_verified"];
const AUTH_INT_FIELDS = ["token_version", "failed_logins"];
const AUTH_DATE_FIELDS = ["password_changed_at", "last_login_at"];

/** True when sellers must be created here instead of through visual-ml-service. */
function useDirectSellerStore(env = process.env) {
  return !String(env.VISUAL_ML_URL || "").trim();
}

function sellerTypeRules(sellerType) {
  const type = sellerType === "company" ? "company" : "individual";
  return { seller_type: type, max_listings: type === "company" ? null : 5 };
}

function cleanAuthState(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const auth = {};
  for (const k of AUTH_BOOL_FIELDS) if (typeof src[k] === "boolean") auth[k] = src[k];
  for (const k of AUTH_INT_FIELDS) if (Number.isInteger(src[k]) && src[k] >= 0) auth[k] = src[k];
  for (const k of AUTH_DATE_FIELDS) {
    const v = src[k];
    if (typeof v === "string" || v instanceof Date) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) auth[k] = d;
    }
  }
  if (auth.token_version === undefined) auth.token_version = 0;
  if (auth.failed_logins === undefined) auth.failed_logins = 0;
  return auth;
}

function publicSeller(doc) {
  const { _id, password_hash, auth, ...rest } = doc; // eslint-disable-line no-unused-vars
  return rest;
}

function _col() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  return db.collection(SELLERS_COLLECTION);
}

/**
 * Same inputs and result shape as services/sellerClient.createSellerInternal().
 * @returns {Promise<{success:true, seller:object} | {success:false, code?:string, error:string}>}
 */
async function createSellerDirect({ name, email, phone = "", city = "", seller_type, password_hash, auth } = {}) {
  if (typeof name !== "string" || !name.trim()) return { success: false, error: "name is required" };
  if (typeof email !== "string" || !email.includes("@")) return { success: false, error: "valid email is required" };
  if (typeof password_hash !== "string" || !BCRYPT_RE.test(password_hash)) {
    return { success: false, error: "bcrypt password_hash is required" };
  }
  if (typeof phone !== "string" || typeof city !== "string") return { success: false, error: "phone and city must be strings" };

  const col = _col();
  const normalized = email.trim().toLowerCase();
  if (await col.findOne({ email: normalized }, { projection: { _id: 1 } })) {
    return { success: false, code: "EMAIL_IN_USE", error: "Email already registered." };
  }
  const now = new Date();
  const doc = {
    seller_id: `sel_${crypto.randomBytes(6).toString("hex")}`,
    name: name.trim(),
    email: normalized,
    phone: phone.trim(),
    city: city.trim(),
    password_hash,
    ...sellerTypeRules(seller_type),
    category_restriction: null,
    completed_orders: 0,
    created_at: now,
    updated_at: now,
    auth: cleanAuthState(auth),
  };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if (err && err.code === 11000) return { success: false, code: "EMAIL_IN_USE", error: "Email already registered." };
    throw err;
  }
  return { success: true, seller: publicSeller(doc) };
}

module.exports = { useDirectSellerStore, sellerTypeRules, cleanAuthState, createSellerDirect, BCRYPT_RE };
