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
    <div className="min-h-screen bg-[#FAF7F2] relative overflow-hidden flex items-center justify-center px-4 py-12 font-sans">
      {/* Background Image with warm overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-25 pointer-events-none"
        style={{ backgroundImage: `url(${loginSignupImg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#FAF7F2]/80 via-[#FAF7F2]/90 to-[#FAF7F2] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-6">
          <div 
            onClick={() => navigate('/')} 
            className="w-20 h-20 mx-auto mb-3 cursor-pointer hover:scale-105 transition-transform"
          >
            <img src={logo} alt="ShaadiSahulat" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] text-[11px] font-bold tracking-wider uppercase mb-2">
            <span>✨</span> Merchant &amp; Designer Portal
          </div>
          <h2 className="font-serif text-3xl font-bold text-stone-900 tracking-tight">
            {mode === 'login' ? 'Merchant Sign In' : 'Join as a Designer'}
          </h2>
          <p className="text-xs text-stone-600 mt-1 font-medium">
            {mode === 'login'
              ? 'Access your bridal boutique inventory, dispatch hub & analytics'
              : 'Showcase and sell your wedding couture across Pakistan'}
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-luxury border border-[#EADBCC] p-7 sm:p-8">
          {pending ? (
            <RegistrationOtpPanel
              pending={pending}
              theme="amber"
              onVerified={(u) => onLogin?.(u)}
              onBackToSignIn={() => {
                setPending(null);
                setMode('login');
                setError('');
              }}
            />
          ) : (<>
            {/* Tab switcher */}
            <div className="flex gap-1 bg-[#FAF7F2] p-1.5 rounded-2xl mb-5 border border-[#EFEAE4]">
              {[
                { id: 'login',    label: 'Sign In'  },
                { id: 'register', label: 'Create Account' },
              ].map(({ id, label }) => (
                <button 
                  key={id} 
                  onClick={() => switchMode(id)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    mode === id
                      ? 'bg-gradient-to-r from-[#9B7036] to-[#7d5624] text-white shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {notice && !error && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
                <span>✓</span> {notice}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Register-only fields */}
              {mode === 'register' && (
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">
                    Boutique / Brand / Full Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => update('name', e.target.value)}
                    placeholder="e.g. Royal Heritage Couture"
                    required
                    className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 bg-[#FAF7F2]/50 text-stone-800"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  placeholder="designer@boutique.com"
                  required
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 bg-[#FAF7F2]/50 text-stone-800"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 bg-[#FAF7F2]/50 text-stone-800"
                />

                {mode === 'register' && (
                  <p className="text-[11px] text-stone-400 mt-1">
                    At least 8 characters, with letters and numbers.
                  </p>
                )}

                {mode === 'login' && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password?portal=seller')}
                      className="text-xs text-[#9B7036] font-semibold hover:underline cursor-pointer"
                    >
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
                      <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Phone</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={e => update('phone', e.target.value)}
                        placeholder="0300-1234567"
                        className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 bg-[#FAF7F2]/50 text-stone-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">City</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={e => update('city', e.target.value)}
                        placeholder="Lahore"
                        className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 bg-[#FAF7F2]/50 text-stone-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Merchant Classification</label>
                    <div className="flex gap-2">
                      {[
                        { id: 'individual', label: '👤 Independent Designer' },
                        { id: 'company',    label: '🏢 Boutique Brand' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => update('seller_type', id)}
                          className={`flex-1 py-2 text-xs rounded-xl border font-bold transition-all ${
                            form.seller_type === id
                              ? 'bg-[#FAF3E8] border-[#9B7036] text-[#9B7036]'
                              : 'border-[#EFEAE4] text-stone-500 hover:border-[#ECD4A8]'
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
                className="w-full py-3.5 bg-gradient-to-r from-[#9B7036] to-[#7d5624] hover:opacity-95 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md shadow-[#9B7036]/20 transition-all disabled:opacity-60 cursor-pointer mt-2"
              >
                {loading ? 'Please wait…' : (mode === 'login' ? 'Enter Merchant Portal' : 'Register Merchant Account')}
              </button>
            </form>

            <p className="text-center text-xs text-stone-500 mt-5">
              {mode === 'login'
                ? "Don't have a seller account? "
                : "Already registered as a merchant? "}
              <button 
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                className="text-[#9B7036] font-bold hover:underline cursor-pointer ml-1"
              >
                {mode === 'login' ? 'Register here' : 'Sign in here'}
              </button>
            </p>
          </>)}

          <div className="text-center mt-5 pt-4 border-t border-[#FAF7F2]">
            <button
              onClick={() => navigate('/')}
              className="text-xs text-stone-500 hover:text-[#9B7036] transition-colors flex items-center gap-1.5 mx-auto font-medium cursor-pointer"
            >
              ← Return to ShaadiSahulat Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
