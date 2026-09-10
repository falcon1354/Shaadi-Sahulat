import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { resolveCategoryIconUrl } from '../../hooks/useCategories';

/**
 * Category image for Dowry / dashboard.
 * Prefers placeholder_image (Cloudinary CategoryPlaceholders), then icon URL, then emoji/package.
 */
export default function CategoryThumb({
  category,
  categoryId,
  categories = [],
  size = 40,
  className = '',
  rounded = 'rounded-xl',
}) {
  const [broken, setBroken] = useState(false);
  const cat =
    category ||
    (categories || []).find((c) => c.category_id === categoryId) ||
    null;

  const url =
    cat?.placeholder_url ||
    resolveCategoryIconUrl(cat?.placeholder_image) ||
    resolveCategoryIconUrl(cat?.icon_url) ||
    resolveCategoryIconUrl(cat?.icon) ||
    null;

  const emoji = cat?.icon && !resolveCategoryIconUrl(cat.icon) ? cat.icon : null;
  const dim = typeof size === 'number' ? `${size}px` : size;

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={cat?.label || categoryId || 'category'}
        onError={() => setBroken(true)}
        className={`${rounded} object-cover shrink-0 bg-gray-100 border border-gray-100 ${className}`}
        style={{ width: dim, height: dim }}
      />
    );
  }

  return (
    <div
      className={`${rounded} shrink-0 bg-gray-50 border border-gray-100 flex items-center justify-center text-lg ${className}`}
      style={{ width: dim, height: dim }}
      title={cat?.label || categoryId}
    >
      {emoji || <Package size={Math.max(14, (typeof size === 'number' ? size : 40) * 0.45)} className="text-gray-400" />}
    </div>
  );
}
