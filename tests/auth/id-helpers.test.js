// Regression tests for lib/helpers.js ID generators.
// Previously _seq() kept only the last 5 digits of Date.now(), so IDs made in the same
// millisecond were identical (lost notifications, E11000) and IDs repeated every 100 s.
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../../lib/helpers");

const GENERATORS = {
  generateOrderId: "ORD", generateApplicationNo: "BNPL", generateDisputeId: "DIS", generatePackageId: "PKG",
  generateTransactionId: "TXN-FYP", generateOfferNo: "OFR", generatePayoutId: "PAY", generateReviewId: "REV",
  generateNotificationId: "NTF",
};

test("every generator keeps its prefix + year and adds a 12-char suffix", () => {
  const year = new Date().getFullYear();
  for (const [fn, prefix] of Object.entries(GENERATORS)) {
    const id = h[fn]();
    assert.match(id, new RegExp(`^${prefix}-${year}-[0-9A-Z]{8}[0-9A-F]{4}$`), `${fn} -> ${id}`);
  }
});

test("IDs generated within the same millisecond are unique", (t) => {
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => 1790000000000; // frozen clock: every call is "the same millisecond"
  const ids = Array.from({ length: 1296 }, () => h.generateNotificationId());
  assert.equal(new Set(ids).size, ids.length);
});

test("IDs 100 seconds apart no longer repeat", (t) => {
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  const base = 1790000000000;
  Date.now = () => base;
  const a = h.generateOrderId();
  Date.now = () => base + 100000;
  const b = h.generateOrderId();
  assert.notEqual(a.slice(0, -6), b.slice(0, -6), "time part must differ after 100 s");
});
