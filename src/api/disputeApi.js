/**
 * Dispute API client — chat + admin decision.
 */
const BASE = "http://localhost:5000/api/disputes";

export async function listDisputes(role, id) {
  const res = await fetch(`${BASE}/?role=${role}&id=${id}`);
  return res.json();
}

export async function getDispute(disputeId) {
  const res = await fetch(`${BASE}/${disputeId}`);
  return res.json();
}

export async function sendMessage(disputeId, { fromRole, fromId, fromName, message }) {
  const res = await fetch(`${BASE}/${disputeId}/messages`, {
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

export async function uploadEvidence(disputeId, { fromId, fromRole, files }) {
  const fd = new FormData();
  fd.append("from_id", fromId);
  fd.append("from_role", fromRole);
  for (const f of files) fd.append("evidence", f);
  const res = await fetch(`${BASE}/${disputeId}/evidence`, {
    method: "POST",
    body: fd,
  });
  return res.json();
}

export async function adminDecision(adminId, disputeId, { decision, notes }) {
  const res = await fetch(`${BASE}/${disputeId}/admin-decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": adminId,
      "x-user-role": "admin",
    },
    body: JSON.stringify({ decision, notes }),
  });
  return res.json();
}

export default { listDisputes, getDispute, sendMessage, uploadEvidence, adminDecision };
