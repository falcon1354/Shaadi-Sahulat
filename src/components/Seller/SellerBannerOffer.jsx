import React, { useState, useEffect } from 'react';
import sellerApi, { resolveImageUrl } from '../../api/sellerApi';

const BASE = 'http://localhost:5000/api/banners';

export default function SellerBannerOffer({ seller }) {
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [title, setTitle] = useState('');
  const [offerText, setOfferText] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [storefront, setStorefront] = useState('new');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myOffers, setMyOffers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

  // Load seller's products for the product picker
  useEffect(() => {
    if (seller?.seller_id) {
      sellerApi.getProducts(seller.seller_id)
        .then(data => {
          setProducts(data.products || []);
        })
        .catch(() => {});
    }
  }, [seller?.seller_id]);

  // Load existing seller offers
  useEffect(() => {
    loadMyOffers();
  }, [seller?.seller_id]);

  const loadMyOffers = async () => {
    try {
      const res = await fetch(`${BASE}/seller-offers?status=pending`);
      const data = await res.json();
      if (data.success) {
        setMyOffers((data.offers || []).filter(o => o.seller_id === seller?.seller_id));
      }
    } catch {}
  };

  const toggleProduct = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setImagePreview('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile && !imagePreview) {
      alert('Please upload a banner image');
      return;
    }
    if (!title && !offerText) {
      alert('Please enter a title or offer text');
      return;
    }

    setSubmitting(true);
    const fd = new FormData();
    fd.append('seller_id', seller.seller_id);
    fd.append('seller_name', seller.name || '');
    fd.append('title', title || offerText);
    fd.append('offer_text', offerText);
    if (startAt) fd.append('start_at', startAt);
    if (endAt) fd.append('end_at', endAt);
    fd.append('category_id', categoryId);
    fd.append('storefront', storefront);
    fd.append('product_ids', selectedProducts.join(','));
    if (imageFile) fd.append('image', imageFile);

    // Validate schedule
    if (startAt && endAt) {
      const start = new Date(startAt);
      const end = new Date(endAt);
      const now = new Date();
      if (start < now) {
        alert('Start time must be in the future.');
        setSubmitting(false);
        return;
      }
      const durationHours = (end - start) / (1000 * 60 * 60);
      if (durationHours > 72) {
        alert('Banner duration cannot exceed 3 days (72 hours).');
        setSubmitting(false);
        return;
      }
      if (end <= start) {
        alert('End time must be after start time.');
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch(`${BASE}/seller-offer`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setMessage('Offer submitted for admin review! You will be notified once approved.');
        setTitle('');
        setOfferText('');
        setStartAt('');
        setEndAt('');
        setCategoryId('');
        setStorefront('new');
        setImageFile(null);
        setImagePreview('');
        setSelectedProducts([]);
        setShowForm(false);
        loadMyOffers();
      } else {
        alert(data.error || 'Failed to submit offer');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">🎯 Promotional Offers</h1>
          <p className="text-sm text-gray-500 mt-1">Create banner offers for your products — admin will review and approve</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all"
        >
          {showForm ? 'Cancel' : '+ New Offer'}
        </button>
      </div>

      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl">
          {message}
        </div>
      )}

      {/* Create Offer Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Create Promotional Offer</h2>

          {/* Banner Image */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Banner Image *</label>
            <input type="file" accept="image/*" onChange={handleImageChange}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
            {imagePreview && (
              <img src={imagePreview} alt="Preview" className="mt-2 w-full h-40 object-cover rounded-xl border border-gray-200" />
            )}
          </div>

          {/* Title + Offer Text */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Title *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Summer Sale 50% Off"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Offer Text</label>
              <input type="text" value={offerText} onChange={e => setOfferText(e.target.value)}
                placeholder="e.g. Buy 2 Get 1 Free"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
            </div>
          </div>

          {/* Storefront + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Storefront</label>
              <select value={storefront} onChange={e => setStorefront(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none">
                <option value="new">New Marketplace</option>
                <option value="thrift">Thrift Marketplace</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Target Category (optional)</label>
              <input type="text" value={categoryId} onChange={e => setCategoryId(e.target.value)}
                placeholder="e.g. wedding_dress"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Start Date/Time *</label>
              <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">End Date/Time *</label>
              <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Maximum duration: 3 days. Schedule must be in the future.</p>

          {/* Product Picker — visual selection of seller's own products */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
              Select Products to Include ({selectedProducts.length} selected)
            </label>
            {products.length === 0 ? (
              <p className="text-xs text-gray-400">No products found. Upload products first.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-60 overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50">
                {products.map(p => {
                  const isSelected = selectedProducts.includes(p.product_id);
                  const img = resolveImageUrl(p.primary_image_url);
                  return (
                    <button
                      key={p.product_id}
                      type="button"
                      onClick={() => toggleProduct(p.product_id)}
                      className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="aspect-square bg-gray-100">
                        {img ? (
                          <img src={img} alt={p.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">📦</div>
                        )}
                      </div>
                      <div className="p-1.5">
                        <p className="text-[10px] font-bold text-gray-800 truncate">{p.title}</p>
                        <p className="text-[9px] text-gray-500">PKR {p.price?.toLocaleString()}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-xl text-sm font-bold hover:shadow-lg disabled:opacity-50 transition-all"
          >
            {submitting ? 'Submitting...' : 'Submit Offer for Admin Review'}
          </button>
        </form>
      )}

      {/* My Existing Offers */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">My Offers</h2>
        {myOffers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
            <p className="text-3xl mb-2">🎯</p>
            <p className="text-sm text-gray-500">No promotional offers yet. Create one above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myOffers.map(offer => (
              <div key={offer.banner_id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="h-32 bg-gray-100">
                  {offer.image_url && (
                    <img src={offer.image_url} alt={offer.title} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-800">{offer.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(offer.start_at).toLocaleDateString()} → {new Date(offer.end_at).toLocaleDateString()}
                  </p>
                  <div className="mt-2">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      offer.seller_offer_status === 'pending' ? 'bg-amber-50 text-amber-700' :
                      offer.seller_offer_status === 'approved' ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {offer.seller_offer_status === 'pending' ? '⏳ Pending Review' :
                       offer.seller_offer_status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    </span>
                    {offer.suggested_price && (
                      <p className="text-xs text-blue-600 mt-1">Admin suggested price: PKR {offer.suggested_price.toLocaleString()}</p>
                    )}
                    {offer.admin_rejection_reason && (
                      <p className="text-xs text-red-600 mt-1">Reason: {offer.admin_rejection_reason}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
