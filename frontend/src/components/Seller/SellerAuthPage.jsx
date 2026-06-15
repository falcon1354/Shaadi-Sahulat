import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerSeller, loginSeller } from '../../api/sellerApi';

export default function SellerAuthPage({ onLogin }) {
  const navigate = useNavigate();
  const [mode,    setMode]    = useState('login');   // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [form, setForm] = useState({
    name:        '',
    email:       '',
    password:    '',
    phone:       '',
    city:        '',
    seller_type: 'individual',   // 'individual' | 'company'
  });

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await registerSeller(form)
        : await loginSeller({ email: form.email, password: form.password });

      if (!result.success) {
        setError(result.error || 'Something went wrong.');
        return;
      }

      // Persist seller to localStorage & notify parent
      const sellerData = result.seller;
      localStorage.setItem('ss_seller', JSON.stringify(sellerData));
      onLogin(sellerData);
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(''); };

  return (
    <div className="animate-fade-in max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-800 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-3">
          🏪
        </div>
        <h2 className="text-2xl font-bold text-gray-800">
          {mode === 'login' ? 'Seller Sign In' : 'Create Seller Account'}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {mode === 'login'
            ? 'Sign in to manage your store and products'
            : 'Register to start selling on ShaadiSahulat'}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-primary-200 p-6">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
          {[
            { id: 'login',    label: 'Sign In'  },
            { id: 'register', label: 'Register' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => switchMode(id)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                mode === id ? 'bg-white text-primary-950 shadow-sm' : 'text-gray-500'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Register-only fields */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="Your name or business name"
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="you@email.com"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="Min 6 characters"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Register-only: phone, city, seller type */}
          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                    placeholder="03xx-xxxxxxx"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City (optional)</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => update('city', e.target.value)}
                    placeholder="Lahore"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seller Type</label>
                <div className="flex gap-2">
                  {[
                    { id: 'individual', label: '👤 Individual' },
                    { id: 'company',    label: '🏢 Company'    },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update('seller_type', id)}
                      className={`flex-1 py-2 text-sm rounded-xl border transition-all ${
                        form.seller_type === id
                          ? 'bg-primary-50 border-primary-500 text-primary-900 font-semibold'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-800 text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-all mt-2">
            {loading ? 'Please wait…' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-primary-950 font-medium hover:underline">
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>

      <div className="text-center mt-5">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5 mx-auto"
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
