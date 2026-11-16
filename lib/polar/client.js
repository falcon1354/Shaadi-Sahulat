/**
 * Thin Polar REST client (Organization Access Token).
 * Scopes used: checkouts:write, orders:read, refunds:write.
 */
const axios = require("axios");
const { getPolarConfig } = require("./config");

function formatPolarError(status, data) {
  const detail = data && data.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d && (d.msg || d.message)).filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  if (data && typeof data.error === "string") return data.error;
  return `Polar request failed (${status})`;
}

async function polarRequest(method, path, { query, body } = {}) {
  const cfg = getPolarConfig();
  if (!cfg.accessToken) {
    const err = new Error("Polar payments are not configured");
    err.status = 503;
    throw err;
  }
  const res = await axios({
    method,
    url: `${cfg.apiBase}${path}`,
    params: query,
    data: body,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
    validateStatus: () => true,
  });
  if (res.status >= 200 && res.status < 300) return res.data;
  const err = new Error(formatPolarError(res.status, res.data));
  err.status = res.status;
  throw err;
}

async function createCheckout(payload) {
  return polarRequest("post", "/v1/checkouts/", { body: payload });
}

async function getCheckout(checkoutId) {
  return polarRequest("get", `/v1/checkouts/${encodeURIComponent(checkoutId)}`);
}

async function createRefund(payload) {
  return polarRequest("post", "/v1/refunds/", { body: payload });
}

/**
 * Best-effort lookup of the Polar order created by a checkout.
 * List filters differ by API version, so a failed lookup is not fatal —
 * the order.paid webhook fills polar_order_id when it arrives.
 */
async function findOrderForCheckout(checkoutId, externalCustomerId) {
  if (!checkoutId) return null;
  const queries = [];
  if (externalCustomerId) queries.push({ external_customer_id: externalCustomerId, limit: 20 });
  queries.push({ limit: 20 });
  for (const query of queries) {
    try {
      const data = await polarRequest("get", "/v1/orders/", { query });
      const items = (data && (data.items || (data.result && data.result.items))) || [];
      const match = items.find((o) => o && o.checkout_id === checkoutId);
      if (match) return match;
    } catch (err) {
      console.warn("[polar] order lookup failed:", err.message);
    }
  }
  return null;
}

module.exports = {
  createCheckout,
  getCheckout,
  createRefund,
  findOrderForCheckout,
};
