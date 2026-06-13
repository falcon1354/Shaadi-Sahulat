import React, { useState, useEffect, useCallback, useRef } from 'react';
import sellerApi from '../../api/sellerApi';
import { useCart } from '../../context/CartContext';

const MAJOR_CATS = [
  { id: '',              label: 'All',          icon: '🛍️' },
  { id: 'wedding_dress', label: 'Wedding Dress', icon: '👗' },
  { id: 'furniture',     label: 'Furniture',    icon: '🛋️' },
  { id: 'electronics',   label: 'Electronics',  icon: '📺' },
  { id: 'kitchen_items', label: 'Kitchen',      icon: '🍳' },
  { id: 'decoration',    label: 'Decoration',   icon: '✨' },
  { id: 'miscellaneous', label: 'Misc',         icon: '🎁' },
];

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'price_asc',  label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

const CONDITIONS = ['', 'New', 'Like New', 'Used', 'Thrift'];
const BIG_CATS   = ['furniture', 'electronics', 'wedding_dress', 'jewelry'];
const SMALL_CATS = ['miscellaneous', 'decoration', 'kitchen_items'];

// ── localStorage helpers ──────────────────────────────────────────────────

function readDowry() {
  try { return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null'); }
  catch { return null; }
}

function getBudgetForCategory(cat) {
  try {
    const data = readDowry();
    if (!data?.category_budgets) return null;
    return data.category_budgets[cat] || null;
  } catch { return null; }
}

function readWishlist() {
  try { return JSON.parse(localStorage.getItem('ss_wishlist') || '[]'); }
  catch { return []; }
}

function saveWishlist(list) {
  try { localStorage.setItem('ss_wishlist', JSON.stringify(list)); } catch {}
}

function saveRecentlyViewed(product) {
  try {
    const current = JSON.parse(localStorage.getItem('ss_recently_viewed') || '[]');
    const filtered = current.filter(p => p.product_id !== product.product_id);
    const entry = {
      product_id:    product.product_id,
      title:         product.title,
      price:         product.price,
      major_category: product.major_category,
    };
    const updated = [entry, ...filtered].slice(0, 10);
    localStorage.setItem('ss_recently_viewed', JSON.stringify(updated));
  } catch {}
}

function shiftBudget(fromCat, toCat, amount) {
  try {
    const dowry = readDowry();
    if (!dowry?.category_budgets) return false;
    const budgets = dowry.category_budgets;
    const src = budgets[fromCat];
    const dst = budgets[toCat];
    if (!src || !dst) return false;
    const available = src.remaining ?? src.estimated ?? 0;
    if (amount > available) return false;
    src.estimated  = (src.estimated  || 0) - amount;
    src.remaining  = (src.remaining  ?? src.estimated) - amount;
    dst.estimated  = (dst.estimated  || 0) + amount;
    dst.remaining  = (dst.remaining  ?? dst.estimated) + amount;
    localStorage.setItem('ss_dowry_latest', JSON.stringify({ ...dowry, category_budgets: budgets }));
    return true;
  } catch { return false; }
}

// ── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
      {message}
    </div>
  );
}

// ── Budget Overshoot Modal (§11.4) ────────────────────────────────────────

