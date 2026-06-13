import React, { useState, useEffect } from 'react';
import sellerApi from '../../api/sellerApi';
import ProductUpload from './ProductUpload';
import ProductList from './ProductList';

const TABS = ['Register / Login', 'Upload Product', 'My Products'];

const SELLER_TYPES = [
  {
    id: 'individual',
    label: 'Individual Seller',
    icon: '👤',
    desc: 'Personal seller · Max 5 active listings',
    maxListings: 5,
  },
  {
    id: 'company',
    label: 'Company / Business',
    icon: '🏢',
    desc: 'Unlimited listings · Optional category restriction',
    maxListings: null,
  },
];

const MAJOR_CATS_OPTIONS = [
  { id: '',               label: 'All Categories (no restriction)' },
  { id: 'wedding_dress',  label: 'Wedding Dress only' },
  { id: 'furniture',      label: 'Furniture only' },
  { id: 'electronics',    label: 'Electronics only' },
  { id: 'kitchen_items',  label: 'Kitchen Items only' },
  { id: 'decoration',     label: 'Decoration only' },
  { id: 'miscellaneous',  label: 'Miscellaneous only' },
];

export default function SellerPage({ onLogin, defaultTab = 0 }) {
  const [tab, setTab]           = useState(defaultTab);
  const [seller, setSeller]     = useState(null);

  // Step 0 — seller type (Individual / Company)
  const [sellerType,       setSellerType]       = useState(null);  // null = not chosen yet
  const [categoryRestrict, setCategoryRestrict] = useState('');    // only for company

  // Register fields
  const [form, setForm]         = useState({ name: '', email: '', password: '', phone: '', city: '' });
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [uploadTick, setUploadTick] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('ss_seller');
    if (stored) {
      try { setSeller(JSON.parse(stored)); } catch (_) {}
    }
  }, []);

  const saveSeller = (doc) => {
    setSeller(doc);
    localStorage.setItem('ss_seller', JSON.stringify(doc));
  };

  const logout = () => {
    setSeller(null);
    localStorage.removeItem('ss_seller');
    setTab(0);
    setSellerType(null);
    setCategoryRestrict('');
  };

  // ── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!sellerType) { setError('Choose a seller type first.'); return; }
    setLoading(true);
    try {
      const data = await sellerApi.registerSeller({
        ...form,
        seller_type:          sellerType,
        max_listings:         sellerType === 'individual' ? 5 : null,
        category_restriction: sellerType === 'company' ? (categoryRestrict || null) : null,
      });
      if (data.success) {
        saveSeller(data.seller);
        if (onLogin) onLogin(data.seller);
        setTab(1);
      } else {
        setError(data.error || 'Registration failed.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await sellerApi.loginSeller(loginForm);
      if (data.success) {
        saveSeller(data.seller);
        if (onLogin) onLogin(data.seller);
        setTab(1);
      } else {
        setError(data.error || 'Login failed. Check email and password.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Seller Panel</h1>
          {seller && (
            <p className="text-sm text-gray-500 mt-1">
              Logged in as <span className="font-semibold text-purple-600">{seller.name}</span>
              &nbsp;·&nbsp;<span className="text-gray-400">{seller.seller_id}</span>
            </p>
          )}
        </div>
        {seller && (
          <button onClick={logout}
            className="text-sm text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-1 transition-colors">
            Log out
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {TABS.map((label, idx) => (
          <button key={idx} onClick={() => setTab(idx)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === idx
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab 0 — Register / Login */}
      {tab === 0 && (
        <div className="space-y-6">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200">{error}</div>}

          {/* ── Register ──────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">New Seller — Register</h2>

            {/* Step 1 — Seller type */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Step 1 — Choose Seller Type</p>
              <div className="grid grid-cols-2 gap-3">
                {SELLER_TYPES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSellerType(t.id)}
                    className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all ${
                      sellerType === t.id
                        ? 'bg-purple-50 border-purple-400 text-purple-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-300'
                    }`}
                  >
                    <span className="text-2xl">{t.icon}</span>
                    <span className="text-sm font-bold">{t.label}</span>
                    <span className="text-[10px] text-gray-400">{t.desc}</span>
                  </button>
                ))}
              </div>

              {/* Company category restriction */}
              {sellerType === 'company' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Category Restriction <span className="text-gray-400">(optional)</span>
                  </label>
                  <select
                    value={categoryRestrict}
                    onChange={e => setCategoryRestrict(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    {MAJOR_CATS_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Step 2 — Profile details */}
            {sellerType && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-3">Step 2 — Profile Details</p>
                <form onSubmit={handleRegister} className="space-y-3">
                  {[
                    { label: 'Full Name *',  key: 'name',     type: 'text',     placeholder: 'Fatima Ahmed' },
                    { label: 'Email *',      key: 'email',    type: 'email',    placeholder: 'fatima@example.com' },
                    { label: 'Password *',   key: 'password', type: 'password', placeholder: 'Min 6 characters' },
                    { label: 'Phone',        key: 'phone',    type: 'tel',      placeholder: '+92 300 0000000' },
                    { label: 'City',         key: 'city',     type: 'text',     placeholder: 'Lahore' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input type={type} value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                  ))}
                  <button type="submit" disabled={loading}
                    className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-xl
                               hover:from-purple-700 hover:to-pink-600 transition-all disabled:opacity-50 text-sm">
                    {loading ? 'Registering...' : `Register as ${sellerType === 'company' ? 'Company' : 'Individual'}`}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* ── Login ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Existing Seller — Login</h2>
            <p className="text-xs text-gray-400 mb-4">
              Demo: <code className="bg-gray-100 px-1 rounded">admin@shaadisahulat.com</code> / <code className="bg-gray-100 px-1 rounded">Admin@1234</code>
            </p>
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" value={loginForm.email}
                  onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="fatima@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                <input type="password" value={loginForm.password}
                  onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Your password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-2.5 border-2 border-purple-400 text-purple-600 font-semibold rounded-xl
                           hover:bg-purple-50 transition-all disabled:opacity-50 text-sm">
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            {seller && (
              <div className="mt-4 p-3 bg-green-50 rounded-xl text-sm text-green-700 text-center">
                Logged in as <strong>{seller.name}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 1 — Upload Product */}
      {tab === 1 && (
        <ProductUpload
          sellerId={seller?.seller_id}
          onUploaded={() => setUploadTick((t) => t + 1)}
        />
      )}

      {/* Tab 2 — My Products */}
      {tab === 2 && (
        <ProductList
          sellerId={seller?.seller_id}
          refreshTrigger={uploadTick}
        />
      )}
    </div>
  );
}
