import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import ReviewForm from "../Reviews/ReviewForm";
import NotificationBell from "../Common/NotificationBell";
import SlaCountdown from "../Common/SlaCountdown";

/**
 * BuyerOrderDetailPage — confirmation (3 buttons) + 7-day auto-complete SLA.
 */
export default function BuyerOrderDetailPage({ buyer }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProblem, setShowProblem] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [problemForm, setProblemForm] = useState({
    problem_type: "damaged",
    title: "",
    description: "",
  });
  const [problemFiles, setProblemFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await orderApi.getOrder(orderId);
    setData(r.success ? r : null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orderId]);

  const confirmReceived = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "RECEIVED",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setMsg("Order complete — reception confirmed.");
    load();
  };

  const confirmNotReceived = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "NOT_RECEIVED",
      problemType: "not_received",
      title: "Order Not Received",
      description: "Buyer reports the order was not received. Seller has 48 hours to respond.",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    const disputeId = r.dispute?.dispute_id;
    if (disputeId) navigate(`/disputes/${disputeId}?as=buyer`, { state: { asRole: "buyer" } });
    else load();
  };

  const submitProblem = async () => {
    if (!problemForm.problem_type) {
      setMsg("Select a problem category.");
      return;
    }
    if (!problemFiles.length) {
      setMsg("Upload at least 1 photo/PDF as evidence.");
      return;
    }
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "PROBLEM",
      problemType: problemForm.problem_type,
      title: problemForm.title || "Problem with order",
      description: problemForm.description,
      evidence_ok: true,
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setShowProblem(false);
    const disputeId = r.dispute?.dispute_id;
    if (disputeId && problemFiles.length) {
      const disputeApi = (await import("../../api/disputeApi")).default;
      await disputeApi.uploadEvidence(disputeId, {
        fromId: buyer.buyer_id,
        fromRole: "buyer",
        files: problemFiles,
        description: problemForm.description,
      });
      navigate(`/disputes/${disputeId}?as=buyer`, { state: { asRole: "buyer" } });
      return;
    }
    setMsg(`Dispute opened: ${disputeId || "ok"}`);
    load();
  };

  const submitReview = async ({
    rating, title, comment,
    ai_suggested_rating, ai_used, ai_generated, ai_provider,
    voice_agent,
  }) => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.submitReview({
      buyerId: buyer.buyer_id, orderId,
      rating, title, comment,
      ai_suggested_rating, ai_used, ai_generated, ai_provider,
      voice_agent,
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setShowReview(false);
    const voiceNote = r.voice?.ok ? " Voice clip saved." : "";
    setMsg(`${r.reviews.length} review(s) submitted. Thank you!${voiceNote}`);
    load();
  };

  if (loading || !data) return <div className="p-8 text-center text-gray-500">Loading order...</div>;
  const { order, packages, disputes, sla, dispute_categories, timers } = data;

  const receptionConfirmed = order.buyer_confirmed_receipt || order.status === "COMPLETED" ||
    (order.timeline || []).some(t => t.by === "buyer" && (t.note || "").toLowerCase().includes("confirmed"));
  const alreadyReviewed = (order.timeline || []).some(
    t => t.by === "buyer" && (t.note || "").toLowerCase().includes("submitted") &&
         (t.note || "").toLowerCase().includes("review")
  );
  const openDispute = (disputes || []).find(d => !["RESOLVED", "CANCELLED"].includes(d.status));
  const canConfirm = order.status === "DELIVERED" && !receptionConfirmed && !openDispute;
  const canReview = receptionConfirmed && !alreadyReviewed && order.status !== "DISPUTED";

  const statusColor = (s) => ({
    PENDING_BNPL_APPROVAL: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-blue-100 text-blue-800", PREPARING: "bg-purple-100 text-purple-800",
    SHIPPED: "bg-indigo-100 text-indigo-800", DELIVERED: "bg-green-100 text-green-800",
    DISPUTED: "bg-red-100 text-red-800", COMPLETED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100");

  const categories = (dispute_categories || []).filter(c => c.id !== "not_received");

  return (
    <div className="max-w-4xl mx-auto p-6">
      {receptionConfirmed && (
        <div className="mb-4 p-4 rounded-2xl bg-green-100 border-2 border-green-400 text-green-900 text-center">
          <p className="text-xl font-extrabold tracking-wide">Reception Confirmed</p>
          <p className="text-xs text-green-800 mt-1">You confirmed you received this order.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate("/buyer/orders")} className="text-sm text-[#a37b3d]">Back to Orders</button>
        <NotificationBell userId={buyer?.buyer_id} role="buyer" onNavigate={(path) => navigate(path)} />
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-800">{order.order_id}</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(order.status)}`}>{order.status}</span>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <p>Placed: {new Date(order.created_at).toLocaleString()}</p>
          <p>Payment: <b>{order.payment_method}</b> ({order.payment_status})</p>
          {order.delivered_at && <p>Delivered: {new Date(order.delivered_at).toLocaleString()}</p>}
          <div className="mt-2 border-t border-gray-200 pt-2 space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono font-semibold">PKR {(order.subtotal || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span className="font-mono font-semibold">PKR {(order.shipping_total || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 mt-1 pt-1">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-mono font-bold">PKR {(order.total_amount || 0).toLocaleString()}</span>
            </div>
          </div>
          <p>Ship to: {order.shipping_address?.line1}, {order.shipping_address?.city}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="text-lg font-semibold mb-3">Items</h2>
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div>
              <p className="font-medium text-gray-800">{it.title}</p>
              <p className="text-xs text-gray-500">{it.major_category} · Qty {it.qty}</p>
            </div>
            <p className="font-semibold">PKR {it.subtotal.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {order.status !== "PENDING_BNPL_APPROVAL" && packages?.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-6 mb-4">
          <h2 className="text-lg font-semibold mb-3">Packages ({packages.length})</h2>
          {packages.map(p => (
            <div key={p.package_id} className="border border-gray-100 rounded-xl p-3 mb-2">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium">{p.package_id}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(p.status)}`}>{p.status}</span>
              </div>
              {p.tracking_number && <p className="text-xs text-gray-600">Tracking: <span className="font-mono">{p.tracking_number}</span></p>}
            </div>
          ))}
        </div>
      )}

      {disputes && disputes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Disputes</h2>
          {disputes.map(d => (
            <div key={d.dispute_id} className="mb-2">
              <p className="font-semibold text-red-800">{d.dispute_id} — {d.status}</p>
              <p className="text-xs text-red-700">{d.dispute_type}: {d.title}</p>
              <button onClick={() => navigate(`/disputes/${d.dispute_id}?as=buyer`, { state: { asRole: "buyer" } })} className="text-xs text-red-700 underline mt-1">Open Chat</button>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-xl p-3 mb-4 text-sm">{msg}</div>}

      {canConfirm && (
        <div className="bg-white rounded-2xl shadow p-6 mb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold mb-1">Confirm Reception</h2>
              <p className="text-sm text-gray-600">Has your order arrived?</p>
            </div>
            <SlaCountdown
              deadline={sla?.auto_complete_deadline || order.auto_complete_at}
              label={`Auto-completes in ${timers?.auto_complete_days || 7} days if no action`}
              className="min-w-[180px]"
            />
          </div>
          <p className="text-xs text-gray-500">
            Day 3: reminder · Day 6: final warning · Day 7: auto-complete and release payment (unless a dispute is open).
          </p>
          <div className="grid gap-2">
            <button onClick={confirmReceived} disabled={submitting}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold">
              Yes, I received it — Order Complete
            </button>
            <button onClick={confirmNotReceived} disabled={submitting}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold">
              No, I did not receive it
            </button>
            <button onClick={() => setShowProblem(true)} disabled={submitting}
              title="Select issue and upload photo"
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold">
              Item received, but there&apos;s a problem
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Opening a dispute puts payment ON HOLD and starts the seller&apos;s 48-hour response window.
          </p>
        </div>
      )}

      {canReview && (
        <button onClick={() => setShowReview(true)}
          className="mt-2 w-full py-3 border border-[#a37b3d] text-[#a37b3d] rounded-xl text-sm font-semibold">
          Leave a Review
        </button>
      )}

      {showProblem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowProblem(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Report a problem</h2>
            <p className="text-xs text-gray-500 mb-3">Select a category and upload at least 1 photo. Seller then has 48h to respond.</p>
            <select value={problemForm.problem_type}
              onChange={e => setProblemForm({ ...problemForm, problem_type: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {(categories.length ? categories : [
                { id: "damaged", label: "Damaged or defective" },
                { id: "wrong", label: "Wrong item sent" },
                { id: "missing", label: "Missing parts" },
                { id: "item_not_as_described", label: "Not as described" },
                { id: "quality_issue", label: "Quality issue" },
                { id: "other", label: "Other" },
              ]).map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <input placeholder="Title" value={problemForm.title}
              onChange={e => setProblemForm({ ...problemForm, title: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <textarea placeholder="Describe the issue" value={problemForm.description}
              onChange={e => setProblemForm({ ...problemForm, description: e.target.value })}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={3} />
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
              onChange={e => setProblemFiles(Array.from(e.target.files || []).slice(0, 5))}
              className="w-full mb-1 text-xs" />
            <p className="text-[10px] text-gray-400 mb-3">jpg/png/mp4/pdf · max 10MB · up to 5 files</p>
            <button onClick={submitProblem} disabled={submitting}
              className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">
              {submitting ? "Submitting..." : "Open dispute"}
            </button>
          </div>
        </div>
      )}

      {showReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
             style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
             onClick={() => setShowReview(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="p-6">
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
