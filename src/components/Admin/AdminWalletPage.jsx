import React, { useState, useEffect, useMemo } from "react";
import adminApi from "../../api/adminApi";
import adminExtApi from "../../api/adminExtApi";

/**
 * Admin Wallet — balance + order-centric ledger.
 * Click an order to see all CREDIT (additions) and DEBIT (subtractions) for that order.
 */
export default function AdminWalletPage({ admin }) {
  const [data, setData] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [sellerMsg, setSellerMsg] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openOrder = async (orderId) => {
    if (!orderId || !adminId) return;
    setSelectedOrderId(orderId);
    setDetailLoading(true);
    setOrderDetail(null);
    // Prefer group already in payload; refresh from dedicated endpoint for full history
    const r = await adminExtApi.getWalletOrderLedger(adminId, orderId);
    setDetailLoading(false);
    if (r.success) setOrderDetail(r);
  };

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
      setSellerMsg(r.error || "Failed to remove seller.");
      return;
    }
    setSellerMsg(`✓ Seller ${sellerId} removed.`);
    await load();
  };

  const orderGroups = useMemo(() => data?.order_groups || [], [data]);

  if (!data) return <div className="text-center py-12 text-gray-500">Loading wallet...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">
          Balance and order-linked history — click an order to see additions and subtractions
        </p>
      </div>

      <div className="bg-gradient-to-br from-[#a37b3d] to-[#8a6633] text-white rounded-2xl shadow p-6">
        <p className="text-xs uppercase opacity-80">Current Balance</p>
        <p className="text-4xl font-bold mt-1">PKR {(data.wallet.balance || 0).toLocaleString()}</p>
        <p className="text-xs opacity-80 mt-2">{data.wallet.currency} • Wallet ID: {data.wallet.wallet_id}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Order-centric history */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">History by Order</h3>
          <p className="text-[11px] text-gray-400 mb-3">
            Each payout release logs a DEBIT (seller net) and CREDIT (platform commission) for that order.
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {orderGroups.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">No order-linked wallet activity yet.</p>
            )}
            {orderGroups.map((g) => (
              <button
                key={g.order_id}
                type="button"
                onClick={() => openOrder(g.order_id)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                  selectedOrderId === g.order_id
                    ? "border-[#a37b3d] bg-[#FFF8F0]"
                    : "border-gray-100 hover:border-[#ECD4A8] bg-gray-50/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-gray-900 font-mono">{g.order_id}</span>
                  <span className="text-[10px] text-gray-400">
                    {g.last_at ? new Date(g.last_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-[11px] font-semibold">
                  <span className="text-green-600">+ PKR {(g.credit_total || 0).toLocaleString()}</span>
                  <span className="text-red-600">− PKR {(g.debit_total || 0).toLocaleString()}</span>
                  <span className="text-gray-500">{(g.entries || []).length} entries</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected order drill-down */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            {selectedOrderId ? `Order ${selectedOrderId}` : "Order detail"}
          </h3>
          {!selectedOrderId && (
            <p className="text-xs text-gray-400 text-center py-12">Select an order on the left to view additions &amp; subtractions.</p>
          )}
          {detailLoading && <p className="text-xs text-gray-500 py-8 text-center">Loading…</p>}
          {orderDetail && !detailLoading && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-green-50 border border-green-100 p-2.5 text-center">
                  <p className="text-[9px] uppercase font-bold text-green-700">Additions</p>
                  <p className="text-sm font-black text-green-800">PKR {(orderDetail.credit_total || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 p-2.5 text-center">
                  <p className="text-[9px] uppercase font-bold text-red-700">Subtractions</p>
                  <p className="text-sm font-black text-red-800">PKR {(orderDetail.debit_total || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5 text-center">
                  <p className="text-[9px] uppercase font-bold text-gray-600">Net</p>
                  <p className="text-sm font-black text-gray-900">PKR {(orderDetail.net || 0).toLocaleString()}</p>
                </div>
              </div>

              {orderDetail.payout && (
                <div className="text-[11px] bg-[#FFF8F0] border border-[#ECD4A8]/60 rounded-xl px-3 py-2">
                  <p className="font-bold text-gray-800">Payout {orderDetail.payout.payout_id}</p>
                  <p className="text-gray-600">
                    Seller {orderDetail.payout.seller_id} · Net PKR {(orderDetail.payout.net_to_seller || 0).toLocaleString()}
                    {orderDetail.payout.commission != null ? ` · Commission PKR ${Number(orderDetail.payout.commission).toLocaleString()}` : ""}
                  </p>
                </div>
              )}

              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(orderDetail.entries || []).map((entry, i) => (
                  <div key={i} className="text-xs border border-gray-100 rounded-lg px-3 py-2 flex justify-between gap-2">
                    <div className="min-w-0">
                      <span className={`font-bold ${entry.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}>
                        {entry.type === "CREDIT" ? "ADDITION +" : "SUBTRACTION −"} PKR {(entry.amount || 0).toLocaleString()}
                      </span>
                      <p className="text-gray-500 mt-0.5">{entry.description}</p>
                      {entry.ref_payout_id && (
                        <p className="text-gray-400 font-mono text-[10px]">Payout: {entry.ref_payout_id}</p>
                      )}
                    </div>
                    <span className="text-gray-400 shrink-0 text-[10px]">
                      {entry.at ? new Date(entry.at).toLocaleString() : ""}
                    </span>
                  </div>
                ))}
                {(!orderDetail.entries || orderDetail.entries.length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-4">No ledger lines for this order.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Non-order ledger + recent payouts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Other ledger (no order)</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {(data.other_entries || []).map((entry, i) => (
              <div key={i} className="text-xs flex justify-between border-b border-gray-100 py-1">
                <div>
                  <span className={`font-bold ${entry.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}>
                    {entry.type === "CREDIT" ? "+" : "−"} PKR {(entry.amount || 0).toLocaleString()}
                  </span>
                  <p className="text-gray-500">{entry.description}</p>
                </div>
                <span className="text-gray-400">{entry.at ? new Date(entry.at).toLocaleString() : ""}</span>
              </div>
            ))}
            {(!data.other_entries || data.other_entries.length === 0) && (
              <p className="text-xs text-gray-400 text-center py-4">None.</p>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Payouts</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {(data.recent_payouts || []).map((p) => (
              <button
                key={p.payout_id}
                type="button"
                onClick={() => openOrder(p.order_id)}
                className="w-full text-left text-xs border-b border-gray-100 py-1.5 hover:bg-[#FFF8F0] rounded"
              >
                <p className="font-semibold">PKR {(p.net_to_seller || 0).toLocaleString()} → {p.seller_id}</p>
                <p className="text-gray-500">{p.transaction_id} • Order {p.order_id}</p>
                <p className="text-[#a37b3d] font-medium text-[10px]">View wallet lines →</p>
              </button>
            ))}
            {(!data.recent_payouts || data.recent_payouts.length === 0) && (
              <p className="text-xs text-gray-400 text-center py-4">No payouts released yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Sellers */}
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
              ) : sellers.map((s) => {
                const productCount = s.product_count ?? 0;
                const locked = productCount > 0;
                const isRemoving = removingId === s.seller_id;
                return (
                  <tr key={s.seller_id} className="border-b border-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">{s.name || "—"}</td>
                    <td className="py-2.5 text-gray-500 font-mono text-xs">{s.seller_id}</td>
                    <td className="py-2.5 text-gray-500">{s.city || "—"}</td>
                    <td className="py-2.5 text-right font-bold text-[#a37b3d]">{productCount}</td>
                    <td className="py-2.5 text-right text-gray-600 text-xs">
                      {typeof s.wallet_balance === "number"
                        ? `PKR ${s.wallet_balance.toLocaleString()}`
                        : "—"}
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
      </div>
    </div>
  );
}
