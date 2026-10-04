import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LOGIN } from '../../auth/guard';
import { policyErrors } from '../../auth/passwordPolicy';

/**
 * Change-password form (buyer / seller / admin). On success every session is
 * revoked server-side, local auth state is cleared and the user signs in again.
 */
export default function ChangePasswordPanel({ className = '' }) {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.current || !form.next) return setError('Please fill in all fields.');
    if (form.next !== form.confirm) return setError('New passwords do not match.');
    if (form.next === form.current) return setError('New password must be different from the current password.');
    const problems = policyErrors(form.next, user?.email);
    if (problems.length) return setError(problems[0]);

    setBusy(true);
    const role = user?.role;
    const res = await changePassword(form.current, form.next);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    navigate(ROLE_LOGIN[role] || '/', { replace: true });
  };

  const input = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a37b3d] bg-gray-50/50';

  return (
    <div className={`bg-white rounded-3xl shadow-sm border border-[#FBEFF1] p-6 sm:p-8 ${className}`}>
      <h3 className="text-base font-extrabold text-gray-900 mb-1">Change Password</h3>
      <p className="text-xs text-gray-500 mb-4">
        You will be signed out on all devices and asked to sign in again.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3 max-w-md">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="cp-current">Current password</label>
          <input id="cp-current" type="password" autoComplete="current-password" required
            value={form.current} onChange={(e) => update('current', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="cp-new">New password</label>
          <input id="cp-new" type="password" autoComplete="new-password" required
            value={form.next} onChange={(e) => update('next', e.target.value)} className={input} />
          <p className="text-[11px] text-gray-500 mt-1">At least 8 characters, with a letter and a number.</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="cp-confirm">Confirm new password</label>
          <input id="cp-confirm" type="password" autoComplete="new-password" required
            value={form.confirm} onChange={(e) => update('confirm', e.target.value)} className={input} />
        </div>
        <button type="submit" disabled={busy}
          className="px-5 py-2.5 bg-gradient-to-r from-[#a37b3d] to-[#c69a54] text-white rounded-xl font-bold text-sm hover:brightness-110 disabled:opacity-60 transition-all shadow-sm">
          {busy ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
