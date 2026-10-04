/**
 * Client storage hygiene for the JWT auth migration.
 *
 * Nothing here stores or reads authentication. Old identity keys are deleted
 * WITHOUT being read, and per-user caches are cleared on logout.
 */

/** Pre-JWT identity keys. They must never be used for authentication again. */
export const LEGACY_AUTH_KEYS = ["ss_buyer", "ss_seller", "ss_admin", "ss_active_role", "ss_auth_changed"];

function _remove(storage, key) {
  try { storage?.removeItem(key); } catch { /* storage unavailable (private mode etc.) */ }
}

function _storages() {
  const out = [];
  try { if (typeof localStorage !== "undefined") out.push(localStorage); } catch { /* ignore */ }
  try { if (typeof sessionStorage !== "undefined") out.push(sessionStorage); } catch { /* ignore */ }
  return out;
}

/** One-time compatibility cleanup: delete legacy identity keys (values are never read). */
export function purgeLegacyAuthStorage() {
  for (const storage of _storages()) {
    for (const key of LEGACY_AUTH_KEYS) _remove(storage, key);
  }
}

/**
 * Logout cleanup. Clears caches that are shared between users of the same
 * browser (`ss_dowry_latest`, un-keyed `ss_wishlist`) and the signed-out buyer's
 * DB-backed caches (re-hydrated from MongoDB at the next login).
 *
 * `ss_cart_<buyerId>` is intentionally KEPT: the cart is not synced to the
 * database, so this key is the only copy of the buyer's cart. It is keyed per
 * buyer, so another account on this browser never sees it.
 */
export function clearUserCaches(user) {
  const keys = ["ss_dowry_latest", "ss_wishlist"];
  if (user?.role === "buyer" && user.id) {
    keys.push(`ss_dowry_${user.id}`, `ss_wishlist_${user.id}`, `ss_recently_viewed_${user.id}`);
  }
  for (const storage of _storages()) {
    for (const key of keys) _remove(storage, key);
  }
}
