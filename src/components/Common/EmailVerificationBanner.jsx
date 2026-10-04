import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

/** Shown on buyer/seller account pages while the signed-in email is unverified. */
export default function EmailVerificationBanner({ className = '' }) {
  const { user, resendVerification } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: '', text: '' });

  if (!user || user.role === 'admin' || user.email_verified !== false) return null;

  const resend = async () => {
    setBusy(true);
    const res = await resendVerification();
    setBusy(false);
    setMsg(res.ok
      ? { tone: 'ok', text: 'A new verification link has been sent. Please check your inbox.' }
      : { tone: 'error', text: res.error });
  };

  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`} role="status">
      <div className="flex-1">
        <p className="text-sm font-bold text-amber-900">Please verify your email address</p>
        <p className="text-xs text-amber-800 mt-0.5">
          We sent a verification link to <span className="font-semibold">{user.email}</span>.
        </p>
        {msg.text && (
          <p className={`text-xs mt-1 font-medium ${msg.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{msg.text}</p>
        )}
      </div>
      <button type="button" onClick={resend} disabled={busy}
        className="px-4 py-2 bg-gradient-to-r from-[#a37b3d] to-[#c69a54] text-white rounded-xl font-bold text-xs hover:brightness-110 disabled:opacity-60 transition-all shadow-sm whitespace-nowrap">
        {busy ? 'Sending…' : 'Resend link'}
      </button>
    </div>
  );
}
