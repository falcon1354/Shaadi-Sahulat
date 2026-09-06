import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import { useAuth } from "../../App";

/**
 * SellerOrderDetailPage
 * ---------------------
 * Reads :orderId and ?t=<token> from the URL and fetches the order via
 * `GET /api/orders/by-token/:token` (no x-user-id needed — the token is the auth).
 *
 * Shows:
 *   - Order ID at the top
 *   - PKG-XX code ONLY after seller has completed "Mark Shipped" (package.shipped_at is set)
 *   - Phone Number, full shipping Address, Delivery Type
 *   - Subtotal INCLUDING the delivery charge (subtotal + shipping_total)
 *   - Order Placed Date & Time (order.created_at)
 *   - Status timeline
 *   - Action buttons: Mark Preparing / Mark Shipped / Mark Delivered
 */
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

  const statusColor = (s) => ({
    PENDING:    "bg-gray-100 text-gray-700",
    PREPARING:  "bg-purple-100 text-purple-800",
    SHIPPED:    "bg-indigo-100 text-indigo-800",
    DELIVERED:  "bg-green-100 text-green-800",
    DISPUTED:   "bg-red-100 text-red-800",
    RESOLVED:   "bg-amber-100 text-amber-800",
    CANCELLED:  "bg-red-100 text-red-800",
    COMPLETED:  "bg-emerald-100 text-emerald-800",
  }[s] || "bg-gray-100 text-gray-700");

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
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-12 text-center text-gray-500">Loading order…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
          <p className="font-semibold">Could not load order</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={() => navigate('/seller/orders')}
            className="mt-3 text-sm text-[#a37b3d] hover:underline">← Back to Orders</button>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-12 text-center text-gray-500">Order not found.</div>
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
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/seller/orders')}
          className="text-sm text-gray-500 hover:text-[#a37b3d]">← Back to Orders</button>
        <button onClick={load} className="text-sm text-[#a37b3d]">↻ Refresh</button>
      </div>

      {msg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{msg}</div>
      )}

      {/* Order ID + status banner */}
      <div className="bg-white rounded-2xl shadow p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Order ID</p>
            <h1 className="text-2xl font-black text-gray-900 font-mono">{order.order_id}</h1>
            <p className="text-xs text-gray-500 mt-1">
              Placed: {order.created_at ? new Date(order.created_at).toLocaleString() : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Order Status</p>
            <span className={`inline-block mt-1 text-xs px-3 py-1.5 rounded-full font-semibold ${statusColor(order.status)}`}>
              {order.status}
            </span>
            <p className="text-[10px] text-gray-400 mt-1">
              Payment: {order.payment_method} • {order.payment_status}
            </p>
          </div>
        </div>
      </div>

      {/* Packages (one card per seller's package) */}
      {myPkgs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-6 text-center text-sm text-gray-500">
          You have no packages on this order.
        </div>
      ) : myPkgs.map(pkg => {
        // PKG- code only after seller has completed "Mark Shipped"
        const pkgCodeReady = !!pkg.shipped_at && pkg.package_id && !pkg.package_id.startsWith('PEND-');
        return (
          <div key={pkg.package_id} className="bg-white rounded-2xl shadow p-6 space-y-4">
            {/* Package code block */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Package Code</p>
                {pkgCodeReady ? (
                  <p className="text-lg font-mono font-black text-gray-900">{pkg.package_id}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic">Package code: pending</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Package Status</p>
                <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-semibold ${statusColor(pkg.status)}`}>
                  {pkg.status}
                </span>
              </div>
            </div>

            {/* Buyer contact + shipping address + delivery type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Phone Number</p>
                <p className="text-gray-800 font-medium">{order.buyer_phone || shipping.phone || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Delivery Type</p>
                <p className="text-gray-800 font-medium capitalize">{order.delivery_method || 'standard'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Shipping Address</p>
                <p className="text-gray-800">{fullAddress || '—'}</p>
              </div>
            </div>

            {/* Subtotal INCLUDING delivery charge */}
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Items Subtotal</span>
                <span className="font-semibold text-gray-800">PKR {(order.subtotal || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Delivery Charge</span>
                <span className="font-semibold text-gray-800">PKR {(order.shipping_total || 0).toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <span className="font-bold text-gray-700">Subtotal (incl. delivery)</span>
                <span className="font-black text-[#a37b3d]">PKR {subtotalWithShipping.toLocaleString()}</span>
              </div>
            </div>

            {/* Items list */}
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">Items</p>
              <div className="divide-y divide-gray-100">
                {(pkg.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{it.title}</p>
                      <p className="text-xs text-gray-500">PKR {(it.price || 0).toLocaleString()} × {it.qty}</p>
                    </div>
                    <p className="font-semibold text-gray-800">PKR {((it.subtotal) || (it.price * it.qty) || 0).toLocaleString()}</p>
                  </div>
                ))}
                {pkg.tracking_number && (
                  <p className="text-xs text-gray-600 pt-2">
                    Courier: <span className="font-medium">{pkg.courier_company || '—'}</span> •
                    Tracking: <span className="font-mono">{pkg.tracking_number}</span>
                  </p>
                )}
                {pkg.shipped_at && (
                  <p className="text-xs text-indigo-700 pt-2">Shipped at: {new Date(pkg.shipped_at).toLocaleString()}</p>
                )}
                {pkg.delivered_at && (
                  <p className="text-xs text-green-700 pt-2">Delivered at: {new Date(pkg.delivered_at).toLocaleString()}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100">
              {pkg.status === 'PENDING' && order.status === 'CONFIRMED' && (
                <button
                  onClick={() => doPreparing(pkg)}
                  disabled={submitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg font-semibold disabled:opacity-50"
                >
                  {submitting ? '...' : 'Mark Preparing'}
                </button>
              )}
              {pkg.status === 'PREPARING' && (
                <button
                  onClick={() => { setModal('shipping'); setMsg(''); }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-semibold"
                >
                  Mark Shipped
                </button>
              )}
              {pkg.status === 'SHIPPED' && (
                <button
                  onClick={() => { setModal('delivered'); setMsg(''); }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold"
                >
                  Mark Delivered
                </button>
              )}
              {pkg.status === 'DELIVERED' && (
                <span className="text-sm text-green-700 self-center">Awaiting buyer confirmation / payout release.</span>
              )}
              {pkg.status === 'COMPLETED' && (
                <span className="text-sm text-emerald-700 self-center">Payout released{pkg.transaction_id ? ` (TXN ${pkg.transaction_id})` : ''}.</span>
              )}
              {pkg.status === 'DISPUTED' && (
                <span className="text-sm text-red-700 self-center">Under dispute — please respond in dispute chat.</span>
              )}
              {pkg.status === 'CANCELLED' && (
                <span className="text-sm text-red-700 self-center">This package was cancelled.</span>
              )}
              {pkg.status === 'RESOLVED' && (
                <span className="text-sm text-amber-700 self-center">Dispute resolved — original deal stands.</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Status timeline (same style as buyer side) */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Timeline</h2>
        <div className="space-y-2">
          {(order.timeline || []).map((t, i) => {
            const isRejected = (t.status || "").toUpperCase() === "REJECTED";
            return (
              <div key={i} className="flex gap-3 text-sm">
                <div className="text-xs text-gray-400 w-40 flex-shrink-0">
                  {t.at ? new Date(t.at).toLocaleString() : '—'}
                </div>
                <div>
                  <span className={`font-semibold ${isRejected ? "text-red-600" : ""}`}>{t.status}</span>
                  <span className="text-gray-500"> by {t.by || '—'}</span>
                  {t.note && <p className={`text-xs ${isRejected ? "text-red-600" : "text-gray-600"}`}>{t.note}</p>}
                </div>
              </div>
            );
          })}
          {(!order.timeline || order.timeline.length === 0) && (
            <p className="text-xs text-gray-400">No timeline events yet.</p>
          )}
        </div>
      </div>

      {/* Action modal: Shipping */}
      {modal === 'shipping' && myPkgs[0] && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">Confirm Shipping</h2>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-gray-600">COURIER COMPANY</label>
                <select value={shipForm.courier_company}
                  onChange={e => setShipForm({ ...shipForm, courier_company: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option>TCS</option><option>Leopards</option><option>DHL</option><option>M&P</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">TRACKING NUMBER (auto-formatted)</label>
                <input
                  value={shipForm.tracking_number}
                  onChange={e => setShipForm({ ...shipForm, tracking_number: formatTrackingNumber(e.target.value) })}
                  placeholder="1234-5678-9012"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">SELLER NOTE (optional)</label>
                <input value={shipForm.seller_note}
                  onChange={e => setShipForm({ ...shipForm, seller_note: e.target.value })}
                  placeholder="Any notes for the buyer"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            {msg && <p className="text-red-600 text-sm mt-2">{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button onClick={() => doShip(myPkgs[0])}
                disabled={submitting || !shipForm.tracking_number}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {submitting ? "..." : "Confirm Shipped"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action modal: Delivered */}
      {modal === 'delivered' && myPkgs[0] && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">Confirm Delivery</h2>
            <p className="text-sm text-gray-600 mb-3">
              Has the package been delivered to the buyer?
            </p>
            <input placeholder="Recipient name" value={deliverForm.recipient_name}
              onChange={e => setDeliverForm({ ...deliverForm, recipient_name: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <input placeholder="Delivery note (e.g. handed to recipient)" value={deliverForm.delivery_note}
              onChange={e => setDeliverForm({ ...deliverForm, delivery_note: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            {msg && <p className="text-red-600 text-sm">{msg}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button onClick={() => doDeliver(myPkgs[0])}
                disabled={submitting}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {submitting ? "..." : "Confirm Delivered"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
