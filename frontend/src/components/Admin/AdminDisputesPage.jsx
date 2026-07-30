import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import adminExtApi from "../../api/adminExtApi";

/**
 * AdminDisputesPage — list all disputes + jump to chat room for decision.
 */
const STATUS_COLOR = {
  OPEN: "bg-amber-100 text-amber-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function AdminDisputesPage({ admin }) {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!admin) return;
    const adminId = admin.admin_id || admin._id;
    const r = await adminExtApi.listDisputes(adminId);
    setDisputes(r.success ? r.disputes : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [admin]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Disputes</h1>
          <p className="text-sm text-gray-500 mt-1">All open and closed disputes — admin reviews and decides</p>
        </div>
        <button onClick={load} className="text-sm text-[#a37b3d]">↻ Refresh</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : disputes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-500">No disputes filed.</div>
      ) : (
        <div className="grid gap-3">
          {disputes.map(d => (
            <div key={d.dispute_id} className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{d.dispute_id} — {d.title}</p>
                <p className="text-xs text-gray-500">
                  Order: {d.order_id} • Buyer: {d.buyer_id} • Seller: {d.seller_id} • Type: {d.dispute_type}
                </p>
                <p className="text-xs text-gray-400">Opened: {new Date(d.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLOR[d.status]}`}>{d.status}</span>
                <button
                  onClick={() => navigate(`/disputes/${d.dispute_id}`)}
                  className="px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-lg font-semibold"
                >
                  Open Chat & Decide
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
