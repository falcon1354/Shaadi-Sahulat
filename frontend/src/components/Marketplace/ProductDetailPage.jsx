import React, { useState, useEffect } from 'react';
import sellerApi from '../../api/sellerApi';
import { useCart } from '../../context/CartContext';
import { toggleWishlistItem, recordRecentlyViewed } from '../../api/buyerApi';

// ── localStorage helpers ──────────────────────────────────────────────────

function readDowry(buyerId) {
  try {
    if (buyerId) return JSON.parse(localStorage.getItem(`ss_dowry_${buyerId}`) || 'null');
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

function getBudgetForCategory(cat, buyerId) {
  try {
    const data = readDowry(buyerId);
    if (!data?.category_budgets) return null;
    return data.category_budgets[cat] || null;
  } catch { return null; }
}

function readWishlist(buyerId) {
  try {
    if (buyerId) return JSON.parse(localStorage.getItem(`ss_wishlist_${buyerId}`) || '[]');
    return JSON.parse(localStorage.getItem('ss_wishlist') || '[]');
  } catch { return []; }
}

function saveWishlist(list, buyerId) {
  try {
    const s = JSON.stringify(list);
    if (buyerId) localStorage.setItem(`ss_wishlist_${buyerId}`, s);
    else         localStorage.setItem('ss_wishlist', s);
  } catch {}
}

function saveRecentlyViewed(product, buyerId) {
  try {
    const key     = buyerId ? `ss_recently_viewed_${buyerId}` : 'ss_recently_viewed';
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = current.filter(p => p.product_id !== product.product_id);
    const entry = {
      product_id:     product.product_id,
      title:          product.title,
      price:          product.price,
      major_category: product.major_category,
    };
    const updated = [entry, ...filtered].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

// ── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 text-white text-sm px-5 py-3 rounded-xl shadow-lg animate-fade-in flex items-center gap-2">
      <span>🛒</span> {message}
    </div>
  );
}

// ── Product Detail Page ───────────────────────────────────────────────────

export default function ProductDetailPage({ productId, product: initialProduct, onBack, buyer, isAdminView = false }) {
  const cartCtx = useCart();
  const addItem = cartCtx?.addItem || (() => {});
  const buyerId = buyer?.buyer_id || null;

  const [product, setProduct]     = useState(initialProduct || null);
  const [loading, setLoading]     = useState(!initialProduct);
  const [toastVisible, setToast]  = useState(false);
  const [wishlist, setWishlist]   = useState(() => readWishlist(buyerId));

  // Load product from API if not passed directly
  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      return;
    }
    if (!productId) return;
    setLoading(true);
    sellerApi.getProduct(productId)
      .then(data => {
        if (data.success !== false) setProduct(data.product || data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, initialProduct]);

  // Record recently viewed
  useEffect(() => {
    if (!product) return;
    saveRecentlyViewed(product, buyerId);
    if (buyerId) {
      recordRecentlyViewed(buyerId, {
        product_id: product.product_id,
        title: product.title,
        price: product.price,
        major_category: product.major_category,
      }).catch(() => {});
    }
  }, [product]);

  const isWishlisted = product ? wishlist.some(w => w.product_id === product.product_id) : false;

  const toggleWishlist = () => {
    if (!product) return;
    const item = {
      product_id:     product.product_id,
      title:          product.title,
      price:          product.discount_price || product.price,
      major_category: product.major_category,
    };
    setWishlist(prev => {
      const exists  = prev.some(p => p.product_id === product.product_id);
      const updated = exists
        ? prev.filter(p => p.product_id !== product.product_id)
        : [...prev, item];
      saveWishlist(updated, buyerId);
      return updated;
    });
    if (buyerId) toggleWishlistItem(buyerId, item).catch(() => {});
  };

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product);
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Loading product…</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="animate-fade-in text-center py-24">
        <p className="text-5xl mb-4">😕</p>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Product Not Found</h2>
        <p className="text-gray-400 text-sm mb-6">This product may have been removed.</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // ── Product Data ─────────────────────────────────────────────────────────

  const imageUrl    = sellerApi.resolveImageUrl(product.primary_image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const effectivePrice = hasDiscount ? product.discount_price : product.price;

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

  const budgetInfo = (!isAdminView && product.major_category)
    ? getBudgetForCategory(product.major_category, buyerId)
    : null;

  const discountPct = hasDiscount && product.price
    ? Math.round(((product.price - product.discount_price) / product.price) * 100)
    : (product.discount_pct ? Math.round(product.discount_pct) : 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in">

      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-purple-600 font-medium transition-colors group"
      >
        <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-purple-100 transition-colors text-base">←</span>
        Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Left: Image ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm aspect-square lg:aspect-[4/3]">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.title}
                className="w-full h-full object-cover"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-200 text-8xl">📦</div>
            )}

            {/* Badges */}
            {hasDiscount && (
              <span className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                {discountPct}% OFF
              </span>
            )}
            {product.condition && product.condition !== 'New' && (
              <span className="absolute top-4 right-16 bg-amber-100 text-amber-700 text-xs font-medium px-3 py-1 rounded-full">
                {product.condition}
              </span>
            )}
            {product.similarity_score !== undefined && (
              <span className="absolute bottom-4 right-4 bg-purple-600/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
                {Math.round(product.similarity_score * 100)}% match
              </span>
            )}

            {/* Wishlist button */}
            {!isAdminView && (
              <button
                onClick={toggleWishlist}
                className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all text-lg ${
                  isWishlisted
                    ? 'bg-pink-500 text-white scale-110'
                    : 'bg-white/90 text-gray-400 hover:text-pink-500 hover:scale-110'
                }`}
                title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
              >
                ❤
              </button>
            )}
          </div>

          {/* Category breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
            <span>🛍️ Marketplace</span>
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
          </div>
        </div>

        {/* ── Right: Details ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Title & price */}
          <div>
            <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide mb-1 capitalize">
              {product.major_category?.replace(/_/g, ' ')}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3">
              {product.title}
            </h1>

            <div className="flex items-end gap-3">
              {hasDiscount ? (
                <>
                  <span className="text-3xl font-bold text-green-600">
                    PKR {product.discount_price.toLocaleString()}
                  </span>
                  <span className="text-lg text-gray-400 line-through mb-0.5">
                    PKR {product.price.toLocaleString()}
                  </span>
                  <span className="text-xs bg-red-100 text-red-600 font-bold px-2.5 py-1 rounded-full mb-0.5">
                    {discountPct}% OFF
                  </span>
                </>
              ) : (
                <span className="text-3xl font-bold text-purple-700">
                  PKR {product.price?.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Budget banner */}
          {budgetInfo && (
            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
              <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2 capitalize">
                💰 Your {product.major_category?.replace(/_/g, ' ')} Budget
              </p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-white rounded-xl p-2.5 text-center">
                  <p className="text-gray-400 mb-0.5">Estimated</p>
                  <p className="font-bold text-gray-700">PKR {(budgetInfo.estimated || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 text-center">
                  <p className="text-gray-400 mb-0.5">Spent</p>
                  <p className="font-bold text-gray-700">PKR {(budgetInfo.spent || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 text-center">
                  <p className="text-gray-400 mb-0.5">Remaining</p>
                  <p className={`font-bold ${(budgetInfo.remaining ?? budgetInfo.estimated ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    PKR {(budgetInfo.remaining ?? budgetInfo.estimated ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Budget vs. price indicator */}
              {budgetInfo.remaining !== undefined && (
                <div className="mt-3">
                  {effectivePrice <= (budgetInfo.remaining ?? 0) ? (
                    <p className="text-xs text-green-600 flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center text-[10px]">✓</span>
                      Within your budget
                    </p>
                  ) : (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center text-[10px]">!</span>
                      Exceeds budget by PKR {(effectivePrice - (budgetInfo.remaining ?? 0)).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-1.5">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">
                {product.description}
              </p>
            </div>
          )}

          {/* Attributes grid */}
          {fields.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">Details</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {fields.map(({ label, value, icon }) => (
                  <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 hover:border-purple-200 hover:bg-purple-50 transition-colors">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">
                      {icon} {label}
                    </p>
                    <p className="text-xs text-gray-700 font-bold capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seller info */}
          <div className="flex items-center justify-between py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                {product.seller_name?.[0]?.toUpperCase() || 'S'}
              </div>
              <div>
                <p className="text-xs text-gray-400">Sold by</p>
                <p className="text-sm font-bold text-gray-800">{product.seller_name || 'Seller'}</p>
              </div>
            </div>
            {product.stock_quantity > 0 && (
              <span className="text-xs bg-green-50 text-green-700 font-semibold px-3 py-1.5 rounded-full border border-green-100">
                ✓ {product.stock_quantity} in stock
              </span>
            )}
          </div>

          {/* CTA buttons */}
          {!isAdminView && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleAddToCart}
                className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-2xl text-sm font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
              >
                🛒 Add to Cart
              </button>
              <button
                onClick={toggleWishlist}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl transition-all border-2 ${
                  isWishlisted
                    ? 'bg-pink-500 text-white border-pink-500 shadow-md'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-pink-400 hover:text-pink-500'
                }`}
                title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
              >
                ❤
              </button>
            </div>
          )}

          {/* Shareable product link */}
          {product.product_id && (
            <div className="flex items-center gap-2 pt-2">
              <a
                href={`http://localhost:3000/products/${product.product_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs font-semibold border border-gray-200 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
              >
                🔗 Share Product Page
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`http://localhost:3000/products/${product.product_id}`);
                  setToast(true);
                  setTimeout(() => setToast(false), 2000);
                }}
                className="px-3 py-2.5 bg-gray-50 text-gray-500 rounded-xl text-xs font-semibold border border-gray-200 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                title="Copy link"
              >
                📋
              </button>
            </div>
          )}
        </div>
      </div>

      <Toast message="Added to cart!" visible={toastVisible} />
    </div>
  );
}
