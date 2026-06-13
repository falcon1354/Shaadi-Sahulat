import React, { useState, useEffect } from 'react';
import sellerApi from '../../api/sellerApi';
import ProductUpload from './ProductUpload';
import ProductList from './ProductList';

const TABS = ['Register / Login', 'Upload Product', 'My Products'];

export default function SellerPage({ onLogin, defaultTab = 0 }) {
  const [tab, setTab]           = useState(defaultTab);
  const [seller, setSeller]     = useState(null);
  const [form, setForm]         = useState({ name: '', email: '', password: '', phone: '', city: '' });
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [uploadTick, setUploadTick] = useState(0);

  // Persist seller in localStorage so panel survives page reload
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
  };

  // ── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await sellerApi.registerSeller(form);
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Register */}
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">New Seller — Register</h2>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
            <form onSubmit={handleRegister} className="space-y-3">
              {[
                { label: 'Full Name *', key: 'name',     type: 'text',     placeholder: 'Fatima Ahmed' },
                { label: 'Email *',     key: 'email',    type: 'email',    placeholder: 'fatima@example.com' },
                { label: 'Password *',  key: 'password', type: 'password', placeholder: 'Min 6 characters' },
                { label: 'Phone',       key: 'phone',    type: 'tel',      placeholder: '+92 300 0000000' },
                { label: 'City',        key: 'city',     type: 'text',     placeholder: 'Lahore' },
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
                {loading ? 'Registering...' : 'Register'}
              </button>
            </form>
          </div>

          {/* Login */}
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Existing Seller — Login</h2>
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
