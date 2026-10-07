import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import disputeApi from "../../api/disputeApi";
import SellerPageHero from "../Common/SellerPageHero";

function formatTrackingNumber(raw) {
  const clean = (raw || '').replace(/[^A-Za-z0-9]/g, '');
  const parts = [];
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.slice(i, i + 4));
  }
  return parts.join('-');
}

// Filter tabs cover every order/package status that can exist in the system.
const FILTERS = [
  { id: 'ALL',        label: 'All Orders',  match: () => true },
  { id: 'PENDING',    label: 'Pending',     match: p => p.status === 'PENDING' },
  { id: 'CONFIRMED',  label: 'Confirmed',   match: p => p.status === 'PENDING' && p.order?.status === 'CONFIRMED' },
  { id: 'PREPARING',  label: 'Preparing',   match: p => p.status === 'PREPARING' },
  { id: 'SHIPPED',    label: 'Shipped',     match: p => p.status === 'SHIPPED' },
  { id: 'DELIVERED',  label: 'Delivered',   match: p => p.status === 'DELIVERED' },
  { id: 'DISPUTED',   label: 'Disputed',    match: p => p.status === 'DISPUTED' },
  { id: 'RESOLVED',   label: 'Resolved',    match: p => p.status === 'RESOLVED' },
  { id: 'CANCELLED',  label: 'Cancelled',   match: p => p.status === 'CANCELLED' },
  { id: 'COMPLETED',  label: 'Completed',   match: p => p.status === 'COMPLETED' },
];

