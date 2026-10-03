import React, { useState, useEffect, useMemo } from "react";
import adminApi from "../../api/adminApi";
import adminExtApi from "../../api/adminExtApi";
import OrderTimeline from "../Common/OrderTimeline";

/**
 * Admin Wallet — Clean, modern dashboard with order-centric financial history & BNPL Bank Receipts.
 * - Tab 1: Wallet Ledger & Orders History (COD Platform Fee in Green (+), BNPL Settled payouts in Red (-))
 * - Tab 2: BNPL Receipts from Bank (Day-wise amounts and total money received from Banker batches)
 * - Tab 3: Registered Sellers Directory
 */
export default function AdminWalletPage({ admin }) {
  const [activeTab, setActiveTab] = useState("ledger"); // "ledger" | "bnpl_receipts" | "sellers"
  const [data, setData] = useState(null);
  const [bnplData, setBnplData] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [sellerMsg, setSellerMsg] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hoveredOrder, setHoveredOrder] = useState(null);
  const [expandedBatchId, setExpandedBatchId] = useState(null);

  const adminId = admin?.admin_id || admin?._id || "admin_001";

  const load = async () => {
    const adminIdInner = admin?.admin_id || admin?._id || "admin_001";
    const [walletResp, sellersResp, bnplResp] = await Promise.all([
      adminExtApi.getWallet(adminIdInner),
      adminApi.getAllSellers(),
      adminExtApi.getBnplReceipts(adminIdInner),
    ]);
    if (walletResp.success) {
      setData(walletResp);
      if (walletResp.order_groups?.length > 0 && !selectedOrderId) {
        openOrder(walletResp.order_groups[0].order_id);
      }
    }
    if (sellersResp.sellers) setSellers(sellersResp.sellers);
    if (bnplResp.success) setBnplData(bnplResp);
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
        <p className="text-sm font-medium text-gray-500">Loading wallet ledger &amp; receipts...</p>
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
            Real-time balance, commission ledger, BNPL batch receipts from bank, and seller settlements
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
              <p className="text-[10px] uppercase font-bold text-emerald-300">Bank BNPL Received</p>
              <p className="text-xl font-black text-white mt-0.5">
                PKR {((bnplData?.total_received || 0) / 1000).toFixed(0)}k
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center min-w-[130px]">
              <p className="text-[10px] uppercase font-bold text-amber-300">Active Sellers</p>
              <p className="text-xl font-black text-white mt-0.5">{sellers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("ledger")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "ledger"
              ? "bg-gray-900 text-white shadow-md"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>📊</span> Orders &amp; Wallet Ledger
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bnpl_receipts")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "bnpl_receipts"
              ? "bg-emerald-800 text-white shadow-md"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>🏦</span> BNPL Receipts from Bank
          {bnplData?.batch_count ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-700 text-white">
              {bnplData.batch_count}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sellers")}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "sellers"
              ? "bg-gray-900 text-white shadow-md"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <span>🏬</span> Registered Sellers ({sellers.length})
        </button>
      </div>

      {/* ────────────────── TAB 1: ORDER CENTRIC HISTORY & DRILL DOWN ────────────────── */}
      {activeTab === "ledger" && (
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
                              {(g.items || []).length > 1
                                ? `${(g.items[0]?.title || g.order_name || g.order_id)} + ${g.items.length - 1} more (click View)`
                                : (g.order_name || `Order ${g.order_id}`)}
                            </p>
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

                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-[#a37b3d] text-[10px] font-bold border border-amber-200/70">
                            <span>🛍️</span> {totalItemsCount} {totalItemsCount === 1 ? 'Total Item' : 'Total Items'}
                          </span>
                        </div>

                        {/* Bottom row: Financial summary */}
                        <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                              + PKR {(g.credit_total || 0).toLocaleString()}
                            </span>
                            {g.debit_total > 0 && (
                              <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                                − PKR {(g.debit_total || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {(g.entries || []).length} line(s)
                          </span>
                        </div>
                      </button>

                      {/* Hover Tooltip Card for Products */}
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

                          <div className="space-y-2 max-h-44 overflow-y-auto pr-1 mb-3">
                            {(g.items || []).length > 0 ? (
                              g.items.map((it, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2 text-[11px] bg-white/5 p-2 rounded-xl border border-white/5">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-gray-100 truncate">{it.title || "Item"}</p>
                                    <p className="text-[10px] text-gray-400">Category: {it.major_category || "General"}</p>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-lg bg-amber-400/20 text-amber-300 font-mono font-bold text-[10px] shrink-0">
                                    x{it.qty || 1}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-gray-400 italic">No item list attached</p>
                            )}
                          </div>

                          <div className="border-t border-gray-800 pt-2 text-[10px] text-gray-400 space-y-0.5">
                            <div className="flex justify-between">
                              <span>Order Total:</span>
                              <span className="text-emerald-400 font-bold">PKR {(g.total_amount || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Status:</span>
                              <span className="text-amber-300 font-semibold">{g.status}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right (7 cols): Selected Order Details & Timeline */}
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
                    <p className="text-xs text-[#a37b3d] font-mono font-bold mt-0.5">
                      Order ID: {selectedOrderId} • Payment: {orderDetail?.order?.payment_method || "COD"}
                    </p>
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
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Payment Method</span>
                      <p className={`font-bold text-xs ${orderDetail.order?.payment_method === 'COD' ? 'text-amber-800' : 'text-emerald-800'}`}>
                        {orderDetail.order?.payment_method === 'COD' ? '💵 Cash on Delivery (COD)' : '🏦 BNPL Installment Plan'}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {orderDetail.order?.payment_method === 'COD' ? 'Courier collected cash at door' : 'Bank funded to platform'}
                      </p>
                    </div>
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
                            className="text-xs border border-gray-100 rounded-2xl p-3 bg-white flex items-start justify-between gap-3"
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
      )}

      {/* ────────────────── TAB 2: BNPL RECEIPTS FROM BANK ────────────────── */}
      {activeTab === "bnpl_receipts" && (
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-300">Banker Settlement Summary</span>
              <h2 className="text-3xl font-black mt-1">
                PKR {(bnplData?.total_received || 0).toLocaleString()}
              </h2>
              <p className="text-xs text-emerald-200/70 mt-1">
                Total BNPL funds transferred by the bank to the Admin escrow account across {bnplData?.total_orders || 0} customer orders
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white/10 rounded-2xl p-3.5 text-center min-w-[120px]">
                <p className="text-[10px] font-bold text-emerald-200">Total Batches</p>
                <p className="text-xl font-bold">{bnplData?.batch_count || 0}</p>
              </div>
              <div className="bg-white/10 rounded-2xl p-3.5 text-center min-w-[120px]">
                <p className="text-[10px] font-bold text-emerald-200">Total Orders</p>
                <p className="text-xl font-bold">{bnplData?.total_orders || 0}</p>
              </div>
            </div>
          </div>

          {/* Day-Wise Batch Groups */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>📅</span> Day-Wise BNPL Bank Receipts
                </h3>
                <p className="text-xs text-gray-500">24-hour batch releases credited directly to the platform</p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                {(bnplData?.day_wise || []).length} Active Settlement Days
              </span>
            </div>

            {(!bnplData?.day_wise || bnplData.day_wise.length === 0) ? (
              <div className="py-16 text-center text-gray-400 space-y-2">
                <span className="text-3xl opacity-40">🏦</span>
                <p className="text-sm font-bold text-gray-700">No BNPL batch receipts yet</p>
                <p className="text-xs text-gray-400">When BNPL orders are approved and accepted, the 24h batcher releases funds here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {bnplData.day_wise.map((dayGroup, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50 hover:border-emerald-200 transition-all">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/60 pb-3 mb-3">
                      <div>
                        <span className="text-xs font-bold text-gray-900">
                          {new Date(dayGroup.date).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {dayGroup.order_count} order(s) processed across {dayGroup.batches?.length || 1} batch release(s)
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-400 block uppercase">Daily Total Received</span>
                        <span className="text-base font-black text-emerald-700">
                          + PKR {(dayGroup.total_amount || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Batches within this day */}
                    <div className="space-y-2">
                      {(dayGroup.batches || []).map((b) => {
                        const isExpanded = expandedBatchId === b.batch_id;
                        return (
                          <div key={b.batch_id} className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[#a37b3d]">{b.batch_id}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {b.status || "RELEASED"}
                                </span>
                                <span className="text-[11px] text-gray-400">
                                  {new Date(b.released_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-900">
                                  PKR {(b.total_amount || 0).toLocaleString()} ({b.order_count || (b.orders || []).length} orders)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedBatchId(isExpanded ? null : b.batch_id)}
                                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                                >
                                  {isExpanded ? "Hide Orders ▲" : "View Orders ▼"}
                                </button>
                              </div>
                            </div>

                            {/* Expandable Orders List in Batch */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                                <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                                  Orders Included in Batch {b.batch_id}:
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {(b.orders || []).map((ord, ordIdx) => (
                                    <div key={ordIdx} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 flex items-center justify-between text-xs">
                                      <div>
                                        <p className="font-bold text-gray-900">{ord.buyer_name || "Customer"}</p>
                                        <p className="font-mono text-[10px] text-[#a37b3d]">{ord.order_id}</p>
                                        {ord.bnpl_app_no && (
                                          <p className="text-[10px] text-gray-400">App: {ord.bnpl_app_no}</p>
                                        )}
                                      </div>
                                      <span className="font-bold text-emerald-700 font-mono text-xs">
                                        PKR {(ord.amount || 0).toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: REGISTERED SELLERS DIRECTORY ────────────────── */}
      {activeTab === "sellers" && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
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
            <div className={`p-3 rounded-2xl text-xs font-medium ${
              sellerMsg.startsWith("✓") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {sellerMsg}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase text-gray-400">
                  <th className="py-3 px-3">Seller / Store</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">City</th>
                  <th className="py-3 px-3 text-center">Active Products</th>
                  <th className="py-3 px-3 text-right">Wallet Balance</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sellers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No sellers found in database.
                    </td>
                  </tr>
                ) : (
                  sellers.map((s) => (
                    <tr key={s.seller_id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-bold text-gray-900">{s.name || s.business_name || "Seller"}</p>
                        <p className="text-[10px] font-mono text-gray-400">{s.seller_id} • {s.email || "No email"}</p>
                      </td>
                      <td className="py-3 px-3 capitalize text-gray-600">{s.seller_type || "individual"}</td>
                      <td className="py-3 px-3 text-gray-600">{s.city || "—"}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          (s.product_count || 0) > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500"
                        }`}>
                          {s.product_count || 0} product(s)
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">
                        PKR {(s.wallet_balance || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeSeller(s.seller_id, s.product_count || 0)}
                          disabled={removingId === s.seller_id || (s.product_count || 0) > 0}
                          title={(s.product_count || 0) > 0 ? "Cannot remove seller with active products" : "Delete seller account"}
                          className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all ${
                            (s.product_count || 0) > 0
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                          }`}
                        >
                          {removingId === s.seller_id ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
