/**
 * Admin extensions API client — orders, disputes, wallet, payouts, BNPL oversight.
 */
const BASE = "http://localhost:5000/api/admin";

function _headers(adminId) {
  return { "x-user-id": adminId, "x-user-role": "admin" };
}

export async function listOrders(adminId, { status, q } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const url = `${BASE}/orders${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { headers: _headers(adminId) });
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
  listOrders, getOrderDetail, listDisputes, releasePayment,
  getWallet, getSellerPayouts, listBnplApplications,
};