export default function SellerOrdersPage({ seller }) {
  const navigate = useNavigate();
  const [packages, setPackages] = useState([]);
  const [disputes, setDisputes] = useState({});
  const [loading, setLoading] = useState(true);
  const [activePkg, setActivePkg] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [shipForm, setShipForm] = useState({ courier_company: "TCS", tracking_number: "", seller_note: "" });
  const [deliverForm, setDeliverForm] = useState({ delivery_note: "", recipient_name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState('ALL');

  const load = async () => {
    if (!seller?.seller_id) return;
    setLoading(true);
    const r = await orderApi.listSellerPackages(seller.seller_id);
    const pkgs = r.success ? r.packages : [];
    setPackages(pkgs);
    const dr = await disputeApi.listDisputes("seller", seller.seller_id);
    if (dr.success && dr.disputes) {
      const map = {};
      for (const d of dr.disputes) map[d.order_id] = d.dispute_id;
      setDisputes(map);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [seller]);

  // Filter + cap to 10 most recent per view
  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.id === filter) || FILTERS[0];
    const arr = filter === 'ALL' ? packages : packages.filter(f.match);
    return arr.slice(0, 10);
  }, [packages, filter]);

  // Count badge per filter tab
  const filterCounts = useMemo(() => {
    const counts = {};
    FILTERS.forEach(f => {
      counts[f.id] = f.id === 'ALL'
        ? packages.length
        : packages.filter(f.match).length;
    });
    return counts;
  }, [packages]);

  const doPreparing = async () => {
    setSubmitting(true);
    const r = await orderApi.markPreparing(seller.seller_id, activePkg.package_id);
    setSubmitting(false);
    if (r.success) { setActionModal(null); load(); }
    else setMsg(r.error);
  };

  const doShip = async () => {
    setSubmitting(true);
    const r = await orderApi.markShipped(seller.seller_id, activePkg.package_id, {
      courierCompany: shipForm.courier_company,
      trackingNumber: shipForm.tracking_number,
      sellerNote: shipForm.seller_note,
    });
    setSubmitting(false);
    if (r.success) { setActionModal(null); load(); }
    else setMsg(r.error);
  };

  const doDeliver = async () => {
    setSubmitting(true);
    const r = await orderApi.markDelivered(seller.seller_id, activePkg.package_id, deliverForm);
    setSubmitting(false);
    if (r.success) { setActionModal(null); load(); }
    else setMsg(r.error);
  };

  const handleTrackingInput = (e) => {
    setShipForm({ ...shipForm, tracking_number: formatTrackingNumber(e.target.value) });
  };

  const statusBadge = (s) => {
    const styles = {
      PENDING:    "bg-amber-50 text-amber-800 border-amber-200",
      PREPARING:  "bg-purple-50 text-purple-800 border-purple-200",
      SHIPPED:    "bg-sky-50 text-sky-800 border-sky-200",
      DELIVERED:  "bg-emerald-50 text-emerald-800 border-emerald-200",
      DISPUTED:   "bg-rose-50 text-rose-800 border-rose-200",
      RESOLVED:   "bg-amber-50 text-amber-800 border-amber-200",
      CANCELLED:  "bg-red-50 text-red-800 border-red-200",
      COMPLETED:  "bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]",
    }[s] || "bg-stone-50 text-stone-700 border-stone-200";

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${styles}`}>
        {s}
      </span>
    );
  };

  // Navigate to the seller order detail page using the order id + seller view token
  const goToDetailPage = (p) => {
    const orderId = p.order?.order_id || p.order_id;
    const token = p.order?.seller_view_token || '';
    if (orderId) navigate(`/seller/orders/${orderId}${token ? `?t=${token}` : ''}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-stone-500">
        <div className="w-10 h-10 border-3 border-[#FAF3E8] border-t-[#9B7036] rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium font-serif italic text-stone-600">Retrieving boutique orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Editorial Page Hero */}
      <SellerPageHero
        badge="Fulfillment Hub"
        title="Order Management"
        subtitle="Monitor incoming orders, track logistics, prepare bridal dispatches, and ensure flawless customer fulfillment."
        imageKey="orders"
        rightSlot={
          <button
            onClick={load}
            className="px-4 py-2.5 bg-white/80 hover:bg-white text-stone-700 border border-[#EADBCC] rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all hover:border-[#9B7036] hover:text-[#9B7036]"
          >
            <span>↻</span> Refresh Orders
          </button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          const count = filterCounts[f.id] || 0;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 text-xs rounded-full whitespace-nowrap font-medium transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-gradient-to-r from-[#9B7036] to-[#7d5624] text-white shadow-md shadow-[#9B7036]/20 font-semibold'
                  : 'bg-white text-stone-600 border border-[#EFEAE4] hover:border-[#ECD4A8] hover:text-[#9B7036]'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-white/25 text-white' : 'bg-[#FAF7F2] text-stone-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      {packages.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[#EFEAE4] p-16 text-center shadow-luxury">
          <div className="w-16 h-16 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-2xl mx-auto mb-4">
            📦
          </div>
          <h3 className="font-serif text-xl font-bold text-stone-800 mb-1">No Orders Assigned Yet</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Once customers purchase items from your boutique, they will appear here ready for packaging and dispatch.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-[#EFEAE4] p-16 text-center shadow-luxury">
          <div className="w-16 h-16 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-2xl mx-auto mb-4">
            🔍
          </div>
          <h3 className="font-serif text-xl font-bold text-stone-800 mb-1">No Orders in this Status</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Try selecting a different filter tab above to view other orders.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(p => {
            const orderId = p.order?.order_id || p.order_id;
            const buyerName = p.order?.buyer_name;
            const showPkgCode = p.status !== 'PENDING';
            return (
              <div
                key={p.package_id}
                className="bg-white rounded-2xl border border-[#EFEAE4] p-5 shadow-sm hover:shadow-luxury hover:border-[#ECD4A8] transition-all group"
              >
                {/* Top row: Order ID + Buyer on left, Status badge on right */}
                <div className="flex items-start justify-between gap-4 pb-3 mb-3 border-b border-[#FAF7F2]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FAF3E8] border border-[#ECD4A8] flex items-center justify-center text-[#9B7036] text-lg">
                      🛍️
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Order</span>
                        <span className="font-mono font-bold text-stone-900 text-sm">#{orderId}</span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Client: <span className="font-medium text-stone-700">{buyerName || 'Valued Buyer'}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {statusBadge(p.status)}
                  </div>
                </div>

                {/* Subtotal + Item Details */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Items Ordered</p>
                    <div className="space-y-1">
                      {p.items?.map((it, i) => (
                        <div key={i} className="text-xs text-stone-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9B7036]"></span>
                          <span className="font-medium text-stone-900 truncate">{it.title}</span>
                          <span className="text-stone-400 text-[11px]">× {it.qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 bg-[#FAF7F2] rounded-xl p-3 border border-[#EFEAE4]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Package Subtotal</p>
                    <p className="font-serif text-lg font-bold text-[#9B7036]">
                      PKR {(p.subtotal || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{p.items_count || 1} Item(s)</p>
                  </div>
                </div>

                {/* Logistics & Tracking info */}
                {(showPkgCode || p.tracking_number || p.delivered_at) && (
                  <div className="bg-[#FAF3E8]/40 border border-[#ECD4A8]/40 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-stone-600">
                    {showPkgCode && p.package_id && !p.package_id.startsWith('PEND-') && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-stone-400">Pkg Code:</span>
                        <span className="font-mono font-bold text-stone-800">{p.package_id}</span>
                      </div>
                    )}
                    {p.tracking_number && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-stone-400">Courier:</span>
                        <span className="font-medium text-stone-800">{p.courier_company}</span>
                        <span className="text-stone-400 ml-2">Tracking:</span>
                        <span className="font-mono font-bold text-[#9B7036]">{p.tracking_number}</span>
                      </div>
                    )}
                    {p.delivered_at && (
                      <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <span>✓ Delivered:</span>
                        <span>{new Date(p.delivered_at).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions based on status */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#FAF7F2] flex-wrap">
                  <div className="flex gap-2 flex-wrap items-center">
                    {p.status === "PENDING" && (
                      <button
                        onClick={() => { setActivePkg(p); setActionModal("preparing"); setMsg(""); }}
                        className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs rounded-xl font-bold transition-all"
                      >
                        ⚡ Mark Preparing
                      </button>
                    )}
                    {p.status === "PREPARING" && (
                      <button
                        onClick={() => { setActivePkg(p); setActionModal("shipping"); setMsg(""); }}
                        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs rounded-xl font-bold transition-all shadow-sm"
                      >
                        🚚 Mark Shipped
                      </button>
                    )}
                    {p.status === "SHIPPED" && (
                      <button
                        onClick={() => { setActivePkg(p); setActionModal("delivered"); setMsg(""); }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl font-bold transition-all shadow-sm"
                      >
                        ✓ Mark Delivered
                      </button>
                    )}
                    {["SHIPPED", "DELIVERED", "DISPUTED"].includes(p.status) && disputes[p.order_id] && (
                      <button
                        onClick={() => navigate(`/disputes/${disputes[p.order_id]}?as=seller`, { state: { asRole: "seller" } })}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-xl font-bold transition-all shadow-sm"
                      >
                        ⚖️ Dispute Room
                      </button>
                    )}
                    {p.status === "DISPUTED" && !disputes[p.order_id] && (
                      <span className="text-xs text-rose-600 font-medium italic">Dispute under mediation</span>
                    )}
                    {p.status === "COMPLETED" && (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <span>✓ Payout Released</span>
                        {p.transaction_id ? <span className="font-mono text-stone-400">({p.transaction_id})</span> : ''}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => goToDetailPage(p)}
                    className="px-4 py-2 bg-gradient-to-r from-[#9B7036] to-[#7d5624] hover:opacity-95 text-white text-xs rounded-xl font-semibold transition-all shadow-sm shadow-[#9B7036]/20 ml-auto"
                  >
                    View Details →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action modals */}
      {actionModal && activePkg && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setActionModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-7 shadow-2xl border border-[#EADBCC]"
            onClick={e => e.stopPropagation()}
          >
            {/* Preparing Modal */}
            {actionModal === "preparing" && (
              <>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center text-xl mb-4">
                  📦
                </div>
                <h2 className="font-serif text-xl font-bold text-stone-900 mb-1">Confirm Packaging</h2>
                <p className="text-sm text-stone-600 mb-4 leading-relaxed">
                  Confirm that you have commenced preparing and packing the ordered bridal items for order{" "}
                  <span className="font-mono font-bold text-stone-900">
                    #{activePkg.order?.order_id || activePkg.order_id}
                  </span>.
                </p>
                {msg && <p className="text-rose-600 text-xs font-semibold mb-3 p-2.5 bg-rose-50 rounded-xl">{msg}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => setActionModal(null)}
                    className="flex-1 py-2.5 border border-[#EFEAE4] hover:bg-stone-50 rounded-xl text-xs font-bold text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doPreparing}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
                  >
                    {submitting ? "Updating..." : "Start Preparing"}
                  </button>
                </div>
              </>
            )}

            {/* Shipping Modal */}
            {actionModal === "shipping" && (
              <>
                <div className="w-12 h-12 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-xl mb-4">
                  🚚
                </div>
                <h2 className="font-serif text-xl font-bold text-stone-900 mb-1">Dispatch & Tracking</h2>
                <p className="text-xs text-stone-500 mb-4">
                  Provide courier shipment details to share tracking updates with the buyer.
                </p>

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Courier Partner</label>
                    <select
                      value={shipForm.courier_company}
                      onChange={e => setShipForm({ ...shipForm, courier_company: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                    >
                      <option>TCS</option>
                      <option>Leopards</option>
                      <option>DHL</option>
                      <option>M&P</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Tracking Number</label>
                    <input
                      value={shipForm.tracking_number}
                      onChange={handleTrackingInput}
                      placeholder="1234-5678-9012"
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Seller Note (Optional)</label>
                    <input
                      value={shipForm.seller_note}
                      onChange={e => setShipForm({ ...shipForm, seller_note: e.target.value })}
                      placeholder="Special handling instructions or note"
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                    />
                  </div>
                </div>

                {msg && <p className="text-rose-600 text-xs font-semibold mt-3 p-2.5 bg-rose-50 rounded-xl">{msg}</p>}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setActionModal(null)}
                    className="flex-1 py-2.5 border border-[#EFEAE4] hover:bg-stone-50 rounded-xl text-xs font-bold text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doShip}
                    disabled={submitting || !shipForm.tracking_number}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#9B7036] to-[#7d5624] hover:opacity-95 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#9B7036]/20 disabled:opacity-50"
                  >
                    {submitting ? "Updating..." : "Confirm Dispatch"}
                  </button>
                </div>
              </>
            )}

            {/* Delivered Modal */}
            {actionModal === "delivered" && (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center text-xl mb-4">
                  ✓
                </div>
                <h2 className="font-serif text-xl font-bold text-stone-900 mb-1">Confirm Delivery</h2>
                <p className="text-xs text-stone-500 mb-4">
                  Record package handover for order <span className="font-mono font-bold text-stone-900">#{activePkg.order?.order_id || activePkg.order_id}</span>.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Recipient Name</label>
                    <input
                      placeholder="e.g. Ayesha Khan"
                      value={deliverForm.recipient_name}
                      onChange={e => setDeliverForm({ ...deliverForm, recipient_name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Delivery Confirmation Note</label>
                    <input
                      placeholder="e.g. Handed directly at doorstep"
                      value={deliverForm.delivery_note}
                      onChange={e => setDeliverForm({ ...deliverForm, delivery_note: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                    />
                  </div>
                </div>

                {msg && <p className="text-rose-600 text-xs font-semibold mt-3 p-2.5 bg-rose-50 rounded-xl">{msg}</p>}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setActionModal(null)}
                    className="flex-1 py-2.5 border border-[#EFEAE4] hover:bg-stone-50 rounded-xl text-xs font-bold text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doDeliver}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
                  >
                    {submitting ? "Updating..." : "Mark as Delivered"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
