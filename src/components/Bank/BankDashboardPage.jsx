import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import bankApi from "../../api/bankApi";
import { resolveMediaUrl } from "../../lib/openDoc";
import BankRepaymentsPage from "./BankRepaymentsPage";

/**
 * BankDashboardPage — bank officer verification workbench and 24h batch releases to platform.
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
  const [batchesData, setBatchesData] = useState(null);
  const [triggeringBatch, setTriggeringBatch] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");

  useEffect(() => {
    const o = bankApi.getOfficerFromStorage();
    if (!o) { navigate("/bank/login"); return; }
    setOfficer(o);
  }, []);

  const load = async () => {
    if (!officer) return;
    if (filter === "REPAYMENTS") return; // BankRepaymentsPage loads its own data
    if (filter === "BATCH_RELEASES") {
      const bResp = await bankApi.listBatches(officer.token);
      if (bResp.success) setBatchesData(bResp);
    } else {
      const r = await bankApi.listApplications(officer.token, filter);
      if (r.success) { setApps(r.applications); setStats(r.stats); }
    }
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
    const payload = {
      ...decision,
      verification_checks: {
        cnic_match:         checks.cnic_approved,
        identity_confirmed: checks.cnic_approved,
        iban_valid:         checks.bank_verified,
        documents_complete: checks.bank_verified,
      },
    };
    const r = await bankApi.decide(officer.token, active.application_no, payload);
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setMsg(`✓ Application ${r.status}.`);
    setActive(null);
    load();
  };

  const handleTriggerBatch = async () => {
    setTriggeringBatch(true);
    setBatchMsg("");
    const r = await bankApi.triggerBatch(officer.token);
    setTriggeringBatch(false);
    if (r.success) {
      setBatchMsg(`✓ ${r.message}`);
      const bResp = await bankApi.listBatches(officer.token);
      if (bResp.success) setBatchesData(bResp);
    } else {
      setBatchMsg(r.error || "Batch execution failed.");
    }
  };

  const statusColor = (s) => ({
    PENDING_BANK_VERIFICATION: "bg-amber-100 text-amber-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    OFFER_ACCEPTED: "bg-emerald-100 text-emerald-800",
    OFFER_DECLINED: "bg-gray-200 text-gray-700",
    CANCELLED: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100");

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

  const FILTERS = [
    { id: "",                          label: "All Applications" },
    { id: "PENDING_BANK_VERIFICATION", label: "Pending Verification" },
    { id: "APPROVED",                  label: "Approved" },
    { id: "OFFER_ACCEPTED",            label: "Offer Accepted" },
    { id: "REJECTED",                  label: "Rejected" },
    { id: "CANCELLED",                 label: "Cancelled" },
    { id: "BATCH_RELEASES",            label: "📦 24h Batch Releases" },
    { id: "REPAYMENTS",                label: "💳 BNPL Repayments" },
  ];

  if (!officer) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
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

      <div className="max-w-6xl mx-auto p-6 flex gap-6">
        {/* Left sidebar — vertical status filter */}
        <aside className="w-52 shrink-0 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Navigation</p>
          {FILTERS.map(f => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id || "ALL"}
                onClick={() => setFilter(f.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
                }`}
              >
                {f.label}
              </button>
            );
          })}

          <button onClick={load} className="w-full text-xs text-blue-600 mt-3 font-semibold hover:underline">
            ↻ Refresh View
          </button>
        </aside>

        {/* Main content */}
        <main className="flex-1 space-y-4 min-w-0">
          {filter === "REPAYMENTS" ? (
            <BankRepaymentsPage officer={officer} onBack={() => setFilter("PENDING_BANK_VERIFICATION")} />
          ) : filter === "BATCH_RELEASES" ? (
            /* ────────────────── 24H BATCH RELEASES VIEW ────────────────── */
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-blue-300">Total Funds Transferred to Platform</span>
                  <h2 className="text-3xl font-black mt-1">
                    PKR {(batchesData?.total_amount_released || 0).toLocaleString()}
                  </h2>
                  <p className="text-xs text-blue-200/80 mt-1">
                    {batchesData?.total_orders_batched || 0} accepted BNPL orders batched &amp; transferred to Admin Escrow
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTriggerBatch}
                  disabled={triggeringBatch}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <span>⚡</span>
                  {triggeringBatch ? "Processing Batch Transfer..." : "Trigger Batch Release Now"}
                </button>
              </div>

              {batchMsg && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-semibold">
                  {batchMsg}
                </div>
              )}

              {/* ── Day-wise Approved BNPL Orders (Default View) ── */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">BNPL Approved Orders (Day-Wise)</h3>
                    <p className="text-xs text-gray-500 mt-0.5">All customer-accepted installment orders scheduled for batch escrow transfer</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                    {batchesData?.approved_orders?.length || 0} Total Orders
                  </span>
                </div>

                {(!batchesData?.approved_orders || batchesData.approved_orders.length === 0) ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No approved BNPL orders found yet.</p>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const map = {};
                      for (const ord of (batchesData?.approved_orders || [])) {
                        const dStr = new Date(ord.created_at || ord.decision_at || Date.now()).toLocaleDateString([], {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        });
                        if (!map[dStr]) {
                          map[dStr] = {
                            dateStr: dStr,
                            rawDate: new Date(ord.created_at || ord.decision_at || Date.now()),
                            orders: [],
                          };
                        }
                        map[dStr].orders.push(ord);
                      }
                      const dayGroups = Object.values(map).sort((a, b) => b.rawDate - a.rawDate);

                      return dayGroups.map((day) => {
                        const allDone = day.orders.length > 0 && day.orders.every((o) => o.is_transferred || o.batch_id);
                        const dayTotal = day.orders.reduce((sum, o) => sum + (o.amount || 0), 0);

                        return (
                          <div key={day.dateStr} className="border border-gray-200 rounded-2xl overflow-hidden bg-gray-50/40">
                            {/* Day Card Header with Checkmark when all are transferred */}
                            <div className="p-4 bg-white border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <span className="text-base">📅</span>
                                <div>
                                  <h4 className="font-bold text-sm text-gray-900">{day.dateStr}</h4>
                                  <p className="text-[11px] text-gray-500">{day.orders.length} order(s) · PKR {dayTotal.toLocaleString()}</p>
                                </div>
                              </div>

                              <div>
                                {allDone ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <span>✓</span> All Transferred
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    <span>⏳</span> {day.orders.filter((o) => !o.is_transferred).length} Pending Release
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Transfer Style Cards for Orders */}
                            <div className="p-3 grid gap-2 sm:grid-cols-2">
                              {day.orders.map((ord, i) => (
                                <div
                                  key={ord.application_no || i}
                                  className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-xs hover:border-blue-300 transition-all space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-bold text-xs text-gray-900">{ord.buyer_name || "Customer"}</p>
                                      <p className="font-mono text-[10px] text-gray-500 font-medium">Order: {ord.order_id}</p>
                                      <p className="text-[10px] text-gray-400">App: {ord.application_no} · {ord.plan_months}m Plan</p>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-xs font-black text-emerald-700 font-mono block">
                                        PKR {(ord.amount || 0).toLocaleString()}
                                      </span>
                                      <span className="text-[10px] text-gray-400">
                                        {new Date(ord.created_at || ord.decision_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-[10px] text-gray-500">Transfer Status:</span>
                                    {ord.is_transferred || ord.batch_id ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 font-mono">
                                        ✓ Transferred · {ord.batch_id}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200">
                                        ⏳ Queued for Batch
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* ── Executed Batch Releases List ── */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Executed Batch Transfers (Bank → Platform)</h3>
                {(!batchesData?.batches || batchesData.batches.length === 0) ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No batches released yet. Click the trigger button above to process pending accepted applications.</p>
                ) : (
                  <div className="space-y-3">
                    {batchesData.batches.map((b) => (
                      <div key={b.batch_id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 hover:bg-white transition-all">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-blue-900">{b.batch_id}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                                ✓ Transferred
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Date &amp; Time: <strong>{new Date(b.released_at).toLocaleString()}</strong>
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-black text-emerald-700 font-mono">
                              PKR {(b.total_amount || 0).toLocaleString()}
                            </span>
                            <p className="text-[10px] text-gray-500">{b.order_count || (b.orders || []).length} order(s) included</p>
                          </div>
                        </div>

                        <div className="grid gap-1.5 sm:grid-cols-2 mt-2">
                          {(b.orders || []).map((ord, idx) => (
                            <div key={idx} className="bg-white p-2.5 rounded-lg border border-gray-100 text-xs flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-gray-800">{ord.buyer_name || "Customer"}</p>
                                <p className="font-mono text-[10px] text-gray-400">{ord.order_id}</p>
                              </div>
                              <span className="font-bold text-emerald-700 font-mono">
                                PKR {(ord.amount || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ────────────────── APPLICATIONS VERIFICATION VIEW ────────────────── */
            <>
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl shadow p-4">
                    <p className="text-xs text-gray-500">Total Active</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.total ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow p-4">
                    <p className="text-xs text-gray-500">Total Pending</p>
                    <p className="text-2xl font-bold text-amber-600">{stats.pending ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow p-4">
                    <p className="text-xs text-gray-500">Total Approved</p>
                    <p className="text-2xl font-bold text-green-600">{stats.approved ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow p-4">
                    <p className="text-xs text-gray-500">Total Rejected</p>
                    <p className="text-2xl font-bold text-red-600">{stats.rejected ?? 0}</p>
                  </div>
                </div>
              )}

              {/* Time filter */}
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs text-gray-500">Time range:</span>
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
            </>
          )}
        </main>
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
                    <button
                      type="button"
                      onClick={() => {
                        const stored = JSON.parse(localStorage.getItem("ss_bank_officer") || "null");
                        let url = d.url || "";
                        if (url.startsWith("/api/") && stored?.token) {
                          url = `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(stored.token)}`;
                        }
                        window.open(resolveMediaUrl(url), "_blank", "noopener,noreferrer");
                      }}
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded">View</button>
                  </div>
                ))}
              </div>

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
