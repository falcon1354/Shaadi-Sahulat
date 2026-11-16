/**
 * Verify a Polar webhook signature.
 *
 * Secrets issued on or after 8 Sep 2026 are Standard Webhooks (HMAC key is
 * the base64 payload after `whsec_`). Older secrets use the raw `whsec_…`
 * string as the HMAC key. Both are accepted. Rejects timestamps skewed by
 * more than 5 minutes.
 */
const crypto = require("crypto");

const MAX_SKEW_SECONDS = 5 * 60;

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function sign(key, id, timestamp, body) {
  return crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

function candidateKeys(secret) {
  const keys = [];
  const trimmed = String(secret || "").trim();
  if (!trimmed) return keys;
  const b64 = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  if (b64) {
    const decoded = Buffer.from(b64, "base64");
    if (decoded.length) keys.push(decoded);
  }
  keys.push(Buffer.from(trimmed, "utf8"));
  return keys;
}

function verifyPolarWebhook(rawBody, headers, secret) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signature = headers["webhook-signature"];
  if (!id || !timestamp || !signature || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  if (!body) return false;

  const presented = String(signature)
    .split(" ")
    .map((part) => {
      const comma = part.indexOf(",");
      return comma === -1 ? "" : part.slice(comma + 1);
    })
    .filter(Boolean);
  if (!presented.length) return false;

  for (const key of candidateKeys(secret)) {
    const expected = sign(key, id, timestamp, body);
    for (const got of presented) {
      if (safeEqual(expected, got)) return true;
    }
  }
  return false;
}

module.exports = { verifyPolarWebhook };
