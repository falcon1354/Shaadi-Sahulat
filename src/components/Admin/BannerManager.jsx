import React, { useState, useEffect } from 'react';
import { useCategories } from '../../hooks/useCategories';
import sellerApi from '../../api/sellerApi';

const BASE = 'http://localhost:5000/api/banners';

export default function BannerManager() {
  const [banners, setBanners] = useState([]);
  const [sellerOffers, setSellerOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBanner, setEditBanner] = useState(null);
  const [activeTab, setActiveTab] = useState('banners'); // 'banners' | 'offers'

  const [categoryId, setCategoryId] = useState('');
  const { categories } = useCategories();

  // Form state
  const [title, setTitle] = useState('');
  const [linkType, setLinkType] = useState('product');
  const [linkValue, setLinkValue] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [storefront, setStorefront] = useState('new');
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  // Seller offer review state
  const [suggestedPrice, setSuggestedPrice] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE);
      const data = await res.json();
      if (data.success) setBanners(data.banners || []);
    } catch { }
    setLoading(false);
  };

  const loadSellerOffers = async () => {
    try {
      const res = await fetch(`${BASE}/seller-offers?status=pending`);
      const data = await res.json();
      if (data.success) setSellerOffers(data.offers || []);
    } catch { }
  };

  useEffect(() => { load(); loadSellerOffers(); }, []);

  const resetForm = () => {
    setTitle(''); setLinkType('product'); setLinkValue('');
    setStartAt(''); setEndAt(''); setIsActive(true);
    setSortOrder(0); setImageFile(null); setEditBanner(null);
    setCategoryId(''); setStorefront('new');
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (b) => {
    setEditBanner(b);
    setTitle(b.title || '');
    setLinkType(b.link_type || 'product');
    setLinkValue(b.link_value || '');
    setCategoryId(b.category_id || '');
    setStorefront(b.storefront || 'new');
    setStartAt(b.start_at ? new Date(b.start_at).toISOString().slice(0, 16) : '');
    setEndAt(b.end_at ? new Date(b.end_at).toISOString().slice(0, 16) : '');
    setIsActive(b.is_active !== false);
    setSortOrder(b.sort_order || 0);
    setImageFile(null);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.append('title', title);
    fd.append('link_type', linkType);
    fd.append('link_value', linkValue);
    if (startAt) fd.append('start_at', startAt);
    if (endAt) fd.append('end_at', endAt);
    fd.append('is_active', String(isActive));
    fd.append('sort_order', String(sortOrder));
    fd.append('category_id', categoryId);
    fd.append('storefront', storefront);
    if (imageFile) fd.append('image', imageFile);

    if (startAt && endAt) {
      const start = new Date(startAt);
      const end = new Date(endAt);
      const now = new Date();
      if (start < now) {
        alert('Start time must be in the future.');
        setSaving(false);
        return;
      }
      const durationHours = (end - start) / (1000 * 60 * 60);
      if (durationHours > 72) {
        alert('Banner duration cannot exceed 3 days (72 hours).');
        setSaving(false);
        return;
      }
      if (end <= start) {
        alert('End time must be after start time.');
        setSaving(false);
        return;
      }
    }

    const url = editBanner ? `${BASE}/${editBanner.banner_id || editBanner._id}` : BASE;
    const method = editBanner ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        resetForm();
        load();
      } else {
        alert(data.error || 'Failed to save banner');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Delete banner "${b.title || 'Untitled'}"?`)) return;
    try {
      await fetch(`${BASE}/${b.banner_id || b._id}`, { method: 'DELETE' });
      load();
    } catch { }
  };

  const handleToggleActive = async (b) => {
    const fd = new FormData();
    fd.append('is_active', String(!b.is_active));
    fd.append('storefront', b.storefront || 'new');
    try {
      await fetch(`${BASE}/${b.banner_id || b._id}`, { method: 'PUT', body: fd });
      load();
    } catch { }
  };

  const handleApproveOffer = async (offer) => {
    try {
      const res = await fetch(`${BASE}/seller-offer/${offer.banner_id || offer._id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggested_price: suggestedPrice || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        loadSellerOffers();
        load();
        setSuggestedPrice('');
      } else {
        alert(data.error || 'Failed to approve');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleRejectOffer = async (offer) => {
    try {
      const res = await fetch(`${BASE}/seller-offer/${offer.banner_id || offer._id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason || 'Not suitable at this time' }),
      });
      const data = await res.json();
      if (data.success) {
        loadSellerOffers();
        setRejectionReason('');
      } else {
        alert(data.error || 'Failed to reject');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const isScheduleActive = (b) => {
    const now = new Date();
    return b.is_active && new Date(b.start_at) <= now && new Date(b.end_at) >= now;
  };

  const storefrontLabel = (s) => {
    if (s === 'thrift') return '♻️ Thrift';
    if (s === 'both') return '🔄 Both';
    return '🛍️ New';
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">🎯 Deal of the Day — Banner Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Review, approve, and schedule seller banner requests.</p>
        </div>
      </div>

      {/* Tabs: Banners | Seller Offers */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('banners')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
            activeTab === 'banners' ? 'bg-red-600 text-white shadow-lg' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          🎯 Banners ({banners.length})
        </button>
        <button
          onClick={() => setActiveTab('offers')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
            activeTab === 'offers' ? 'bg-amber-500 text-white shadow-lg' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          📋 Seller Offers ({sellerOffers.length})
        </button>
      </div>

      {/* BANNERS TAB */}
      {activeTab === 'banners' && (
        loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="w-8 h-8 mx-auto mb-3 border-3 border-gray-200 border-t-red-500 rounded-full animate-spin" />
            Loading banners…
          </div>
        ) : banners.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">🎯</p>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No Banners Yet</h3>
            <p className="text-sm text-gray-500">Click "New Banner" to create your first Deal of the Day.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-gray-500 font-bold text-xs uppercase tracking-wide">Banner</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-bold text-xs uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-bold text-xs uppercase tracking-wide">Storefront</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-bold text-xs uppercase tracking-wide">Schedule</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-bold text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {banners.map(b => (
                  <tr key={b.banner_id || b._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <img src={b.image_url} alt={b.title || 'Banner'} className="w-20 h-12 object-cover rounded-lg border border-gray-200" onError={(e) => { e.target.src = ''; e.target.alt = '📷'; }} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{b.title || '(Untitled)'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        b.storefront === 'thrift' ? 'bg-emerald-50 text-emerald-700' :
                        b.storefront === 'both' ? 'bg-purple-50 text-purple-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {storefrontLabel(b.storefront)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <p>{new Date(b.start_at).toLocaleDateString()}</p>
                      <p className="text-gray-400">→ {new Date(b.end_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggleActive(b)} className="cursor-pointer">
                        {isScheduleActive(b) ? (
                          <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-200">✓ Live</span>
                        ) : b.is_active ? (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-200">Scheduled</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full border border-gray-200">Inactive</span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* SELLER OFFERS TAB */}
      {activeTab === 'offers' && (
        sellerOffers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">📋</p>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No Pending Offers</h3>
            <p className="text-sm text-gray-500">Seller promotional offers will appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sellerOffers.map(offer => (
              <div key={offer.banner_id || offer._id} className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
                <div className="flex gap-4">
                  <div className="w-32 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    {offer.image_url && (
                      <img src={offer.image_url} alt={offer.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-800">{offer.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      By <strong>{offer.seller_name}</strong> ({offer.seller_id}) · Storefront: {storefrontLabel(offer.storefront)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(offer.start_at).toLocaleString()} → {new Date(offer.end_at).toLocaleString()}
                    </p>
                    {offer.seller_product_ids?.length > 0 && (
                      <p className="text-xs text-blue-600 mt-1">Products: {offer.seller_product_ids.join(', ')}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <input
                        type="number"
                        placeholder="Suggested price (PKR)"
                        value={suggestedPrice}
                        onChange={e => setSuggestedPrice(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-48"
                      />
                      <button
                        onClick={() => handleApproveOffer(offer)}
                        className="px-4 py-2 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600"
                      >
                        ✓ Approve
                      </button>
                      <input
                        type="text"
                        placeholder="Rejection reason"
                        value={rejectionReason}
                        onChange={e => setRejectionReason(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1"
                      />
                      <button
                        onClick={() => handleRejectOffer(offer)}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600"
                      >
                        ✗ Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}>
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-gray-900">{editBanner ? 'Edit Banner' : 'Create New Banner'}</h2>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Banner Image *</label>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-red-50 file:text-red-700 hover:file:bg-red-100" />
              {editBanner && !imageFile && <p className="text-[10px] text-gray-400 mt-1">Leave empty to keep current image</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer Sale 50% Off"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Link Type</label>
                <select value={linkType} onChange={(e) => setLinkType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none">
                  <option value="product">Product (Internal)</option>
                  <option value="custom_url">Custom URL (External)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">{linkType === 'product' ? 'Product ID' : 'URL'}</label>
                <input type="text" value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder={linkType === 'product' ? 'e.g. sp-1234' : 'https://...'}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Target Category</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none">
                  <option value="">All Marketplace (Homepage)</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Storefront</label>
                <select value={storefront} onChange={(e) => setStorefront(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none">
                  <option value="new">🛍️ New Marketplace</option>
                  <option value="thrift">♻️ Thrift Marketplace</option>
                  <option value="both">🔄 Both</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Start Date/Time</label>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">End Date/Time</label>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-red-600" />
                <label className="text-sm font-semibold text-gray-700">Active</label>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Sort Order</label>
                <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving || (!imageFile && !editBanner)} className="flex-1 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-xl text-sm font-bold hover:shadow-lg disabled:opacity-50 transition-all">{saving ? 'Saving…' : editBanner ? 'Update Banner' : 'Create Banner'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
