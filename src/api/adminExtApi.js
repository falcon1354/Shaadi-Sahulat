/**
 * Admin extensions API client — orders, disputes, wallet, payouts, BNPL oversight.
 */
const BASE = "http://localhost:5000/api/admin";

function _headers(adminId) {
  return { "x-user-id": adminId, "x-user-role": "admin" };
}

export async function listOrders(adminId, { status, q, page, limit } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  const url = `${BASE}/orders${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { headers: _headers(adminId) });
  return res.json();
}

// Orders with pending payment release (DELIVERED/RESOLVED with no payout yet).
// Each order is enriched with `release_due_at` (delivered_at + 24h) and
// `overdue` (true if now > release_due_at).
export async function listPendingReleaseOrders(adminId) {
  const res = await fetch(`${BASE}/orders/pending-release`, {
    headers: _headers(adminId),
  });
  return res.json();
}

// Aggregate sales timeline (past 30 days) — returns
// { success, count, timeline: [{ date, order_count, revenue }, ...] }
export async function getSalesTimeline(adminId) {
  const res = await fetch(`${BASE}/sales-timeline`, {
    headers: _headers(adminId),
  });
  return res.json();
}

// Marketplace breakdown — returns
// { success, top_buyers, top_sellers, categories, top_products }
export async function getBreakdown(adminId) {
  const res = await fetch(`${BASE}/breakdown`, {
    headers: _headers(adminId),
  });
  return res.json();
}

// Remove a seller (only allowed when product_count === 0). Backend returns
// 403 with `error` if the seller still has active product listings.
export async function removeSeller(adminId, sellerId) {
  const res = await fetch(`${BASE}/sellers/${sellerId}`, {
    method: "DELETE",
    headers: _headers(adminId),
  });
  return res.json();
}

export async function getOrderDetail(adminId, orderId) {
  const res = await fetch(`${BASE}/orders/${orderId}`, { headers: _headers(adminId) });
  return res.json();
}

export async function listDisputes(adminId) {
  const res = await fetch(`${BASE}/disputes`, { headers: _headers(adminId) });
  return res.json();
}

export async function releasePayment(adminId, orderId) {
  const res = await fetch(`${BASE}/orders/${orderId}/release-payment`, {
    method: "POST",
    headers: { ..._headers(adminId), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function getWallet(adminId) {
  const res = await fetch(`${BASE}/wallet`, { headers: _headers(adminId) });
  return res.json();
}

export async function getSellerPayouts(adminId, sellerId) {
  const res = await fetch(`${BASE}/sellers/${sellerId}/payouts`, {
    headers: _headers(adminId),
  });
  return res.json();
}

export async function listBnplApplications(adminId, status) {
  const url = status
    ? `${BASE}/bnpl/applications?status=${status}`
    : `${BASE}/bnpl/applications`;
  const res = await fetch(url, { headers: _headers(adminId) });
  return res.json();
}

export default {
  listOrders, listPendingReleaseOrders, getOrderDetail, listDisputes,
  releasePayment, getWallet, getSellerPayouts, listBnplApplications,
  getSalesTimeline, getBreakdown, removeSeller,
};
