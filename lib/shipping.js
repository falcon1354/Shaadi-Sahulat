/**
 * Server-side delivery pricing (Phase 2I).
 *
 * The buyer only chooses a delivery METHOD; the price is always taken from this
 * table (a client-sent shipping_cost is ignored). Keep the amounts in sync with
 * DELIVERY_OPTIONS in src/components/Cart/CheckoutPage.jsx — tests/auth/phase2i
 * checks that the two agree.
 */

const DELIVERY_OPTIONS = Object.freeze({
  standard: Object.freeze({ label: "Standard Delivery", price: 150 }),
  express:  Object.freeze({ label: "Express Delivery",  price: 350 }),
  same_day: Object.freeze({ label: "Same Day Delivery", price: 500 }),
});

const DEFAULT_DELIVERY_METHOD = "standard";

/** @returns {{ method: string, cost: number } | null}  null = unknown method */
function resolveDelivery(method) {
  const m = method === undefined || method === null || method === "" ? DEFAULT_DELIVERY_METHOD : method;
  if (typeof m !== "string" || !Object.prototype.hasOwnProperty.call(DELIVERY_OPTIONS, m)) return null;
  return { method: m, cost: DELIVERY_OPTIONS[m].price };
}

module.exports = { DELIVERY_OPTIONS, DEFAULT_DELIVERY_METHOD, resolveDelivery };