function OvershootModal({ state, onContinue, onShift, onClose }) {
  if (!state) return null;
  const { product, overshoot, scenario, cat } = state;
  const catLabel = MAJOR_CATS.find(c => c.id === cat)?.label || cat;
  const isBig    = scenario === 'D';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="text-center mb-4">
          <span className="text-4xl">{isBig ? '⚠️' : '💸'}</span>
          <h3 className="text-lg font-bold text-gray-800 mt-2">
            {scenario === 'B'
              ? `Slight Budget Overshoot`
              : `${catLabel} Budget Exceeded`}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {scenario === 'B'
              ? `This item slightly exceeds your ${catLabel} budget by`
              : `This item exceeds your ${catLabel} budget by`}
            {' '}
            <span className="font-bold text-red-600">PKR {overshoot.toLocaleString()}</span>
          </p>
          {isBig && overshoot > 50000 && (
            <p className="text-xs text-blue-600 mt-2 bg-blue-50 rounded-lg p-2">
              💳 Consider our BNPL option to spread the cost.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onShift}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-colors">
            Shift Budget from Another Category
          </button>
          <button
            onClick={onContinue}
            className="w-full py-2 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors">
            Continue Anyway (over-budget)
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget Shift Modal (§11.5) ────────────────────────────────────────────

function BudgetShiftModal({ targetCat, overshoot, onDone, onClose }) {
  const dowry   = readDowry();
  const budgets = dowry?.category_budgets || {};
  const cats    = Object.entries(budgets).filter(([k, v]) => k !== targetCat && (v.remaining ?? v.estimated ?? 0) > 0);
  const [fromCat, setFromCat] = useState(cats[0]?.[0] || '');
  const [amount,  setAmount]  = useState(overshoot > 0 ? String(overshoot) : '');
  const [error,   setError]   = useState('');

  const fromBudget = fromCat ? budgets[fromCat] : null;
  const maxShift   = fromBudget ? (fromBudget.remaining ?? fromBudget.estimated ?? 0) : 0;

  const handleConfirm = () => {
    const amt = Number(amount);
    if (!fromCat) return setError('Select a source category.');
    if (!amt || amt <= 0) return setError('Enter a valid amount.');
    if (amt > maxShift) return setError(`Maximum available from this category: PKR ${maxShift.toLocaleString()}`);
    const ok = shiftBudget(fromCat, targetCat, amt);
    if (ok) { onDone(); }
    else setError('Shift failed. Please try again.');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Shift Budget</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Shift From</label>
            <select
              value={fromCat}
              onChange={e => { setFromCat(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
              <option value="">Select category…</option>
              {cats.map(([k, v]) => (
                <option key={k} value={k}>
                  {MAJOR_CATS.find(c => c.id === k)?.label || k} — PKR {(v.remaining ?? v.estimated ?? 0).toLocaleString()} available
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (PKR)</label>
            <input
              type="number"
              value={amount}
              min="1"
              max={maxShift}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
            />
            {fromCat && (
              <p className="text-xs text-gray-400 mt-1">Max available: PKR {maxShift.toLocaleString()}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Shift To</label>
            <div className="border border-purple-200 bg-purple-50 rounded-xl px-3 py-2 text-sm text-purple-700 font-medium">
              {MAJOR_CATS.find(c => c.id === targetCat)?.label || targetCat}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-colors">
            Confirm Shift
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────

function ProductCard({ product, onView, highlight, onAddToCart, isWishlisted, onToggleWishlist }) {
  const [toastVisible, setToast] = useState(false);
  const imageUrl  = sellerApi.resolveImageUrl(product.primary_image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const cardRef   = useRef(null);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardRef.current.classList.add('ring-2', 'ring-purple-400');
      const t = setTimeout(() => cardRef.current?.classList.remove('ring-2', 'ring-purple-400'), 3000);
      return () => clearTimeout(t);
    }
  }, [highlight]);

  const handleAddToCart = (e) => {
    e.stopPropagation();
    onAddToCart(product, () => { setToast(true); setTimeout(() => setToast(false), 1800); });
  };

  return (
    <>
      <div ref={cardRef}
        className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all overflow-hidden flex flex-col">
        {/* Image */}
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={product.title} className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">
              {MAJOR_CATS.find(c => c.id === product.major_category)?.icon || '📦'}
            </div>
          )}
          {hasDiscount && (
            <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {product.discount_pct ? `${Math.round(product.discount_pct)}% OFF` : 'SALE'}
            </span>
          )}
          {product.condition && product.condition !== 'New' && (
            <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
              {product.condition}
            </span>
          )}
          {product.similarity_score !== undefined && (
            <span className="absolute bottom-2 right-2 bg-purple-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {Math.round(product.similarity_score * 100)}% match
            </span>
          )}
          {/* Wishlist heart */}
          <button
            onClick={e => { e.stopPropagation(); onToggleWishlist(product); }}
            className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all ${
              isWishlisted ? 'bg-pink-500 text-white' : 'bg-white/80 text-gray-400 hover:text-pink-500'
            } ${product.condition && product.condition !== 'New' ? 'top-8' : 'top-2'}`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}>
            ❤
          </button>
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col flex-1">
          <p className="text-xs text-purple-500 font-medium mb-0.5 capitalize">
            {product.major_category?.replace(/_/g, ' ')}
            {product.subcategory ? ` › ${product.subcategory.replace(/_/g, ' ')}` : ''}
          </p>
          <p className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1">{product.title}</p>

          <div className="mt-2 flex items-center gap-2">
            {hasDiscount ? (
              <>
                <span className="text-sm font-bold text-green-600">PKR {product.discount_price.toLocaleString()}</span>
                <span className="text-xs text-gray-400 line-through">PKR {product.price.toLocaleString()}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-purple-700">PKR {product.price?.toLocaleString()}</span>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span>{product.seller_name || 'Seller'}</span>
            {product.city && <span>📍 {product.city}</span>}
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={() => onView && onView(product)}
              className="flex-1 py-1.5 text-xs font-semibold text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors">
              View Details
            </button>
            <button onClick={handleAddToCart}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">
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

function ProductDetailModal({ product, onClose, onAddToCart, isWishlisted, onToggleWishlist }) {
  const [toastVisible, setToast] = useState(false);
  if (!product) return null;

  const imageUrl    = sellerApi.resolveImageUrl(product.primary_image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;

  const fields = [
    product.color           && { label: 'Color',      value: product.color },
    product.fabric          && { label: 'Fabric',     value: product.fabric },
    product.embroidery_type && { label: 'Embroidery', value: product.embroidery_type },
    product.size            && { label: 'Size',       value: product.size },
    product.material        && { label: 'Material',   value: product.material },
    product.brand           && { label: 'Brand',      value: product.brand },
    product.condition       && { label: 'Condition',  value: product.condition },
    product.city            && { label: 'City',       value: product.city },
  ].filter(Boolean);

  const budgetInfo = product.major_category ? getBudgetForCategory(product.major_category) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-gray-50">
            <img src={imageUrl} alt={product.title} className="w-full h-full object-cover" />
            <button
              onClick={() => onToggleWishlist(product)}
              className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all ${
                isWishlisted ? 'bg-pink-500 text-white' : 'bg-white/90 text-gray-400 hover:text-pink-500'
              }`}>
              ❤
            </button>
          </div>
        )}
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-purple-500 font-medium capitalize mb-1">
                {product.major_category?.replace(/_/g, ' ')}
              </p>
              <h2 className="text-lg font-bold text-gray-800">{product.title}</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1">×</button>
          </div>

          {/* Budget banner inside modal */}
          {budgetInfo && (
            <div className="mb-3 p-3 bg-purple-50 rounded-xl border border-purple-100 text-xs">
              <p className="font-semibold text-purple-700 capitalize mb-1">
                Your {product.major_category?.replace(/_/g, ' ')} Budget
              </p>
              <div className="flex gap-3 text-gray-600">
                <span>Budget: <strong>PKR {budgetInfo.estimated?.toLocaleString()}</strong></span>
                <span>Spent: <strong>PKR {(budgetInfo.spent || 0).toLocaleString()}</strong></span>
                <span className={budgetInfo.remaining < 0 ? 'text-red-500' : 'text-green-600'}>
                  Left: <strong>PKR {(budgetInfo.remaining ?? budgetInfo.estimated ?? 0).toLocaleString()}</strong>
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            {hasDiscount ? (
              <>
                <span className="text-xl font-bold text-green-600">PKR {product.discount_price.toLocaleString()}</span>
                <span className="text-sm text-gray-400 line-through">PKR {product.price.toLocaleString()}</span>
                <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">
                  {Math.round(product.discount_pct || 0)}% OFF
                </span>
              </>
            ) : (
              <span className="text-xl font-bold text-purple-700">PKR {product.price?.toLocaleString()}</span>
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
            {product.stock_quantity > 0 && (
              <span className="text-green-600 text-xs font-medium">{product.stock_quantity} in stock</span>
            )}
          </div>

          <button
            onClick={() => onAddToCart(product, () => { setToast(true); setTimeout(() => setToast(false), 1800); })}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-colors">
            Add to Cart
          </button>
        </div>
      </div>
      <Toast message="Added to cart!" visible={toastVisible} />
    </div>
  );
}

// ── Main MarketplacePage ──────────────────────────────────────────────────

export default function MarketplacePage({ highlightProductId, onHighlightCleared, buyer }) {
  const { addItem } = useCart();

  const [activeCat,   setActiveCat]   = useState('');
  const [products,    setProducts]    = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [viewProduct, setViewProduct] = useState(null);

  // Search
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching,     setSearching]     = useState(false);
  const searchTimer = useRef(null);

  // Filters
  const [sortBy,     setSortBy]     = useState('newest');
  const [condition,  setCondition]  = useState('');
  const [minPrice,   setMinPrice]   = useState('');
  const [maxPrice,   setMaxPrice]   = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  // Wishlist
  const [wishlist, setWishlist] = useState(() => readWishlist());

  // §11.4 Overshoot modal
  const [overshootState, setOvershootState] = useState(null);
  const [pendingCallback, setPendingCallback] = useState(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftToast, setShiftToast] = useState('');

  const LIMIT = 12;

  const budgetInfo = activeCat ? getBudgetForCategory(activeCat) : null;

  const load = useCallback(async () => {
    if (searchResults !== null) return;
    setLoading(true);
    try {
      const data = await sellerApi.getPublicProducts({
        major_category: activeCat || undefined,
        condition:      condition  || undefined,
        min_price:      minPrice   || undefined,
        max_price:      maxPrice   || undefined,
        city:           cityFilter || undefined,
        sort_by:        sortBy,
        page,
        limit: LIMIT,
      });
      if (data.success !== false) {
        setProducts(data.products || []);
        setTotal(data.total || 0);
      }
    } catch (_) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [activeCat, condition, minPrice, maxPrice, cityFilter, sortBy, page, searchResults]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!highlightProductId) return;
    const found = products.find(p => p.product_id === highlightProductId);
    if (found) { setViewProduct(found); onHighlightCleared?.(); }
  }, [highlightProductId, products, onHighlightCleared]);

  // Save recently viewed when product modal opens
  useEffect(() => {
    if (viewProduct) saveRecentlyViewed(viewProduct);
  }, [viewProduct]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 3) { setSearchResults(null); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/seller/search?q=${encodeURIComponent(searchQuery)}&major_category=${activeCat}&limit=12`);
        const data = await res.json();
        setSearchResults(data.success !== false ? (data.products || []) : []);
      } catch { setSearchResults([]); }
      finally  { setSearching(false); }
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, activeCat]);

  const clearSearch = () => { setSearchQuery(''); setSearchResults(null); };
  const handleCatChange = (id) => { setActiveCat(id); setPage(1); clearSearch(); };
  const applyFilters    = () => { setPage(1); setShowFilter(false); load(); };
  const clearFilters    = () => { setCondition(''); setMinPrice(''); setMaxPrice(''); setCityFilter(''); setSortBy('newest'); setPage(1); };

  // Wishlist toggle
  const toggleWishlist = (product) => {
    setWishlist(prev => {
      const exists  = prev.some(p => p.product_id === product.product_id);
      const updated = exists
        ? prev.filter(p => p.product_id !== product.product_id)
        : [...prev, {
            product_id:     product.product_id,
            title:          product.title,
            price:          product.discount_price || product.price,
            major_category: product.major_category,
          }];
      saveWishlist(updated);
      return updated;
    });
  };

  // §11.4 Budget check before adding to cart
  const handleAddToCart = (product, onSuccess) => {
    const price     = product.discount_price || product.price || 0;
    const cat       = product.major_category;
    const budget    = cat ? getBudgetForCategory(cat) : null;
    const remaining = budget ? (budget.remaining ?? budget.estimated ?? 0) : null;
    const overshoot = remaining !== null ? price - remaining : -1;

    if (overshoot <= 0 || remaining === null) {
      addItem(product);
      onSuccess?.();
      return;
    }

    // Scenario B: small category, small overshoot → subtle toast then add
    if (SMALL_CATS.includes(cat) && overshoot <= 5000) {
      addItem(product);
      onSuccess?.();
      setShiftToast(`This item slightly exceeds your ${cat.replace(/_/g, ' ')} budget by PKR ${overshoot.toLocaleString()}.`);
      setTimeout(() => setShiftToast(''), 3500);
      return;
    }

    // Scenario C or D → show overshoot modal
    setPendingCallback(() => () => { addItem(product); onSuccess?.(); });
    setOvershootState({
      product,
      overshoot,
      scenario: BIG_CATS.includes(cat) ? 'D' : 'C',
      cat,
    });
  };

  const handleOvershootContinue = () => {
    pendingCallback?.();
    setOvershootState(null);
    setPendingCallback(null);
  };

  const handleOvershootShift = () => {
    setShiftModalOpen(true);
  };

  const handleShiftDone = () => {
    setShiftModalOpen(false);
    setShiftToast('Budget shifted successfully! Retry adding the item.');
    setTimeout(() => setShiftToast(''), 3000);
    setOvershootState(null);
    setPendingCallback(null);
  };

  const displayProducts = searchResults !== null ? searchResults : products;
  const totalPages      = searchResults !== null ? 1 : Math.ceil(total / LIMIT);

  return (
    <div className="animate-fade-in">
      {/* Title */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-800">Marketplace</h2>
        <p className="text-sm text-gray-500 mt-1">Browse wedding products from our verified sellers</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by description… (e.g. red silk lehenga)"
          className="w-full pl-9 pr-24 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
        />
        {searchQuery && (
          <button onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
            Clear
          </button>
        )}
        {searching && (
          <div className="absolute right-16 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {MAJOR_CATS.map(cat => (
          <button key={cat.id} onClick={() => handleCatChange(cat.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              activeCat === cat.id
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
            }`}>
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Budget banner (§4.4) */}
      {activeCat && budgetInfo && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-4 text-sm flex-wrap">
          <span className="font-semibold text-purple-700 capitalize">
            {MAJOR_CATS.find(c => c.id === activeCat)?.label} Budget
          </span>
          <span className="text-gray-600">
            Estimated: <strong>PKR {budgetInfo.estimated?.toLocaleString()}</strong>
          </span>
          <span className="text-gray-600">
            Spent: <strong>PKR {(budgetInfo.spent || 0).toLocaleString()}</strong>
          </span>
          <span className={budgetInfo.remaining < 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
            Remaining: PKR {(budgetInfo.remaining ?? budgetInfo.estimated ?? 0).toLocaleString()}
          </span>
        </div>
      )}

      {/* Search results header */}
      {searchResults !== null && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {searching ? 'Searching…' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`}
          </span>
          <button onClick={clearSearch} className="text-xs text-purple-500 hover:underline">Show all</button>
        </div>
      )}

      {/* Controls row */}
      {searchResults === null && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {loading ? 'Loading…' : `${total} product${total !== 1 ? 's' : ''}`}
            </span>
            <button onClick={() => setShowFilter(v => !v)}
              className={`text-xs px-3 py-1.5 border rounded-lg font-medium transition-colors ${
                showFilter ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'
              }`}>
              Filters
            </button>
            {(condition || minPrice || maxPrice || cityFilter) && (
              <button onClick={clearFilters} className="text-xs text-red-400 hover:text-red-600">Clear</button>
            )}
          </div>
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Filter panel */}
      {showFilter && searchResults === null && (
        <div className="bg-white rounded-xl border border-purple-100 p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Min Price (PKR)</label>
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)}
              placeholder="0" min="0"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Price (PKR)</label>
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
              placeholder="Any" min="0"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
              <option value="">All</option>
              {CONDITIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input type="text" value={cityFilter} onChange={e => setCityFilter(e.target.value)}
              placeholder="e.g. Lahore"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div className="col-span-2 md:col-span-4 flex gap-2 justify-end">
            <button onClick={clearFilters}
              className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">Reset</button>
            <button onClick={applyFilters}
              className="px-4 py-1.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg font-medium">Apply</button>
          </div>
        </div>
      )}

      {/* Product grid */}
      {(loading || searching) ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
        </div>
      ) : displayProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">{searchResults !== null ? '🔍' : '🛍️'}</p>
          <p className="text-gray-500 text-sm">
            {searchResults !== null
              ? `No products match "${searchQuery}". Try different keywords.`
              : 'No products found in this category yet.'}
          </p>
          {searchResults !== null && (
            <button onClick={clearSearch} className="mt-2 text-xs text-purple-500 hover:underline">
              Browse all products
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayProducts.map(p => (
            <ProductCard
              key={p.product_id}
              product={p}
              onView={setViewProduct}
              highlight={highlightProductId === p.product_id}
              onAddToCart={handleAddToCart}
              isWishlisted={wishlist.some(w => w.product_id === p.product_id)}
              onToggleWishlist={toggleWishlist}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {searchResults === null && totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-40 hover:border-purple-400 transition-colors">
            ← Prev
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-40 hover:border-purple-400 transition-colors">
            Next →
          </button>
        </div>
      )}

      {/* Product detail modal */}
      {viewProduct && (
        <ProductDetailModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onAddToCart={handleAddToCart}
          isWishlisted={wishlist.some(w => w.product_id === viewProduct.product_id)}
          onToggleWishlist={toggleWishlist}
        />
      )}

      {/* §11.4 Overshoot modal */}
      <OvershootModal
        state={overshootState}
        onContinue={handleOvershootContinue}
        onShift={handleOvershootShift}
        onClose={() => { setOvershootState(null); setPendingCallback(null); }}
      />

      {/* §11.5 Budget shift modal */}
      {shiftModalOpen && overshootState && (
        <BudgetShiftModal
          targetCat={overshootState.cat}
          overshoot={overshootState.overshoot}
          onDone={handleShiftDone}
          onClose={() => setShiftModalOpen(false)}
        />
      )}

      {/* Scenario B subtle toast / shift success toast */}
      <Toast message={shiftToast} visible={!!shiftToast} />
    </div>
  );
}
