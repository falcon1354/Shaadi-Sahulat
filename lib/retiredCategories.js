/**
 * Categories removed from marketplace, seller upload, admin manager, and dowry.
 * Matches jewelry, accessories, and second-hand / second-life gear under any spelling.
 */
function isRetiredCategory(id, label) {
  const k = `${id || ""} ${label || ""}`.toLowerCase();
  if (!k.trim()) return false;
  if (k.includes("jewel") || k.includes("jwel")) return true;
  if (k.includes("accessor") || k.includes("accessar")) return true;
  if (k.includes("second") && (k.includes("hand") || k.includes("life") || k.includes("gear"))) {
    return true;
  }
  return false;
}

function filterRetiredCategories(categories) {
  return (categories || []).filter((c) => !isRetiredCategory(c.category_id, c.label));
}

module.exports = { isRetiredCategory, filterRetiredCategories };
