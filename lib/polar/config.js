/**
 * Polar.sh connection settings. Nothing here is sent to the browser except
 * `enabled` (via GET /api/payments/config).
 *
 * POLAR_SERVER=sandbox talks to sandbox-api.polar.sh (default).
 * POLAR_SERVER=production talks to api.polar.sh.
 */
const { getAuthConfig } = require("../tokens");

function getPolarConfig() {
  const accessToken = String(process.env.POLAR_ACCESS_TOKEN || "").trim();
  const webhookSecret = String(process.env.POLAR_WEBHOOK_SECRET || "").trim();
  const productId = String(process.env.POLAR_PRODUCT_ID || "").trim();
  const server = String(process.env.POLAR_SERVER || "sandbox").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
  const apiBase = server === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";
  let frontendOrigin = "http://localhost:3000";
  try {
    frontendOrigin = getAuthConfig().frontendOrigin.replace(/\/$/, "");
  } catch {
    frontendOrigin = String(process.env.FRONTEND_ORIGIN || frontendOrigin).replace(/\/$/, "");
  }
  return {
    accessToken,
    webhookSecret,
    productId,
    server,
    apiBase,
    frontendOrigin,
    enabled: Boolean(accessToken && productId),
  };
}

module.exports = { getPolarConfig };
