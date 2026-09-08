import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import disputeApi from "../../api/disputeApi";

function formatTrackingNumber(raw) {
  const clean = (raw || '').replace(/[^A-Za-z0-9]/g, '');
  const parts = [];
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.slice(i, i + 4));
  }
  return parts.join('-');
}

// Filter tabs cover every order/package status that can exist in the system.
// PENDING (Package) === order is confirmed and waiting for seller to prepare.
const FILTERS = [
  { id: 'ALL',        label: 'All',        match: () => true },
  { id: 'PENDING',    label: 'Pending',    match: p => p.status === 'PENDING' },
  { id: 'CONFIRMED',  label: 'Confirmed',  match: p => p.status === 'PENDING' && p.order?.status === 'CONFIRMED' },
  { id: 'PREPARING',  label: 'Preparing',  match: p => p.status === 'PREPARING' },
  { id: 'SHIPPED',    label: 'Shipped',    match: p => p.status === 'SHIPPED' },
  { id: 'DELIVERED',  label: 'Delivered',  match: p => p.status === 'DELIVERED' },
  { id: 'DISPUTED',   label: 'Disputed',   match: p => p.status === 'DISPUTED' },
  { id: 'RESOLVED',   label: 'Resolved',   match: p => p.status === 'RESOLVED' },
  { id: 'CANCELLED',  label: 'Cancelled',  match: p => p.status === 'CANCELLED' },
  { id: 'COMPLETED',  label: 'Completed',  match: p => p.status === 'COMPLETED' },
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

  // Filter + cap to 5 most recent
  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.id === filter) || FILTERS[0];
    const arr = filter === 'ALL' ? packages : packages.filter(f.match);
    return arr.slice(0, 5);
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

  const openDetail = (pkg) => {
    setActivePkg(pkg);
    setActionModal("detail");
    setMsg("");
  };

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

  const statusColor = (s) => ({
    PENDING:    "bg-gray-100 text-gray-700",
    PREPARING:  "bg-purple-100 text-purple-800",
    SHIPPED:    "bg-indigo-100 text-indigo-800",
    DELIVERED:  "bg-green-100 text-green-800",
    DISPUTED:   "bg-red-100 text-red-800",
    RESOLVED:   "bg-amber-100 text-amber-800",
    CANCELLED:  "bg-red-100 text-red-800",
    COMPLETED:  "bg-emerald-100 text-emerald-800",
  }[s] || "bg-gray-100");

  // Navigate to the seller order detail page using the order id + seller view token
  const goToDetailPage = (p) => {
    const orderId = p.order?.order_id || p.order_id;
    const token = p.order?.seller_view_token || '';
    if (orderId) navigate(`/seller/orders/${orderId}${token ? `?t=${token}` : ''}`);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading orders...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Orders to Fulfill</h1>
        <button onClick={load} className="text-sm text-[#a37b3d]">↻ Refresh</button>
      </div>

      {/* Filter tabs — every order/package status + count badges */}
      <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap font-semibold flex items-center gap-1.5 ${
              filter === f.id ? 'bg-[#a37b3d] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-[#ECD4A8]'
            }`}>
            <span>{f.label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              filter === f.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>{filterCounts[f.id] || 0}</span>
          </button>
        ))}
      </div>

      {packages.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center">
          <div className="text-5xl mb-3">📦</div>
          <p className="text-gray-600">No orders assigned to you yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-gray-600">No orders match the selected filter.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(p => {
            const orderId = p.order?.order_id || p.order_id;
            const buyerName = p.order?.buyer_name;
            const showPkgCode = p.status !== 'PENDING'; // PKG- only after Mark Preparing (per backend)
            return (
              <div key={p.package_id} className="bg-white rounded-2xl shadow p-4">
                {/* Top row: Order ID + Buyer on left, Status badge on right */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      Order ID: <span className="font-mono">{orderId}</span>
                    </p>
                    <p className="text-xs text-gray-500">Buyer: {buyerName || '—'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(p.status)}`}>{p.status}</span>
                </div>

                {/* Subtotal + Item Count on right side as separate fields */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="text-xs text-gray-500 flex-1 min-w-0">
                    {p.items?.map((it, i) => (
                      <span key={i} className="block truncate">
                        {it.title} × {it.qty}{i < p.items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-800">PKR {(p.subtotal || 0).toLocaleString()}</p>
                    <p className="text-[11px] text-gray-500">Subtotal</p>
                    <p className="text-xs font-semibold text-gray-700 mt-1">{p.items_count || 0}</p>
                    <p className="text-[11px] text-gray-500">Item count</p>
                  </div>
                </div>

                {/* PKG- code: only show after Mark Preparing (status !== PENDING) */}
                {showPkgCode && p.package_id && !p.package_id.startsWith('PEND-') && (
                  <p className="text-xs text-gray-600 mb-2">
                    Package code: <span className="font-mono font-semibold">{p.package_id}</span>
                  </p>
                )}
                {p.tracking_number && (
                  <p className="text-xs text-gray-600 mb-2">
                    Courier: {p.courier_company} • Tracking: <span className="font-mono">{p.tracking_number}</span>
                  </p>
                )}
                {p.delivered_at && (
                  <p className="text-xs text-green-700 mb-2">Delivered: {new Date(p.delivered_at).toLocaleString()}</p>
                )}

                {/* Actions based on status */}
                <div className="flex gap-2 flex-wrap">
                  {p.status === "PENDING" && (
                    <>
                      <button onClick={() => { setActivePkg(p); setActionModal("preparing"); setMsg(""); }}
                        className="px-3 py-1.5 border border-purple-300 text-purple-700 text-xs rounded-lg font-semibold">Mark Preparing</button>
                      <button onClick={() => goToDetailPage(p)}
                        className="px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-lg font-semibold">View Detail</button>
                    </>
                  )}
                  {p.status === "PREPARING" && (
                    <>
                      <button onClick={() => { setActivePkg(p); setActionModal("shipping"); setMsg(""); }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg font-semibold">Mark Shipped</button>
                      <button onClick={() => goToDetailPage(p)}
                        className="px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-lg font-semibold">View Detail</button>
                    </>
                  )}
                  {p.status === "SHIPPED" && (
                    <>
                      <button onClick={() => { setActivePkg(p); setActionModal("delivered"); setMsg(""); }}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-semibold">Mark Delivered</button>
                      <button onClick={() => goToDetailPage(p)}
                        className="px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-lg font-semibold">View Detail</button>
                    </>
                  )}
                  {(p.status === "DELIVERED" || p.status === "COMPLETED" || p.status === "RESOLVED") && (
                    <button onClick={() => goToDetailPage(p)}
                      className="px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-lg font-semibold">View Detail</button>
                  )}
                  {["SHIPPED", "DELIVERED", "DISPUTED"].includes(p.status) && disputes[p.order_id] && (
                    <button onClick={() => navigate(`/disputes/${disputes[p.order_id]}?as=seller`, { state: { asRole: "seller" } })}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg font-semibold"
                    >⚖️ Dispute Chat</button>
                  )}
                  {p.status === "DISPUTED" && !disputes[p.order_id] && (
                    <span className="text-xs text-red-600 self-center">Dispute under review</span>
                  )}
                  {p.status === "COMPLETED" && (
                    <span className="text-xs text-emerald-700 self-center">Payout released {p.transaction_id ? `(TXN ${p.transaction_id})` : ''}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action modals (preparing / shipping / delivered only — detail moved to dedicated page) */}
      {actionModal && activePkg && (actionModal !== 'detail') && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setActionModal(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            {/* Preparing Modal */}
            {actionModal === "preparing" && (
              <>
                <h2 className="text-lg font-bold mb-3">Mark as Preparing?</h2>
                <p className="text-sm text-gray-600 mb-4">
                  This confirms you've started packing the items for order <span className="font-mono font-semibold">{activePkg.order?.order_id || activePkg.order_id}</span>.
                </p>
                {msg && <p className="text-red-600 text-sm mb-2">{msg}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setActionModal(null)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                  <button onClick={doPreparing} disabled={submitting}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold">
                    {submitting ? "..." : "Confirm Preparing"}
                  </button>
                </div>
              </>
            )}

            {/* Shipping Modal */}
            {actionModal === "shipping" && (
              <>
                <h2 className="text-lg font-bold mb-3">Confirm Shipping</h2>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">COURIER COMPANY</label>
                    <select value={shipForm.courier_company} onChange={e => setShipForm({ ...shipForm, courier_company: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option>TCS</option><option>Leopards</option><option>DHL</option><option>M&P</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">TRACKING NUMBER (auto-formatted)</label>
                    <input value={shipForm.tracking_number} onChange={handleTrackingInput}
                      placeholder="1234-5678-9012"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">SELLER NOTE (optional)</label>
                    <input value={shipForm.seller_note} onChange={e => setShipForm({ ...shipForm, seller_note: e.target.value })}
                      placeholder="Any notes for the buyer"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
                {msg && <p className="text-red-600 text-sm mt-2">{msg}</p>}
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setActionModal(null)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                  <button onClick={doShip} disabled={submitting || !shipForm.tracking_number}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {submitting ? "..." : "Confirm Shipped"}
                  </button>
                </div>
              </>
            )}

            {/* Delivered Modal */}
            {actionModal === "delivered" && (
              <>
                <h2 className="text-lg font-bold mb-3">Confirm Delivery</h2>
                <p className="text-sm text-gray-600 mb-3">
                  Has order <span className="font-mono font-semibold">{activePkg.order?.order_id || activePkg.order_id}</span> been delivered to the buyer?
                </p>
                <input placeholder="Recipient name" value={deliverForm.recipient_name}
                  onChange={e => setDeliverForm({ ...deliverForm, recipient_name: e.target.value })}
                  className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input placeholder="Delivery note (e.g. handed to recipient)" value={deliverForm.delivery_note}
                  onChange={e => setDeliverForm({ ...deliverForm, delivery_note: e.target.value })}
                  className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                {msg && <p className="text-red-600 text-sm">{msg}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setActionModal(null)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                  <button onClick={doDeliver} disabled={submitting}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold">
                    {submitting ? "..." : "Confirm Delivered"}
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
