import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import { useAuth } from "../../App";
import OrderTimeline from "../Common/OrderTimeline";

export default function SellerOrderDetailPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t") || "";
  const navigate = useNavigate();
  const { seller } = useAuth();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  // Modal state for shipping & delivery forms
  const [shipForm, setShipForm] = useState({ courier_company: "TCS", tracking_number: "", seller_note: "" });
  const [deliverForm, setDeliverForm] = useState({ delivery_note: "", recipient_name: "" });
  const [modal, setModal] = useState(null);   // null | 'shipping' | 'delivered'

  const load = async () => {
    if (!token) {
      setError("Missing access token in URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await orderApi.getOrderByToken(token);
      if (r.success) {
        setData(r);
        setError("");
      } else {
        setError(r.error || "Unable to load this order.");
      }
    } catch (e) {
      setError(e.message || "Network error loading order.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, orderId]);

  const order    = data?.order;
  const allPkgs  = data?.packages || [];
  // Only show the seller's own packages for action buttons
  const myPkgs   = seller?.seller_id
    ? allPkgs.filter(p => p.seller_id === seller.seller_id)
    : allPkgs;

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
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${styles}`}>
        {s}
      </span>
    );
  };

  // ── Actions ────────────────────────────────────────────────────────────
  const doPreparing = async (pkg) => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.markPreparing(seller.seller_id, pkg.package_id);
    setSubmitting(false);
    if (r.success) { load(); }
    else setMsg(r.error || "Failed to mark preparing.");
  };

  const doShip = async (pkg) => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.markShipped(seller.seller_id, pkg.package_id, {
      courierCompany: shipForm.courier_company,
      trackingNumber: shipForm.tracking_number,
      sellerNote:     shipForm.seller_note,
    });
    setSubmitting(false);
    if (r.success) { setModal(null); load(); }
    else setMsg(r.error || "Failed to mark shipped.");
  };

  const doDeliver = async (pkg) => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.markDelivered(seller.seller_id, pkg.package_id, deliverForm);
    setSubmitting(false);
    if (r.success) { setModal(null); load(); }
    else setMsg(r.error || "Failed to mark delivered.");
  };

  const formatTrackingNumber = (raw) => {
    const clean = (raw || '').replace(/[^A-Za-z0-9]/g, '');
    const parts = [];
    for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4));
    return parts.join('-');
  };

  // ── Render guards ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-stone-500">
        <div className="w-10 h-10 border-3 border-[#FAF3E8] border-t-[#9B7036] rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium font-serif italic text-stone-600">Retrieving order details...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700">
          <p className="font-semibold text-base">Could not load order</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={() => navigate('/seller/orders')}
            className="mt-4 text-xs font-bold text-[#9B7036] hover:underline flex items-center gap-1">
            ← Return to Orders
          </button>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className="p-12 text-stone-500">Order not found.</div>
      </div>
    );
  }

  const shipping = order.shipping_address || {};
  const fullAddress = [
    shipping.house_number && `House ${shipping.house_number}`,
    shipping.line1,
    shipping.city,
    shipping.province,
  ].filter(Boolean).join(', ');
  const subtotalWithShipping = (order.subtotal || 0) + (order.shipping_total || 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Top navigation header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/seller/orders')}
          className="px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-700 border border-[#EFEAE4] rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all hover:border-[#ECD4A8] hover:text-[#9B7036]"
        >
          <span>←</span> Back to All Orders
        </button>
        <button
          onClick={load}
          className="px-3.5 py-2 bg-white hover:bg-stone-50 text-[#9B7036] border border-[#EADBCC] rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
        >
          <span>↻</span> Refresh Order
        </button>
      </div>

      {msg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700">
          {msg}
        </div>
      )}

      {/* Order Header Summary Banner */}
      <div className="bg-white rounded-3xl border border-[#EFEAE4] shadow-luxury p-7">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] text-[11px] font-bold tracking-wider uppercase mb-3">
              <span>🧾</span> Verified Order
            </div>
            <h1 className="text-3xl font-bold text-stone-900 font-mono tracking-tight">
              #{order.order_id}
            </h1>
            <p className="text-xs text-stone-500 mt-1.5 flex items-center gap-2">
              <span>Placed:</span>
              <span className="font-medium text-stone-700">
                {order.created_at ? new Date(order.created_at).toLocaleString() : '—'}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-1.5">Current Status</p>
            {statusBadge(order.status)}
            <p className="text-xs text-stone-500 mt-2 font-medium">
              Payment: <span className="capitalize">{order.payment_method || 'COD'}</span> • <span className="font-semibold text-emerald-700">{order.payment_status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Packages (one card per seller's package) */}
      {myPkgs.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#EFEAE4] shadow-sm p-8 text-center text-sm text-stone-500">
          You have no packages associated with this order.
        </div>
      ) : myPkgs.map(pkg => {
        const pkgCodeReady = !!pkg.shipped_at && pkg.package_id && !pkg.package_id.startsWith('PEND-');
        return (
          <div key={pkg.package_id} className="bg-white rounded-3xl border border-[#EFEAE4] shadow-luxury p-7 space-y-6">
            {/* Package code and status */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[#FAF7F2]">
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Package Code</p>
                {pkgCodeReady ? (
                  <p className="text-xl font-mono font-black text-stone-900 mt-0.5">{pkg.package_id}</p>
                ) : (
                  <p className="text-sm text-stone-500 italic mt-0.5">Package code: pending shipment</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-1">Package Status</p>
                {statusBadge(pkg.status)}
              </div>
            </div>

            {/* Buyer contact + shipping address + delivery type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-[#FAF7F2] p-5 rounded-2xl border border-[#EFEAE4]">
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-1">Customer Phone</p>
                <p className="text-stone-800 font-semibold font-mono">{order.buyer_phone || shipping.phone || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-1">Delivery Method</p>
                <p className="text-stone-800 font-semibold capitalize">{order.delivery_method || 'Standard Boutique Delivery'}</p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-[#EFEAE4]/60">
                <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-1">Shipping Destination</p>
                <p className="text-stone-800 font-medium leading-relaxed">{fullAddress || '—'}</p>
              </div>
            </div>

            {/* Subtotal INCLUDING delivery charge */}
            <div className="bg-[#FAF3E8]/50 rounded-2xl p-5 border border-[#ECD4A8]/60 text-sm space-y-2">
              <div className="flex justify-between text-stone-600">
                <span>Items Subtotal</span>
                <span className="font-semibold text-stone-800 font-mono">PKR {(order.subtotal || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Delivery Charge</span>
                <span className="font-semibold text-stone-800 font-mono">PKR {(order.shipping_total || 0).toLocaleString()}</span>
              </div>
              <div className="border-t border-[#ECD4A8] pt-2 mt-2 flex justify-between items-center">
                <span className="font-serif font-bold text-base text-stone-800">Total (incl. delivery)</span>
                <span className="font-serif text-2xl font-bold text-[#9B7036]">PKR {subtotalWithShipping.toLocaleString()}</span>
              </div>
            </div>

            {/* Items list */}
            <div>
              <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-3">Items Included in this Package</p>
              <div className="divide-y divide-[#FAF7F2] border border-[#EFEAE4] rounded-2xl overflow-hidden">
                {(pkg.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between items-center p-4 text-sm bg-white hover:bg-[#FAF7F2]/40 transition-colors">
                    <div>
                      <p className="font-medium text-stone-900">{it.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5">PKR {(it.price || 0).toLocaleString()} × {it.qty}</p>
                    </div>
                    <p className="font-serif font-bold text-[#9B7036] text-base">
                      PKR {((it.subtotal) || (it.price * it.qty) || 0).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>

              {(pkg.tracking_number || pkg.shipped_at || pkg.delivered_at) && (
                <div className="mt-3 p-3.5 bg-stone-50 rounded-xl border border-stone-200/60 text-xs text-stone-600 space-y-1">
                  {pkg.tracking_number && (
                    <p>
                      Courier Partner: <span className="font-semibold text-stone-800">{pkg.courier_company || '—'}</span> • Tracking: <span className="font-mono font-bold text-[#9B7036]">{pkg.tracking_number}</span>
                    </p>
                  )}
                  {pkg.shipped_at && (
                    <p className="text-sky-700 font-medium">Shipped on: {new Date(pkg.shipped_at).toLocaleString()}</p>
                  )}
                  {pkg.delivered_at && (
                    <p className="text-emerald-700 font-medium">Delivered on: {new Date(pkg.delivered_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 flex-wrap pt-4 border-t border-[#FAF7F2] items-center">
              {pkg.status === 'PENDING' && order.status === 'CONFIRMED' && (
                <button
                  onClick={() => doPreparing(pkg)}
                  disabled={submitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl font-bold transition-all shadow-md disabled:opacity-50"
                >
                  {submitting ? '...' : '⚡ Mark Preparing'}
                </button>
              )}
              {pkg.status === 'PREPARING' && (
                <button
                  onClick={() => { setModal('shipping'); setMsg(''); }}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-xl font-bold transition-all shadow-md"
                >
                  🚚 Mark Shipped
                </button>
              )}
              {pkg.status === 'SHIPPED' && (
                <button
                  onClick={() => { setModal('delivered'); setMsg(''); }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl font-bold transition-all shadow-md"
                >
                  ✓ Mark Delivered
                </button>
              )}
              {pkg.status === 'DELIVERED' && (
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                  Awaiting client confirmation &amp; automatic payout release.
                </span>
              )}
              {pkg.status === 'COMPLETED' && (
                <span className="text-xs text-[#9B7036] font-semibold bg-[#FAF3E8] px-3 py-1.5 rounded-full border border-[#ECD4A8]">
                  ✓ Payout Released{pkg.transaction_id ? ` (TXN ${pkg.transaction_id})` : ''}
                </span>
              )}
              {pkg.status === 'DISPUTED' && (
                <span className="text-xs text-rose-700 font-semibold bg-rose-50 px-3 py-1.5 rounded-full border border-rose-200">
                  Dispute active — please respond in the Dispute Chat.
                </span>
              )}
              {pkg.status === 'CANCELLED' && (
                <span className="text-xs text-stone-500 font-semibold bg-stone-100 px-3 py-1.5 rounded-full">
                  This package was cancelled.
                </span>
              )}
              {pkg.status === 'RESOLVED' && (
                <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                  Dispute resolved — original deal stands.
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Branching Status Timeline */}
      <OrderTimeline
        timeline={order.timeline || []}
        title="Order Fulfillment & Status Progression"
      />

      {/* Action modal: Shipping */}
      {modal === 'shipping' && myPkgs[0] && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setModal(null)}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-7 shadow-2xl border border-[#EADBCC]" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-xl mb-4">
              🚚
            </div>
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-1">Confirm Shipping Dispatch</h2>
            <p className="text-xs text-stone-500 mb-4">
              Enter courier tracking details to notify the buyer.
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
                  onChange={e => setShipForm({ ...shipForm, tracking_number: formatTrackingNumber(e.target.value) })}
                  placeholder="1234-5678-9012"
                  className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Seller Note (Optional)</label>
                <input
                  value={shipForm.seller_note}
                  onChange={e => setShipForm({ ...shipForm, seller_note: e.target.value })}
                  placeholder="Special instructions or notes"
                  className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                />
              </div>
            </div>

            {msg && <p className="text-rose-600 text-xs font-semibold mt-3 p-2.5 bg-rose-50 rounded-xl">{msg}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-[#EFEAE4] hover:bg-stone-50 rounded-xl text-xs font-bold text-stone-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doShip(myPkgs[0])}
                disabled={submitting || !shipForm.tracking_number}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#9B7036] to-[#7d5624] hover:opacity-95 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#9B7036]/20 disabled:opacity-50"
              >
                {submitting ? "..." : "Confirm Shipped"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action modal: Delivered */}
      {modal === 'delivered' && myPkgs[0] && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setModal(null)}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-7 shadow-2xl border border-[#EADBCC]" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center text-xl mb-4">
              ✓
            </div>
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-1">Confirm Delivery</h2>
            <p className="text-xs text-stone-500 mb-4">
              Has the package been received by the client?
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Recipient Name</label>
                <input
                  placeholder="Recipient Name"
                  value={deliverForm.recipient_name}
                  onChange={e => setDeliverForm({ ...deliverForm, recipient_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Delivery Confirmation Note</label>
                <input
                  placeholder="e.g. Handed to recipient at address"
                  value={deliverForm.delivery_note}
                  onChange={e => setDeliverForm({ ...deliverForm, delivery_note: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036]/30 text-stone-800"
                />
              </div>
            </div>

            {msg && <p className="text-rose-600 text-xs font-semibold mt-3 p-2.5 bg-rose-50 rounded-xl">{msg}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-[#EFEAE4] hover:bg-stone-50 rounded-xl text-xs font-bold text-stone-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doDeliver(myPkgs[0])}
                disabled={submitting}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                {submitting ? "..." : "Confirm Delivered"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
