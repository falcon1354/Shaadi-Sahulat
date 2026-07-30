import React, { useState, useEffect } from "react";
import adminExtApi from "../../api/adminExtApi";

/**
 * AdminWalletPage — show admin wallet balance + ledger + recent payouts.
 */
export default function AdminWalletPage({ admin }) {
  const [data, setData] = useState(null);

  const load = async () => {
    if (!admin) return;
    const adminId = admin.admin_id || admin._id;
    const r = await adminExtApi.getWallet(adminId);
    if (r.success) setData(r);
  };
  useEffect(() => { load(); }, [admin]);

  if (!data) return <div className="text-center py-12 text-gray-500">Loading wallet...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">Dummy balance for FYP — every seller payout is logged here</p>
      </div>

      <div className="bg-gradient-to-br from-[#a37b3d] to-[#8a6633] text-white rounded-2xl shadow p-6">
        <p className="text-xs uppercase opacity-80">Current Balance</p>
        <p className="text-4xl font-bold mt-1">PKR {(data.wallet.balance || 0).toLocaleString()}</p>
        <p className="text-xs opacity-80 mt-2">{data.wallet.currency} • Wallet ID: {data.wallet.wallet_id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Ledger (last 50)</h3>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {(data.wallet.ledger || []).map((entry, i) => (
              <div key={i} className="text-xs flex justify-between border-b border-gray-100 py-1">
                <div>
                  <span className={`font-bold ${entry.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}>
                    {entry.type === "CREDIT" ? "+" : "−"} PKR {entry.amount.toLocaleString()}
                  </span>
                  <p className="text-gray-500">{entry.description}</p>
                  <p className="text-gray-400">{new Date(entry.at).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {(!data.wallet.ledger || data.wallet.ledger.length === 0) && (
              <p className="text-xs text-gray-400 text-center py-4">No transactions yet.</p>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Payouts (last 20)</h3>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {(data.recent_payouts || []).map(p => (
              <div key={p.payout_id} className="text-xs border-b border-gray-100 py-1">
                <p className="font-semibold">PKR {p.net_to_seller.toLocaleString()} → {p.seller_id}</p>
                <p className="text-gray-500">{p.transaction_id} • Order {p.order_id}</p>
                <p className="text-gray-400">{new Date(p.released_at).toLocaleString()}</p>
              </div>
            ))}
            {(!data.recent_payouts || data.recent_payouts.length === 0) && (
              <p className="text-xs text-gray-400 text-center py-4">No payouts released yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
