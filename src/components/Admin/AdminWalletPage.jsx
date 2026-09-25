import React, { useState, useEffect, useMemo } from "react";
import adminApi from "../../api/adminApi";
import adminExtApi from "../../api/adminExtApi";
import OrderTimeline from "../Common/OrderTimeline";

/**
 * Admin Wallet — Clean, modern dashboard with order-centric financial history.
 * - Shows Order Title with Order ID below it (e.g. ORD-2026-XXXXX)
 * - Shows Total Items badge with hover popup displaying all products with quantities
 * - Displays Buyer Full Name and Seller Store Name
 * - Features branching order timeline for tracking transactions & milestones
 */
export default function AdminWalletPage({ admin }) {
  const [data, setData] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [sellerMsg, setSellerMsg] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hoveredOrder, setHoveredOrder] = useState(null);

  const adminId = admin?.admin_id || admin?._id || "admin_001";

  const load = async () => {
    const adminIdInner = admin?.admin_id || admin?._id || "admin_001";
    const [walletResp, sellersResp] = await Promise.all([
      adminExtApi.getWallet(adminIdInner),
      adminApi.getAllSellers(),
    ]);
    if (walletResp.success) {
      setData(walletResp);
      if (walletResp.order_groups?.length > 0 && !selectedOrderId) {
        openOrder(walletResp.order_groups[0].order_id);
      }
    }
    if (sellersResp.sellers) setSellers(sellersResp.sellers);
  };

  useEffect(() => { load(); }, [admin]);

  const openOrder = async (orderId) => {
    if (!orderId) return;
    setSelectedOrderId(orderId);
    setDetailLoading(true);
    setOrderDetail(null);
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

  const sellerNameMap = useMemo(() => {
    const map = {};
    (sellers || []).forEach(s => {
      map[s.seller_id] = s.name || s.business_name || s.seller_id;
    });
    return map;
  }, [sellers]);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-80 space-y-3">
        <div className="w-10 h-10 border-4 border-[#a37b3d] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-500">Loading wallet ledger...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Wallet &amp; Financial Oversight</h1>
          <p className="text-xs text-gray-500 mt-1">
            Real-time balance, settlement ledger, and order transaction timelines
          </p>
        </div>
        <button
          onClick={load}
          className="px-3.5 py-2 rounded-2xl border border-gray-200 hover:border-gray-300 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white transition-all shadow-sm"
        >
          ↻ Refresh Ledger
        </button>
      </div>

      {/* ── Balance Card ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1e1b18] via-[#2c241b] to-[#12100e] text-white p-6 md:p-8 shadow-xl border border-amber-900/30">
        <div className="absolute right-0 top-0 w-80 h-80 bg-[#a37b3d]/15 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30">
              <span>💳</span> Platform Reserve Balance
            </span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xs text-amber-200/70 font-semibold">PKR</span>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white">
                {(data.wallet.balance || 0).toLocaleString()}
              </h2>
            </div>
            <p className="text-xs text-amber-200/50 mt-2 font-mono">
              Account: {data.wallet.wallet_id} • Status: Active
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center min-w-[130px]">
              <p className="text-[10px] uppercase font-bold text-amber-200/70">Processed Orders</p>
              <p className="text-xl font-black text-white mt-0.5">{orderGroups.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center min-w-[130px]">
              <p className="text-[10px] uppercase font-bold text-emerald-300">Active Sellers</p>
              <p className="text-xl font-black text-white mt-0.5">{sellers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Order-Centric History & Drill-down Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left (5 cols): History by Order */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>📦</span> History by Order
                </h3>
                <p className="text-[11px] text-gray-400">Select order to view item breakdown &amp; timeline</p>
              </div>
              <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                {orderGroups.length} Orders
              </span>
            </div>

            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {orderGroups.length === 0 && (
                <div className="py-12 text-center text-xs text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                  No order-linked transactions logged yet.
                </div>
              )}

              {orderGroups.map((g) => {
                const isSelected = selectedOrderId === g.order_id;
                const buyerDisplayName = g.buyer_name || "Customer";
                const totalItemsCount = g.items_count || (g.items || []).reduce((acc, it) => acc + (it.qty || 1), 0) || 1;

                return (
                  <div
                    key={g.order_id}
                    onMouseEnter={() => setHoveredOrder(g)}
                    onMouseLeave={() => setHoveredOrder(null)}
                    className="relative group"
                  >
                    <button
                      type="button"
                      onClick={() => openOrder(g.order_id)}
                      className={`w-full text-left rounded-2xl p-4 transition-all border ${
                        isSelected
                          ? "border-[#a37b3d] bg-gradient-to-r from-[#FFF8F0] to-amber-50/20 shadow-md ring-1 ring-[#a37b3d]/30"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                      }`}
                    >
                      {/* Top: Order Name / Main Title */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-gray-900 line-clamp-1">
                            {g.order_name || `Order ${g.order_id}`}
                          </p>
                          {/* Order ID clearly shown below the Title */}
                          <p className="text-[11px] text-[#a37b3d] font-mono font-bold mt-0.5">
                            {g.order_id}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium shrink-0">
                          {g.last_at ? new Date(g.last_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ""}
                        </span>
                      </div>

                      {/* Middle: Buyer Name & Total Items Badge */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-[10px] text-gray-400 font-semibold uppercase">Buyer:</span>
                          <span className="text-xs font-bold text-gray-800 truncate max-w-[150px]">
                            {buyerDisplayName}
                          </span>
                        </div>

                        {/* Total Items Badge (Hoverable for Product details) */}
                        <div className="relative group/items">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-[#a37b3d] text-[10px] font-bold border border-amber-200/70 hover:bg-amber-100 transition-colors cursor-pointer">
                            <span>🛍️</span> {totalItemsCount} {totalItemsCount === 1 ? 'Total Item' : 'Total Items'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom row: Financial summary */}
                      <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                            + PKR {(g.credit_total || 0).toLocaleString()}
                          </span>
                          <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                            − PKR {(g.debit_total || 0).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {(g.entries || []).length} lines
                        </span>
                      </div>
                    </button>

                    {/* ── Hover Card for Products with Quantity & Technical Details ── */}
                    {hoveredOrder?.order_id === g.order_id && (
                      <div className="absolute left-full top-0 ml-3 w-80 p-4 bg-gray-900/95 backdrop-blur-md text-white rounded-3xl shadow-2xl border border-gray-800 z-50 pointer-events-none hidden md:block animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Products &amp; Quantities
                          </span>
                          <span className="text-[10px] font-bold text-gray-300">
                            {totalItemsCount} Items
                          </span>
                        </div>

                        {/* Products list with Quantity */}
                        <div className="space-y-2 max-h-44 overflow-y-auto pr-1 mb-3">
                          {(g.items || []).length > 0 ? (
                            g.items.map((it, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2 text-xs bg-gray-800/60 p-2 rounded-xl border border-gray-800">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-gray-100 truncate text-[11px]">{it.title || "Product Item"}</p>
                                  <p className="text-[10px] text-gray-400">{it.major_category || "Apparel"}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-bold text-[10px]">
                                    Qty: {it.qty || 1}
                                  </span>
                                  <p className="text-[10px] text-gray-300 font-mono mt-0.5">
                                    PKR {(it.price || it.subtotal || 0).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-gray-400 italic">No item breakdown available.</p>
                          )}
                        </div>

                        {/* Order Metadata Footer */}
                        <div className="pt-2 border-t border-gray-800/80 text-[10px] text-gray-400 space-y-1">
                          <div className="flex justify-between">
                            <span>Order ID:</span>
                            <span className="font-mono text-gray-200">{g.order_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Buyer Name:</span>
                            <span className="text-gray-200 font-semibold">{buyerDisplayName}</span>
                          </div>
                          {g.packages && g.packages.length > 0 && (
                            <div className="flex justify-between">
                              <span>Package ID:</span>
                              <span className="font-mono text-amber-300">{g.packages[0].package_id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right (7 cols): Selected Order Details & Branching Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 min-h-[540px]">
            <div className="border-b border-gray-100 pb-4 mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {orderDetail?.order?.items?.[0]?.title
                    ? `${orderDetail.order.items[0].title} ${orderDetail.order.items.length > 1 ? `(+${orderDetail.order.items.length - 1} more items)` : ''}`
                    : selectedOrderId ? `Order ${selectedOrderId}` : "Order Settlement Details"}
                </h3>
                {selectedOrderId && (
                  <p className="text-xs text-[#a37b3d] font-mono font-bold mt-0.5">Order ID: {selectedOrderId}</p>
                )}
              </div>

              {orderDetail?.order?.status && (
                <span className="px-3 py-1 bg-amber-50 text-[#a37b3d] font-bold text-xs rounded-full border border-amber-200/60">
                  {orderDetail.order.status}
                </span>
              )}
            </div>

            {!selectedOrderId && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-2 text-gray-400">
                <span className="text-3xl opacity-40">👈</span>
                <p className="text-xs font-bold text-gray-600">Select an order on the left</p>
                <p className="text-[11px]">View full credit/debit breakdown, buyer info, and branching timeline.</p>
              </div>
            )}

            {detailLoading && (
              <div className="flex flex-col items-center justify-center py-20 space-y-2">
                <div className="w-8 h-8 border-3 border-[#a37b3d] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-gray-400">Loading order settlement ledger...</p>
              </div>
            )}

            {orderDetail && !detailLoading && (
              <div className="space-y-6">
                {/* 3 Metrics Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100 p-3.5 text-center">
                    <p className="text-[10px] uppercase font-bold text-emerald-700">Platform Credit (+)</p>
                    <p className="text-base md:text-lg font-black text-emerald-800 mt-0.5">
                      PKR {(orderDetail.credit_total || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-50/70 border border-rose-100 p-3.5 text-center">
                    <p className="text-[10px] uppercase font-bold text-rose-700">Seller Payout (−)</p>
                    <p className="text-base md:text-lg font-black text-rose-800 mt-0.5">
                      PKR {(orderDetail.debit_total || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-50/70 border border-amber-200/60 p-3.5 text-center">
                    <p className="text-[10px] uppercase font-bold text-[#a37b3d]">Net Retained</p>
                    <p className="text-base md:text-lg font-black text-gray-900 mt-0.5">
                      PKR {(orderDetail.net || 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Buyer & Seller Info Strip */}
                <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Buyer Full Name</span>
                    <p className="font-bold text-gray-900 text-sm">{orderDetail.order?.buyer_name || "Customer"}</p>
                    <p className="text-gray-500 text-[11px]">{orderDetail.order?.buyer_email || orderDetail.order?.buyer_phone || "—"}</p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Seller / Store</span>
                    <p className="font-bold text-gray-900 text-sm">
                      {orderDetail.payout?.seller_id 
                        ? (sellerNameMap[orderDetail.payout.seller_id] || orderDetail.payout.seller_id)
                        : (orderDetail.packages?.[0]?.seller_id || "Seller")}
                    </p>
                    {orderDetail.packages?.[0]?.package_id && (
                      <p className="text-gray-400 font-mono text-[10px]">Package: {orderDetail.packages[0].package_id}</p>
                    )}
                  </div>

                  {orderDetail.payout && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-[#a37b3d] uppercase block">Payout Status</span>
                      <p className="font-bold text-emerald-700 font-mono text-xs">Released</p>
                      <p className="text-[10px] text-gray-400">
                        {orderDetail.payout.released_at ? new Date(orderDetail.payout.released_at).toLocaleDateString() : "Processed"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Order Lifecycle Branching Timeline */}
                {orderDetail.order?.timeline && orderDetail.order.timeline.length > 0 ? (
                  <OrderTimeline
                    timeline={orderDetail.order.timeline}
                    title="Order Progress &amp; Settlement Timeline"
                  />
                ) : (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                      Wallet Ledger Entries
                    </h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {(orderDetail.entries || []).map((entry, idx) => (
                        <div
                          key={idx}
                          className="text-xs border border-gray-100 rounded-2xl p-3 bg-white flex items-start justify-between gap-3 hover:border-gray-200 transition-all"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <span className={`font-bold text-xs ${
                              entry.type === "CREDIT" ? "text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg" : "text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg"
                            }`}>
                              {entry.type === "CREDIT" ? "ADDITION +" : "SUBTRACTION −"} PKR {(entry.amount || 0).toLocaleString()}
                            </span>
                            <p className="text-gray-600 text-xs font-medium pt-0.5">{entry.description}</p>
                          </div>
                          <span className="text-gray-400 text-[10px] shrink-0 font-medium">
                            {entry.at ? new Date(entry.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Registered Sellers Directory ── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>🏬</span> Registered Sellers Directory
            </h3>
            <p className="text-xs text-gray-500">Manage seller accounts, active product counts, and wallet balances</p>
          </div>
          <button onClick={load} className="text-xs font-semibold text-[#a37b3d] hover:underline">
            ↻ Refresh Sellers
          </button>
        </div>

        {sellerMsg && (
          <div className={`p-3 rounded-2xl text-xs font-medium mb-4 ${
            sellerMsg.startsWith("✓") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {sellerMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-3 font-bold uppercase tracking-wider">Seller Name</th>
                <th className="pb-3 font-bold uppercase tracking-wider">City</th>
                <th className="pb-3 font-bold uppercase tracking-wider text-right">Active Listings</th>
                <th className="pb-3 font-bold uppercase tracking-wider text-right">Wallet Balance</th>
                <th className="pb-3 font-bold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sellers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 text-xs">No registered sellers found.</td>
                </tr>
              ) : sellers.map((s) => {
                const productCount = s.product_count ?? 0;
                const locked = productCount > 0;
                const isRemoving = removingId === s.seller_id;

                return (
                  <tr key={s.seller_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 font-bold text-gray-900">
                      <div>{s.name || s.business_name || s.seller_id}</div>
                      <span className="text-[10px] text-gray-400 font-mono font-normal">{s.seller_id}</span>
                    </td>
                    <td className="py-3 text-gray-600 font-medium">{s.city || "—"}</td>
                    <td className="py-3 text-right">
                      <span className="px-2 py-0.5 bg-amber-50 text-[#a37b3d] font-bold rounded-md">
                        {productCount} items
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-gray-800">
                      {typeof s.wallet_balance === "number" ? `PKR ${s.wallet_balance.toLocaleString()}` : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeSeller(s.seller_id, productCount)}
                        disabled={locked || isRemoving}
                        title={locked ? "Cannot remove seller with active listings" : "Remove seller"}
                        className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                          locked
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white"
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
