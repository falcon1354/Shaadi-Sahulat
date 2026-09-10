/**
 * BNPL API client — buyer-facing endpoints.
 * All calls require the buyer's x-user-id + x-user-role headers (set automatically).
 */
const BASE = "http://localhost:5000/api/bnpl";

function _headers(buyerId) {
  return {
    "x-user-id": buyerId,
    "x-user-role": "buyer",
  };
}

export async function checkEligibility(buyerId, amount) {
  const res = await fetch(`${BASE}/eligibility?amount=${amount}`, {
    headers: _headers(buyerId),
  });
  return res.json();
}

export async function listBanks() {
  const res = await fetch(`${BASE}/banks`);
  return res.json();
}

export async function getProfile(buyerId) {
  const res = await fetch(`${BASE}/profile`, { headers: _headers(buyerId) });
  return res.json();
}

export async function previewCnicOcr(buyerId, cnicFrontFile) {
  const fd = new FormData();
  fd.append("cnic_front", cnicFrontFile);
  const res = await fetch(`${BASE}/ocr-preview`, {
    method: "POST",
    headers: _headers(buyerId),
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

  const res = await fetch(`${BASE}/applications`, {
    method: "POST",
    headers: _headers(buyerId), // do NOT set Content-Type — FormData sets it
    body: fd,
  });
  return res.json();
}

export async function listMyApplications(buyerId) {
  const res = await fetch(`${BASE}/applications`, { headers: _headers(buyerId) });
  return res.json();
}

export async function getApplication(buyerId, applicationNo) {
  const res = await fetch(`${BASE}/applications/${applicationNo}`, {
    headers: _headers(buyerId),
  });
  return res.json();
}

export async function acceptOffer(buyerId, applicationNo) {
  const res = await fetch(`${BASE}/applications/${applicationNo}/accept-offer`, {
    method: "POST",
    headers: { ..._headers(buyerId), "Content-Type": "application/json" },
  });
  return res.json();
}

export async function declineOffer(buyerId, applicationNo) {
  const res = await fetch(`${BASE}/applications/${applicationNo}/decline-offer`, {
    method: "POST",
    headers: { ..._headers(buyerId), "Content-Type": "application/json" },
  });
  return res.json();
}

export default {
  checkEligibility, listBanks, getProfile, previewCnicOcr,
  submitApplication, listMyApplications, getApplication,
  acceptOffer, declineOffer,
};
