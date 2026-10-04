import React, { useEffect, useMemo, useState } from "react";
import adminExtApi from "../../api/adminExtApi";

function fmt(n) {
  return `PKR ${Number(n || 0).toLocaleString()}`;
}

export default function AdminBnplRepaymentsPage({ admin }) {
  const adminId = admin?.admin_id || admin?._id || "admin_001";
  const [summary, setSummary] = useState({ total_disbursed: 0, total_recovered: 0, total_outstanding: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [filterBuyer, setFilterBuyer] = useState("");
  const [filterBank, setFilterBank] = useState("");

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filterBuyer.trim()) params.buyer_id = filterBuyer.trim();
    if (filterBank.trim()) params.bank_id = filterBank.trim();
    const r = await adminExtApi.listBnplRepayments(adminId, params);
    setLoading(false);
    if (r.success) {
      setSummary(r.summary || {});
      setRows(r.rows || []);
    }
  };

  useEffect(() => { load(); }, [adminId]);

  const banks = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { if (r.bank_id) m.set(r.bank_id, r.bank_name || r.bank_id); });
    return [...m.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterBank && r.bank_id !== filterBank) return false;
      if (filterBuyer) {
        const q = filterBuyer.toLowerCase();
        const hay = `${r.buyer_name || ""} ${r.buyer_id || ""} ${r.buyer_email || ""}`.toLowerCase();
        if (!hay.includes(q) && r.buyer_id !== filterBuyer) return false;
      }
      return true;
    });
  }, [rows, filterBank, filterBuyer]);

  const openDetail = async (applicationNo) => {
    const r = await adminExtApi.getBnplRepayment(adminId, applicationNo);
    if (r.success) setActive(r.repayment);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">BNPL Repayments</h1>
          <p className="text-sm text-gray-500">Platform-wide view of financed amounts and recovery (read-only)</p>
        </div>
        <button onClick={load} className="text-sm text-[#a37b3d] font-semibold">↻ Refresh</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Disbursed", value: summary.total_disbursed, cls: "text-blue-700" },
          { label: "Total Recovered", value: summary.total_recovered, cls: "text-emerald-700" },
          { label: "Total Outstanding", value: summary.total_outstanding, cls: "text-amber-700" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border p-4 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.cls}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={filterBuyer}
          onChange={(e) => setFilterBuyer(e.target.value)}
          placeholder="Filter by buyer name / id…"
          className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]"
        />
        <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm">
          <option value="">All banks</option>
          {banks.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <button onClick={load} className="px-3 py-2 bg-gray-800 text-white rounded-lg text-sm">Apply</button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-gray-500 text-sm">No BNPL repayments found.</div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-gray-500">
                <th className="px-3 py-3">Buyer</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3">Order</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Monthly</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Remaining</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.application_no} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <p className="font-semibold">{r.buyer_name || r.buyer_id}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{r.application_no}</p>
                  </td>
                  <td className="px-3 py-3">{r.bank_name}</td>
                  <td className="px-3 py-3 font-mono">{r.order_id}</td>
                  <td className="px-3 py-3 text-right font-semibold">{fmt(r.total_amount)}</td>
                  <td className="px-3 py-3 text-right">{fmt(r.monthly_installment)}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{fmt(r.amount_paid)}</td>
                  <td className="px-3 py-3 text-right text-amber-700">{fmt(r.amount_remaining)}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      r.repayment_status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>{r.repayment_status}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => openDetail(r.application_no)}
                      className="px-2 py-1 border rounded-lg font-semibold">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">{active.application_no}</h3>
                <p className="text-xs text-gray-500">{active.buyer_name} · {active.bank_name} · {active.order_id}</p>
              </div>
              <button onClick={() => setActive(null)} className="text-2xl text-gray-400">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Total</p><p className="font-bold">{fmt(active.total_amount)}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Monthly</p><p className="font-bold">{fmt(active.monthly_installment)}</p></div>
              <div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs text-emerald-700">Paid</p><p className="font-bold">{fmt(active.amount_paid)}</p></div>
              <div className="bg-amber-50 rounded-xl p-3"><p className="text-xs text-amber-700">Remaining</p><p className="font-bold">{fmt(active.amount_remaining)}</p></div>
            </div>
            <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Payment history (view-only)</h4>
            {(active.payment_history || []).length === 0 ? (
              <p className="text-xs text-gray-400">No payments yet.</p>
            ) : (
              <div className="space-y-1">
                {active.payment_history.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs border rounded-lg px-2 py-1.5">
                    <span>{new Date(p.paid_at).toLocaleString()}{p.note ? ` · ${p.note}` : ""}</span>
                    <span className="font-bold text-emerald-700">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
