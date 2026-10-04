/** Order statuses that must not count toward dowry spent. */
export const SPENT_EXCLUDED_STATUSES = new Set([
  "CANCELLED",
  "PENDING_BNPL_APPROVAL",
]);

/** BNPL applications that still represent a real financed commitment. */
export const ACTIVE_BNPL_STATUSES = new Set(["OFFER_ACCEPTED", "APPROVED"]);

/**
 * Build spent-by-category from buyer orders.
 * @param {Array} orders
 * @param {Array} [bnplApps] optional — when provided, BNPL orders only count if app is active
 */
export function spentByCategoryFromOrders(orders = [], bnplApps = null) {
  const activeBnpl = new Set();
  if (Array.isArray(bnplApps)) {
    for (const a of bnplApps) {
      if (a?.application_no && ACTIVE_BNPL_STATUSES.has(a.status)) {
        activeBnpl.add(a.application_no);
      }
    }
  }

  const spentByCat = {};
  for (const o of orders) {
    if (!o || o.superseded) continue;
    if (SPENT_EXCLUDED_STATUSES.has(o.status)) continue;

    if (o.payment_method === "BNPL") {
      // Without app list, only count when application id is present (finalized path)
      if (!o.bnpl_application_id) continue;
      if (bnplApps && !activeBnpl.has(o.bnpl_application_id)) continue;
    }

    for (const it of o.items || []) {
      const cat = it.major_category || it.subcategory || "";
      if (!cat) continue;
      spentByCat[cat] = (spentByCat[cat] || 0) + (Number(it.subtotal) || 0);
    }
  }
  return spentByCat;
}

/** Apply spentByCat onto a category_budgets map; returns new budgets + whether changed. */
export function applySpentToBudgets(categoryBudgets = {}, spentByCat = {}) {
  const budgets = { ...categoryBudgets };
  let changed = false;
  for (const [cat, info] of Object.entries(budgets)) {
    const spent = spentByCat[cat] || 0;
    const estimated = Number(info?.estimated) || 0;
    const remaining = estimated - spent;
    if ((Number(info?.spent) || 0) !== spent || Number(info?.remaining) !== remaining) {
      budgets[cat] = { ...info, spent, remaining };
      changed = true;
    }
  }
  // Also surface spend in categories missing from budgets (orphans)
  for (const [cat, spent] of Object.entries(spentByCat)) {
    if (cat in budgets) continue;
    budgets[cat] = { estimated: 0, spent, remaining: -spent, active: true };
    changed = true;
  }
  return { budgets, changed };
}

export default {
  SPENT_EXCLUDED_STATUSES,
  ACTIVE_BNPL_STATUSES,
  spentByCategoryFromOrders,
  applySpentToBudgets,
};
