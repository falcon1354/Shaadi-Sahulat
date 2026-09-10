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

/** Active admin category ids (is_active !== false). */
export function activeCategoryIdSet(categories = []) {
  return new Set(
    (categories || [])
      .filter((c) => c && c.is_active !== false)
      .map((c) => c.category_id)
  );
}

/**
 * Split allocated budget entries into still-active vs soft-deleted admin categories.
 * Deleted cats stay visible in Fine-Tune / dashboard as a separate group.
 */
export function splitAllocatedAndDeleted(catBudgets, originalIds, categories = []) {
  const activeIds = activeCategoryIdSet(categories);
  const allocated = filterDisplayBudgetEntries(catBudgets, originalIds);
  const live = [];
  const deleted = [];
  for (const entry of allocated) {
    const [key] = entry;
    if (activeIds.size === 0 || activeIds.has(key)) live.push(entry);
    else deleted.push(entry);
  }
  return { live, deleted };
}

/** New admin categories not yet in original estimation (candidates for Reallocate → To). */
export function newUnallocatedCategories(categories = [], originalIds = [], catBudgets = {}) {
  const originals = new Set(originalIds || []);
  return (categories || []).filter((c) => {
    if (!c || c.is_active === false || isRetiredCategory(c.category_id)) return false;
    if (originals.has(c.category_id)) return false;
    const info = catBudgets[c.category_id];
    const funded = (info?.estimated || 0) > 0 || (info?.spent || 0) > 0;
    return !funded;
  });
}

export default {
  RETIRED_CATEGORY_IDS,
  isRetiredCategory,
  isAllocatedBudgetCategory,
  filterDisplayBudgetEntries,
  activeCategoryIdSet,
  splitAllocatedAndDeleted,
  newUnallocatedCategories,
};
