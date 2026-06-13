import React, { useState } from 'react';
import adminApi from '../../api/adminApi';

export default function AdminLogin({ onLogin, onBack }) {
  const [form, setForm]   = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.loginAdmin(form);
      if (res.success) {
        localStorage.setItem('ss_admin', JSON.stringify(res.admin));
        onLogin(res.admin);
      } else {
        setError(res.error || 'Invalid credentials');
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
          <p className="text-gray-400 text-sm mt-1">ShaadiSahulat Admin Control</p>
        </div>

        <form onSubmit={handle} className="bg-gray-800 rounded-2xl p-8 space-y-5 border border-gray-700">
          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="admin@shaadisahulat.com"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          {onBack && (
            <button type="button" onClick={onBack}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors">
              ← Back to Home
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
