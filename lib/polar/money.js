/**
 * Polar prices are integer minor units ("cents"). PKR has 2 (paisa).
 * Zero-decimal currencies are listed so a future currency switch does not
 * multiply yen or won by 100.
 */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function toMinor(amountMajor, currency = "pkr") {
  const major = Number(amountMajor);
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error("Charge amount must be greater than zero");
  }
  const cur = String(currency || "pkr").toLowerCase();
  if (ZERO_DECIMAL.has(cur)) return Math.round(major);
  return Math.round(major * 100);
}

function fromMinor(amountMinor, currency = "pkr") {
  const minor = Number(amountMinor) || 0;
  const cur = String(currency || "pkr").toLowerCase();
  if (ZERO_DECIMAL.has(cur)) return minor;
  return Math.round(minor) / 100;
}

module.exports = { toMinor, fromMinor, ZERO_DECIMAL };
