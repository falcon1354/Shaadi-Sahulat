import React, { useState, useEffect } from 'react';
import { authFetch } from '../../api/http';
import sellerApi, { resolveImageUrl } from '../../api/sellerApi';
import SellerPageHero from '../Common/SellerPageHero';

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
      const res = await authFetch(`${BASE}/seller-offers?status=pending`);
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
      const res = await authFetch(`${BASE}/seller-offer`, { method: 'POST', body: fd });
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
    <div className="space-y-6 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Page Hero */}
      <SellerPageHero
        badge="Promotions & Visibility"
        title="Promotional Banners & Offers"
        subtitle="Feature your bridal collection on marketplace carousels. Submit custom promotions for administrative review and curated placement."
        imageKey="campaigns"
        rightSlot={
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 bg-gradient-to-r from-[#9B7036] to-[#7d5624] hover:opacity-95 text-white font-semibold text-xs rounded-xl shadow-md shadow-[#9B7036]/20 transition-all flex items-center gap-2"
          >
            <span>{showForm ? '✕' : '+'}</span>
            <span>{showForm ? 'Cancel Form' : 'Create New Offer'}</span>
          </button>
        }
      />

      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-4 py-3 rounded-2xl flex items-center gap-2">
          <span>✓</span> {message}
        </div>
      )}

      {/* Create Offer Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#EFEAE4] p-7 space-y-6 shadow-luxury">
          <div className="border-b border-[#FAF7F2] pb-3">
            <h2 className="font-serif text-xl font-bold text-stone-900">Create Promotional Campaign</h2>
            <p className="text-xs text-stone-500 mt-0.5">Submit high-resolution visuals and offer details for admin approval</p>
          </div>

          {/* Banner Image */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-2">
              Banner Artwork / Creative *
            </label>
            <div className="border-2 border-dashed border-[#EADBCC] hover:border-[#9B7036] rounded-2xl p-6 text-center bg-[#FAF7F2]/40 transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-xs text-stone-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#FAF3E8] file:text-[#9B7036] hover:file:bg-[#ECD4A8]/60 cursor-pointer"
              />
              {imagePreview && (
                <div className="mt-4 rounded-xl overflow-hidden border border-[#EADBCC] shadow-sm max-h-52">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Title + Offer Text */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Campaign Headline *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Royal Bridal Heritage Collection — 20% Off"
                className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Tagline / Subtext</label>
              <input
                type="text"
                value={offerText}
                onChange={e => setOfferText(e.target.value)}
                placeholder="e.g. Handcrafted Zardozi Lehengas &amp; Sherwanis"
                className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
              />
            </div>
          </div>

          {/* Storefront + Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Target Storefront</label>
              <select
                value={storefront}
                onChange={e => setStorefront(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
              >
                <option value="new">Boutique / Brand New</option>
                <option value="thrift">Pre-Loved / Thrift Collection</option>
                <option value="both">Both Marketplaces</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Target Category (Optional)</label>
              <input
                type="text"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                placeholder="e.g. bridal_dresses, jewelry"
                className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Launch Date &amp; Time *</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={e => setStartAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Expiry Date &amp; Time *</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={e => setEndAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
              />
            </div>
          </div>
          <p className="text-xs text-stone-500 italic">Notice: Maximum campaign duration is 72 hours (3 days). Scheduled time must be in the future.</p>

          {/* Product Picker */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-2">
              Attach Boutique Products ({selectedProducts.length} Selected)
            </label>
            {products.length === 0 ? (
              <p className="text-xs text-stone-400">No active products found. Upload products to link them to this campaign.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-h-64 overflow-y-auto p-3 border border-[#EFEAE4] rounded-2xl bg-[#FAF7F2]/40">
                {products.map(p => {
                  const isSelected = selectedProducts.includes(p.product_id);
                  const img = resolveImageUrl(p.primary_image_url);
                  return (
                    <button
                      key={p.product_id}
                      type="button"
                      onClick={() => toggleProduct(p.product_id)}
                      className={`relative rounded-2xl border-2 overflow-hidden transition-all text-left bg-white ${
                        isSelected
                          ? 'border-[#9B7036] ring-2 ring-[#ECD4A8] shadow-md'
                          : 'border-[#EFEAE4] hover:border-[#ECD4A8]'
                      }`}
                    >
                      <div className="aspect-square bg-stone-100">
                        {img ? (
                          <img src={img} alt={p.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-300 text-xl">📦</div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] font-bold text-stone-800 truncate">{p.title}</p>
                        <p className="text-[10px] font-serif text-[#9B7036] font-bold mt-0.5">PKR {p.price?.toLocaleString()}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-[#9B7036] rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-[#9B7036] to-[#7d5624] hover:opacity-95 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#9B7036]/20 disabled:opacity-50"
          >
            {submitting ? 'Submitting Campaign...' : 'Submit Campaign for Administrative Approval'}
          </button>
        </form>
      )}

      {/* My Existing Offers */}
      <div className="space-y-4">
        <h2 className="font-serif text-lg font-bold text-stone-900">Campaign History &amp; Submissions</h2>
        {myOffers.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[#EFEAE4] p-12 text-center shadow-luxury">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-2xl mx-auto mb-3">
              🎯
            </div>
            <h3 className="font-serif text-base font-bold text-stone-800 mb-1">No Active Campaigns</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Create a promotional campaign banner above to boost your brand exposure across ShaadiSahulat.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myOffers.map(offer => (
              <div key={offer.banner_id} className="bg-white rounded-3xl border border-[#EFEAE4] overflow-hidden shadow-luxury">
                <div className="h-36 bg-stone-100 relative">
                  {offer.image_url ? (
                    <img src={offer.image_url} alt={offer.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300">No Image</div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-serif font-bold text-base text-stone-900">{offer.title}</h3>
                  <p className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                    <span>📅</span>
                    <span>{new Date(offer.start_at).toLocaleDateString()} → {new Date(offer.end_at).toLocaleDateString()}</span>
                  </p>
                  <div className="mt-3 pt-3 border-t border-[#FAF7F2] flex items-center justify-between">
                    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                      offer.seller_offer_status === 'pending' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      offer.seller_offer_status === 'approved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {offer.seller_offer_status === 'pending' ? '⏳ Under Review' :
                       offer.seller_offer_status === 'approved' ? '✓ Approved &amp; Live' : '✗ Declined'}
                    </span>
                    {offer.suggested_price && (
                      <p className="text-xs font-serif font-bold text-[#9B7036]">Admin Price: PKR {offer.suggested_price.toLocaleString()}</p>
                    )}
                  </div>
                  {offer.admin_rejection_reason && (
                    <p className="text-xs text-rose-600 mt-2 p-2 bg-rose-50 rounded-xl">Reason: {offer.admin_rejection_reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
