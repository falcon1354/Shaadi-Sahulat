import React from 'react';
import { resolveImageUrl } from '../../api/sellerApi';

const CONDITION_COLORS = {
  'New': 'bg-green-100 text-green-700',
  'Like New': 'bg-blue-100 text-blue-700',
  'Good': 'bg-yellow-100 text-yellow-700',
  'Used': 'bg-orange-100 text-orange-700',
  'Thrift': 'bg-purple-100 text-purple-700',
};

export default function ThriftProductCard({ product, onClick }) {
  const imageUrl = resolveImageUrl(product.primary_image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.price - product.discount_price) / product.price) * 100)
    : (product.discount_pct ? Math.round(product.discount_pct) : 0);

  // Calculate savings from original price (for thrift)
  const savings = product.original_price && product.original_price > product.price
    ? product.original_price - product.price
    : (hasDiscount ? product.price - product.discount_price : 0);

  const conditionClass = CONDITION_COLORS[product.condition] || 'bg-gray-100 text-gray-700';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300 cursor-pointer group"
    >
      {/* Image Section */}
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200 text-5xl">♻️</div>
        )}

        {/* Top-left: Hot Deal badge */}
        {product.is_hot_deal && hasDiscount && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded-full shadow flex items-center gap-1">
              <span className="animate-pulse">🔥</span> HOT DEAL
            </span>
          </div>
        )}

        {/* Top-right: Savings badge */}
        {savings > 0 && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 bg-emerald-500 text-white text-[10px] font-black rounded-full shadow">
              -PKR {savings.toLocaleString()}
            </span>
          </div>
        )}

        {/* Final Sale badge */}
        {product.is_final_sale && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-full shadow">
              FINAL SALE
            </span>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-3 space-y-1.5">
        {/* Brand / Category / Seller */}
        <p className="text-[10px] text-gray-400 font-medium truncate">
          {[product.brand, product.major_category?.replace(/_/g, ' '), product.seller_name].filter(Boolean).join(' · ')}
        </p>

        {/* Title */}
        <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">
          {product.title}
        </h3>

        {/* Price + Size + Condition */}
        <div className="flex items-end justify-between gap-1">
          <div className="flex items-baseline gap-1.5">
            {hasDiscount ? (
              <>
                <span className="text-base font-extrabold text-emerald-600">
                  PKR {product.discount_price.toLocaleString()}
                </span>
                <span className="text-xs text-gray-400 line-through">
                  PKR {product.price.toLocaleString()}
                </span>
              </>
            ) : (
              <span className="text-base font-extrabold text-gray-900">
                PKR {product.price?.toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {product.size && (
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 font-bold rounded">
                {product.size}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 font-bold rounded ${conditionClass}`}>
              {product.condition || 'Thrift'}
            </span>
          </div>
        </div>

        {/* Original price indicator for thrift */}
        {product.original_price && product.original_price > product.price && (
          <p className="text-[10px] text-gray-400">
            Was PKR {product.original_price.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
