/**
 * Polar webhook signature + PKR minor-unit conversion.
 * No network and no database.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { verifyPolarWebhook } = require("../../lib/polar/webhook");
const { toMinor, fromMinor } = require("../../lib/polar/money");

function headers(id, timestamp, signature) {
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  };
}

test("Standard Webhooks secret verifies a Polar signature", () => {
  const key = crypto.randomBytes(24);
  const secret = `whsec_${key.toString("base64")}`;
  const id = "msg_test_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: "order.paid", data: { id: "ord_1" } });
  const signature = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  assert.equal(
    verifyPolarWebhook(Buffer.from(body), headers(id, timestamp, `v1,${signature}`), secret),
    true
  );
});

test("legacy Polar HMAC secret verifies", () => {
  const secret = "whsec_legacy-secret-value";
  const id = "msg_test_2";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = "{\"type\":\"checkout.updated\"}";
  const signature = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  assert.equal(
    verifyPolarWebhook(body, headers(id, timestamp, `v1,${signature}`), secret),
    true
  );
});

test("rejects a stale timestamp and a bad signature", () => {
  const secret = "whsec_legacy-secret-value";
  const body = "{}";
  const stale = String(Math.floor(Date.now() / 1000) - 60 * 30);
  const signature = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(`id.${stale}.${body}`).digest("base64");
  assert.equal(verifyPolarWebhook(body, headers("id", stale, `v1,${signature}`), secret), false);
  const now = String(Math.floor(Date.now() / 1000));
  assert.equal(verifyPolarWebhook(body, headers("id", now, "v1,not-the-signature"), secret), false);
});

test("PKR converts to paisa and zero-decimal currencies do not", () => {
  assert.equal(toMinor(1500, "pkr"), 150000);
  assert.equal(fromMinor(150000, "pkr"), 1500);
  assert.equal(toMinor(1500, "jpy"), 1500);
  assert.throws(() => toMinor(0, "pkr"));
});
