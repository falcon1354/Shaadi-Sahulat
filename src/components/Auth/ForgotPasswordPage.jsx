import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthShell, { Alert, PORTAL_LOGIN, inputClass, primaryButtonClass } from './AuthShell';

/**
 * Request a password-reset link. The answer is identical whether or not the email
 * belongs to an account (the backend never reveals it), so the page shows one
 * generic confirmation.
 */
export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const portal = PORTAL_LOGIN[new URLSearchParams(location.search).get('portal')] || null;

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Please enter your email address.');
    setBusy(true);
    const res = await forgotPassword(email.trim());
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSent(res.message || 'If an account exists for this email, you will receive password reset instructions.');
  };

  return (
    <AuthShell title="Forgot Password" subtitle="We'll email you a link to choose a new password">
      {error && <Alert>{error}</Alert>}
      {sent ? (
        <>
          <Alert tone="success">{sent}</Alert>
          <p className="text-xs text-gray-500 mb-4">
            The link expires soon and can be used once. Didn't get it? Check your spam folder or try again in a minute.
          </p>
          <button type="button" className={primaryButtonClass} onClick={() => { setSent(''); }}>
            Send another link
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="fp-email">Email Address</label>
            <input id="fp-email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className={inputClass} />
          </div>
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Please wait…' : 'Send Reset Link'}
          </button>
        </form>
      )}
      {portal && (
        <p className="text-center text-xs text-gray-500 mt-5">
          Remembered it?{' '}
          <button type="button" onClick={() => navigate(portal.path)} className="text-[#a37b3d] font-bold hover:underline cursor-pointer">
            {portal.label}
          </button>
        </p>
      )}
    </AuthShell>
  );
}
