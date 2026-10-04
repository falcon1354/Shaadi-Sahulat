/**
 * Dispute API client — chat, seller 48h response, admin outcomes, SLA.
 */
import { authFetch } from "./http";
const BASE = "http://localhost:5000/api/disputes";

export async function listDisputes(role, id, filter) {
  const q = new URLSearchParams({ role, id });
  if (filter) q.set("filter", filter);
  const res = await authFetch(`${BASE}/?${q}`);
  return res.json();
}

export async function getDispute(disputeId) {
  const res = await authFetch(`${BASE}/${disputeId}`);
  return res.json();
}

export async function getSlaMeta() {
  const res = await authFetch(`${BASE}/meta/sla`);
  return res.json();
}

export async function sendMessage(disputeId, { fromRole, fromId, fromName, message }) {
  const res = await authFetch(`${BASE}/${disputeId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from_role: fromRole,
      from_id: fromId,
      from_name: fromName,
      message,
    }),
  });
  return res.json();
}

export async function uploadEvidence(disputeId, { fromId, fromRole, files, description }) {
  const fd = new FormData();
  fd.append("from_id", fromId);
  fd.append("from_role", fromRole);
  if (description) fd.append("description", description);
  for (const f of files) fd.append("evidence", f);
  const res = await authFetch(`${BASE}/${disputeId}/evidence`, {
    method: "POST",
    body: fd,
  });
  return res.json();
}

export async function sellerRespond(disputeId, payload) {
  const res = await authFetch(`${BASE}/${disputeId}/seller-respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function buyerReviewOffer(disputeId, { buyerId, accept }) {
  const res = await authFetch(`${BASE}/${disputeId}/buyer-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer_id: buyerId, accept }),
  });
  return res.json();
}

export async function adminDecision(adminId, disputeId, { decision, notes, refund_percent }) {
  const res = await authFetch(`${BASE}/${disputeId}/admin-decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ decision, notes, refund_percent }),
  });
  return res.json();
}

export default {
  listDisputes,
  getDispute,
  getSlaMeta,
  sendMessage,
  uploadEvidence,
  sellerRespond,
  buyerReviewOffer,
  adminDecision,
};
