import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const THEMES = {
  gold: {
    ring: 'focus:ring-[#a37b3d]',
    button: 'bg-gradient-to-r from-[#a37b3d] to-[#c69a54]',
    link: 'text-[#a37b3d]',
  },
  indigo: {
    ring: 'focus:ring-indigo-500',
    button: 'bg-gradient-to-r from-indigo-600 to-purple-600',
    link: 'text-indigo-600',
  },
};

/**
 * "Verify your email" step of OTP-first sign-up. The account does not exist yet:
 * it is created (and signed in) only when the 6-digit code is verified.
 * `pending` comes from register() and is held in memory only (never stored).
 */
export default function RegistrationOtpPanel({ pending, theme = 'gold', onVerified, onBackToSignIn }) {
  const { verifyRegistration, resendRegistrationOtp } = useAuth();
  const t = THEMES[theme] || THEMES.gold;
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(pending.message || '');
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [cooldown, setCooldown] = useState(Number(pending.resendAfter) || 60);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  // After success, continue into the app as the existing sign-up flow did.
  useEffect(() => {
    if (!verifiedUser) return undefined;
    const id = setTimeout(() => onVerified?.(verifiedUser), 1500);
    return () => clearTimeout(id);
  }, [verifiedUser, onVerified]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    const r = await verifyRegistration(pending, otp);
    setBusy(false);
    if (!r.ok) {
      setOtp('');
      setError(r.error);
      return;
    }
    setInfo('');
    setVerifiedUser(r.user);
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    const r = await resendRegistrationOtp(pending);
    setBusy(false);
    if (!r.ok) {
      if (r.retryAfter) setCooldown(Number(r.retryAfter));
      return setError(r.error);
    }
    setOtp('');
    setCooldown(Number(r.resendAfter) || 60);
    setInfo(`A new code has been sent to ${pending.email}. Earlier codes no longer work.`);
    inputRef.current?.focus();
  };

  if (verifiedUser) {
    return (
      <div className="text-center py-4" role="status">
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl">✓</div>
        <h3 className="text-lg font-extrabold text-gray-900">Email verified — account created</h3>
        <p className="text-xs text-gray-500 mt-1 mb-4">Welcome to ShaadiSahulat! Taking you to your dashboard…</p>
        <button type="button" onClick={() => onVerified?.(verifiedUser)}
          className={`w-full py-3 ${t.button} text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all shadow-md cursor-pointer`}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-extrabold text-gray-900 mb-1">Verify your email</h3>
      <p className="text-xs text-gray-500 mb-4">
        We sent a 6-digit code to <span className="font-bold text-gray-800 break-all">{pending.email}</span>.
        Your account is created once the code is verified. The code expires in {Math.round((Number(pending.otpExpiresIn) || 600) / 60)} minutes.
      </p>

      {info && !error && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium" role="status">{info}</div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium" role="alert">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="reg-otp">Verification code</label>
          <input
            id="reg-otp"
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className={`w-full border border-gray-200 rounded-xl px-3.5 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 ${t.ring} bg-gray-50/50`}
          />
        </div>
        <button type="submit" disabled={busy || otp.length !== 6}
          className={`w-full py-3.5 ${t.button} text-white rounded-xl font-bold text-sm hover:brightness-110 disabled:opacity-60 transition-all shadow-md cursor-pointer`}>
          {busy ? 'Please wait…' : 'Verify OTP'}
        </button>
      </form>

      <div className="flex items-center justify-between mt-4 text-xs">
        <button type="button" onClick={resend} disabled={busy || cooldown > 0}
          className={`${t.link} font-bold hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-default`}>
          {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
        </button>
        <button type="button" onClick={onBackToSignIn} className="text-gray-500 hover:text-gray-800 font-medium cursor-pointer">
          ← Back to sign in
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Didn't get it? Check your spam folder. Never share this code with anyone.</p>
    </div>
  );
}
