/**
 * ThriftHomePage.jsx — Thrift Marketplace Homepage (V3)
 *
 * A separate storefront for the ShaadiSahulat platform with a
 * thrift-themed visual identity (teal/green accent #0d9488).
 *
 * Sections:
 *   1. Navbar with thrift branding + "New Marketplace" link
 *   2. Hero Banner Slider (auto-rotating every 5s)
 *   3. Category Grid
 *   4. Featured Thrift Products (admin-curated)
 *   5. Recently Added Products with sidebar filters
 *
 * Product cards show: condition badge, original price strikethrough,
 * "Final Sale" badge, and thrift-specific styling.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, MapPin, ShoppingBag, Package, Shirt, Sofa, Monitor,
  Utensils, Sparkles, Gift, Search, SlidersHorizontal, X,
  ChevronLeft, ChevronRight, Recycle, Tag, AlertTriangle,
  Filter, ArrowRight, Loader2, Store, RefreshCw,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const THRIFT_ACCENT = '#0d9488';
const FLASK_BASE = 'http://localhost:5002';
const NODE_BASE = 'http://localhost:5000';

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'price_asc',  label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

const CONDITION_OPTIONS = [
  { value: '',        label: 'All Conditions' },
  { value: 'Like New', label: 'Like New' },
  { value: 'Good',    label: 'Good' },
  { value: 'Fair',    label: 'Fair' },
];

const PRICE_RANGES = [
  { label: 'All Prices', min: '', max: '' },
  { label: 'Under PKR 5,000', min: '', max: '5000' },
  { label: 'PKR 5,000 – 15,000', min: '5000', max: '15000' },
  { label: 'PKR 15,000 – 50,000', min: '15000', max: '50000' },
  { label: 'PKR 50,000 – 100,000', min: '50000', max: '100000' },
  { label: 'Over PKR 100,000', min: '100000', max: '' },
];

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[ThriftHomePage] fetch error:', url, err);
    return null;
  }
}

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${FLASK_BASE}${imageUrl}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-teal-700 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
      {message}
    </div>
  );
}

// ── Skeleton Loaders ──────────────────────────────────────────────────────

function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-3 bg-gray-200 rounded w-2/3" />
      </div>
    </div>
  );
}

function BannerSkeleton() {
  return (
    <div className="w-full h-56 sm:h-72 md:h-80 bg-gray-200 rounded-2xl animate-pulse flex items-center justify-center">
      <Recycle size={48} className="text-gray-300" />
    </div>
  );
}

function CategorySkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 animate-pulse">
      <div className="w-16 h-16 bg-gray-200 rounded-full" />
      <div className="h-3 bg-gray-200 rounded w-16" />
    </div>
  );
}

// ── Thrift Product Card ───────────────────────────────────────────────────

function ThriftProductCard({ product, onView, onAddToCart, isWishlisted, onToggleWishlist }) {
  const [toastVisible, setToast] = useState(false);
  const [imgError, setImgError] = useState(false);

  const imageUrl = resolveImageUrl(product.primary_image_url || product.image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const hasOriginalPrice = product.original_price && product.original_price > product.price;
  const conditionDetail = product.condition_detail || product.condition || '';
  const isFinalSale = product.is_final_sale || product.marketplace_type === 'thrift';

  const conditionBadgeColor = {
    'Like New': 'bg-emerald-100 text-emerald-700',
    'Good': 'bg-teal-100 text-teal-700',
    'Fair': 'bg-amber-100 text-amber-700',
    'New': 'bg-gray-100 text-gray-600',
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    onAddToCart(product, () => {
      setToast(true);
      setTimeout(() => setToast(false), 1800);
    });
  };

  return (
    <>
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-teal-300 transition-all overflow-hidden flex flex-col cursor-pointer group"
        onClick={() => onView && onView(product)}
      >
        {/* Image */}
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={product.title || product.name || 'Thrift item'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl bg-gray-50">
              <Recycle size={40} />
            </div>
          )}

          {/* Condition Badge */}
          {conditionDetail && conditionDetail !== 'New' && (
            <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
              conditionBadgeColor[conditionDetail] || 'bg-teal-100 text-teal-700'
            }`}>
              {conditionDetail}
            </span>
          )}

          {/* Final Sale Badge */}
          {isFinalSale && (
            <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
              <AlertTriangle size={9} /> FINAL SALE
            </span>
          )}

          {/* Wishlist Heart */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleWishlist && onToggleWishlist(product); }}
            className={`absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all cursor-pointer ${
              isWishlisted
                ? 'bg-red-500 text-white'
                : 'bg-white/80 text-gray-400 hover:text-teal-600'
            }`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          >
            <Heart size={14} className={isWishlisted ? 'fill-white' : ''} />
          </button>

          {/* Discount Badge */}
          {hasDiscount && (
            <span className="absolute bottom-2 left-2 bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {product.discount_pct ? `${Math.round(product.discount_pct)}% OFF` : 'SALE'}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col flex-1">
          <p className="text-xs text-teal-600 font-bold mb-0.5 capitalize">
            {product.major_category?.replace(/_/g, ' ')}
            {product.subcategory ? ` › ${product.subcategory.replace(/_/g, ' ')}` : ''}
          </p>
          <p className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1">
            {product.title || product.name}
          </p>

          {/* Price Section */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-teal-700">
              PKR {(product.discount_price || product.price)?.toLocaleString()}
            </span>
            {hasOriginalPrice && (
              <span className="text-xs text-gray-400 line-through">
                PKR {product.original_price.toLocaleString()}
              </span>
            )}
            {hasDiscount && !hasOriginalPrice && (
              <span className="text-xs text-gray-400 line-through">
                PKR {product.price?.toLocaleString()}
              </span>
            )}
          </div>

          {/* Seller & City */}
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span>{product.seller_name || 'Seller'}</span>
            {product.city && (
              <span className="flex items-center gap-0.5">
                <MapPin size={10} /> {product.city}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onView && onView(product); }}
              className="flex-1 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors cursor-pointer"
            >
              View Details
            </button>
            <button
              onClick={handleAddToCart}
              className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-all cursor-pointer shadow-md shadow-teal-600/20"
            >
              + Cart
            </button>
          </div>
        </div>
      </div>
      <Toast message="Added to cart!" visible={toastVisible} />
    </>
  );
}

// ── Product Detail Modal ──────────────────────────────────────────────────

function ThriftProductDetailModal({ product, onClose, onAddToCart, isWishlisted, onToggleWishlist }) {
  const [toastVisible, setToast] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!product) return null;

  const imageUrl = resolveImageUrl(product.primary_image_url || product.image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const hasOriginalPrice = product.original_price && product.original_price > product.price;
  const conditionDetail = product.condition_detail || product.condition || '';
  const isFinalSale = product.is_final_sale || product.marketplace_type === 'thrift';

  const fields = [
    product.color && { label: 'Color', value: product.color },
    product.fabric && { label: 'Fabric', value: product.fabric },
    product.size && { label: 'Size', value: product.size },
    product.material && { label: 'Material', value: product.material },
    product.brand && { label: 'Brand', value: product.brand },
    conditionDetail && { label: 'Condition', value: conditionDetail },
    product.city && { label: 'City', value: product.city },
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-teal-100">
        {imageUrl && !imgError && (
          <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-gray-50">
            <img
              src={imageUrl}
              alt={product.title || product.name}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
            <button
              onClick={() => onToggleWishlist && onToggleWishlist(product)}
              className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all cursor-pointer ${
                isWishlisted
                  ? 'bg-red-500 text-white'
                  : 'bg-white/90 text-gray-400 hover:text-teal-600'
              }`}
            >
              <Heart size={18} className={isWishlisted ? 'fill-white' : ''} />
            </button>
            {isFinalSale && (
              <span className="absolute bottom-3 left-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <AlertTriangle size={12} /> Final Sale — No Returns
              </span>
            )}
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-teal-600 font-bold capitalize mb-1">
                {product.major_category?.replace(/_/g, ' ')}
                {product.subcategory ? ` › ${product.subcategory.replace(/_/g, ' ')}` : ''}
              </p>
              <h2 className="text-lg font-bold text-gray-800">{product.title || product.name}</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1 cursor-pointer"
            >
              ×
            </button>
          </div>

          {/* Condition Badge */}
          {conditionDetail && (
            <div className="mb-3 inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-xs font-bold px-3 py-1.5 rounded-full">
              <Tag size={12} /> Condition: {conditionDetail}
            </div>
          )}

          {/* Price Section */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-xl font-bold text-teal-700">
              PKR {(product.discount_price || product.price)?.toLocaleString()}
            </span>
            {hasOriginalPrice && (
              <>
                <span className="text-sm text-gray-400 line-through">
                  PKR {product.original_price.toLocaleString()}
                </span>
                <span className="text-xs bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full">
                  {Math.round(((product.original_price - (product.discount_price || product.price)) / product.original_price) * 100)}% OFF
                </span>
              </>
            )}
            {hasDiscount && !hasOriginalPrice && (
              <>
                <span className="text-sm text-gray-400 line-through">
                  PKR {product.price?.toLocaleString()}
                </span>
                <span className="text-xs bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full">
                  {Math.round(product.discount_pct || 0)}% OFF
                </span>
              </>
            )}
          </div>

          {product.description && (
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">{product.description}</p>
          )}

          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {fields.map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                  <p className="text-xs text-gray-700 font-semibold capitalize">{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 mb-4 text-sm text-gray-500">
            <span>Sold by <strong className="text-gray-700">{product.seller_name}</strong></span>
            {product.stock_quantity > 0 ? (
              <span className="text-teal-600 text-xs font-medium">{product.stock_quantity} in stock</span>
            ) : (
              <span className="text-red-500 text-xs font-medium">Only 1 available</span>
            )}
          </div>

          <button
            onClick={() => onAddToCart(product, () => {
              setToast(true);
              setTimeout(() => setToast(false), 1800);
            })}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-teal-600/20 cursor-pointer"
          >
            Add to Cart
          </button>
        </div>
      </div>
      <Toast message="Added to cart!" visible={toastVisible} />
    </div>
  );
}

// ── Hero Banner Slider ────────────────────────────────────────────────────

function HeroBannerSlider({ banners }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % (banners?.length || 1));
    }, 5000);
  }, [banners?.length]);

  useEffect(() => {
    if (banners && banners.length > 1) startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners, startTimer]);

  if (!banners || banners.length === 0) {
    return (
      <div className="w-full h-56 sm:h-72 md:h-80 bg-gradient-to-r from-teal-700 to-teal-500 rounded-2xl flex items-center justify-center">
        <div className="text-center text-white">
          <Recycle size={48} className="mx-auto mb-3 opacity-80" />
          <h2 className="text-2xl font-bold">Thrift Marketplace</h2>
          <p className="text-teal-100 mt-1">Pre-loved items at amazing prices</p>
        </div>
      </div>
    );
  }

  const banner = banners[current];
  const bannerImage = banner.image_url ? resolveImageUrl(banner.image_url) : null;

  return (
    <div className="relative w-full h-56 sm:h-72 md:h-80 rounded-2xl overflow-hidden group">
      {bannerImage ? (
        <img
          src={bannerImage}
          alt={banner.title}
          className="w-full h-full object-cover transition-opacity duration-500"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-r from-teal-700 to-teal-500 flex items-center justify-center">
          <div className="text-center text-white">
            <Recycle size={40} className="mx-auto mb-2 opacity-80" />
            <h3 className="text-xl font-bold">{banner.title}</h3>
          </div>
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

      {/* Banner Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
        <h3 className="text-white text-lg sm:text-xl font-bold mb-1">{banner.title}</h3>
        {banner.link_value && (
          <Link
            to={banner.link_type === 'product' ? `/product/${banner.link_value}` : '#'}
            className="inline-flex items-center gap-1 text-teal-200 text-sm font-medium hover:text-white transition-colors"
          >
            Shop Now <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={() => { setCurrent((current - 1 + banners.length) % banners.length); startTimer(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all cursor-pointer opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft size={16} className="text-gray-700" />
          </button>
          <button
            onClick={() => { setCurrent((current + 1) % banners.length); startTimer(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all cursor-pointer opacity-0 group-hover:opacity-100"
          >
            <ChevronRight size={16} className="text-gray-700" />
          </button>
        </>
      )}

      {/* Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrent(i); startTimer(); }}
              className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                i === current ? 'bg-white w-6' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Category Grid ─────────────────────────────────────────────────────────

function CategoryGrid({ categories, activeCategory, onSelectCategory }) {
  const getCategoryIcon = (id) => {
    switch (id) {
      case 'wedding_dress': return <Shirt size={22} />;
      case 'furniture': return <Sofa size={22} />;
      case 'electronics': return <Monitor size={22} />;
      case 'kitchen_items': return <Utensils size={22} />;
      case 'decoration': return <Sparkles size={22} />;
      case 'miscellaneous': return <Gift size={22} />;
      default: return <Package size={22} />;
    }
  };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
      {categories.map((cat) => {
        const isActive = activeCategory === cat.category_id;
        return (
          <button
            key={cat.category_id}
            onClick={() => onSelectCategory(cat.category_id)}
            className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${
              isActive
                ? 'border-teal-500 bg-teal-50 shadow-md shadow-teal-500/10'
                : 'border-gray-100 bg-white hover:border-teal-300 hover:shadow-sm'
            }`}
          >
            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center ${
              isActive ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-600'
            }`}>
              {getCategoryIcon(cat.category_id)}
            </div>
            <span className={`text-xs font-semibold text-center leading-tight ${
              isActive ? 'text-teal-700' : 'text-gray-600'
            }`}>
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Filter Sidebar ────────────────────────────────────────────────────────

function FilterSidebar({
  condition, setCondition,
  priceRange, setPriceRange,
  sortBy, setSortBy,
  activeCategory, setActiveCategory,
  categories,
  onReset,
  totalProducts,
}) {
  return (
    <div className="w-full lg:w-64 shrink-0 space-y-6">
      {/* Product Count */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-teal-700">
          <Package size={16} />
          <span className="text-sm font-bold">{totalProducts} Thrift Items</span>
        </div>
      </div>

      {/* Sort */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
          <SlidersHorizontal size={14} /> Sort By
        </h4>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Category Filter */}
      {categories && categories.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <ShoppingBag size={14} /> Category
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            <button
              onClick={() => setActiveCategory('')}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
                !activeCategory ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category_id}
                onClick={() => setActiveCategory(cat.category_id)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer capitalize ${
                  activeCategory === cat.category_id ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Condition Filter */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
          <Tag size={14} /> Condition
        </h4>
        <div className="space-y-1">
          {CONDITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCondition(opt.value)}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
                condition === opt.value ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
          <Filter size={14} /> Price Range
        </h4>
        <div className="space-y-1">
          {PRICE_RANGES.map((range, idx) => {
            const isSelected = priceRange.min === range.min && priceRange.max === range.max;
            return (
              <button
                key={idx}
                onClick={() => setPriceRange({ min: range.min, max: range.max })}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
                  isSelected ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {range.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset Button */}
      <button
        onClick={onReset}
        className="w-full py-2 text-sm text-teal-600 border border-teal-200 rounded-xl hover:bg-teal-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
      >
        <RefreshCw size={14} /> Reset Filters
      </button>
    </div>
  );
}

// ── Mobile Filter Drawer ──────────────────────────────────────────────────

function MobileFilterDrawer({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Filters</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main ThriftHomePage ──────────────────────────────────────────────────

export default function ThriftHomePage() {
  const navigate = useNavigate();

  // ── Navbar scroll behavior ──
  const [navbarVisible, setNavbarVisible] = useState(true);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop === 0) {
        setNavbarVisible(true);
      } else if (scrollTop > lastScrollTopRef.current && scrollTop > 10) {
        setNavbarVisible(false);
      }
      lastScrollTopRef.current = scrollTop;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Data State ──
  const [banners, setBanners] = useState([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);

  // ── Filters ──
  const [activeCategory, setActiveCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  // ── Product Detail Modal ──
  const [viewProduct, setViewProduct] = useState(null);

  // ── Wishlist ──
  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ss_thrift_wishlist') || '[]');
    } catch { return []; }
  });

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  // ── Toast ──
  const [toast, setToast] = useState({ message: '', visible: false });

  // ── Fetch banners ──
  useEffect(() => {
    (async () => {
      setBannersLoading(true);
      const data = await fetchJSON(`${NODE_BASE}/api/banners/active?storefront=thrift`);
      if (data?.success && data.banners) {
        setBanners(data.banners);
      } else if (data?.banners) {
        setBanners(data.banners);
      }
      setBannersLoading(false);
    })();
  }, []);

  // ── Fetch categories ──
  useEffect(() => {
    (async () => {
      setCategoriesLoading(true);
      const data = await fetchJSON(`${NODE_BASE}/api/categories`);
      if (data?.categories) {
        setCategories(data.categories);
      } else if (Array.isArray(data)) {
        setCategories(data);
      }
      setCategoriesLoading(false);
    })();
  }, []);

  // ── Fetch featured products (admin-curated) ──
  useEffect(() => {
    (async () => {
      setFeaturedLoading(true);
      const data = await fetchJSON(
        `${FLASK_BASE}/seller/products/public?marketplace_type=thrift&sort_by=newest&limit=8`
      );
      if (data?.products) {
        setFeaturedProducts(data.products.slice(0, 8));
      }
      setFeaturedLoading(false);
    })();
  }, []);

  // ── Fetch products with filters ──
  useEffect(() => {
    (async () => {
      setProductsLoading(true);
      const params = new URLSearchParams();
      params.set('marketplace_type', 'thrift');
      params.set('sort_by', sortBy);
      params.set('page', String(page));
      params.set('limit', '20');

      if (activeCategory) params.set('major_category', activeCategory);
      if (condition) params.set('condition_detail', condition);
      if (priceRange.min) params.set('min_price', priceRange.min);
      if (priceRange.max) params.set('max_price', priceRange.max);

      const data = await fetchJSON(`${FLASK_BASE}/seller/products/public?${params}`);
      if (data?.products) {
        setProducts(data.products);
        setTotalProducts(data.total || data.products.length);
      } else {
        setProducts([]);
        setTotalProducts(0);
      }
      setProductsLoading(false);
    })();
  }, [activeCategory, condition, priceRange, sortBy, page]);

  // ── Wishlist helpers ──
  const isWishlisted = useCallback((product) => {
    return wishlist.some((w) => w.product_id === product.product_id);
  }, [wishlist]);

  const toggleWishlist = useCallback((product) => {
    setWishlist((prev) => {
      const exists = prev.some((w) => w.product_id === product.product_id);
      const next = exists
        ? prev.filter((w) => w.product_id !== product.product_id)
        : [...prev, { product_id: product.product_id, title: product.title || product.name }];
      try {
        localStorage.setItem('ss_thrift_wishlist', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ── Add to cart ──
  const handleAddToCart = useCallback((product, onDone) => {
    try {
      const cart = JSON.parse(localStorage.getItem('ss_thrift_cart') || '[]');
      const exists = cart.find((item) => item.product_id === product.product_id);
      if (exists) {
        exists.qty = (exists.qty || 1) + 1;
      } else {
        cart.push({
          product_id: product.product_id,
          title: product.title || product.name,
          price: product.discount_price || product.price,
          original_price: product.original_price || null,
          condition: product.condition_detail || product.condition || '',
          is_final_sale: true,
          marketplace_type: 'thrift',
          qty: 1,
        });
      }
      localStorage.setItem('ss_thrift_cart', JSON.stringify(cart));
      window.dispatchEvent(new CustomEvent('thrift-cart-updated'));
      onDone?.();
    } catch {
      setToast({ message: 'Failed to add to cart', visible: true });
      setTimeout(() => setToast({ message: '', visible: false }), 2000);
    }
  }, []);

  // ── Search ──
  const handleSearch = useCallback((query) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.length < 3) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const data = await fetchJSON(
        `${FLASK_BASE}/seller/search?q=${encodeURIComponent(query)}&marketplace_type=thrift&limit=10`
      );
      setSearchResults(data?.products || []);
      setSearching(false);
    }, 400);
  }, []);

  // ── Reset filters ──
  const resetFilters = useCallback(() => {
    setActiveCategory('');
    setCondition('');
    setPriceRange({ min: '', max: '' });
    setSortBy('newest');
    setPage(1);
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  // ── Display products ──
  const displayProducts = searchResults !== null ? searchResults : products;
  const isSearchActive = searchResults !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Navbar ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-teal-100 shadow-sm transition-transform duration-300 ${
          navbarVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <Recycle size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-teal-700 leading-none">Thrift Market</h1>
              <span className="text-[10px] text-gray-400">by ShaadiSahulat</span>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden sm:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                placeholder="Search thrift items..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-gray-50"
              />
              {searching && (
                <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-500 animate-spin" />
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileFilter(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-teal-600 rounded-lg hover:bg-teal-50 transition-colors cursor-pointer"
            >
              <SlidersHorizontal size={18} />
            </button>
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
            >
              <Store size={14} /> New Marketplace
            </Link>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="sm:hidden px-4 pb-2">
          <div className="relative w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              placeholder="Search thrift items..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-gray-50"
            />
            {searching && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-500 animate-spin" />
            )}
          </div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 sm:pt-18 pb-12">

        {/* ── Hero Banner Slider ── */}
        <section className="mb-8">
          {bannersLoading ? (
            <BannerSkeleton />
          ) : (
            <HeroBannerSlider banners={banners} />
          )}
        </section>

        {/* ── Category Grid ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">Browse Categories</h2>
            {activeCategory && (
              <button
                onClick={() => setActiveCategory('')}
                className="text-xs text-teal-600 hover:text-teal-800 font-medium cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>
          {categoriesLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CategorySkeleton key={i} />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <CategoryGrid
              categories={categories}
              activeCategory={activeCategory}
              onSelectCategory={(id) => {
                setActiveCategory(id);
                setPage(1);
              }}
            />
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Package size={32} className="mx-auto mb-2" />
              <p className="text-sm">No categories available</p>
            </div>
          )}
        </section>

        {/* ── Featured Thrift Products ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                <Sparkles size={20} className="text-teal-600" /> Featured Thrift Finds
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Admin-curated highlights</p>
            </div>
          </div>
          {featuredLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {featuredProducts.map((product) => (
                <ThriftProductCard
                  key={product.product_id}
                  product={product}
                  onView={setViewProduct}
                  onAddToCart={handleAddToCart}
                  isWishlisted={isWishlisted(product)}
                  onToggleWishlist={toggleWishlist}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <Recycle size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">No featured thrift items yet</p>
              <p className="text-xs text-gray-400 mt-1">Check back soon for curated picks!</p>
            </div>
          )}
        </section>

        {/* ── Recently Added Products + Sidebar ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                <RefreshCw size={20} className="text-teal-600" /> Recently Added
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isSearchActive
                  ? `${displayProducts.length} result${displayProducts.length !== 1 ? 's' : ''} for "${searchQuery}"`
                  : `${totalProducts} thrift item${totalProducts !== 1 ? 's' : ''} available`
                }
              </p>
            </div>
            <button
              onClick={() => setShowMobileFilter(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer"
            >
              <Filter size={14} /> Filters
            </button>
          </div>

          <div className="flex gap-6">
            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
              <FilterSidebar
                condition={condition}
                setCondition={(v) => { setCondition(v); setPage(1); }}
                priceRange={priceRange}
                setPriceRange={(v) => { setPriceRange(v); setPage(1); }}
                sortBy={sortBy}
                setSortBy={setSortBy}
                activeCategory={activeCategory}
                setActiveCategory={(v) => { setActiveCategory(v); setPage(1); }}
                categories={categories}
                onReset={resetFilters}
                totalProducts={totalProducts}
              />
            </div>

            {/* Products Grid */}
            <div className="flex-1">
              {productsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              ) : displayProducts.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {displayProducts.map((product) => (
                      <ThriftProductCard
                        key={product.product_id}
                        product={product}
                        onView={setViewProduct}
                        onAddToCart={handleAddToCart}
                        isWishlisted={isWishlisted(product)}
                        onToggleWishlist={toggleWishlist}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  {!isSearchActive && totalProducts > 20 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-500">
                        Page {page} of {Math.ceil(totalProducts / 20)}
                      </span>
                      <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page * 20 >= totalProducts}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                  <Recycle size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500 font-medium">
                    {isSearchActive
                      ? 'No results found for your search'
                      : 'No thrift items found with current filters'
                    }
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try adjusting your filters or search terms
                  </p>
                  <button
                    onClick={resetFilters}
                    className="mt-4 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-teal-800 text-teal-100 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
                <Recycle size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Thrift Marketplace</p>
                <p className="text-xs text-teal-300">by ShaadiSahulat</p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-xs text-teal-300">
              <Link to="/" className="hover:text-white transition-colors">New Marketplace</Link>
              <span>All items are pre-owned</span>
              <span>Final Sale — No Returns</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Mobile Filter Drawer ── */}
      <MobileFilterDrawer open={showMobileFilter} onClose={() => setShowMobileFilter(false)}>
        <FilterSidebar
          condition={condition}
          setCondition={(v) => { setCondition(v); setPage(1); }}
          priceRange={priceRange}
          setPriceRange={(v) => { setPriceRange(v); setPage(1); }}
          sortBy={sortBy}
          setSortBy={setSortBy}
          activeCategory={activeCategory}
          setActiveCategory={(v) => { setActiveCategory(v); setPage(1); }}
          categories={categories}
          onReset={() => { resetFilters(); setShowMobileFilter(false); }}
          totalProducts={totalProducts}
        />
      </MobileFilterDrawer>

      {/* ── Product Detail Modal ── */}
      {viewProduct && (
        <ThriftProductDetailModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onAddToCart={handleAddToCart}
          isWishlisted={isWishlisted(viewProduct)}
          onToggleWishlist={toggleWishlist}
        />
      )}

      {/* ── Global Toast ── */}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
