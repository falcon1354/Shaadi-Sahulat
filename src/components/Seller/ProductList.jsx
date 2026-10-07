import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ExternalLink, Search, ChevronRight, Package, PlusCircle, Filter, ArrowUpDown, Sparkles } from 'lucide-react';
import sellerApi from '../../api/sellerApi';
import { useCategories } from '../../hooks/useCategories';
import SellerPageHero from '../Common/SellerPageHero';
import heroImg from '../../assets/hero/Dash_Categories.jpg';

const STATUS_COLORS = {
  available:    'bg-emerald-50 text-emerald-800 border border-emerald-200',
  processing:   'bg-amber-50 text-amber-800 border border-amber-200',
  out_of_stock: 'bg-rose-50 text-rose-800 border border-rose-200',
  hidden:       'bg-stone-100 text-stone-600 border border-stone-200',
  freeze:       'bg-slate-100 text-slate-700 border border-slate-200',
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
      setError(err.message || 'Error updating product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-[#EADBCC]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFEAE4]">
          <h3 className="text-lg font-serif font-bold text-stone-900">Edit Product Listing</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none cursor-pointer">×</button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Title</label>
            <input type="text" value={form.title} onChange={e => update('title', e.target.value)}
              className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] focus:border-[#ECD4A8]" />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Description</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)}
              rows={3}
              className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] focus:border-[#ECD4A8] resize-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Price (PKR)</label>
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
                  <div className="mb-1.5 text-[11px] bg-[#FAF7F2] border border-[#EADBCC] rounded-xl px-3 py-2 space-y-0.5">
                    <div className="text-[#9B7036] font-bold">
                    Suggested: PKR {lo.toLocaleString()} – {hi.toLocaleString()}
                    <span className="text-stone-400 font-normal ml-1">(avg PKR {avg.toLocaleString()}, ±{band}%)</span>
                  </div>
                  {isHardBlock && (
                    <div className="text-rose-600 font-bold">
                      🚫 Price too high — max allowed PKR {Math.round(avg * 2).toLocaleString()}
                    </div>
                  )}
                  {isSoftWarn && (
                    <div className="text-amber-700 font-semibold">
                      ⚠ {price > avg ? 'Above' : 'Below'} suggested range by {devPct}%. Are you sure?
                    </div>
                  )}
                  {isOK && <div className="text-emerald-700 font-semibold">✓ Within recommended market range</div>}
                </div>
              );
            })()}
            <input type="number" value={form.price} onChange={e => update('price', e.target.value)}
              min="0"
              className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] focus:border-[#ECD4A8]" />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setDiscountEnabled(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${discountEnabled ? 'bg-[#9B7036]' : 'bg-stone-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-xs transition-transform ${discountEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-bold text-stone-700">Special Discount / Sale Price</span>
            </label>

            {discountEnabled && (
              <div className="mt-2 p-3 bg-[#FAF7F2] rounded-2xl border border-[#EADBCC]">
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Sale Price (PKR)</label>
                <input type="number" value={form.discount_price}
                  onChange={e => update('discount_price', e.target.value)}
                  min="0" placeholder="Must be less than original price"
                  className="w-full bg-white border border-[#EADBCC] rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
                {form.price && form.discount_price && Number(form.discount_price) < Number(form.price) && (
                  <p className="text-[11px] text-emerald-700 font-bold mt-1.5">
                    Discount: {Math.round((1 - Number(form.discount_price) / Number(form.price)) * 100)}% off
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Stock Quantity</label>
              <input type="number" value={form.stock_quantity} onChange={e => update('stock_quantity', e.target.value)}
                min="0"
                className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Status</label>
              <select value={form.availability_status} onChange={e => update('availability_status', e.target.value)}
                className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white capitalize">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {product.major_category === 'wedding_dress' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Color</label>
                  <input type="text" value={form.color} onChange={e => update('color', e.target.value)}
                    className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Fabric</label>
                  <input type="text" value={form.fabric} onChange={e => update('fabric', e.target.value)}
                    className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Embroidery</label>
                  <input type="text" value={form.embroidery_type} onChange={e => update('embroidery_type', e.target.value)}
                    className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Size</label>
                  <input type="text" value={form.size} onChange={e => update('size', e.target.value)}
                    className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
                </div>
              </>
            )}
            {['furniture', 'kitchen_items'].includes(product.major_category) && (
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Material</label>
                <input type="text" value={form.material} onChange={e => update('material', e.target.value)}
                  className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
              </div>
            )}
            {['electronics', 'kitchen_items', 'miscellaneous'].includes(product.major_category) && (
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Brand</label>
                <input type="text" value={form.brand} onChange={e => update('brand', e.target.value)}
                  className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">Condition</label>
              <select value={form.condition} onChange={e => update('condition', e.target.value)}
                className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                {['New', 'Like New', 'Used', 'Thrift'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-[#EFEAE4]">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-xs font-bold text-stone-600 border border-[#EADBCC] rounded-xl hover:bg-[#FAF7F2] transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 text-xs text-white bg-[#9B7036] hover:bg-[#835d2c] rounded-xl font-bold disabled:opacity-60 transition-colors cursor-pointer shadow-xs">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvertListingModal({ product, categories, onSaved, onClose }) {
  const cat = categories.find(c => c.category_id === product.major_category);
  const thriftAllowed = (cat?.storefront || 'both') !== 'new';
  const isThrift = (product.marketplace_type || '').toLowerCase() === 'thrift';
  const target = isThrift ? 'new' : 'thrift';
  const [price, setPrice] = useState(isThrift ? String(product.price || '') : String(product.discount_price || product.price || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (target === 'thrift' && !thriftAllowed) {
      setError('This category is not enabled for Thrift listings.');
      return;
    }
    const num = Number(price);
    if (!Number.isFinite(num) || num <= 0) {
      setError(target === 'thrift' ? 'Enter a Discounted Price.' : 'Enter a New Price.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updates = target === 'thrift'
        ? {
            marketplace_type: 'thrift',
            condition: 'Thrift',
            discount_price: num,
            original_price: product.original_price || product.price,
            stock_quantity: 1,
          }
        : {
            marketplace_type: 'new',
            condition: 'New',
            price: num,
            discount_price: null,
            original_price: '',
          };
      const data = await sellerApi.updateProduct(product.product_id, updates);
      if (!data.success && data.success !== undefined) throw new Error(data.error || 'Update failed');
      onSaved(data.product || { ...product, ...updates });
    } catch (e) {
      setError(e.message || 'Conversion failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#EADBCC] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-serif font-bold text-stone-900 mb-1">
          Convert to {target === 'thrift' ? 'Thrift Listing' : 'Retail Product'}
        </h3>
        <p className="text-xs text-stone-500 mb-4">{product.title}</p>
        {!thriftAllowed && target === 'thrift' && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-xl mb-3 font-semibold">Thrift is not enabled for this category.</p>
        )}
        <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">
          {target === 'thrift' ? 'Discounted Thrift Price (PKR)' : 'New Retail Price (PKR)'}
        </label>
        <input type="number" value={price} onChange={e => setPrice(e.target.value)}
          className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#9B7036]" />
        {error && <p className="text-xs text-rose-700 mb-3 font-semibold">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-[#EADBCC] rounded-xl text-xs font-bold text-stone-600 hover:bg-[#FAF7F2] cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || (target === 'thrift' && !thriftAllowed)}
            className="flex-1 py-2.5 bg-[#9B7036] hover:bg-[#835d2c] text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs transition-colors">
            {saving ? 'Saving…' : 'Confirm Conversion'}
          </button>
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
  const [convertTarget, setConvertTarget] = useState(null);
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
        setError(data.error || 'Failed to load products');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const handleDelete = async (productId) => {
    if (!window.confirm('Delete this product permanently?')) return;
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
      <div className="bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-12 text-center text-stone-400">
        Register or log in as a merchant to see your products.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Editorial Page Hero */}
      <SellerPageHero
        badge={<><Package size={12} /> Merchant Inventory</>}
        title="Product Catalog & Inventory"
        subtitle="Manage live boutique listings, adjust pricing tiers, control stock levels, and convert items to thrift."
        image={heroImg}
        imageAlt="ShaadiSahulat Product Catalog"
        rightSlot={
          <button
            onClick={() => navigate('/seller/upload')}
            className="px-4 py-2.5 rounded-2xl bg-[#9B7036] hover:bg-[#835d2c] text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle size={15} /> Add New Listing
          </button>
        }
      />

      {/* Category Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setFilterCat('all')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-2xl whitespace-nowrap font-bold border transition-all cursor-pointer ${
            filterCat === 'all'
              ? 'bg-[#9B7036] text-white border-[#9B7036] shadow-2xs'
              : 'bg-white text-stone-700 border-[#EADBCC] hover:border-[#9B7036]'
          }`}
        >
          <span>📦</span>
          <span>All Categories ({total})</span>
        </button>
        {categoriesPresent.map(c => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-2xl whitespace-nowrap font-bold border capitalize transition-all cursor-pointer ${
              filterCat === c
                ? 'bg-[#9B7036] text-white border-[#9B7036] shadow-2xs'
                : 'bg-white text-stone-700 border-[#EADBCC] hover:border-[#9B7036]'
            }`}
          >
            <span>🏷️</span>
            <span>{catLabel(c)}</span>
          </button>
        ))}
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="bg-white rounded-3xl border border-[#EFEAE4] p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Search Products</label>
          <div className="relative">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, style..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-[#EADBCC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          </div>
        </div>
        {/* Status */}
        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Inventory Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-[#EADBCC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white capitalize">
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="freeze">Freeze</option>
            <option value="hidden">Hidden</option>
            <option value="processing">Processing</option>
          </select>
        </div>
        {/* Condition */}
        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Listing Type</label>
          <select value={filterCond} onChange={e => setFilterCond(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-[#EADBCC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
            <option value="all">All Channels (Retail & Thrift)</option>
            <option value="retail">Boutique Retail</option>
            <option value="thrift">Thrift Pre-Loved</option>
          </select>
        </div>
        {/* Sort By */}
        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Sort Catalog</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-[#EADBCC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
            <option value="newest">Newest Additions</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-semibold">{error}</div>
      )}

      {/* Product List Container (grouped by category) */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-16 text-center text-sm text-stone-400">
          No products match the selected filters.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, items]) => {
            const isCollapsed = collapsed[cat];
            return (
              <div key={cat} className="bg-white rounded-3xl shadow-xs border border-[#EFEAE4] overflow-hidden">
                {/* Category Group Header (collapsible) */}
                <button
                  onClick={() => setCollapsed(s => ({ ...s, [cat]: !s[cat] }))}
                  className="w-full flex items-center gap-3.5 p-5 bg-[#FAF7F2]/60 hover:bg-[#FAF7F2] transition-colors border-b border-[#EFEAE4] cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C1814] to-[#362A1F] border border-[#9B7036]/40 flex items-center justify-center text-[#ECD4A8] font-serif font-bold text-sm uppercase">
                    {catLabel(cat)[0]}
                  </div>
                  <ChevronRight
                    size={18}
                    className={`text-[#9B7036] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                  />
                  <span className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider">
                    {catLabel(cat)}
                  </span>
                  <span className="ml-auto text-xs font-bold text-[#9B7036] bg-white px-3 py-1 rounded-full border border-[#EADBCC]">
                    {items.length} product{items.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Product rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-[#EFEAE4]">
                    {items.map(prod => {
                      const condLabel = (prod.marketplace_type || '').toLowerCase() === 'thrift'
                        || (prod.condition || '').toLowerCase() === 'thrift'
                          ? 'Thrift' : 'Retail';
                      const isFreeze = (prod.availability_status || '').toLowerCase() === 'freeze'
                        || (prod.availability_status || '').toLowerCase() === 'hidden';
                      return (
                        <div key={prod.product_id} className="flex items-center gap-4 p-4 hover:bg-[#FAF7F2]/40 transition-colors flex-wrap sm:flex-nowrap">
                          {/* Square product thumbnail */}
                          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 border border-[#EADBCC] flex-shrink-0">
                            {prod.primary_image_url || (prod.images && prod.images[0]) ? (
                              <img
                                src={sellerApi.resolveImageUrl(prod.primary_image_url || prod.images[0])}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-stone-300 font-serif text-lg">?</div>
                            )}
                          </div>

                          {/* Info block */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-stone-900 truncate">{prod.title}</p>
                            <p className="text-xs text-stone-500 mt-0.5 capitalize flex items-center gap-1.5">
                              <span>{(prod.subcategory || '—').replace(/_/g, ' ')}</span>
                              <span className="text-stone-300">·</span>
                              <span className={`font-semibold px-2 py-0.5 rounded-md text-[10px] ${condLabel === 'Thrift' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-[#FAF7F2] text-[#9B7036] border border-[#EADBCC]'}`}>
                                {condLabel}
                              </span>
                            </p>
                          </div>

                          {/* Stock block */}
                          <div className="text-xs text-stone-700 hidden sm:block w-20 text-center">
                            <p className="font-bold text-stone-900">{prod.stock_quantity ?? 0}</p>
                            <p className="text-[10px] text-stone-400 font-medium">In Stock</p>
                          </div>

                          {/* Pricing block */}
                          <div className="text-right w-32 shrink-0">
                            <p className="text-sm font-serif font-bold text-stone-900">
                              PKR {(prod.original_price || prod.price || 0).toLocaleString()}
                            </p>
                            {prod.discount_price && prod.discount_price < prod.price ? (
                              <p className="text-[11px] text-emerald-700 font-bold">
                                Sale: PKR {prod.discount_price.toLocaleString()}
                              </p>
                            ) : (
                              <p className="text-[10px] text-stone-300">—</p>
                            )}
                          </div>

                          {/* Status badge */}
                          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold capitalize shrink-0 ${
                            isFreeze
                              ? (STATUS_COLORS.freeze || 'bg-slate-100 text-slate-700 border border-slate-200')
                              : (STATUS_COLORS[prod.availability_status] || 'bg-emerald-50 text-emerald-800 border border-emerald-200')
                          }`}>
                            {isFreeze
                              ? 'Freeze'
                              : (Number(prod.stock_quantity) > 0 && (prod.availability_status || '') === 'out_of_stock')
                                ? 'Available'
                                : (prod.availability_status === 'out_of_stock'
                                    ? 'Out of Stock'
                                    : (prod.availability_status || 'available').replace(/_/g, ' '))}
                          </span>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto sm:ml-0">
                            <button
                              onClick={() => setConvertTarget(prod)}
                              title="Convert New ↔ Thrift"
                              className="px-2.5 py-1 text-[11px] font-bold text-[#9B7036] border border-[#EADBCC] rounded-xl hover:bg-[#FAF7F2] cursor-pointer transition-colors"
                            >
                              {(prod.marketplace_type || 'new') === 'thrift' ? '→ Retail' : '→ Thrift'}
                            </button>
                            <button
                              onClick={() => setEditing(prod)}
                              title="Edit Listing"
                              className="p-2 text-stone-600 hover:text-[#9B7036] hover:bg-[#FAF7F2] rounded-xl transition-colors cursor-pointer"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(prod.product_id)}
                              disabled={deleting === prod.product_id}
                              title="Delete Listing"
                              className="p-2 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                            <button
                              onClick={() => navigate(`/buyer/product/${prod.product_id}`)}
                              title="View on Live Marketplace"
                              className="p-2 text-stone-400 hover:text-stone-800 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <ExternalLink size={15} />
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
      {convertTarget && (
        <ConvertListingModal
          product={convertTarget}
          categories={categories}
          onSaved={(updated) => {
            setProducts(ps => ps.map(p => p.product_id === updated.product_id ? { ...p, ...updated } : p));
            setConvertTarget(null);
          }}
          onClose={() => setConvertTarget(null)}
        />
      )}
    </div>
  );
}
