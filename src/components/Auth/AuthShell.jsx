import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import loginSignupImg from '../../assets/hero/LoginSignup.jpeg';
import logo from '../../assets/ShaadiSahulat Logo PNG.png';

/** Portals a "back to sign in" link may point at (from ?portal=…, display only). */
export const PORTAL_LOGIN = {
  buyer: { path: '/buyer/login', label: 'Buyer Sign In' },
  seller: { path: '/seller/login', label: 'Seller Sign In' },
  admin: { path: '/admin/login', label: 'Admin Sign In' },
};

export const inputClass =
  'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50';
export const primaryButtonClass =
  'w-full py-3.5 bg-gradient-to-r from-[#a37b3d] to-[#c69a54] text-white rounded-xl font-bold text-sm hover:brightness-110 disabled:opacity-60 transition-all shadow-md cursor-pointer';

/**
 * Reads a one-time token from ?token=… exactly once, then removes it from the
 * address bar (replace navigation) so it is not kept in history, bookmarks or
 * Referer headers. The token lives only in component memory — never in storage.
 */
export function useOneTimeToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.search).get('token') || '');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('token')) return;
    params.delete('token');
    const rest = params.toString();
    navigate(`${location.pathname}${rest ? `?${rest}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return token;
}

export function Alert({ tone = 'error', children }) {
  const tones = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    info: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  return (
    <div className={`mb-4 p-3 border rounded-xl text-xs font-medium ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Gold-themed card layout shared by the forgot / reset / verify pages. */
export default function AuthShell({ title, subtitle, children }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#e8e3da] relative overflow-hidden flex items-center justify-center px-4 py-8 font-sans">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 pointer-events-none"
        style={{ backgroundImage: `url(${loginSignupImg})` }}
      />
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-6">
          <div onClick={() => navigate('/')} className="w-16 h-16 mx-auto mb-3 cursor-pointer hover:scale-105 transition-transform">
            <img src={logo} alt="ShaadiSahulat" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h2 className="text-3xl font-black text-[#eb44ab] tracking-tight">{title}</h2>
          {subtitle && <p className="text-base text-[#73606c] font-bold mt-2 drop-shadow-md">{subtitle}</p>}
        </div>
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-7">
          {children}
          <div className="text-center mt-5">
            <button
              type="button"
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
