import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RegistrationOtpPanel from '../Auth/RegistrationOtpPanel';
import loginSignupImg from '../../assets/hero/LoginSignup1.jpeg';
import logo from '../../assets/ShaadiSahulat Logo PNG.png';

export default function SellerAuthPage({ onLogin }) {
  const navigate = useNavigate();
  const { login, register, notice, clearNotice } = useAuth();
  const [mode,    setMode]    = useState('login');   // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [pending, setPending] = useState(null);  // OTP-first sign-up: set after the code is emailed

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
    clearNotice?.();
    try {
      // JWT auth: the session lives in an HttpOnly cookie + in-memory access token.
      const result = mode === 'register'
        ? await register('seller', {
            name: form.name, email: form.email, password: form.password,
            phone: form.phone, city: form.city, seller_type: form.seller_type,
          })
        : await login('seller', form.email, form.password);

      if (!result.ok) {
        setError(result.error || 'Something went wrong. Please try again.');
        return;
      }
      if (result.pending) {
        // No account yet: it is created only after the emailed code is verified.
        setForm(f => ({ ...f, password: '' }));
        setPending(result.pending);
        return;
      }
      onLogin?.(result.user);
    } catch {
      setError('Could not reach the server. Please check your connection.');
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
          {pending ? (
            <RegistrationOtpPanel
              pending={pending}
              theme="indigo"
              onVerified={(u) => onLogin?.(u)}
              onBackToSignIn={() => { setPending(null); setMode('login'); setError(''); }}
            />
          ) : (<>
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

          {notice && !error && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
              {notice}
            </div>
          )}

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
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
              />
              {mode === 'register' && (
                <p className="text-[11px] text-gray-500 mt-1">At least 8 characters, with a letter and a number.</p>
              )}
              {mode === 'login' && (
                <div className="text-right mt-1">
                  <button type="button" onClick={() => navigate('/forgot-password?portal=seller')}
                    className="text-[11px] text-indigo-600 font-bold hover:underline cursor-pointer">
                    Forgot password?
                  </button>
                </div>
              )}
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

          </>)}

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
