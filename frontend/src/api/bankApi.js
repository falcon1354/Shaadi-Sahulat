/**
 * Bank officer API client.
 * Token is stored in localStorage under 'ss_bank_officer' after login.
 */
const BASE = "http://localhost:5000/api/bank";

function _headers(token) {
  return { "x-officer-token": token };
}

export function getOfficerFromStorage() {
  try { return JSON.parse(localStorage.getItem("ss_bank_officer") || "null"); }
  catch { return null; }
}

export function saveOfficerToStorage(officer) {
  localStorage.setItem("ss_bank_officer", JSON.stringify(officer));
}

export function clearOfficerFromStorage() {
  localStorage.removeItem("ss_bank_officer");
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function listApplications(token, status, period) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (period) params.set('period', period);
  const url = params.toString() ? `${BASE}/applications?${params}` : `${BASE}/applications`;
  const res = await fetch(url, { headers: _headers(token) });
  return res.json();
}

export async function getApplication(token, applicationNo) {
  const res = await fetch(`${BASE}/applications/${applicationNo}`, {
    headers: _headers(token),
  });
  return res.json();
}

export async function decide(token, applicationNo, payload) {
  const res = await fetch(`${BASE}/applications/${applicationNo}/decision`, {
    method: "POST",
    headers: { ..._headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export default {
  login, listApplications, getApplication, decide,
  getOfficerFromStorage, saveOfficerToStorage, clearOfficerFromStorage,
};
