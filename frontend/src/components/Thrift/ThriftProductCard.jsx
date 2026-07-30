/**
 * ThriftProductCard.jsx — Product card for the Thrift Marketplace (ShaadiSahulat V3)
 *
 * Distinct visual design from the main marketplace cards:
 *   - Warm earth-tone palette instead of gold/cream
 *   - Dashed border + vintage feel for thrift identity
 *   - Condition badge with color coding
 *   - "Final Sale" indicator for non-returnable items
 *
 * Props:
 *   product — {
 *     product_id, title, name, price_pkr, original_price, discount_price,
 *     brand, major_category, subcategory, seller_name, condition, condition_detail,
 *     size, is_hot_deal, is_best_seller, is_final_sale, primary_image_url,
 *     image_url, city, ...
 *   }
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Tag, ShieldCheck, AlertTriangle } from 'lucide-react';

// ── Image URL resolver ─────────────────────────────────────────────────────

function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('/images/')) return `http://localhost:5002${url}`;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
}

// ── Condition color map ────────────────────────────────────────────────────

const CONDITION_STYLES = {
  'Like New': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  'Good': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  'Fair': {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  'New': {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
  },
};

const DEFAULT_CONDITION_STYLE = {
  bg: 'bg-gray-50',
  text: 'text-gray-600',
  border: 'border-gray-200',
  dot: 'bg-gray-400',
};

// ── Component ──────────────────────────────────────────────────────────────

function ThriftProductCard({ product }) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Derive display values
  const title = product.title || product.name || 'Untitled Product';
  const price = product.price_pkr ?? product.price ?? 0;
  const originalPrice = product.original_price ?? null;
  const conditionLabel = product.condition_detail || product.condition || '';
  const imageUrl = resolveImageUrl(
    product.primary_image_url || product.image_url || product.thumbnail_url || ''
  );

  // Discount calculation
  const discountAmount =
    originalPrice && originalPrice > price ? originalPrice - price : null;

  // Badge logic
  const isHotDeal = product.is_hot_deal === true;
  const isBestSeller = product.is_best_seller === true;
  const isFinalSale = product.is_final_sale === true;

  // Condition style
  const condStyle =
    CONDITION_STYLES[conditionLabel] || DEFAULT_CONDITION_STYLE;

  // Wishlist toggle
  const handleWishlistToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWishlisted((prev) => !prev);
  };

  // Brand / Category / Seller line
  const metaLine = [
    product.brand,
    product.major_category?.replace(/_/g, ' '),
    product.seller_name,
  ]
    .filter(Boolean)
    .join(' \u00B7 ');

  return (
    <Link
      to={`/thrift/product/${product.product_id || product._id}`}
      className="group block"
    >
      <div
        className={`
          relative bg-white rounded-2xl border-2 border-dashed border-amber-300/70
          overflow-hidden flex flex-col
          transition-all duration-300 ease-out
          hover:border-amber-500 hover:shadow-lg hover:shadow-amber-100/50
          hover:-translate-y-1
        `}
      >
        {/* ── Image Section ─────────────────────────────────────────── */}
        <div className="relative aspect-[4/5] bg-gradient-to-br from-amber-50/60 to-stone-50 overflow-hidden">
          {/* Product image */}
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-amber-300">
              <Tag size={40} strokeWidth={1.2} />
              <span className="text-xs mt-2 text-amber-400 font-medium">
                Pre-Loved
              </span>
            </div>
          )}

          {/* Top-left badge: Hot Deal / Best Seller */}
          {isHotDeal && (
            <span className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-red-500 text-white text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg shadow-md">
              <span className="inline-block w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              Hot Deal
            </span>
          )}
          {!isHotDeal && isBestSeller && (
            <span className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-amber-500 text-white text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg shadow-md">
              <ShieldCheck size={11} />
              Best Seller
            </span>
          )}

          {/* Top-right badge: discount amount */}
          {discountAmount && (
            <span className="absolute top-2.5 right-2.5 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-md">
              -PKR {discountAmount.toLocaleString()}
            </span>
          )}

          {/* Final Sale badge — bottom-left of image */}
          {isFinalSale && (
            <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 bg-gray-900/80 backdrop-blur-sm text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md">
              <AlertTriangle size={10} />
              Final Sale
            </span>
          )}

          {/* Wishlist heart button */}
          <button
            onClick={handleWishlistToggle}
            className={`
              absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center
              shadow-sm transition-all duration-200 cursor-pointer z-10
              focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1
              ${
                discountAmount
                  ? 'top-9'
                  : ''
              }
              ${
                isWishlisted
                  ? 'bg-red-50 text-red-500 border border-red-200'
                  : 'bg-white/80 backdrop-blur-sm text-gray-400 border border-gray-200 hover:text-red-400 hover:border-red-200'
              }
            `}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
            aria-label={
              isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'
            }
          >
            <Heart
              size={15}
              className={`transition-transform duration-200 ${
                isWishlisted ? 'fill-red-500 scale-110' : 'scale-100'
              }`}
            />
          </button>
        </div>

        {/* ── Product Info Section ───────────────────────────────────── */}
        <div className="p-3.5 flex flex-col gap-1.5">
          {/* Brand / Category / Seller */}
          {metaLine && (
            <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide truncate">
              {metaLine}
            </p>
          )}

          {/* Product title */}
          <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug min-h-[2.5rem]">
            {title}
          </h3>

          {/* Price row */}
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-base font-extrabold text-emerald-600">
              PKR {price.toLocaleString()}
            </span>
            {originalPrice && originalPrice > price && (
              <span className="text-xs text-stone-400 line-through font-medium">
                PKR {originalPrice.toLocaleString()}
              </span>
            )}
          </div>

          {/* Size & Condition row */}
          <div className="flex items-center justify-between mt-1.5">
            {/* Size */}
            {product.size && (
              <span className="text-[10px] text-stone-500 font-medium bg-stone-100 px-2 py-0.5 rounded">
                Size: {product.size}
              </span>
            )}

            {/* Condition badge */}
            {conditionLabel && (
              <span
                className={`
                  inline-flex items-center gap-1 text-[10px] font-semibold
                  px-2 py-0.5 rounded-full border
                  ${condStyle.bg} ${condStyle.text} ${condStyle.border}
                `}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${condStyle.dot}`}
                />
                {conditionLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default ThriftProductCard;
