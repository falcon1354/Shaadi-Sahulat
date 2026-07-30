import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import ReviewForm from "../Reviews/ReviewForm";
import NotificationBell from "../Common/NotificationBell";

/**
 * BuyerOrderDetailPage — single order with full timeline + Confirm Reception + AI-powered review form.
 *
 * v-spec updates:
 *   - Show only "Confirm Reception" at top first (no "Leave a Review" until confirmed)
 *   - When buyer picks "Yes, I received it": bold "Reception Confirmed" banner at TOP;
 *     hide Confirm button afterwards
 *   - Once review submitted: hide the review button too
 *   - 3 confirm options:
 *       i.  Yes, I received it              → normal receive flow
 *       ii. No, I have NOT received it     → NO popup; opens Socket.io dispute chat
 *       iii. I received it but there is an issue → keep image-upload popup
 */
export default function BuyerOrderDetailPage({ buyer }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProblem, setShowProblem] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [problemForm, setProblemForm] = useState({ problem_type: "damaged", title: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await orderApi.getOrder(orderId);
    setData(r.success ? r : null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orderId]);

  // ── i. Yes, I received it ────────────────────────────────────────────────
  const confirmReceived = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "RECEIVED",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setMsg("Reception Confirmed");
    load();
  };

  // ── ii. No, I have NOT received it → open dispute + chat (no popup) ─────
  const confirmNotReceived = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "NOT_RECEIVED",
      problemType: "not_received",
      title: "Order Not Received",
      description: "Buyer reports the order was not received. Awaiting seller/admin response.",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    const disputeId = r.dispute?.dispute_id;
    if (disputeId) navigate(`/disputes/${disputeId}`);
    else load();
  };

  // ── iii. I received it but there's an issue → popup + image ─────────────
  const submitProblem = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "PROBLEM",
      problemType: problemForm.problem_type,
      title: problemForm.title,
      description: problemForm.description,
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setShowProblem(false);
    setMsg(`Dispute opened: ${r.dispute?.dispute_id}.`);
    load();
  };

  const submitReview = async ({
    rating, title, comment,
    ai_suggested_rating, ai_used, ai_generated, ai_provider,
  }) => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.submitReview({
      buyerId: buyer.buyer_id, orderId,
      rating, title, comment,
      ai_suggested_rating, ai_used, ai_generated, ai_provider,
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setShowReview(false);
    setMsg(`${r.reviews.length} review(s) submitted. Thank you!`);
    load();
  };

  if (loading || !data) return <div className="p-8 text-center text-gray-500">Loading order...</div>;
  const { order, packages, disputes } = data;

  // Derived flags
  const receptionConfirmed = (order.timeline || []).some(
    t => t.by === "buyer" && (t.note || "").toLowerCase().includes("confirmed receipt")
  );
  const alreadyReviewed = (order.timeline || []).some(
    t => t.by === "buyer" && (t.note || "").toLowerCase().includes("submitted") &&
         (t.note || "").toLowerCase().includes("review")
  );
  const canConfirm = order.status === "DELIVERED" && !receptionConfirmed;
  const canReview = receptionConfirmed && !alreadyReviewed && order.status !== "DISPUTED";

  const statusColor = (s) => ({
    PENDING_BNPL_APPROVAL: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-blue-100 text-blue-800", PREPARING: "bg-purple-100 text-purple-800",
    SHIPPED: "bg-indigo-100 text-indigo-800", DELIVERED: "bg-green-100 text-green-800",
    DISPUTED: "bg-red-100 text-red-800", COMPLETED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100");

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Bold "Reception Confirmed" banner at TOP */}
      {receptionConfirmed && (
        <div className="mb-4 p-4 rounded-2xl bg-green-100 border-2 border-green-400 text-green-900 text-center">
          <p className="text-xl font-extrabold tracking-wide">✅ Reception Confirmed</p>
          <p className="text-xs text-green-800 mt-1">You confirmed you received this order.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate("/buyer/orders")} className="text-sm text-[#a37b3d]">← Back to Orders</button>
        <NotificationBell
          userId={buyer?.buyer_id}
          role="buyer"
          onNavigate={(path) => navigate(path)}
        />
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-800">{order.order_id}</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(order.status)}`}>{order.status}</span>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <p>Placed: {new Date(order.created_at).toLocaleString()}</p>
          <p>Payment: <b>{order.payment_method}</b> ({order.payment_status})</p>
          {order.bnpl_application_id && <p>BNPL Application: <button onClick={() => navigate("/buyer/bnpl")} className="text-[#a37b3d] underline">{order.bnpl_application_id}</button></p>}
          <p>Total: <b>PKR {order.total_amount.toLocaleString()}</b> (subtotal {order.subtotal.toLocaleString()} + shipping {order.shipping_total.toLocaleString()})</p>
          <p>Ship to: {order.shipping_address.line1}, {order.shipping_address.city}{order.shipping_address.province ? `, ${order.shipping_address.province}` : ""}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="text-lg font-semibold mb-3">Items</h2>
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div>
              <p className="font-medium text-gray-800">{it.title}</p>
              <p className="text-xs text-gray-500">{it.major_category} • Qty {it.qty} • PKR {it.price.toLocaleString()}</p>
            </div>
            <p className="font-semibold">PKR {it.subtotal.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="text-lg font-semibold mb-3">Packages ({packages.length})</h2>
        {packages.map(p => (
          <div key={p.package_id} className="border border-gray-100 rounded-xl p-3 mb-2">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-gray-800">{p.package_id}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(p.status)}`}>{p.status}</span>
            </div>
            <p className="text-xs text-gray-500">Seller: {p.seller_id} • {p.items.length} item(s) • PKR {p.subtotal.toLocaleString()}</p>
            {p.tracking_number && <p className="text-xs text-gray-600">Courier: {p.courier_company} • Tracking: <span className="font-mono">{p.tracking_number}</span></p>}
            {p.delivered_at && <p className="text-xs text-green-700">Delivered: {new Date(p.delivered_at).toLocaleString()}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="text-lg font-semibold mb-3">Timeline</h2>
        <div className="space-y-2">
          {(order.timeline || []).map((t, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <div className="text-xs text-gray-400 w-32 flex-shrink-0">{new Date(t.at).toLocaleString()}</div>
              <div>
                <span className="font-semibold">{t.status}</span>
                <span className="text-gray-500"> by {t.by}</span>
                {t.note && <p className="text-xs text-gray-600">{t.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {disputes && disputes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Disputes</h2>
          {disputes.map(d => (
            <div key={d.dispute_id} className="mb-2">
              <p className="font-semibold text-red-800">{d.dispute_id} — {d.status}</p>
              <p className="text-xs text-red-700">{d.dispute_type}: {d.title}</p>
              <button onClick={() => navigate(`/disputes/${d.dispute_id}`)}
                className="text-xs text-red-700 underline mt-1">Open Chat →</button>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-xl p-3 mb-4 text-sm">{msg}</div>}

      {/* Confirm Reception UI — only if not yet confirmed */}
      {canConfirm && (
        <div className="bg-white rounded-2xl shadow p-6 mb-4">
          <h2 className="text-lg font-bold mb-2">Confirm Reception</h2>
          <p className="text-sm text-gray-600 mb-4">Has your order arrived?</p>
          <div className="grid gap-2">
            <button
              onClick={confirmReceived}
              disabled={submitting}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold"
            >
              ✅ Yes, I received it
            </button>
            <button
              onClick={confirmNotReceived}
              disabled={submitting}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold"
              title="Opens a live chat with Seller & Admin"
            >
              ❌ No, I have NOT received it (opens chat)
            </button>
            <button
              onClick={() => setShowProblem(true)}
              disabled={submitting}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold"
            >
              ⚠ I received it, but there is an issue
            </button>
          </div>
        </div>
      )}

      {/* Leave a Review — only after Reception Confirmed AND not already reviewed */}
      {canReview && (
        <button onClick={() => setShowReview(true)}
          className="mt-2 w-full py-3 border border-[#a37b3d] text-[#a37b3d] rounded-xl text-sm font-semibold">
          Leave a Review
        </button>
      )}

      {/* Problem popup — image/PDF evidence */}
      {showProblem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowProblem(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Report Issue</h2>
            <p className="text-xs text-gray-500 mb-3">Order: {order.order_id}</p>
            <select value={problemForm.problem_type} onChange={e => setProblemForm({ ...problemForm, problem_type: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="damaged">damaged</option>
              <option value="missing">missing</option>
              <option value="wrong">wrong</option>
              <option value="poor_quality">poor_quality</option>
              <option value="other">other</option>
            </select>
            <input placeholder="Title" value={problemForm.title}
              onChange={e => setProblemForm({ ...problemForm, title: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <textarea placeholder="Description" value={problemForm.description}
              onChange={e => setProblemForm({ ...problemForm, description: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={3} />
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={() => {}}
              className="w-full mb-3 text-xs"
              title="Evidence file (image or PDF) — upload from the dispute chat afterwards"
            />
            <button onClick={submitProblem} disabled={submitting}
              className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      )}

      {/* Review modal — AI-powered (no voice) */}
      {showReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
             style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
             onClick={() => setShowReview(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-1">Rate Your Experience</h2>
              <p className="text-xs text-gray-500 mb-4">Use the AI to suggest a rating or generate a draft review.</p>
              <ReviewForm
                productTitle={order.items[0]?.title || "your order"}
                productDescription={order.items[0]?.major_category || ""}
                buyerId={buyer?.buyer_id}
                productId={order.items[0]?.product_id}
                onSubmit={submitReview}
                onCancel={() => setShowReview(false)}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
