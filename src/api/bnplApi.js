/**
 * BNPL API client — buyer-facing endpoints.
 * Buyer identity is sent as `Authorization: Bearer <token>` by authFetch (src/api/http.js).
 */
import { authFetch } from "./http";
const BASE = "http://localhost:5000/api/bnpl";

export async function checkEligibility(buyerId, amount) {
  const res = await authFetch(`${BASE}/eligibility?amount=${amount}`);
  return res.json();
}

export async function listBanks() {
  const res = await authFetch(`${BASE}/banks`);
  return res.json();
}

export async function getProfile(buyerId) {
  const res = await authFetch(`${BASE}/profile`);
  return res.json();
}

export async function previewCnicOcr(buyerId, cnicFrontFile) {
  const fd = new FormData();
  fd.append("cnic_front", cnicFrontFile);
  const res = await authFetch(`${BASE}/ocr-preview`, {
    method: "POST",
    body: fd,
  });
  return res.json();
}

export async function submitApplication({
  buyerId,
  orderId,
  bankId,
  iban,
  accountTitle,
  planMonths,
  cnicNumber,
  cnicFront,
  cnicBack,
  utilityBill,
}) {
  const fd = new FormData();
  fd.append("order_id", orderId);
  fd.append("bank_id", bankId);
  fd.append("iban", iban);
  fd.append("account_title", accountTitle);
  fd.append("plan_months", String(planMonths));
  fd.append("confirm", "true");
  if (cnicNumber) fd.append("cnic_number", cnicNumber);
  fd.append("cnic_front", cnicFront);
  fd.append("cnic_back", cnicBack);
  fd.append("utility_bill", utilityBill);

  const res = await authFetch(`${BASE}/applications`, {
    method: "POST",
    // do NOT set Content-Type — FormData sets it
    body: fd,
  });
  return res.json();
}

export async function listMyApplications(buyerId) {
  const res = await authFetch(`${BASE}/applications`);
  return res.json();
}

export async function getApplication(buyerId, applicationNo) {
  const res = await authFetch(`${BASE}/applications/${applicationNo}`);
  return res.json();
}

export async function acceptOffer(buyerId, applicationNo) {
  const res = await authFetch(`${BASE}/applications/${applicationNo}/accept-offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function declineOffer(buyerId, applicationNo) {
  const res = await authFetch(`${BASE}/applications/${applicationNo}/decline-offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function listMyRepayments(buyerId) {
  const res = await authFetch(`${BASE}/repayments`);
  return res.json();
}

export async function getMyRepayment(buyerId, applicationNo) {
  const res = await authFetch(`${BASE}/repayments/${encodeURIComponent(applicationNo)}`);
  return res.json();
}

export default {
  checkEligibility, listBanks, getProfile, previewCnicOcr,
  submitApplication, listMyApplications, getApplication,
  acceptOffer, declineOffer, listMyRepayments, getMyRepayment,
};
