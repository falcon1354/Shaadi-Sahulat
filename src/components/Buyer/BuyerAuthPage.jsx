import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RegistrationOtpPanel from '../Auth/RegistrationOtpPanel';
import loginSignupImg from '../../assets/hero/LoginSignup.jpeg';
import logo from '../../assets/ShaadiSahulat Logo PNG.png';

export default function BuyerAuthPage({ onLogin }) {
  const navigate = useNavigate();
  const { login, register, notice, clearNotice } = useAuth();
  const [mode,    setMode]    = useState('login');   // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [pending, setPending] = useState(null);  // OTP-first sign-up: set after the code is emailed

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
    clearNotice?.();
    try {
      // JWT auth: the session lives in an HttpOnly cookie + in-memory access token.
      const result = mode === 'register'
        ? await register('buyer', {
            name: form.name, email: form.email, password: form.password, phone: form.phone, city: form.city,
          })
        : await login('buyer', form.email, form.password);

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

  return (
    <div className="min-h-screen bg-[#e8e3da] relative overflow-hidden flex items-center justify-center px-4 py-8 font-sans">
      
      {/* Soft 25% Opacity Background Image for High Text Contrast */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 pointer-events-none"
        style={{ backgroundImage: `url(${loginSignupImg})` }}
      />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-6">
          <div 
            onClick={() => navigate('/')} 
            className="w-16 h-16 mx-auto mb-3 cursor-pointer hover:scale-105 transition-transform"
          >
            <img src={logo} alt="ShaadiSahulat" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h2 className="text-4xl font-black text-[#eb44ab] tracking-tight">
            {mode === 'login' ? 'Buyer Sign In' : 'Create Buyer Account'}
          </h2>
          <p className="text-lg sm:text-x text-[#73606c] font-bold mt-2 drop-shadow-md">
            {mode === 'login'
              ? 'Access your wedding Products within Budget'
              : 'Join ShaadiSahulat — plan your dream wedding'}
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-7 sm:p-7">
          {pending ? (
            <RegistrationOtpPanel
              pending={pending}
              theme="gold"
              onVerified={(u) => onLogin?.(u)}
              onBackToSignIn={() => { setPending(null); setMode('login'); setError(''); }}
            />
          ) : (<>
          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl mb-5">
            {['login', 'register'].map(m => (
              <button 
                key={m} 
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                  mode === m ? 'bg-white text-[#a37b3d] shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {m === 'login' ? 'Sign In' : 'Register'}
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="Your full name"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                placeholder="you@email.com"
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => update('password', e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50"
              />
              {mode === 'register' && (
                <p className="text-[11px] text-gray-500 mt-1">At least 8 characters, with a letter and a number.</p>
              )}
              {mode === 'login' && (
                <div className="text-right mt-1">
                  <button type="button" onClick={() => navigate('/forgot-password?portal=buyer')}
                    className="text-[11px] text-[#a37b3d] font-bold hover:underline cursor-pointer">
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone (optional)</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                    placeholder="03xx-xxxxxxx"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">City (optional)</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => update('city', e.target.value)}
                    placeholder="Lahore"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#a37b3d] to-[#c69a54] text-white rounded-xl font-bold text-sm hover:brightness-110 disabled:opacity-60 transition-all shadow-md mt-2 cursor-pointer">
              {loading ? 'Please wait…' : (mode === 'login' ? 'Sign In as Buyer' : 'Create Buyer Account')}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-5">
            {mode === 'login'
              ? "Don't have an account? "
              : "Already have an account? "}
            <button 
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-[#a37b3d] font-bold hover:underline cursor-pointer">
              {mode === 'login' ? 'Register here' : 'Sign in here'}
            </button>
          </p>
          </>)}

        <div className="text-center mt-5">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-[#a37b3d] hover:text-black transition-colors flex items-center gap-1.5 mx-auto font-medium cursor-pointer"
          >
            ← Back to Home
          </button>
        </div>
        </div>


      </div>
    </div>
  );
}
