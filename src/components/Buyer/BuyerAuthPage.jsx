import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerBuyer, loginBuyer, saveBuyerToStorage } from '../../api/buyerApi';

export default function BuyerAuthPage({ onLogin }) {
  const navigate = useNavigate();
  const [mode,    setMode]    = useState('login');   // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [form, setForm] = useState({
    name:     '',
    email:    '',
    password: '',
    phone:    '',
    city:     '',
  });

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await registerBuyer(form)
        : await loginBuyer({ email: form.email, password: form.password });

      if (!result.success) {
        setError(result.error || 'Something went wrong.');
        return;
      }

      saveBuyerToStorage(result.buyer);
      onLogin(result.buyer);
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-3">
          👤
        </div>
        <h2 className="text-2xl font-bold text-gray-800">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {mode === 'login'
            ? 'Access your wishlist, cart and budget tracker'
            : 'Join ShaadiSahulat — free forever'}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                mode === m ? 'bg-white text-[#a37b3d] shadow-sm' : 'text-gray-500'
              }`}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="Your name"
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="you@email.com"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="Min 6 characters"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
            />
          </div>

          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => update('phone', e.target.value)}
                  placeholder="03xx-xxxxxxx"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City (optional)</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => update('city', e.target.value)}
                  placeholder="Lahore"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] text-gray-900 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-all mt-2">
            {loading ? 'Please wait…' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          {mode === 'login'
            ? "Don't have an account? "
            : "Already have an account? "}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-[#a37b3d] font-medium hover:underline">
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
