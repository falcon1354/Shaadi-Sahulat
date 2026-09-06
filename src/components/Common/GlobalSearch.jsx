import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, Package } from 'lucide-react';
import sellerApi from '../../api/sellerApi';

/**
 * GlobalSearch — buyer navbar search bar that searches BOTH retail and thrift
 * products via the unified /api/seller/search endpoint (no marketplace_type
 * filter).
 *
 * Behaviour:
 *  - Debounced search (300ms) once the query is >= 2 chars.
 *  - Results are grouped by `marketplace_type` ("Retail" / "Thrift").
 *  - Clicking a result navigates to /buyer/retail/product/:id or
 *    /buyer/thrift/product/:id based on the item's marketplace_type.
 *  - Shows a loading spinner while searching, and a graceful empty state.
 *  - Closes the dropdown on outside click, Escape key, or result click.
 *
 * Props:
 *   onSelectProduct(product) — optional override; if not provided, navigates.
 *   autoFocus                — focus the input on mount.
 */
export default function GlobalSearch({ onSelectProduct, autoFocus } = {}) {
  const navigate = useNavigate();
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState(null);  // null = not searched yet
  const [loading, setLoading]       = useState(false);
  const [isOpen, setIsOpen]         = useState(false);

  const inputRef = useRef(null);
  const wrapRef  = useRef(null);
  const timerRef = useRef(null);
  const reqIdRef = useRef(0); // guard against out-of-order responses

  // ── Outside-click + Escape handling ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setIsOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // ── Debounced search ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    clearTimeout(timerRef.current);
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const reqId = ++reqIdRef.current;
      try {
        const data = await sellerApi.searchAll({ q, limit: 20 });
        // Ignore stale responses
        if (reqId !== reqIdRef.current) return;
        const products = (data && data.success !== false && data.products) || [];
        setResults(products);
      } catch {
        if (reqId !== reqIdRef.current) return;
        setResults([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // ── Group results by marketplace_type ───────────────────────────────────
  const grouped = useMemo(() => {
    const retail = [];
    const thrift = [];
    for (const p of results || []) {
      if (p.marketplace_type === 'thrift') thrift.push(p);
      else                                 retail.push(p);
    }
    return { retail, thrift };
  }, [results]);

  const totalCount = (results?.length) || 0;

  // ── Selection handler ───────────────────────────────────────────────────
  const handleSelect = useCallback((product) => {
    const isThrift = product.marketplace_type === 'thrift';
    const path = `/buyer/${isThrift ? 'thrift' : 'retail'}/product/${product.product_id}`;
    if (typeof onSelectProduct === 'function') {
      onSelectProduct(product, path);
    } else {
      navigate(path, { state: { product, from: isThrift ? 'thrift' : 'marketplace' } });
    }
    setIsOpen(false);
    setQuery('');
    setResults(null);
    inputRef.current?.blur();
  }, [navigate, onSelectProduct]);

  const showDropdown = isOpen && (loading || results !== null);

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl">
      {/* Search input */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Search all of ShaadiSahulat"
          className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] focus:border-[#ECD4A8] transition-all shadow-sm"
          aria-label="Search products"
        />
        {/* Right-side affordance: spinner / clear */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
          {loading ? (
            <Loader2 size={16} className="text-[#a37b3d] animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[28rem] overflow-y-auto z-50 animate-fade-in">
          {loading ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          ) : totalCount === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-2xl mb-1">🔍</p>
              <p className="text-sm text-gray-500">No products match “{query}”.</p>
              <p className="text-xs text-gray-400 mt-1">Try a different keyword.</p>
            </div>
          ) : (
            <>
              {/* Retail group */}
              {grouped.retail.length > 0 && (
                <SearchGroup
                  label="🛍️ Retail"
                  products={grouped.retail}
                  onSelect={handleSelect}
                />
              )}
              {/* Thrift group */}
              {grouped.thrift.length > 0 && (
                <SearchGroup
                  label="♻️ Thrift"
                  products={grouped.thrift}
                  onSelect={handleSelect}
                />
              )}
              {/* Footer summary */}
              <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100 bg-gray-50/50">
                {totalCount} result{totalCount !== 1 ? 's' : ''} for “{query}”
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-component: result group with a heading ─────────────────────────────
function SearchGroup({ label, products, onSelect }) {
  return (
    <div className="py-1">
      <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      {products.map((p) => (
        <SearchResult key={`${p.marketplace_type}-${p.product_id}`} product={p} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ── Sub-component: single result row ──────────────────────────────────────
function SearchResult({ product, onSelect }) {
  const imageUrl  = sellerApi.resolveImageUrl(product.primary_image_url);
  const isThrift  = product.marketplace_type === 'thrift';
  const price     = product.discount_price || product.price;
  const hasDiscount = product.discount_price && product.price && product.discount_price < product.price;

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="w-full text-left px-4 py-2 hover:bg-[#FFF5F8] transition-colors flex items-center gap-3 group"
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <Package size={16} className="text-gray-300" />
        )}
      </div>
      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#a37b3d]">
          {product.title}
        </p>
        <p className="text-[11px] text-gray-500 truncate flex items-center gap-1.5">
          <span className="capitalize">{product.major_category?.replace(/_/g, ' ')}</span>
          {product.seller_name && (
            <>
              <span className="text-gray-300">·</span>
              <span className="truncate">{product.seller_name}</span>
            </>
          )}
        </p>
      </div>
      {/* Price + type tag */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-[#a37b3d]">PKR {price?.toLocaleString?.() || '—'}</p>
        <span
          className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
            isThrift
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-[#FFF5F8] text-[#a37b3d] border border-[#FBEFF1]'
          }`}
        >
          {isThrift ? 'Thrift' : 'Retail'}
          {hasDiscount && ' · Sale'}
        </span>
      </div>
    </button>
  );
}
