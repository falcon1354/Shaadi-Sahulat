import React, { useState } from "react";
import bankApi from "../../api/bankApi";
import { useNavigate } from "react-router-dom";

/**
 * BankLoginPage — single bank officer login.
 * Default credentials: officer@bank.com / bank123
 */
export default function BankLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("officer@bank.com");
  const [password, setPassword] = useState("bank123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const r = await bankApi.login(email, password);
    setLoading(false);
    if (!r.success) { setError(r.error); return; }
    bankApi.saveOfficerToStorage({ ...r.officer, token: r.token, email: r.email });
    navigate("/bank/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🏦</div>
          <h1 className="text-2xl font-bold text-gray-800">Bank Officer Login</h1>
          <p className="text-sm text-gray-500 mt-1">Dummy Bank Verification Dashboard</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading ? "Logging in..." : "LOGIN"}
          </button>
        </form>
        <div className="mt-4 text-xs text-gray-500 text-center bg-blue-50 rounded-lg p-2">
          Demo credentials: <b>officer@bank.com</b> / <b>bank123</b>
        </div>
      </div>
    </div>
  );
}
