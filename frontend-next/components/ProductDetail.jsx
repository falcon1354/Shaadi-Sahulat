'use client';

import { useState } from 'react';
import Link from 'next/link';

const ML_URL = 'http://localhost:5002';

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${ML_URL}${imageUrl}`;
}

function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 text-white text-sm px-5 py-3 rounded-xl shadow-lg animate-fade-in flex items-center gap-2">
      ✅ {message}
    </div>
  );
}

export default function ProductDetail({ product }) {
  const [copied, setCopied] = useState(false);

  if (!product) return null;

  const imageUrl     = resolveImageUrl(product.primary_image_url);
  const hasDiscount  = product.discount_price && product.discount_price < product.price;
  const effectivePrice = hasDiscount ? product.discount_price : product.price;

  const discountPct = hasDiscount && product.price
    ? Math.round(((product.price - product.discount_price) / product.price) * 100)
    : (product.discount_pct ? Math.round(product.discount_pct) : 0);

  const fields = [
    product.color           && { label: 'Color',      value: product.color,           icon: '🎨' },
    product.fabric          && { label: 'Fabric',     value: product.fabric,          icon: '🧵' },
    product.embroidery_type && { label: 'Embroidery', value: product.embroidery_type, icon: '✨' },
    product.size            && { label: 'Size',       value: product.size,            icon: '📐' },
    product.material        && { label: 'Material',   value: product.material,        icon: '🪨' },
    product.brand           && { label: 'Brand',      value: product.brand,           icon: '🏷️' },
    product.condition       && { label: 'Condition',  value: product.condition,       icon: '🔖' },
    product.city            && { label: 'City',       value: product.city,            icon: '📍' },
  ].filter(Boolean);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="animate-fade-in">

      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/" className="hover:text-purple-600 transition-colors">🏠 Home</Link>
        <span>›</span>
        <span className="capitalize text-purple-600 font-medium">
          {product.major_category?.replace(/_/g, ' ')}
        </span>
        {product.subcategory && (
          <>
            <span>›</span>
            <span className="capitalize">{product.subcategory.replace(/_/g, ' ')}</span>
          </>
        )}
        <span>›</span>
        <span className="text-gray-500 truncate max-w-[200px]">{product.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

        {/* ── Left: Image ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shadow-md aspect-square lg:aspect-[4/3]">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-200 text-8xl">
                📦
              </div>
            )}

            {/* Badges */}
            {hasDiscount && (
              <span className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
                {discountPct}% OFF
              </span>
            )}
            {product.condition && product.condition !== 'New' && (
              <span className="absolute top-4 right-4 bg-amber-100 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm">
                {product.condition}
              </span>
            )}
          </div>

          {/* Share row */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-semibold border border-purple-100 hover:bg-purple-100 transition-colors"
            >
              🔗 Copy Share Link
            </button>
            <a
              href={`http://localhost:5173`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl text-sm font-semibold hover:from-purple-700 hover:to-pink-600 transition-all shadow-sm"
            >
              🛒 Open in App
            </a>
          </div>
        </div>

        {/* ── Right: Details ────────────────────────────────────────── */}
        <div className="space-y-6 animate-slide-up">

          {/* Title & Price */}
          <div>
            <p className="text-xs text-purple-500 font-semibold uppercase tracking-widest mb-2 capitalize">
              {product.major_category?.replace(/_/g, ' ')}
              {product.subcategory ? ` · ${product.subcategory.replace(/_/g, ' ')}` : ''}
            </p>
            <h1 className="text-3xl font-extrabold text-gray-900 leading-snug mb-4">
              {product.title}
            </h1>

            <div className="flex items-end gap-3 flex-wrap">
              {hasDiscount ? (
                <>
                  <span className="text-4xl font-extrabold text-green-600">
                    PKR {product.discount_price.toLocaleString()}
                  </span>
                  <span className="text-xl text-gray-400 line-through mb-0.5">
                    PKR {product.price.toLocaleString()}
                  </span>
                  <span className="text-sm bg-red-100 text-red-600 font-bold px-3 py-1 rounded-full mb-0.5">
                    Save {discountPct}%
                  </span>
                </>
              ) : (
                <span className="text-4xl font-extrabold text-purple-700">
                  PKR {product.price?.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <span className="text-base">📝</span> Description
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-2xl p-5 border border-gray-100">
                {product.description}
              </p>
            </div>
          )}

          {/* Attributes Grid */}
          {fields.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                <span className="text-base">📋</span> Product Details
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fields.map(({ label, value, icon }) => (
                  <div
                    key={label}
                    className="bg-white border border-gray-100 rounded-xl p-3.5 hover:border-purple-200 hover:shadow-sm transition-all group"
                  >
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1 group-hover:text-purple-500 transition-colors">
                      {icon} {label}
                    </p>
                    <p className="text-sm text-gray-800 font-bold capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seller Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                  {product.seller_name?.[0]?.toUpperCase() || 'S'}
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Sold by</p>
                  <p className="text-base font-bold text-gray-900">{product.seller_name || 'Seller'}</p>
                  {product.city && (
                    <p className="text-xs text-gray-400 mt-0.5">📍 {product.city}</p>
                  )}
                </div>
              </div>
              {product.stock_quantity > 0 && (
                <span className="text-xs bg-green-50 text-green-700 font-bold px-4 py-2 rounded-full border border-green-100 shadow-sm">
                  ✓ {product.stock_quantity} in stock
                </span>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
            <p className="text-sm text-gray-600 mb-3">
              To add this item to your cart or wishlist, open the ShaadiSahulat app.
            </p>
            <a
              href="http://localhost:5173"
              className="block w-full text-center py-3.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              🛒 Open ShaadiSahulat App
            </a>
          </div>

          {/* Product ID */}
          <p className="text-[10px] text-gray-300 font-mono text-right">
            ID: {product.product_id}
          </p>
        </div>
      </div>

      <Toast message="Link copied to clipboard!" visible={copied} />
    </div>
  );
}
