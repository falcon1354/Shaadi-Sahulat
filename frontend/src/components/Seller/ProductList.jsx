import React, { useState, useEffect, useCallback } from 'react';
import sellerApi from '../../api/sellerApi';

const STATUS_COLORS = {
  available:    'bg-green-100 text-green-700',
  processing:   'bg-yellow-100 text-yellow-700',
  out_of_stock: 'bg-red-100 text-red-700',
  hidden:       'bg-gray-100 text-gray-600',
};
const STATUS_OPTIONS = ['available', 'out_of_stock', 'hidden', 'processing'];

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

  // Load price suggestion — §11.3: pass item_type/color/condition for 3-priority lookup
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
        // Remove discount
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Edit Product</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input type="text" value={form.title} onChange={e => update('title', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] resize-none" />
          </div>

          {/* Price + §11.3 suggestion */}
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

          {/* Discount toggle */}
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

          {/* Stock + Status */}
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

          {/* Category-specific fields */}
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

          {/* Actions */}
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

// ── ProductList ───────────────────────────────────────────────────────────

export default function ProductList({ sellerId, refreshTrigger }) {
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [editing,  setEditing]  = useState(null);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      const data = await sellerApi.listProducts({ sellerId, page, limit: 10 });
      if (data.success !== false) {
        setProducts(data.products || []);
        setTotal(data.total || 0);
      } else {
        setError(data.error || 'Failed to load products.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sellerId, page]);

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

  if (!sellerId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-8 text-center text-gray-400">
        Register or log in as a seller to see your products.
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800">My Products</h2>
          <span className="text-sm text-gray-400">{total} total</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#ECD4A8] border-t-[#a37b3d] rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No products yet. Upload your first product above.</div>
        ) : (
          <div className="space-y-3">
            {products.map(prod => (
              <div key={prod.product_id}
                className="flex items-center gap-4 p-3 border border-gray-100 rounded-xl hover:border-[#ECD4A8] transition-colors">

                {/* Thumbnail */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                  {prod.primary_image_url ? (
                    <img src={sellerApi.resolveImageUrl(prod.primary_image_url)} alt={prod.title}
                      className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">?</div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{prod.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {prod.major_category?.replace('_', ' ')} &bull; {prod.images?.length || 0} img(s)
                  </p>
                  <p className="text-xs text-[#a37b3d] font-semibold mt-0.5">
                    PKR {prod.price?.toLocaleString()}
                    {prod.discount_price && prod.discount_price < prod.price && (
                      <span className="ml-2 text-green-600">Sale: PKR {prod.discount_price?.toLocaleString()}</span>
                    )}
                  </p>
                </div>

                {/* Status badge */}
                <div className="flex-shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[prod.availability_status] || 'bg-gray-100 text-gray-600'}`}>
                    {prod.availability_status}
                  </span>
                </div>

                {/* Edit */}
                <button
                  onClick={() => setEditing(prod)}
                  className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-600 transition-colors px-2">
                  Edit
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(prod.product_id)}
                  disabled={deleting === prod.product_id}
                  className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors px-2">
                  {deleting === prod.product_id ? '…' : 'Del'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 10 && (
          <div className="flex justify-center gap-3 mt-5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-[#ECD4A8]">Prev</button>
            <span className="px-3 py-1 text-sm text-gray-500">Page {page} / {Math.ceil(total / 10)}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 10 >= total}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-[#ECD4A8]">Next</button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <EditModal product={editing} onSave={handleSaved} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
