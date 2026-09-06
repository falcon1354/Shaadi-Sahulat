import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import disputeApi from "../../api/disputeApi";
import { useSocket } from "../../context/SocketContext";

/**
 * DisputeChatPage — real-time chat room for a dispute. Buyer, seller, and
 * admin can post messages and upload evidence.
 *
 * Per BNPL&Delivery.md Module 2 Step 7.
 *
 * v3.1: Now uses Socket.io for real-time messages. The 5-second polling
 *       is kept as a fallback in case the socket disconnects.
 */
export default function DisputeChatPage({ user }) {
  // user = { id, role, name } where role is "buyer" | "seller" | "admin"
  const { disputeId } = useParams();
  const navigate = useNavigate();
  const { socket, isConnected, joinDispute, leaveDispute, on, sendTyping } = useSocket();

  const [dispute, setDispute] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [adminDecision, setAdminDecision] = useState({ decision: "RESOLVED", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [socketStatus, setSocketStatus] = useState(isConnected ? "live" : "polling");

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const load = async () => {
    const r = await disputeApi.getDispute(disputeId);
    if (r.success) {
      setDispute(r.dispute);
      setMessages(r.messages);
    }
    setLoading(false);
  };

  // Initial load + join socket room.
  // v3.2: Always join the dispute room, regardless of dispute status.
  // Previously the admin could not "enter" rooms for disputes that were
  // already RESOLVED or CANCELLED — but the admin still needs to read
  // the chat history of closed disputes, so the socket must be in the
  // room. The chat input itself is hidden when isClosed (see below).
  useEffect(() => {
    load();
    if (disputeId) {
      joinDispute(disputeId);
      return () => leaveDispute(disputeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  // Real-time: receive new messages via socket
  useEffect(() => {
    if (!on) return;
    const off = on("dispute:message", (msg) => {
      if (!msg || msg.dispute_id !== disputeId) return;
      setMessages((prev) => {
        // De-duplicate (in case REST refresh races with socket)
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    });
    return off;
  }, [on, disputeId]);

  // Real-time: typing indicator
  useEffect(() => {
    if (!on) return;
    const off = on("dispute:typing", ({ name }) => {
      setTypingUser(name);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2500);
    });
    return off;
  }, [on]);

  // Update socket status when connection changes
  useEffect(() => {
    setSocketStatus(isConnected ? "live" : "polling");
  }, [isConnected]);

  // Fallback polling (every 15s) — slower now that socket handles live updates
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    const msgText = text;
    setText("");
    // Optimistic: show immediately
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
      fromRole: user.role, fromId: user.id,
      fromName: user.name || user.role, message: msgText,
    });
    // No need to reload — socket will broadcast the persisted version.
    // Remove the optimistic message after a short delay to avoid duplication.
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }, 2000);
  };

  const onTextChange = (v) => {
    setText(v);
    // Throttle typing indicator
    if (socket && disputeId) {
      sendTyping(disputeId, user.name || user.role);
    }
  };

  const upload = async () => {
    if (!files.length) return;
    setSubmitting(true);
    await disputeApi.uploadEvidence(disputeId, { fromId: user.id, fromRole: user.role, files });
    setSubmitting(false);
    setFiles([]);
    setUploadOpen(false);
    load();
  };

  const submitAdmin = async () => {
    setSubmitting(true);
    await disputeApi.adminDecision(user.id, disputeId, adminDecision);
    setSubmitting(false);
    load();
  };

  if (loading || !dispute) return <div className="p-8 text-center text-gray-500">Loading dispute...</div>;

  const isClosed = dispute.status === "RESOLVED" || dispute.status === "CANCELLED";

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="text-sm text-[#a37b3d] mb-3">← Back</button>

      {/* Dispute header */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">Dispute {dispute.dispute_id}</h1>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
              socketStatus === "live" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${socketStatus === "live" ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
              {socketStatus === "live" ? "Live (Socket.io)" : "Polling (15s)"}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
              dispute.status === "OPEN" ? "bg-amber-100 text-amber-800"
              : dispute.status === "UNDER_REVIEW" ? "bg-blue-100 text-blue-800"
              : dispute.status === "RESOLVED" ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
            }`}>{dispute.status}</span>
          </div>
        </div>
        <p className="text-sm text-gray-700">Order: <b>{dispute.order_id}</b></p>
        <p className="text-sm text-gray-700">Type: <b>{dispute.dispute_type}</b></p>
        <p className="text-sm text-gray-700">Title: {dispute.title}</p>
        {dispute.description && <p className="text-sm text-gray-600 mt-1">{dispute.description}</p>}
        {dispute.evidence && dispute.evidence.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-600">EVIDENCE FILES</p>
            <ul className="text-xs">
              {dispute.evidence.map((e, i) => (
                <li key={i}>
                  <a href={`http://localhost:5000/uploads/${e.file_path}`} target="_blank" rel="noreferrer" className="text-[#a37b3d]">
                    📎 {e.original_name} (uploaded by {e.uploaded_by})
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">CHAT ROOM</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No messages yet. Start the conversation.</p>
          ) : messages.map((m, i) => {
            const isMe = m.sender_id === user.id && m.sender_role === user.role;
            return (
              <div key={m._id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-xl px-3 py-2 ${isMe ? "bg-[#a37b3d] text-white" : "bg-gray-100 text-gray-800"}`}>
                  <p className="text-xs font-semibold mb-0.5 opacity-80">[{m.sender_role}] {m.sender_name}</p>
                  <p className="text-sm">{m.message}</p>
                  <p className={`text-xs mt-1 ${isMe ? "text-white/60" : "text-gray-500"}`}>
                    {new Date(m.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUser && (
          <div className="text-xs text-gray-500 italic mt-2 ml-2">
            <span className="inline-flex items-center gap-1">
              {typingUser} is typing
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </span>
          </div>
        )}

        {!isClosed && (
          <div className="border-t border-gray-100 pt-3 mt-3">
            {uploadOpen ? (
              <div className="space-y-2">
                <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files))}
                  className="text-xs" />
                <div className="flex gap-2">
                  <button onClick={() => setUploadOpen(false)} className="flex-1 py-1 border border-gray-200 rounded text-xs">Cancel</button>
                  <button onClick={upload} disabled={submitting || !files.length}
                    className="flex-1 py-1 bg-[#a37b3d] text-white rounded text-xs">Upload</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={text} onChange={e => onTextChange(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="Type a message..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <button onClick={() => setUploadOpen(true)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">📎</button>
                <button onClick={send} className="px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold">Send</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin decision */}
      {user.role === "admin" && !isClosed && (
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">ADMIN DECISION</h2>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setAdminDecision({ ...adminDecision, decision: "RESOLVED" })}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${adminDecision.decision === "RESOLVED" ? "bg-green-600 text-white" : "border border-gray-200"}`}>
              ✓ RESOLVED (original deal stands)
            </button>
            <button onClick={() => setAdminDecision({ ...adminDecision, decision: "CANCELLED" })}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${adminDecision.decision === "CANCELLED" ? "bg-red-600 text-white" : "border border-gray-200"}`}>
              ✗ CANCELLED (seller gets nothing)
            </button>
          </div>
          <textarea placeholder="Admin notes / reason" value={adminDecision.notes}
            onChange={e => setAdminDecision({ ...adminDecision, notes: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2" rows={2} />
          <button onClick={submitAdmin} disabled={submitting}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
            {submitting ? "Submitting..." : `Submit ${adminDecision.decision}`}
          </button>
        </div>
      )}

      {isClosed && (
        <div className={`rounded-2xl p-4 text-center ${dispute.status === "RESOLVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          <p className="font-semibold">This dispute has been {dispute.status}.</p>
          {dispute.admin_notes && <p className="text-xs mt-1">Admin notes: {dispute.admin_notes}</p>}
        </div>
      )}
    </div>
  );
}
