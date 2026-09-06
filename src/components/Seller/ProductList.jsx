import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ExternalLink, Search, ChevronRight } from 'lucide-react';
import sellerApi from '../../api/sellerApi';
import { useCategories } from '../../hooks/useCategories';

const STATUS_COLORS = {
  available:    'bg-emerald-100 text-emerald-700',
  processing:   'bg-amber-100 text-amber-700',
  out_of_stock: 'bg-red-100 text-red-700',
  hidden:       'bg-gray-200 text-gray-600',
  freeze:       'bg-slate-200 text-slate-700',
};
const STATUS_OPTIONS = ['available', 'out_of_stock', 'hidden', 'processing', 'freeze'];

// ── Edit Modal ────────────────────────────────────────────────────────────

function EditModal({ product, onSave, onClose }) {
  const [form,    setForm]    = useState({
    title:              product.title         || '',
    description:        product.description   || '',
    price:              product.price         || '',
    discount_price:     product.discount_price || '',
    discount_pct:       product.discount_pct   || '',
    stock_quantity:     product.stock_quantity || 1,
    availability_status: product.availability_status || 'available',
    color:              product.color      || '',
    fabric:             product.fabric     || '',
    embroidery_type:    product.embroidery_type || '',
    size:               product.size       || '',
    material:           product.material   || '',
    brand:              product.brand      || '',
    condition:          product.condition  || '',
  });
  const [discountEnabled, setDiscountEnabled] = useState(
    !!(product.discount_price && product.discount_price < product.price)
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [priceSuggestion, setPriceSuggestion] = useState(null);

  // Load price suggestion
  useEffect(() => {
    if (!product.major_category) return;
    const params = new URLSearchParams({
      major_category: product.major_category,
      subcategory:    product.subcategory || '',
      item_type:      product.item_type   || '',
      color:          form.color          || '',
      condition:      form.condition      || '',
    });
    fetch(`/api/seller/price-suggestion?${params}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.suggestion) setPriceSuggestion(data.suggestion); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.major_category, product.subcategory, product.item_type]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        title:               form.title,
        description:         form.description,
        price:               Number(form.price),
        stock_quantity:      Number(form.stock_quantity),
        availability_status: form.availability_status,
        color:               form.color,
        fabric:              form.fabric,
        embroidery_type:     form.embroidery_type,
        size:                form.size,
        material:            form.material,
        brand:               form.brand,
        condition:           form.condition,
      };

      if (discountEnabled && form.discount_price) {
        payload.discount_price = Number(form.discount_price);
        const pct = ((payload.price - payload.discount_price) / payload.price) * 100;
        payload.discount_pct = Math.round(pct);
      } else {
        payload.discount_price = null;
        payload.discount_pct   = null;
      }

      const result = await sellerApi.updateProduct(product.product_id, payload);
      if (result.success) {
        onSave({ ...product, ...payload });
      } else {
        setError(result.error || 'Update failed.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Edit Product</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input type="text" value={form.title} onChange={e => update('title', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Price (PKR)</label>
            {priceSuggestion && (() => {
              const price    = Number(form.price);
              const avg      = priceSuggestion.avg || 0;
              const lo       = priceSuggestion.range_low  || priceSuggestion.p25  || 0;
              const hi       = priceSuggestion.range_high || priceSuggestion.p75  || 0;
              const band     = priceSuggestion.band_pct || 30;
              const devPct   = avg > 0 ? Math.round(Math.abs(price - avg) / avg * 100) : 0;
              const isHardBlock = price > 0 && avg > 0 && price > avg * 2;
              const isSoftWarn  = price > 0 && avg > 0 && devPct > band && !isHardBlock;
              const isOK        = price > 0 && avg > 0 && devPct <= band;
              return (
                  <div className="mb-1.5 text-[10px] bg-[#FFF5F8] rounded-lg px-2 py-1.5 space-y-0.5">
                    <div className="text-[#a37b3d]">
                    Suggested: PKR {lo.toLocaleString()} – {hi.toLocaleString()}
                    <span className="text-gray-400 ml-1">(avg PKR {avg.toLocaleString()}, ±{band}%)</span>
                  </div>
                  {isHardBlock && (
                    <div className="text-red-600 font-bold">
                      🚫 Price too high — max allowed PKR {Math.round(avg * 2).toLocaleString()}
                    </div>
                  )}
                  {isSoftWarn && (
                    <div className="text-amber-600 font-semibold">
                      ⚠ {price > avg ? 'Above' : 'Below'} suggested range by {devPct}%. Are you sure?
                    </div>
                  )}
                  {isOK && <div className="text-green-600">✓ Within recommended range</div>}
                </div>
              );
            })()}
            <input type="number" value={form.price} onChange={e => update('price', e.target.value)}
              min="0"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setDiscountEnabled(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${discountEnabled ? 'bg-[#a37b3d]' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${discountEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-medium text-gray-600">Discount / Sale price</span>
            </label>

            {discountEnabled && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Sale Price (PKR)</label>
                <input type="number" value={form.discount_price}
                  onChange={e => update('discount_price', e.target.value)}
                  min="0" placeholder="Must be less than original price"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
                {form.price && form.discount_price && Number(form.discount_price) < Number(form.price) && (
                  <p className="text-[10px] text-green-600 mt-1">
                    Discount: {Math.round((1 - Number(form.discount_price) / Number(form.price)) * 100)}% off
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock Quantity</label>
              <input type="number" value={form.stock_quantity} onChange={e => update('stock_quantity', e.target.value)}
                min="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.availability_status} onChange={e => update('availability_status', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {product.major_category === 'wedding_dress' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                  <input type="text" value={form.color} onChange={e => update('color', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fabric</label>
                  <input type="text" value={form.fabric} onChange={e => update('fabric', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Embroidery</label>
                  <input type="text" value={form.embroidery_type} onChange={e => update('embroidery_type', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                  <input type="text" value={form.size} onChange={e => update('size', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
                </div>
              </>
            )}
            {['furniture', 'kitchen_items'].includes(product.major_category) && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
                <input type="text" value={form.material} onChange={e => update('material', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
              </div>
            )}
            {['electronics', 'kitchen_items', 'miscellaneous'].includes(product.major_category) && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
                <input type="text" value={form.brand} onChange={e => update('brand', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
              <select value={form.condition} onChange={e => update('condition', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]">
                {['New', 'Like New', 'Used', 'Thrift'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 text-sm text-white bg-[#a37b3d] hover:bg-[#8a6633] rounded-xl font-semibold disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ProductList (full redesign) ───────────────────────────────────────────

export default function ProductList({ sellerId, refreshTrigger, seller }) {
  const navigate = useNavigate();
  const { categories } = useCategories();

  // Data state
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [editing,  setEditing]  = useState(null);
  const [error,    setError]    = useState('');

  // Filter / sort state
  const [filterCat,    setFilterCat]    = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCond,   setFilterCond]   = useState('all');
  const [sortBy,       setSortBy]       = useState('newest');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState(new Set());
  const [collapsed,    setCollapsed]    = useState({});

  // Load all products (high limit so we can group client-side)
  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const data = await sellerApi.listProducts({ sellerId, page: 1, limit: 500 });
      if (data.success !== false) {
        setProducts(data.products || []);
        setTotal(data.total || (data.products?.length || 0));
      } else {
        setError(data.error || 'Failed to load products.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const handleDelete = async (productId) => {
    if (!window.confirm('Delete this product and all its images?')) return;
    setDeleting(productId);
    try {
      const data = await sellerApi.deleteProduct(productId);
      if (data.success) {
        setProducts(ps => ps.filter(p => p.product_id !== productId));
        setTotal(t => t - 1);
      } else {
        alert(data.error || 'Delete failed.');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = (updated) => {
    setProducts(ps => ps.map(p => p.product_id === updated.product_id ? updated : p));
    setEditing(null);
  };

  // Helper: display label for a category id
  const catLabel = (key) => categories.find(c => c.category_id === key)?.label
    || (key || 'other').replace(/_/g, ' ');

  // Categories the seller has actually uploaded products in
  const categoriesPresent = useMemo(
    () => [...new Set(products.map(p => p.major_category || 'other'))],
    [products],
  );

  // Apply filters + sort, then group by category
  const grouped = useMemo(() => {
    const g = {};
    let arr = products;

    // Filter: category pill
    if (filterCat !== 'all') arr = arr.filter(p => (p.major_category || 'other') === filterCat);
    // Filter: status dropdown
    if (filterStatus !== 'all') arr = arr.filter(p => (p.availability_status || 'available') === filterStatus);
    // Filter: condition dropdown (Thrift vs Retail)
    if (filterCond !== 'all') {
      arr = arr.filter(p => {
        const mt = (p.marketplace_type || '').toLowerCase();
        const cond = (p.condition || '').toLowerCase();
        if (filterCond === 'thrift') return mt === 'thrift' || cond === 'thrift';
        if (filterCond === 'retail') return mt === 'new' || mt === '' || (cond !== 'thrift');
        return true;
      });
    }
    // Filter: search query (title or subcategory)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q) ||
        (p.item_type || '').toLowerCase().includes(q)
      );
    }
    // Sort
    arr = [...arr].sort((a, b) => {
      if (sortBy === 'price_asc')  return (a.price || 0) - (b.price || 0);
      if (sortBy === 'price_desc') return (b.price || 0) - (a.price || 0);
      // newest (default)
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    arr.forEach(p => {
      const k = p.major_category || 'other';
      (g[k] ||= []).push(p);
    });
    return g;
  }, [products, filterCat, filterStatus, filterCond, search, sortBy]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!sellerId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-8 text-center text-gray-400">
        Register or log in as a seller to see your products.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Section 1: Page Header ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">My Products</h1>
          <p className="text-xs text-gray-400 mt-0.5">{total} total product{total !== 1 ? 's' : ''}</p>
        </div>
        {seller && (
          <div className="flex items-center gap-3 bg-[#FFF5F8] rounded-xl px-4 py-2 border border-[#FBEFF1]">
            <div className="w-10 h-10 rounded-full bg-[#a37b3d] text-white flex items-center justify-center font-black text-lg">
              {(seller.name || '?')[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 truncate max-w-[160px]">{seller.name}</p>
              <p className="text-[10px] text-gray-500 font-medium">{total} product{total !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Category Filter Pills ───────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterCat('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full whitespace-nowrap font-semibold border ${
            filterCat === 'all'
              ? 'bg-[#a37b3d] text-white border-[#a37b3d]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-[#ECD4A8]'
          }`}
        >
          <span>📦</span>
          <span>All</span>
        </button>
        {categoriesPresent.map(c => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full whitespace-nowrap font-semibold border capitalize ${
              filterCat === c
                ? 'bg-[#a37b3d] text-white border-[#a37b3d]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#ECD4A8]'
            }`}
          >
            <span>🏷️</span>
            <span>{catLabel(c)}</span>
          </button>
        ))}
      </div>

      {/* ── Section 3: Filter & Sort Toolbar ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Search</label>
          <div className="relative">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#a37b3d]"
            />
            <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={14} />
            </button>
          </div>
        </div>
        {/* Status */}
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#a37b3d]">
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="out_of_stock">Sold</option>
            <option value="freeze">Freeze</option>
            <option value="hidden">Hidden</option>
            <option value="processing">Processing</option>
          </select>
        </div>
        {/* Condition */}
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Condition</label>
          <select value={filterCond} onChange={e => setFilterCond(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#a37b3d]">
            <option value="all">All</option>
            <option value="retail">Retail</option>
            <option value="thrift">Thrift</option>
          </select>
        </div>
        {/* Sort By */}
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Sort By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#a37b3d]">
            <option value="newest">Newest</option>
            <option value="price_asc">Price Low–High</option>
            <option value="price_desc">Price High–Low</option>
          </select>
        </div>
      </div>

      {/* Selection summary */}
      {selected.size > 0 && (
        <div className="text-xs text-gray-500 px-1">
          {selected.size} selected
          <button onClick={() => setSelected(new Set())} className="ml-2 text-[#a37b3d] hover:underline">Clear</button>
        </div>
      )}

      {error && (
        <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* ── Section 4: Product List Container (grouped by category) ────────── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#ECD4A8] border-t-[#a37b3d] rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-12 text-center text-sm text-gray-400">
          No products match the current filters.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, items]) => {
            const isCollapsed = collapsed[cat];
            return (
              <div key={cat} className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] overflow-hidden">
                {/* ── Section 5: Category Group Header (collapsible) ─────────── */}
                <button
                  onClick={() => setCollapsed(s => ({ ...s, [cat]: !s[cat] }))}
                  className="w-full flex items-center gap-3 p-4 bg-gray-50/60 hover:bg-gray-50 transition-colors"
                >
                  {/* Small square category thumbnail */}
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#ECD4A8] to-[#a37b3d] flex items-center justify-center text-white font-bold text-sm uppercase">
                    {catLabel(cat)[0]}
                  </div>
                  {/* Right-facing arrow (expand/collapse) */}
                  <ChevronRight
                    size={18}
                    className={`text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  />
                  {/* Category name in ALL CAPS bold */}
                  <span className="text-sm font-black text-gray-800 uppercase tracking-wider">
                    {catLabel(cat).toUpperCase()}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400 font-semibold">
                    {items.length} product{items.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Product rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-50">
                    {items.map(prod => {
                      const isSelected = selected.has(prod.product_id);
                      const condLabel = (prod.marketplace_type || '').toLowerCase() === 'thrift'
                        || (prod.condition || '').toLowerCase() === 'thrift'
                          ? 'Thrift' : 'Retail';
                      const isFreeze = (prod.availability_status || '').toLowerCase() === 'freeze'
                        || (prod.availability_status || '').toLowerCase() === 'hidden';
                      return (
                        <div key={prod.product_id} className="flex items-center gap-3 p-3 hover:bg-gray-50/50 transition-colors">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(prod.product_id)}
                            className="w-4 h-4 rounded border-gray-300 text-[#a37b3d] focus:ring-[#a37b3d]"
                          />
                          {/* Square product thumbnail */}
                          <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                            {prod.primary_image_url || (prod.images && prod.images[0]) ? (
                              <img
                                src={sellerApi.resolveImageUrl(prod.primary_image_url || prod.images[0])}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">?</div>
                            )}
                          </div>
                          {/* Info block */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{prod.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(prod.subcategory || '—').replace(/_/g, ' ')} <span className="text-gray-300">({condLabel})</span>
                            </p>
                          </div>
                          {/* Stock block */}
                          <div className="text-xs text-gray-700 hidden sm:block w-16 text-center">
                            <p className="font-mono font-bold">{prod.stock_quantity ?? 0}</p>
                            <p className="text-[10px] text-gray-400">In Stock</p>
                          </div>
                          {/* Pricing block */}
                          <div className="text-right w-28">
                            <p className="text-sm font-bold text-gray-800">
                              PKR {(prod.original_price || prod.price || 0).toLocaleString()}
                            </p>
                            {prod.discount_price && prod.discount_price < prod.price ? (
                              <p className="text-[11px] text-emerald-700 font-semibold">
                                Sale: {prod.discount_price.toLocaleString()}
                              </p>
                            ) : (
                              <p className="text-[11px] text-gray-300">—</p>
                            )}
                          </div>
                          {/* Status badge */}
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                            isFreeze
                              ? (STATUS_COLORS.freeze || 'bg-slate-200 text-slate-700')
                              : (STATUS_COLORS[prod.availability_status] || 'bg-emerald-100 text-emerald-700')
                          }`}>
                            {isFreeze ? 'Freeze' : (prod.availability_status || 'available')}
                          </span>
                          {/* Action buttons */}
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => setEditing(prod)}
                              title="Edit"
                              className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(prod.product_id)}
                              disabled={deleting === prod.product_id}
                              title="Delete"
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                            >
                              <Trash2 size={14} />
                            </button>
                            <button
                              onClick={() => navigate(`/buyer/product/${prod.product_id}`)}
                              title="View on Marketplace"
                              className="p-2 text-gray-500 hover:text-[#a37b3d] hover:bg-[#FFF5F8] rounded-lg transition-colors"
                            >
                              <ExternalLink size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <EditModal product={editing} onSave={handleSaved} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
