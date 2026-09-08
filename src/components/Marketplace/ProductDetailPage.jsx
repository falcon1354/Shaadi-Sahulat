import React, { useState, useEffect } from 'react';
import sellerApi from '../../api/sellerApi';
import { useCart } from '../../context/CartContext';
import { toggleWishlistItem, recordRecentlyViewed } from '../../api/buyerApi';
import { getProductReviews } from '../../api/reviewNotificationApi';
import { submitReview } from '../../api/orderApi';
import ReviewList from '../Reviews/ReviewList';
import ReviewForm from '../Reviews/ReviewForm';
import StarRating from '../Reviews/StarRating';
import SizeAwareTryOnModal from './SizeAwareTryOnModal';

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

  // Reviews state
  const [reviews, setReviews]       = useState([]);
  const [avgRating, setAvgRating]   = useState(0);
  const [reviewsLoading, setRL]     = useState(false);
  const [showReviewForm, setSRF]    = useState(false);
  const [submittingReview, setSR]   = useState(false);
  const [tryOnOpen, setTryOnOpen]   = useState(false);

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

  // ── Load reviews for this product ────────────────────────────────────────
  const loadReviews = async () => {
    if (!product?.product_id) return;
    setRL(true);
    try {
      const res = await getProductReviews(product.product_id);
      if (res?.success) {
        setReviews(res.reviews || []);
        setAvgRating(res.average_rating || 0);
      }
    } catch (e) {
      // silent
    } finally {
      setRL(false);
    }
  };

  useEffect(() => { loadReviews(); }, [product?.product_id]);

  // ── Submit review ─────────────────────────────────────────────────────────
  // NOTE: the host project's review flow is order-gated (a buyer must have
  // purchased the product before they can review it). The actual POST goes
  // to /api/orders/:order_id/review, NOT a free-form product review endpoint.
  // For the ProductDetailPage demo, we surface the form so buyers can see
  // what writing a review looks like — but submission will fail unless the
  // buyer has a delivered order containing this product.
  const handleSubmitReview = async ({ rating, title, comment, ai_suggested_rating, ai_used, ai_generated }) => {
    if (!buyerId) {
      alert('Please log in as a buyer to leave a review.');
      return;
    }
    setSR(true);
    // We need an order_id to submit a review. The product detail page doesn't
    // have one — the proper flow is BuyerOrdersPage → BuyerOrderDetailPage →
    // ReviewForm. Here we surface a helpful message guiding the buyer there.
    alert(
      `To submit your ${rating}★ review, please go to: My Orders → open your order for this product → "Write a Review".\n\n` +
      `Reviews are tied to a delivered order so only verified buyers can rate products.`
    );
    setSR(false);
  };

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

  // Stock available
  const availableStock = typeof product.stock_quantity === 'number' ? product.stock_quantity : (product.stock_qty || 10);
  const [selectedQty, setSelectedQty] = useState(1);

  // ── Active image state (for thumbnail bar) ──────────────────────────────
  // Resets whenever the product changes.
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  useEffect(() => { setActiveImageIdx(0); }, [product?.product_id]);
  const images = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : [{ image_url: product.primary_image_url }];
  const activeImage = images[activeImageIdx] || images[0];
  const activeImageUrl = sellerApi.resolveImageUrl(
    activeImage?.image_url || activeImage?.primary_image_url || product.primary_image_url
  );

  const handleAddToCart = () => {
    if (!product || availableStock <= 0) return;
    addItem(product, selectedQty);
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-12 h-12 border-4 border-[#FBEFF1] border-t-[#a37b3d] rounded-full animate-spin" />
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
          className="px-6 py-2.5 bg-[#a37b3d] text-white rounded-xl text-sm font-semibold hover:bg-[#8a6633] transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // ── Product Data ─────────────────────────────────────────────────────────

  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const effectivePrice = hasDiscount ? product.discount_price : product.price;
  const isThrift = product.marketplace_type === 'thrift';

  // Compute the SINGLE biggest discount percentage for thrift items so we can
  // render ONE discount badge instead of several. Falls back to 0 if no discount.
  const discountPctFromDiscountPrice = hasDiscount && product.price
    ? Math.round(((product.price - product.discount_price) / product.price) * 100)
    : 0;
  const discountPctFromOriginalPrice = isThrift && product.original_price && product.original_price > product.price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;
  const discountPct = isThrift
    ? Math.max(discountPctFromDiscountPrice, discountPctFromOriginalPrice, product.discount_pct ? Math.round(product.discount_pct) : 0)
    : (hasDiscount ? discountPctFromDiscountPrice : (product.discount_pct ? Math.round(product.discount_pct) : 0));

  const fields = [
    product.color           && { label: 'Color',      value: product.color,           icon: '🎨' },
    product.fabric          && { label: 'Fabric',     value: product.fabric,          icon: '🧵' },
    product.embroidery_type && { label: 'Embroidery', value: product.embroidery_type, icon: '✨' },
    product.size            && { label: 'Size',       value: product.size,            icon: '📐' },
    product.material        && { label: 'Material',   value: product.material,        icon: '🪨' },
    product.brand           && { label: 'Brand',      value: product.brand,           icon: '🏷️' },
    product.condition       && { label: 'Condition',  value: product.condition,       icon: '🔖' },
    product.city            && { label: 'City',       value: product.city,            icon: '📍' },
    product.marketplace_type === 'thrift' && { label: 'Marketplace', value: '♻️ Thrift', icon: '♻️' },
    product.is_final_sale   && { label: 'Return Policy', value: 'Final Sale (No Returns)', icon: '⚠️' },
  ].filter(Boolean);

  const budgetInfo = (!isAdminView && product.major_category)
    ? getBudgetForCategory(product.major_category, buyerId)
    : null;

  const totalSold = product.completed_orders || product.orders_count || 0;
  const ratingVal = avgRating > 0 ? avgRating.toFixed(1) : (product.rating || 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-4">

      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
        <button onClick={onBack} className="hover:text-[#a37b3d] font-bold">← Back</button>
        <span>·</span>
        <span>{isThrift ? '♻️ Thrift' : '🛍️ Marketplace'}</span>
        <span>›</span>
        <span className="capitalize text-[#a37b3d] font-medium">
          {product.major_category?.replace(/_/g, ' ')}
        </span>
        {product.subcategory && (
          <>
            <span>›</span>
            <span className="capitalize">{product.subcategory.replace(/_/g, ' ')}</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Left: Image + Thumbnails ──────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="relative rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 shadow-md min-h-[420px] lg:min-h-[500px] flex items-center justify-center">
            {activeImageUrl ? (
              <img
                src={activeImageUrl}
                alt={product.title}
                className="w-full h-full object-cover rounded-3xl"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-200 text-8xl">📦</div>
            )}

            {/* Animated GIF Badges — conditional on DB flags */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
              {product.is_hot_deal && hasDiscount && (
                <span className="bg-red-500 text-white text-xs font-black px-3 py-1 rounded-full shadow flex items-center gap-1">
                  <span className="animate-pulse">🔥</span> HOT DEAL ({discountPct}% OFF)
                </span>
              )}
              {product.is_best_seller && totalSold > 0 && (
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow flex items-center gap-1">
                  <span className="animate-pulse">⭐</span> BEST SELLER
                </span>
              )}
            </div>

            {/* Wishlist button */}
            {!isAdminView && (
              <button
                onClick={toggleWishlist}
                className={`absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all text-xl ${
                  isWishlisted
                    ? 'bg-rose-500 text-white scale-110'
                    : 'bg-white/90 text-gray-400 hover:text-rose-500 hover:scale-110'
                }`}
                title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
              >
                ❤
              </button>
            )}
          </div>

          {/* Thumbnail strip — clickable thumbnails that swap the main image */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {images.map((img, idx) => {
                const url = sellerApi.resolveImageUrl(img.image_url || img.primary_image_url);
                const isActive = idx === activeImageIdx;
                return (
                  <button
                    key={img.image_id || idx}
                    onClick={() => setActiveImageIdx(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                      isActive
                        ? 'border-[#a37b3d] shadow-md ring-2 ring-[#ECD4A8]/50'
                        : 'border-gray-200 hover:border-[#ECD4A8] opacity-70 hover:opacity-100'
                    }`}
                    aria-label={`View image ${idx + 1}`}
                    aria-pressed={isActive}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`${product.title} — image ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📦</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Details ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Title, Sold Count + Avg Rating e.g. 1 (5) & price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-[#a37b3d] font-semibold uppercase tracking-wide capitalize">
                {product.major_category?.replace(/_/g, ' ')}
              </p>
              {/* Sold Count + Avg Rating — conditional on actual sales */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-extrabold rounded-full">
                {totalSold > 0 ? <span>Total Sold: {totalSold} ({ratingVal})</span> : <span>({ratingVal || 'No ratings'})</span>}
              </div>
            </div>

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
                  {/* Discount pill — ONLY for retail. For thrift, a single
                      combined badge is rendered below to avoid badge spam. */}
                  {!isThrift && (
                    <span className="text-xs bg-red-100 text-red-600 font-bold px-2.5 py-1 rounded-full mb-0.5">
                      {discountPct}% OFF
                    </span>
                  )}
                </>
              ) : (
                <span className="text-3xl font-bold text-[#a37b3d]">
                  PKR {product.price?.toLocaleString()}
                </span>
              )}
            </div>
            {/* Thrift original price reference (no separate Save PKR badge —
                the single thrift badge below carries the discount info instead). */}
            {isThrift && product.original_price && product.original_price > product.price && (
              <p className="text-sm text-gray-400 mt-1">
                Original price: <span className="line-through">PKR {product.original_price.toLocaleString()}</span>
              </p>
            )}
            {/* Thrift single discount badge — shows ONE badge representing the
                biggest discount, plus an optional Final-Sale policy badge. */}
            {isThrift && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
                  ♻️ Thrift{discountPct > 0 ? ` — ${discountPct}% OFF` : ''}
                </span>
                {product.is_final_sale && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
                    ⚠️ Final Sale
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Budget banner */}
          {budgetInfo && (
            <div className="p-4 bg-[#FFF5F8] rounded-2xl border border-[#FBEFF1]">
              <p className="text-xs font-bold text-[#a37b3d] uppercase tracking-wide mb-2 capitalize">
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
                  <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 hover:border-[#FBEFF1] hover:bg-[#FFF5F8] transition-colors">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">
                      {icon} {label}
                    </p>
                    <p className="text-xs text-gray-700 font-bold capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock & Quantity Control (Capped at available stock) */}
          <div className="flex items-center justify-between py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] flex items-center justify-center text-white font-bold text-sm">
                {product.seller_name?.[0]?.toUpperCase() || 'S'}
              </div>
              <div>
                <p className="text-xs text-gray-400">Sold by</p>
                <p className="text-sm font-bold text-gray-800">{product.seller_name || 'Seller'}</p>
              </div>
            </div>

            {availableStock > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 font-semibold">Qty:</span>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                  <button
                    onClick={() => setSelectedQty(q => Math.max(1, q - 1))}
                    className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 font-bold text-sm"
                  >-</button>
                  <span className="px-3 py-1.5 font-bold text-sm text-gray-800">{selectedQty}</span>
                  <button
                    onClick={() => setSelectedQty(q => Math.min(availableStock, q + 1))}
                    disabled={selectedQty >= availableStock}
                    className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 font-bold text-sm disabled:opacity-40"
                  >+</button>
                </div>
                <span className="text-xs bg-green-50 text-green-700 font-semibold px-2.5 py-1 rounded-full border border-green-100">
                  ✓ {availableStock} in stock
                </span>
              </div>
            ) : (
              <span className="text-xs bg-red-50 text-red-700 font-semibold px-3 py-1.5 rounded-full border border-red-100">
                Out of Stock
              </span>
            )}
          </div>

          {/* CTA buttons */}
          {!isAdminView && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={availableStock <= 0}
                  className="flex-1 py-3.5 bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] hover:from-[#8a6633] hover:to-[#ECD4A8] text-white rounded-2xl text-sm font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  🛒 Add to Cart ({selectedQty})
                </button>
                <button
                  onClick={toggleWishlist}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl transition-all border-2 ${
                    isWishlisted
                      ? 'bg-[#FFF5F8] text-[#a37b3d] border-[#a37b3d] shadow-md'
                      : 'bg-white text-gray-400 border-gray-200 hover:border-[#ECD4A8] hover:text-[#a37b3d]'
                  }`}
                  title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                >
                  ❤
                </button>
              </div>
              {String(product.major_category || '').toLowerCase() === 'wedding_dress' && (
                <button
                  type="button"
                  onClick={() => setTryOnOpen(true)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  Try it on
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!isAdminView && String(product.major_category || '').toLowerCase() === 'wedding_dress' && (
        <SizeAwareTryOnModal
          open={tryOnOpen}
          onClose={() => setTryOnOpen(false)}
          product={product}
        />
      )}

      {/* ── Reviews section ───────────────────────────────────────────────── */}
      <div className="mt-10 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              💬 Customer Reviews
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <StarRating value={avgRating} size="sm" />
              <span className="text-sm font-semibold text-gray-700">
                {avgRating.toFixed(1)} · {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {!isAdminView && buyer && (
            <button
              onClick={() => setSRF((v) => !v)}
              className="px-4 py-2 bg-[#a37b3d] text-white rounded-xl text-sm font-bold hover:bg-[#8a6633] transition-colors flex items-center gap-2"
            >
              ✨ Write a Review
            </button>
          )}
          {!isAdminView && !buyer && (
            <p className="text-xs text-gray-500">
              Login as a buyer to write a review
            </p>
          )}
        </div>

        {/* AI-powered review form (collapsible) */}
        {showReviewForm && buyer && (
          <ReviewForm
            productTitle={product.title}
            productDescription={product.description}
            buyerId={buyer?.buyer_id}
            productId={product.product_id}
            onSubmit={handleSubmitReview}
            onCancel={() => setSRF(false)}
            submitting={submittingReview}
          />
        )}

        {/* Reviews list */}
        {reviewsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <div className="w-6 h-6 mx-auto mb-2 border-2 border-gray-200 border-t-[#a37b3d] rounded-full animate-spin" />
            Loading reviews…
          </div>
        ) : (
          <ReviewList
            reviews={reviews}
            showAiBadge
            emptyMessage="No reviews yet. Be the first to review this product!"
          />
        )}
      </div>

      <Toast message="Added to cart!" visible={toastVisible} />
    </div>
  );
}
