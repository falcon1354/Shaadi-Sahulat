import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_HOME } from '../../auth/guard';
import AuthShell, { Alert, inputClass, primaryButtonClass, useOneTimeToken } from './AuthShell';

const COPY = {
  verifying: { title: 'Verifying Email', subtitle: 'One moment…' },
  verified: { title: 'Email Verified', subtitle: 'Thank you for confirming your email address' },
  already_verified: { title: 'Already Verified', subtitle: 'Your email address is already confirmed' },
  expired: { title: 'Link Expired', subtitle: 'Verification links are valid for a limited time' },
  invalid: { title: 'Invalid Link', subtitle: 'This verification link cannot be used' },
  error: { title: 'Verify Email', subtitle: 'Something went wrong' },
};

/** Resend form: signed in → current account (no email needed); otherwise by email. */
export function ResendVerification() {
  const { status, resendVerification } = useAuth();
  const signedIn = status === 'authenticated';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: '', text: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!signedIn && !email.trim()) return setMsg({ tone: 'error', text: 'Please enter your email address.' });
    setBusy(true);
    const res = await resendVerification(signedIn ? undefined : email.trim());
    setBusy(false);
    setMsg(res.ok
      ? { tone: 'success', text: res.message || 'If this email belongs to an unverified account, a new verification link has been sent.' }
      : { tone: 'error', text: res.error });
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-2">
      {msg.text && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!signedIn && (
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="rv-email">Email Address</label>
          <input id="rv-email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className={inputClass} />
        </div>
      )}
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? 'Please wait…' : 'Send a new verification link'}
      </button>
    </form>
  );
}

export default function VerifyEmailPage() {
  const token = useOneTimeToken();
  const { verifyEmail, status: authStatus, role } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(token ? 'verifying' : 'invalid');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Wait for session restore so a signed-in user's badge refreshes; run once only.
    if (!token || started.current || authStatus === 'loading') return;
    started.current = true;
    verifyEmail(token).then((res) => {
      setState(res.status);
      setMessage(res.message);
    });
  }, [token, authStatus, verifyEmail]);

  const copy = COPY[state] || COPY.error;
  const ok = state === 'verified' || state === 'already_verified';

  return (
    <AuthShell title={copy.title} subtitle={copy.subtitle}>
      {state === 'verifying' && <p className="text-sm text-gray-500 text-center py-4">Checking your link…</p>}
      {ok && (
        <>
          <Alert tone="success">{message || 'Your email address has been verified.'}</Alert>
          <button type="button" className={primaryButtonClass}
            onClick={() => navigate(authStatus === 'authenticated' && ROLE_HOME[role] ? ROLE_HOME[role] : '/', { replace: true })}>
            {authStatus === 'authenticated' ? 'Continue to your dashboard' : 'Continue'}
          </button>
        </>
      )}
      {(state === 'expired' || state === 'invalid' || state === 'error') && (
        <>
          <Alert>{message || 'This verification link is invalid. Please request a new one.'}</Alert>
          <ResendVerification />
        </>
      )}
    </AuthShell>
  );
}
