import React, { useState, useEffect } from "react";
import adminApi from "../../api/adminApi";
import adminExtApi from "../../api/adminExtApi";

/**
 * AdminWalletPage — show admin wallet balance + ledger + recent payouts,
 * plus a Sellers management section that lets the admin remove sellers
 * that have NO active product listings.
 */
export default function AdminWalletPage({ admin }) {
  const [data, setData] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [sellerMsg, setSellerMsg] = useState("");
  const [removingId, setRemovingId] = useState("");

  const adminId = admin?.admin_id || admin?._id;

  const load = async () => {
    if (!admin) return;
    const adminIdInner = admin.admin_id || admin._id;
    const [walletResp, sellersResp] = await Promise.all([
      adminExtApi.getWallet(adminIdInner),
      adminApi.getAllSellers(),
    ]);
    if (walletResp.success) setData(walletResp);
    if (sellersResp.sellers) setSellers(sellersResp.sellers);
  };
  useEffect(() => { load(); }, [admin]);

  const removeSeller = async (sellerId, productCount) => {
    if (productCount > 0) {
      setSellerMsg(`Cannot remove seller "${sellerId}" — they have ${productCount} active product listing(s).`);
      return;
    }
    if (!confirm(`Remove seller ${sellerId}? This action is permanent.`)) return;
    setRemovingId(sellerId);
    setSellerMsg("");
    const r = await adminExtApi.removeSeller(adminId, sellerId);
    setRemovingId("");
    if (!r.success) {
      // Backend returns 403 with `error` when seller still has products
      // (or 502 when the ML service is unreachable).
      setSellerMsg(r.error || "Failed to remove seller.");
      return;
    }
    setSellerMsg(`✓ Seller ${sellerId} removed.`);
    await load();
  };

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

      {/* ── Sellers management ─────────────────────────────────────────────
          Lists every seller with their live product_count. Remove is disabled
          (and shows a tooltip) when the seller still has active listings —
          matches the backend DELETE /api/admin/sellers/:seller_id guard. */}
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Sellers</h3>
          <button onClick={load} className="text-xs text-[#a37b3d]">↻ Refresh</button>
        </div>

        {sellerMsg && (
          <p className={`text-xs mb-3 ${sellerMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{sellerMsg}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Seller Name</th>
                <th className="pb-2 font-medium">Seller ID</th>
                <th className="pb-2 font-medium">City</th>
                <th className="pb-2 font-medium text-right">Products</th>
                <th className="pb-2 font-medium text-right">Wallet Balance</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sellers.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400 text-xs">No sellers registered.</td></tr>
              ) : sellers.map(s => {
                const productCount = s.product_count ?? 0;
                const locked = productCount > 0;
                const isRemoving = removingId === s.seller_id;
                return (
                  <tr key={s.seller_id} className="border-b border-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">{s.name || '—'}</td>
                    <td className="py-2.5 text-gray-500 font-mono text-xs">{s.seller_id}</td>
                    <td className="py-2.5 text-gray-500">{s.city || '—'}</td>
                    <td className="py-2.5 text-right font-bold text-[#a37b3d]">{productCount}</td>
                    <td className="py-2.5 text-right text-gray-600 text-xs">
                      {typeof s.wallet_balance === 'number'
                        ? `PKR ${s.wallet_balance.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => removeSeller(s.seller_id, productCount)}
                        disabled={locked || isRemoving}
                        title={locked ? "Cannot remove seller with active product listings" : "Remove seller"}
                        className={`text-xs px-3 py-1 rounded-lg font-semibold ${
                          locked
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                        }`}
                      >
                        {isRemoving ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Sellers with active product listings cannot be removed. Remove or migrate their products first.
        </p>
      </div>
    </div>
  );
}
