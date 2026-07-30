import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import bankApi from "../../api/bankApi";

/**
 * BankDashboardPage — bank officer verification workbench.
 *
 * Per spec:
 *   - Filters "Past 7 Days" and "Past 24 Hours"
 *   - No duplicate entries per application
 *   - Applications grouped by buyer (one row per buyer, expand to see all)
 *   - Verification Workbench: explicit CNIC Approved + Bank Verified checks
 *   - Approve button disabled until BOTH checks are ticked
 *   - Risk Score REMOVED entirely
 */
export default function BankDashboardPage() {
  const navigate = useNavigate();
  const [officer, setOfficer] = useState(null);
  const [filter, setFilter] = useState("PENDING_BANK_VERIFICATION");
  const [timeFilter, setTimeFilter] = useState("ALL");   // ALL | 24H | 7D
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState(null);
  const [active, setActive] = useState(null);
  const [decision, setDecision] = useState({ decision: "APPROVE", plan_months: 3, reason: "", comment: "" });
  const [checks, setChecks] = useState({ cnic_approved: false, bank_verified: false });
  const [expanded, setExpanded] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const o = bankApi.getOfficerFromStorage();
    if (!o) { navigate("/bank/login"); return; }
    setOfficer(o);
  }, []);

  const load = async () => {
    if (!officer) return;
    const r = await bankApi.listApplications(officer.token, filter);
    if (r.success) { setApps(r.applications); setStats(r.stats); }
  };
  useEffect(() => { load(); }, [officer, filter]);

  const openApp = async (appNo) => {
    setMsg("");
    setChecks({ cnic_approved: false, bank_verified: false });
    const r = await bankApi.getApplication(officer.token, appNo);
    if (r.success) { setActive(r); setDecision({ ...decision, plan_months: r.plan_months }); }
  };

  const submitDecision = async () => {
    setSubmitting(true); setMsg("");
    const r = await bankApi.decide(officer.token, active.application_no, decision);
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setMsg(`✓ Application ${r.status}.`);
    setActive(null);
    load();
  };

  const statusColor = (s) => ({
    PENDING_BANK_VERIFICATION: "bg-amber-100 text-amber-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    OFFER_ACCEPTED: "bg-emerald-100 text-emerald-800",
    OFFER_DECLINED: "bg-gray-200 text-gray-700",
    CANCELLED: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100");

  // Time-based filter + dedup by application_no
  const filteredApps = useMemo(() => {
    const seen = new Set();
    const unique = [];
    for (const a of apps) {
      if (!seen.has(a.application_no)) { seen.add(a.application_no); unique.push(a); }
    }
    if (timeFilter === "ALL") return unique;
    const cutoff = Date.now() - (timeFilter === "24H" ? 24 * 3600e3 : 7 * 24 * 3600e3);
    return unique.filter(a => new Date(a.created_at).getTime() >= cutoff);
  }, [apps, timeFilter]);

  // Group by buyer
  const grouped = useMemo(() => {
    const map = {};
    for (const a of filteredApps) {
      const key = a.buyer_id || a.buyer_name || "unknown";
      if (!map[key]) map[key] = { buyer_name: a.buyer_name, buyer_id: a.buyer_id, items: [] };
      map[key].items.push(a);
    }
    return Object.values(map).map(g => ({
      ...g,
      counts: g.items.reduce((acc, a) => {
        acc.total++;
        if (a.status === "PENDING_BANK_VERIFICATION") acc.pending++;
        else if (a.status === "APPROVED" || a.status === "OFFER_ACCEPTED") acc.approved++;
        else if (a.status === "REJECTED" || a.status === "OFFER_DECLINED" || a.status === "CANCELLED") acc.rejected++;
        return acc;
      }, { total: 0, pending: 0, approved: 0, rejected: 0 }),
    }));
  }, [filteredApps]);

  const canApprove = decision.decision === "REJECT" || (checks.cnic_approved && checks.bank_verified);

  if (!officer) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏦</span>
          <div>
            <h1 className="text-lg font-bold">Dummy Bank — Verification Dashboard</h1>
            <p className="text-xs text-blue-200">Officer: {officer.email}</p>
          </div>
        </div>
        <button onClick={() => { bankApi.clearOfficerFromStorage(); navigate("/"); }}
          className="text-sm bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded-lg">
          Logout
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">Completed Today</p>
              <p className="text-2xl font-bold text-blue-600">{stats.completed_today}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">Approved Today</p>
              <p className="text-2xl font-bold text-green-600">{stats.approved_today}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-xs text-gray-500">Rejected Today</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected_today}</p>
            </div>
          </div>
        )}

        {/* Status filter */}
        <div className="flex gap-2 mb-2">
          {["PENDING_BANK_VERIFICATION", "APPROVED", "REJECTED", ""].map(s => (
            <button key={s || "ALL"} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === s ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
              {s ? s.replace(/_/g, " ") : "ALL"}
            </button>
          ))}
          <button onClick={load} className="ml-auto text-xs text-blue-600">↻ Refresh</button>
        </div>

        {/* Time filter */}
        <div className="flex gap-2 mb-4">
          <span className="text-xs text-gray-500 self-center">Time range:</span>
          {[{ id: "ALL", l: "All Time" }, { id: "24H", l: "Past 24 Hours" }, { id: "7D", l: "Past 7 Days" }].map(t => (
            <button key={t.id} onClick={() => setTimeFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${timeFilter === t.id ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Grouped-by-buyer list */}
        <div className="grid gap-3">
          {grouped.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">No applications.</div>
          ) : grouped.map(g => {
            const key = g.buyer_id || g.buyer_name;
            const isOpen = expanded[key];
            return (
              <div key={key} className="bg-white rounded-xl shadow">
                <div className="p-4 flex items-center justify-between cursor-pointer"
                     onClick={() => setExpanded(s => ({ ...s, [key]: !s[key] }))}>
                  <div>
                    <p className="font-semibold text-gray-800">👤 {g.buyer_name || g.buyer_id}</p>
                    <p className="text-xs text-gray-500">
                      {g.counts.total} application(s) · 🟡 {g.counts.pending} pending · ✅ {g.counts.approved} approved · ❌ {g.counts.rejected} rejected
                    </p>
                  </div>
                  <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div className="border-t border-gray-100 p-3 space-y-2">
                    {g.items.map(a => (
                      <div key={a.application_no} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{a.application_no}</p>
                          <p className="text-xs text-gray-500">{a.bank_name} • PKR {a.amount.toLocaleString()} • {a.plan_months} months • CNIC: {a.cnic_masked || "—"}</p>
                          <p className="text-xs text-gray-400">Submitted: {new Date(a.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(a.status)}`}>{a.status}</span>
                          <button onClick={(e) => { e.stopPropagation(); openApp(a.application_no); }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-semibold">
                            Verify Now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verification modal */}
      {active && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setActive(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Verification Workbench — {active.application_no}</h2>
              <button onClick={() => setActive(null)} className="text-gray-400 text-2xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-gray-600 mb-2">APPLICANT</h3>
                <p className="text-sm"><b>Name:</b> {active.buyer.name}</p>
                <p className="text-sm"><b>Email:</b> {active.buyer.email}</p>
                <p className="text-sm"><b>Phone:</b> {active.buyer.phone}</p>
                <p className="text-sm"><b>Address:</b> {active.buyer.address}</p>
                <p className="text-sm"><b>CNIC (plain):</b> <span className="font-mono">{active.buyer.cnic_plain || "—"}</span></p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-gray-600 mb-2">BANK</h3>
                <p className="text-sm"><b>Bank:</b> {active.bank?.name}</p>
                <p className="text-sm"><b>IBAN (plain):</b> <span className="font-mono">{active.iban_plain}</span></p>
                <p className="text-sm"><b>Account Title:</b> {active.account_title}</p>
                <p className="text-sm"><b>Amount:</b> PKR {active.amount.toLocaleString()}</p>
                <p className="text-sm"><b>Plan:</b> {active.plan_months} months</p>
              </div>
            </div>

            <div className={`rounded-xl p-3 mb-4 ${active.ocr_vs_buyer?.mismatch ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
              <h3 className="text-xs font-semibold mb-1">OCR vs BUYER CNIC</h3>
              <p className="text-xs">Buyer-entered: <span className="font-mono">{active.ocr_vs_buyer?.buyer_entered_cnic || "—"}</span></p>
              <p className="text-xs">OCR-extracted: <span className="font-mono">{active.ocr_vs_buyer?.ocr_extracted_cnic || "—"}</span></p>
              <p className={`text-xs mt-1 font-semibold ${active.ocr_vs_buyer?.mismatch ? "text-red-700" : "text-green-700"}`}>
                {active.ocr_vs_buyer?.note}
              </p>
            </div>

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">DOCUMENTS + EXPLICIT CHECKS</h3>
              <div className="grid gap-2">
                {active.documents?.map(d => (
                  <div key={d._id} className="border border-gray-200 rounded-lg p-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{d.doc_type} — {d.original_name}</p>
                      {d.ocr_extracted_cnic && <p className="text-xs text-gray-500">OCR CNIC: <span className="font-mono">{d.ocr_extracted_cnic}</span> ({Math.round((d.ocr_confidence || 0) * 100)}%)</p>}
                      {d.ocr_error && <p className="text-xs text-amber-700">OCR error: {d.ocr_error}</p>}
                    </div>
                    <a href={`http://localhost:5000${d.url}`} target="_blank" rel="noreferrer"
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded">View</a>
                  </div>
                ))}
              </div>

              {/* Explicit approvals — MUST be ticked to Approve */}
              {active.status === "PENDING_BANK_VERIFICATION" && (
                <div className="mt-3 space-y-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={checks.cnic_approved}
                      onChange={e => setChecks({ ...checks, cnic_approved: e.target.checked })} />
                    <span className={checks.cnic_approved ? "text-green-700 font-semibold" : "text-gray-700"}>
                      I have verified the CNIC identity document
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={checks.bank_verified}
                      onChange={e => setChecks({ ...checks, bank_verified: e.target.checked })} />
                    <span className={checks.bank_verified ? "text-green-700 font-semibold" : "text-gray-700"}>
                      I have verified the bank account details
                    </span>
                  </label>
                  {!canApprove && decision.decision === "APPROVE" && (
                    <p className="text-xs text-red-600">⚠ Both checks required before Approve is enabled.</p>
                  )}
                </div>
              )}
            </div>

            {active.status === "PENDING_BANK_VERIFICATION" && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold mb-2">DECISION</h3>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setDecision({ ...decision, decision: "APPROVE" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold ${decision.decision === "APPROVE" ? "bg-green-600 text-white" : "border border-gray-200"}`}>
                    ✓ APPROVE
                  </button>
                  <button onClick={() => setDecision({ ...decision, decision: "REJECT" })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold ${decision.decision === "REJECT" ? "bg-red-600 text-white" : "border border-gray-200"}`}>
                    ✗ REJECT
                  </button>
                </div>
                {decision.decision === "APPROVE" && (
                  <div className="mb-3">
                    <label className="text-xs">Plan Months</label>
                    <select value={decision.plan_months} onChange={e => setDecision({ ...decision, plan_months: parseInt(e.target.value, 10) })}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm">
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                    </select>
                  </div>
                )}
                <textarea placeholder={decision.decision === "APPROVE" ? "Approval comment" : "Rejection reason"}
                  value={decision.decision === "APPROVE" ? decision.comment : decision.reason}
                  onChange={e => decision.decision === "APPROVE"
                    ? setDecision({ ...decision, comment: e.target.value })
                    : setDecision({ ...decision, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2" rows={2} />
                {msg && <p className="text-red-600 text-xs mb-2">{msg}</p>}
                <button onClick={submitDecision} disabled={submitting || !canApprove}
                  className={`w-full py-2 rounded-lg text-sm font-semibold text-white ${canApprove ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"}`}>
                  {submitting ? "Submitting..." : `SUBMIT ${decision.decision}`}
                </button>
              </div>
            )}

            {active.offer && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-blue-800 mb-1">EXISTING OFFER</h3>
                <p className="text-xs">Offer #: {active.offer.offer_no} • Status: {active.offer.status}</p>
                <p className="text-xs">Approved: PKR {active.offer.approved_amount.toLocaleString()} • Monthly: PKR {active.offer.monthly_installment.toLocaleString()}</p>
                <p className="text-xs">Valid until: {new Date(active.offer.valid_until).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
