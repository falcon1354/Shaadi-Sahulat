/**
 * Review + Notification API clients.
 */
const REV_BASE = "http://localhost:5000/api/reviews";
const NTF_BASE = "http://localhost:5000/api/notifications";

// ── Reviews ────────────────────────────────────────────────────────────────

export async function getProductReviews(productId) {
  const res = await fetch(`${REV_BASE}/product/${productId}`);
  return res.json();
}

export async function getSellerRating(sellerId) {
  const res = await fetch(`${REV_BASE}/seller/${sellerId}`);
  return res.json();
}

/** Seller: list ALL reviews for the seller's products (visible + hidden). */
export async function getSellerAllReviews(sellerId) {
  const res = await fetch(`${REV_BASE}/seller/${sellerId}/all`);
  return res.json();
}

/** Admin: list ALL reviews across the platform. */
export async function getAdminAllReviews({ q, min_rating, max_rating } = {}) {
  const params = new URLSearchParams();
  if (q)           params.set('q', q);
  if (min_rating)  params.set('min_rating', min_rating);
  if (max_rating)  params.set('max_rating', max_rating);
  const qs = params.toString();
  const res = await fetch(`${REV_BASE}/admin/all${qs ? `?${qs}` : ''}`);
  return res.json();
}

// ── Notifications ──────────────────────────────────────────────────────────

export async function listNotifications(userId, role) {
  const res = await fetch(`${NTF_BASE}/?user_id=${userId}&role=${role}`);
  return res.json();
}

export async function markNotificationRead(id) {
  const res = await fetch(`${NTF_BASE}/${id}/read`, { method: "POST" });
  return res.json();
}

export async function markAllNotificationsRead(userId, role) {
  const res = await fetch(`${NTF_BASE}/read-all?user_id=${userId}&role=${role}`, {
    method: "POST",
  });
  return res.json();
}

export default {
  getProductReviews, getSellerRating, getSellerAllReviews, getAdminAllReviews,
  listNotifications, markNotificationRead, markAllNotificationsRead,
};
