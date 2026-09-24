import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerSeller, loginSeller } from '../../api/sellerApi';
import loginSignupImg from '../../assets/hero/LoginSignup1.jpeg';
import logo from '../../assets/ShaadiSahulat Logo PNG.png';

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
      // v3.2: notify SocketContext immediately (no 1.5s wait)
      try { window.dispatchEvent(new Event('ss_auth_changed')); } catch {}
      onLogin(sellerData);
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(''); };

  return (
    <div className="min-h-screen bg-[#f5edf2] relative overflow-hidden flex items-center justify-center px-4 py-8 font-sans">
      
      {/* Soft 25% Opacity Background Image for High Text Contrast */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 pointer-events-none"
        style={{ backgroundImage: `url(${loginSignupImg})` }}
      />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-6">
          <div 
            onClick={() => navigate('/')} 
            className="w-16 h-16 mx-auto mb-3 cursor-pointer hover:scale-105 transition-transform"
          >
            <img src={logo} alt="ShaadiSahulat" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h2 className="text-3xl font-black text-[#eb44ab] tracking-tight">
            {mode === 'login' ? 'Seller Sign In' : 'Create Seller Account'}
          </h2>
          <p className=" text-m text-[#73606c] mt-1 font-bold">
            {mode === 'login'
              ? 'Sign in to manage your products, storefront & orders'
              : 'Register your brand to start selling on ShaadiSahulat'}
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-7 sm:p-8">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl mb-5">
            {[
              { id: 'login',    label: 'Sign In'  },
              { id: 'register', label: 'Register' },
            ].map(({ id, label }) => (
              <button 
                key={id} 
                onClick={() => switchMode(id)}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                  mode === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">

            {/* Register-only fields */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Business / Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="Your brand or full name"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                placeholder="you@email.com"
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => update('password', e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
              />
            </div>

            {/* Register-only: phone, city, seller type */}
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Phone (optional)</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => update('phone', e.target.value)}
                      placeholder="03xx-xxxxxxx"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">City (optional)</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => update('city', e.target.value)}
                      placeholder="Lahore"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Seller Account Type</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'individual', label: '👤 Individual' },
                      { id: 'company',    label: '🏢 Company'    },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => update('seller_type', id)}
                        className={`flex-1 py-2 text-sm rounded-xl border font-bold transition-all ${
                          form.seller_type === id
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
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
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:brightness-110 disabled:opacity-60 transition-all shadow-md mt-2 cursor-pointer">
              {loading ? 'Please wait…' : (mode === 'login' ? 'Sign In as Seller' : 'Create Seller Account')}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-5">
            {mode === 'login'
              ? "Don't have a seller account? "
              : "Already registered as seller? "}
            <button 
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-indigo-600 font-bold hover:underline cursor-pointer">
              {mode === 'login' ? 'Register here' : 'Sign in here'}
            </button>
          </p>

        <div className="text-center mt-5">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-indigo-700 hover:text-black transition-colors flex items-center gap-1.5 mx-auto font-medium cursor-pointer"
          >
            ← Back to Home
          </button>
        </div>
        </div>


      </div>
    </div>
  );
}
