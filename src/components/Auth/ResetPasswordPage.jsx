import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { policyErrors } from '../../auth/passwordPolicy';
import AuthShell, { Alert, PORTAL_LOGIN, inputClass, primaryButtonClass, useOneTimeToken } from './AuthShell';

/**
 * Choose a new password from an emailed one-time link. On success every session
 * of the account is revoked server-side and the user signs in again (no auto-login).
 */
export default function ResetPasswordPage() {
  const token = useOneTimeToken();
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkProblem, setLinkProblem] = useState(token ? '' : 'This reset link is invalid. Please request a new one.');
  const [done, setDone] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    const problems = policyErrors(form.password);
    if (problems.length) return setError(problems[0]);
    setBusy(true);
    const res = await resetPassword(token, form.password);
    setBusy(false);
    if (res.ok) {
      setForm({ password: '', confirm: '' });
      return setDone(true);
    }
    if (res.expired || res.invalid) return setLinkProblem(res.error);
    setError(res.error);
  };

  if (done) {
    return (
      <AuthShell title="Password Reset" subtitle="You can now sign in with your new password">
        <Alert tone="success">
          Your password has been reset. For your security you have been signed out on all devices.
        </Alert>
        <div className="space-y-2">
          {['buyer', 'seller'].map((p) => (
            <button key={p} type="button" className={primaryButtonClass} onClick={() => navigate(PORTAL_LOGIN[p].path, { replace: true })}>
              {PORTAL_LOGIN[p].label}
            </button>
          ))}
          <button type="button" onClick={() => navigate(PORTAL_LOGIN.admin.path, { replace: true })}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-800 cursor-pointer">
            Admin sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  if (linkProblem) {
    return (
      <AuthShell title="Reset Password" subtitle="This link can't be used">
        <Alert>{linkProblem}</Alert>
        <button type="button" className={primaryButtonClass} onClick={() => navigate('/forgot-password', { replace: true })}>
          Request a new link
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset Password" subtitle="Choose a new password for your account">
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="rp-new">New password</label>
          <input id="rp-new" type="password" autoComplete="new-password" required value={form.password}
            onChange={(e) => update('password', e.target.value)} placeholder="••••••••" className={inputClass} />
          <p className="text-[11px] text-gray-500 mt-1">At least 8 characters, with a letter and a number.</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="rp-confirm">Confirm new password</label>
          <input id="rp-confirm" type="password" autoComplete="new-password" required value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)} placeholder="••••••••" className={inputClass} />
        </div>
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? 'Please wait…' : 'Reset Password'}
        </button>
      </form>
    </AuthShell>
  );
}
