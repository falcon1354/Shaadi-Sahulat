/** Categories removed from dowry tracking (legacy / thrift-as-storefront). */
export const RETIRED_CATEGORY_IDS = [
  'jewelry',
  'jewellery',
  'accessories',
  'accessaries',
  'second_hand',
  'second_hand_gear',
  'second-hand',
  'jweley',
];

export function isRetiredCategory(id, label) {
  const k = `${id || ''} ${label || ''}`.toLowerCase();
  if (!k.trim()) return false;
  if (RETIRED_CATEGORY_IDS.includes(k.trim())) return true;
  if (k.includes('jewel') || k.includes('jwel')) return true;
  if (k.includes('accessor') || k.includes('accessar')) return true;
  if (k.includes('second') && (k.includes('hand') || k.includes('life') || k.includes('gear'))) {
    return true;
  }
  return false;
}

/**
 * A category is shown on pie / breakdown / remaining cashflow when:
 *   - it was part of the original dowry estimation, OR
 *   - it later received an allocated amount via Reallocate Budget
 * Zero-allocated categories added after estimation stay hidden until funded.
 */
export function isAllocatedBudgetCategory(key, info = {}, originalIds) {
  if (isRetiredCategory(key)) return false;
  const estimated = info.estimated || 0;
  const spent = info.spent || 0;
  if (Array.isArray(originalIds) && originalIds.length > 0) {
    if (originalIds.includes(key)) return true;
    return estimated > 0 || spent > 0;
  }
  return estimated > 0 || spent > 0;
}

export function filterDisplayBudgetEntries(catBudgets, originalIds) {
  return Object.entries(catBudgets || {}).filter(([key, info]) =>
    info?.active !== false && isAllocatedBudgetCategory(key, info, originalIds)
  );
}

export default {
  RETIRED_CATEGORY_IDS,
  isRetiredCategory,
  isAllocatedBudgetCategory,
  filterDisplayBudgetEntries,
};
