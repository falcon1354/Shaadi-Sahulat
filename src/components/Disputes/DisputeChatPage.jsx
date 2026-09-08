import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import disputeApi from "../../api/disputeApi";
import { useSocket } from "../../context/SocketContext";
import SlaCountdown from "../Common/SlaCountdown";

/**
 * DisputeChatPage — 3-party chat + Evidence + Order Details tabs,
 * seller 48h actions, buyer offer review, admin resolution outcomes, SLA timers.
 */
export default function DisputeChatPage({ user }) {
  const { disputeId } = useParams();
  const navigate = useNavigate();
  const { socket, isConnected, joinDispute, leaveDispute, on, sendTyping } = useSocket();

  const [dispute, setDispute] = useState(null);
  const [messages, setMessages] = useState([]);
  const [order, setOrder] = useState(null);
  const [sla, setSla] = useState(null);
  const [sellerActions, setSellerActions] = useState([]);
  const [adminOutcomes, setAdminOutcomes] = useState([]);
  const [tab, setTab] = useState("chat");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [adminForm, setAdminForm] = useState({
    decision: "buyer_wins_full",
    notes: "",
    refund_percent: 50,
  });
  const [sellerForm, setSellerForm] = useState({
    action: "accept_full_refund",
    note: "",
    refund_percent: 50,
    tracking_number: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [typingUser, setTypingUser] = useState(null);
  const [socketStatus, setSocketStatus] = useState(isConnected ? "live" : "polling");

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const load = async () => {
    const r = await disputeApi.getDispute(disputeId);
    if (r.success) {
      setDispute(r.dispute);
      setMessages(r.messages || []);
      setOrder(r.order || null);
      setSla(r.sla || null);
      setSellerActions(r.seller_actions || []);
      setAdminOutcomes(r.admin_outcomes || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (disputeId) {
      joinDispute(disputeId);
      return () => leaveDispute(disputeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  useEffect(() => {
    if (!on) return;
    const off = on("dispute:message", (m) => {
      if (!m || m.dispute_id !== disputeId) return;
      setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
    });
    return off;
  }, [on, disputeId]);

  useEffect(() => {
    if (!on) return;
    const off = on("dispute:typing", ({ name }) => {
      setTypingUser(name);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2500);
    });
    return off;
  }, [on]);

  useEffect(() => {
    setSocketStatus(isConnected ? "live" : "polling");
  }, [isConnected]);

  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  const isClosed =
    dispute?.chat_locked ||
    ["RESOLVED", "CANCELLED"].includes(dispute?.status) ||
    String(dispute?.status || "").startsWith("CLOSED_");
  const muted = (dispute?.muted_roles || []).includes(user.role);
  const canUploadEvidence = user.role === "buyer" && !isClosed && !muted;
  const canSellerRespond =
    user.role === "seller" &&
    ["SELLER_RESPONSE_PENDING", "OPEN"].includes(dispute?.status);
  const canBuyerReview =
    user.role === "buyer" && dispute?.status === "BUYER_REVIEW_PENDING";
  const canAdminResolve =
    user.role === "admin" &&
    !isClosed &&
    ["ADMIN_REVIEW_PENDING", "UNDER_REVIEW", "SELLER_RESPONDED", "SELLER_RESPONSE_PENDING", "OPEN", "BUYER_REVIEW_PENDING"].includes(
      dispute?.status
    );

  const send = async () => {
    if (!text.trim() || muted) return;
    const msgText = text;
    setText("");
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      dispute_id: disputeId,
      sender_id: user.id,
      sender_role: user.role,
      sender_name: user.name || user.role,
      message: msgText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    await disputeApi.sendMessage(disputeId, {
      fromRole: user.role,
      fromId: user.id,
      fromName: user.name || user.role,
      message: msgText,
    });
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }, 2000);
  };

  const onTextChange = (v) => {
    setText(v);
    if (socket && disputeId) sendTyping(disputeId, user.name || user.role);
  };

  const upload = async () => {
    if (!canUploadEvidence) {
      setMsg("Only the buyer can upload evidence.");
      return;
    }
    if (!files.length) return;
    setSubmitting(true);
    setMsg("");
    const r = await disputeApi.uploadEvidence(disputeId, {
      fromId: user.id,
      fromRole: user.role,
      files,
      description: evidenceDesc,
    });
    setSubmitting(false);
    if (!r.success) {
      setMsg(r.error || "Upload failed");
      return;
    }
    setFiles([]);
    setEvidenceDesc("");
    setUploadOpen(false);
    load();
  };

  const submitSeller = async () => {
    setSubmitting(true);
    setMsg("");
    const r = await disputeApi.sellerRespond(disputeId, {
      seller_id: user.id,
      action: sellerForm.action,
      note: sellerForm.note,
      refund_percent: sellerForm.refund_percent,
      tracking_number: sellerForm.tracking_number,
    });
    setSubmitting(false);
    if (!r.success) {
      setMsg(r.error || "Seller response failed");
      return;
    }
    load();
  };

  const submitBuyerReview = async (accept) => {
    setSubmitting(true);
    setMsg("");
    const r = await disputeApi.buyerReviewOffer(disputeId, {
      buyerId: user.id,
      accept,
    });
    setSubmitting(false);
    if (!r.success) {
      setMsg(r.error || "Review failed");
      return;
    }
    load();
  };

  const submitAdmin = async () => {
    setSubmitting(true);
    setMsg("");
    const r = await disputeApi.adminDecision(user.id, disputeId, {
      decision: adminForm.decision,
      notes: adminForm.notes,
      refund_percent: adminForm.refund_percent,
    });
    setSubmitting(false);
    if (!r.success) {
      setMsg(r.error || "Decision failed");
      return;
    }
    load();
  };

  if (loading || !dispute) {
    return <div className="p-8 text-center text-gray-500">Loading dispute...</div>;
  }

  const statusTone = (() => {
    if (isClosed) return "bg-green-100 text-green-800";
    if (String(dispute.status).includes("ADMIN")) return "bg-blue-100 text-blue-800";
    if (String(dispute.status).includes("SELLER")) return "bg-amber-100 text-amber-800";
    return "bg-amber-100 text-amber-800";
  })();

  const bubbleClass = (m) => {
    const isMe = m.sender_id === user.id && m.sender_role === user.role;
    if (m.is_system) return "bg-slate-100 text-slate-700 border border-slate-200 w-full max-w-full";
    if (m.sender_role === "admin") return "bg-indigo-100 text-indigo-950 border border-indigo-200";
    if (isMe) return "bg-[#a37b3d] text-white";
    return "bg-gray-100 text-gray-800";
  };

  const evidenceUrl = (e) =>
    /^https?:\/\//i.test(e.file_path || e.url || "")
      ? e.file_path || e.url
      : `http://localhost:5000/uploads/${e.file_path}`;

  const tabs = [
    { id: "chat", label: "Chat" },
    { id: "evidence", label: "Evidence" },
    { id: "order", label: "Order Details" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="text-sm text-[#a37b3d] mb-3">
        ← Back
      </button>

      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="text-xl font-bold">Dispute {dispute.dispute_id}</h1>
            <p className="text-sm text-gray-700 mt-1">
              Order: <b>{dispute.order_id}</b> · Type: <b>{dispute.dispute_type}</b>
            </p>
            <p className="text-sm text-gray-700">{dispute.title}</p>
            {dispute.description && (
              <p className="text-sm text-gray-600 mt-1">{dispute.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  socketStatus === "live"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    socketStatus === "live" ? "bg-green-500 animate-pulse" : "bg-amber-500"
                  }`}
                />
                {socketStatus === "live" ? "Live" : "Polling"}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusTone}`}>
                {dispute.status}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                You: {user.role}
              </span>
            </div>
            <SlaCountdown
              deadline={sla?.primary_deadline}
              label={sla?.primary_label || "Active SLA"}
              className="min-w-[160px] text-right"
            />
          </div>
        </div>

        <div className="mt-3 grid sm:grid-cols-3 gap-2 text-[11px]">
          <SlaCountdown
            deadline={sla?.seller_response_deadline || dispute.seller_response_deadline}
            label="Seller 48h response"
            showExpired={!!dispute.seller_response_deadline}
          />
          <SlaCountdown
            deadline={sla?.admin_resolution_deadline || dispute.admin_resolution_deadline}
            label="Admin 5-day resolve"
            showExpired={!!dispute.admin_resolution_deadline}
          />
          <SlaCountdown
            deadline={sla?.appeal_deadline || dispute.appeal_deadline}
            label="Appeal window (7d)"
            showExpired={!!dispute.appeal_deadline}
          />
        </div>

        {dispute.outcome_code && (
          <p className="text-xs text-gray-600 mt-2">
            Outcome: <b>{dispute.outcome_code}</b>
            {dispute.admin_notes ? ` — ${dispute.admin_notes}` : ""}
          </p>
        )}
      </div>

      {msg && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {msg}
        </div>
      )}

      <div className="flex gap-1 mb-3 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.id
                ? "border-[#a37b3d] text-[#a37b3d]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {t.id === "evidence" && dispute.evidence?.length
              ? ` (${dispute.evidence.length})`
              : ""}
          </button>
        ))}
      </div>

      {tab === "chat" && (
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">
                No messages yet. Start the conversation.
              </p>
            ) : (
              messages.map((m, i) => {
                const isMe = m.sender_id === user.id && m.sender_role === user.role;
                const isSystem = !!m.is_system;
                return (
                  <div
                    key={m._id || i}
                    className={`flex ${isSystem ? "justify-center" : isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${bubbleClass(m)}`}>
                      <p className="text-xs font-semibold mb-0.5 opacity-80">
                        {isSystem
                          ? "System"
                          : m.sender_role === "admin"
                            ? `[ADMIN] ${m.sender_name || "Admin"}`
                            : `[${m.sender_role}] ${m.sender_name}`}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isMe && !isSystem ? "text-white/60" : "opacity-60"
                        }`}
                      >
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {typingUser && (
            <div className="text-xs text-gray-500 italic mt-2 ml-2">{typingUser} is typing…</div>
          )}

          {!isClosed && !muted && canUploadEvidence && (
            <div className="border-t border-gray-100 pt-3 mt-3">
              {uploadOpen ? (
                <div className="space-y-2">
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
                    onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
                    className="text-xs"
                  />
                  <input
                    value={evidenceDesc}
                    onChange={(e) => setEvidenceDesc(e.target.value)}
                    placeholder="Short description (optional)"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                  />
                  <p className="text-[10px] text-gray-400">jpg/png/mp4/pdf · max 10MB · up to 5 files</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadOpen(false)}
                      className="flex-1 py-1 border border-gray-200 rounded text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={upload}
                      disabled={submitting || !files.length}
                      className="flex-1 py-1 bg-[#a37b3d] text-white rounded text-xs"
                    >
                      Upload
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={text}
                    onChange={(e) => onTextChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    title="Upload evidence"
                  >
                    📎
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    className="px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          )}

          {!isClosed && !muted && !canUploadEvidence && (
            <div className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={send}
                  className="px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {muted && (
            <p className="text-xs text-amber-700 mt-2">You are muted — chat is read-only for you.</p>
          )}
          {isClosed && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Chat locked after resolution.
              {dispute.appeal_deadline
                ? ` Appeal until ${new Date(dispute.appeal_deadline).toLocaleString()}.`
                : ""}
            </p>
          )}
        </div>
      )}

      {tab === "evidence" && (
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">EVIDENCE</h2>
          {!dispute.evidence?.length ? (
            <p className="text-sm text-gray-400">No evidence uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {dispute.evidence.map((e, i) => (
                <li key={i} className="text-sm border border-gray-100 rounded-lg px-3 py-2">
                  <a
                    href={evidenceUrl(e)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#a37b3d] font-medium"
                  >
                    {e.original_name || e.file_path}
                  </a>
                  <p className="text-[11px] text-gray-500">
                    by {e.uploaded_by}
                    {e.uploaded_at ? ` · ${new Date(e.uploaded_at).toLocaleString()}` : ""}
                    {e.description ? ` — ${e.description}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {!isClosed && !muted && canUploadEvidence && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
                className="text-xs"
              />
              <button
                type="button"
                onClick={upload}
                disabled={submitting || !files.length}
                className="px-3 py-1.5 bg-[#a37b3d] text-white rounded-lg text-xs font-semibold"
              >
                Upload evidence
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "order" && (
        <div className="bg-white rounded-2xl shadow p-4 mb-4 text-sm space-y-2">
          <h2 className="text-sm font-semibold text-gray-600 mb-2">ORDER DETAILS</h2>
          {order ? (
            <>
              <p>
                <b>{order.order_id}</b> — {order.status} · Payment: {order.payment_status}
              </p>
              <p>Total: PKR {(order.total_amount || 0).toLocaleString()}</p>
              {order.delivered_at && (
                <p>Delivered: {new Date(order.delivered_at).toLocaleString()}</p>
              )}
              <div className="border-t border-gray-100 pt-2 mt-2">
                {(order.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between py-1">
                    <span>
                      {it.title} × {it.qty}
                    </span>
                    <span className="font-mono">PKR {(it.subtotal || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-400">Order details unavailable.</p>
          )}
          <div className="border-t border-gray-100 pt-2 mt-2 text-xs text-gray-600 space-y-1">
            <p>Buyer: {dispute.buyer_id}</p>
            <p>Seller: {dispute.seller_id}</p>
            {dispute.escalation_reason && <p>Escalation: {dispute.escalation_reason}</p>}
            {dispute.seller_response_action && (
              <p>Seller action: {dispute.seller_response_action}</p>
            )}
          </div>
        </div>
      )}

      {canSellerRespond && (
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-1">SELLER RESPONSE (48h)</h2>
          <p className="text-xs text-gray-500 mb-3">
            Respond before the timer expires or the case auto-escalates to admin.
          </p>
          <select
            value={sellerForm.action}
            onChange={(e) => setSellerForm({ ...sellerForm, action: e.target.value })}
            className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {(sellerActions.length
              ? sellerActions
              : [
                  { id: "accept_full_refund", label: "Accept Full Refund" },
                  { id: "offer_partial_refund", label: "Offer Partial Refund" },
                  { id: "offer_replacement", label: "Offer Replacement" },
                  { id: "reject_dispute", label: "Reject Dispute (escalate)" },
                ]
            ).map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          {sellerForm.action === "offer_partial_refund" && (
            <input
              type="number"
              min={1}
              max={99}
              value={sellerForm.refund_percent}
              onChange={(e) =>
                setSellerForm({ ...sellerForm, refund_percent: Number(e.target.value) })
              }
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              placeholder="Refund %"
            />
          )}
          {sellerForm.action === "offer_replacement" && (
            <input
              value={sellerForm.tracking_number}
              onChange={(e) =>
                setSellerForm({ ...sellerForm, tracking_number: e.target.value })
              }
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              placeholder="Replacement tracking number"
            />
          )}
          <textarea
            value={sellerForm.note}
            onChange={(e) => setSellerForm({ ...sellerForm, note: e.target.value })}
            placeholder="Note / reason (required for reject)"
            className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            rows={2}
          />
          <button
            type="button"
            onClick={submitSeller}
            disabled={submitting}
            className="w-full py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold"
          >
            {submitting ? "Submitting..." : "Submit response"}
          </button>
        </div>
      )}

      {canBuyerReview && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-semibold text-amber-900 mb-1">Seller offer pending</h2>
          <p className="text-xs text-amber-800 mb-3">
            {dispute.seller_response_action === "offer_replacement"
              ? `Replacement offered${
                  dispute.seller_replacement_tracking
                    ? ` (tracking: ${dispute.seller_replacement_tracking})`
                    : ""
                }.`
              : `Partial refund offered: ${dispute.seller_offer_percent || "?"}%`}
            {dispute.seller_response_note ? ` — ${dispute.seller_response_note}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submitBuyerReview(true)}
              disabled={submitting}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold"
            >
              Accept offer
            </button>
            <button
              type="button"
              onClick={() => submitBuyerReview(false)}
              disabled={submitting}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold"
            >
              Reject → admin
            </button>
          </div>
        </div>
      )}

      {canAdminResolve && (
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">RESOLVE DISPUTE</h2>
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {(adminOutcomes.length
              ? adminOutcomes
              : [
                  { id: "buyer_wins_full", label: "Buyer Wins — Full Refund" },
                  { id: "buyer_wins_partial", label: "Buyer Wins — Partial Refund" },
                  { id: "buyer_wins_return", label: "Buyer Wins — Return Required" },
                  { id: "seller_wins", label: "Seller Wins" },
                  { id: "compromise", label: "Compromise" },
                  { id: "force_replacement", label: "Force Replacement" },
                ]
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setAdminForm({ ...adminForm, decision: o.id })}
                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold border ${
                  adminForm.decision === o.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {(adminForm.decision === "buyer_wins_partial" ||
            adminForm.decision === "compromise") && (
            <input
              type="number"
              min={1}
              max={99}
              value={adminForm.refund_percent}
              onChange={(e) =>
                setAdminForm({ ...adminForm, refund_percent: Number(e.target.value) })
              }
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              placeholder="Buyer refund %"
            />
          )}
          <textarea
            placeholder="Admin notes / reason"
            value={adminForm.notes}
            onChange={(e) => setAdminForm({ ...adminForm, notes: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2"
            rows={2}
          />
          <button
            type="button"
            onClick={submitAdmin}
            disabled={submitting}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
          >
            {submitting ? "Submitting..." : "Resolve Dispute"}
          </button>
        </div>
      )}

      {isClosed && (
        <div className="rounded-2xl p-4 text-center bg-green-50 text-green-800">
          <p className="font-semibold">
            Dispute closed{dispute.outcome_code ? `: ${dispute.outcome_code}` : ""}.
          </p>
          {dispute.admin_notes && (
            <p className="text-xs mt-1">Notes: {dispute.admin_notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
