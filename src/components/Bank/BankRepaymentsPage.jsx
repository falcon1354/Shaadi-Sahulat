import React, { useEffect, useState } from "react";
import bankApi from "../../api/bankApi";

function fmt(n) {
  return `PKR ${Number(n || 0).toLocaleString()}`;
}

function statusBadge(s) {
  const map = {
    ACTIVE: "bg-amber-100 text-amber-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
    DEFAULTED: "bg-red-100 text-red-800",
  };
  return map[s] || "bg-gray-100 text-gray-700";
}

/**
 * Banker BNPL Repayments — list, detail, record payment.
 * Rendered as a panel inside BankDashboardPage or standalone.
 */
export default function BankRepaymentsPage({ officer, onBack }) {
  const [summary, setSummary] = useState({ total_disbursed: 0, total_recovered: 0, total_outstanding: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState({ amount: "", paid_at: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!officer?.token) return;
    setLoading(true);
    const r = await bankApi.listRepayments(officer.token);
    setLoading(false);
    if (r.success) {
      setSummary(r.summary || {});
      setRows(r.rows || []);
    }
  };

  useEffect(() => { load(); }, [officer?.token]);

  const openDetail = async (applicationNo) => {
    setMsg("");
    const r = await bankApi.getRepayment(officer.token, applicationNo);
    if (r.success) {
      setActive(r.repayment);
      setForm({
        amount: String(r.repayment.monthly_installment || ""),
        paid_at: new Date().toISOString().slice(0, 10),
        note: "",
      });
    }
  };

  const submitPayment = async () => {
    if (!active) return;
    setSubmitting(true);
    setMsg("");
    const r = await bankApi.recordRepaymentPayment(officer.token, active.application_no, {
      amount: Number(form.amount),
      paid_at: form.paid_at || undefined,
      note: form.note || "",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error || "Failed to record payment"); return; }
    setMsg("✓ Payment recorded");
    setActive(r.repayment);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">BNPL Repayments</h2>
          <p className="text-xs text-gray-500">Track financed amounts and record buyer installments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-sm text-blue-600 font-semibold">↻ Refresh</button>
          {onBack && (
            <button onClick={onBack} className="text-sm px-3 py-1.5 border rounded-lg">← Applications</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Disbursed", value: summary.total_disbursed, color: "text-blue-700" },
          { label: "Total Recovered", value: summary.total_recovered, color: "text-emerald-700" },
          { label: "Total Outstanding", value: summary.total_outstanding, color: "text-amber-700" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-12">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-gray-500 text-sm">
          No active BNPL repayments yet. Approve a BNPL application to start tracking.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-gray-500">
                <th className="px-3 py-3">Buyer</th>
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
              {rows.map((r) => (
                <tr key={r.application_no} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-gray-800">{r.buyer_name || r.buyer_id}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{r.application_no}</p>
                  </td>
                  <td className="px-3 py-3 font-mono">{r.order_id}</td>
                  <td className="px-3 py-3 text-right font-semibold">{fmt(r.total_amount)}</td>
                  <td className="px-3 py-3 text-right">{fmt(r.monthly_installment)}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{fmt(r.amount_paid)}</td>
                  <td className="px-3 py-3 text-right text-amber-700">{fmt(r.amount_remaining)}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${statusBadge(r.repayment_status)}`}>
                      {r.repayment_status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => openDetail(r.application_no)}
                      className="px-2 py-1 bg-blue-600 text-white rounded-lg font-semibold">
                      Open
                    </button>
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
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">{active.application_no}</h3>
                <p className="text-xs text-gray-500">{active.buyer_name} · {active.order_id}</p>
              </div>
              <button onClick={() => setActive(null)} className="text-2xl text-gray-400">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Total financed</p><p className="font-bold">{fmt(active.total_amount)}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Monthly installment</p><p className="font-bold">{fmt(active.monthly_installment)}</p></div>
              <div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs text-emerald-700">Amount paid</p><p className="font-bold text-emerald-800">{fmt(active.amount_paid)}</p></div>
              <div className="bg-amber-50 rounded-xl p-3"><p className="text-xs text-amber-700">Amount remaining</p><p className="font-bold text-amber-800">{fmt(active.amount_remaining)}</p></div>
            </div>

            {active.next_due_date && active.repayment_status === "ACTIVE" && (
              <p className="text-xs text-blue-700 mb-3">Next due: <b>{new Date(active.next_due_date).toLocaleDateString()}</b></p>
            )}

            <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Installment schedule</h4>
            <div className="space-y-1 mb-4 max-h-40 overflow-y-auto">
              {(active.installments || []).map((inst, i) => (
                <div key={i} className="flex justify-between text-xs border rounded-lg px-2 py-1.5">
                  <span>#{i + 1} · {new Date(inst.due_date).toLocaleDateString()}</span>
                  <span className="font-semibold">{fmt(inst.amount)} · {inst.status}</span>
                </div>
              ))}
            </div>

            <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Payment history</h4>
            {(active.payment_history || []).length === 0 ? (
              <p className="text-xs text-gray-400 mb-4">No payments recorded yet.</p>
            ) : (
              <div className="space-y-1 mb-4 max-h-36 overflow-y-auto">
                {active.payment_history.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs border rounded-lg px-2 py-1.5">
                    <span>{new Date(p.paid_at).toLocaleString()}{p.note ? ` · ${p.note}` : ""}</span>
                    <span className="font-bold text-emerald-700">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {active.repayment_status !== "COMPLETED" && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-bold text-gray-800">Record Payment</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Amount received</label>
                    <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Date</label>
                    <input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Note (optional)</label>
                  <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Cash / bank transfer" />
                </div>
                {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
                <button onClick={submitPayment} disabled={submitting}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                  {submitting ? "Saving…" : "Record Payment"}
                </button>
              </div>
            )}
            {active.repayment_status === "COMPLETED" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 font-semibold">
                Fully repaid — no further payments needed.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
