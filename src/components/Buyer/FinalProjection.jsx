import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, Legend
} from 'recharts';
import { useCategories } from '../../hooks/useCategories';
import { getFullBuyerData } from '../../api/buyerApi';
import orderApi from '../../api/orderApi';
import bnplApi from '../../api/bnplApi';
import {
  Sparkles, DollarSign, Wallet, ArrowUpRight, Info, HelpCircle,
  CheckCircle2, ChevronRight, BarChart3, PieChart as PieIcon, AlertCircle, ShoppingBag,
  ShieldAlert, ArrowDownRight, Compass, Receipt, CreditCard, Calendar
} from 'lucide-react';

function readDowry(buyerId) {
  try {
    if (buyerId) return JSON.parse(localStorage.getItem(`ss_dowry_${buyerId}`) || 'null');
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

const formatPKR = (v) => {
  if (v >= 1000000) return `PKR ${(v / 1000000).toFixed(2)}M`;
  if (v >= 1000)    return `PKR ${(v / 1000).toFixed(0)}K`;
  return `PKR ${v}`;
};

const formatPKRFull = (v) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(v);

const CHART_COLORS = ['#a37b3d', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#14b8a6'];

export default function FinalProjection({ buyer }) {
  const buyerId = buyer?.buyer_id;
  const { categories } = useCategories();
  const catLabel = (key) =>
    categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');
  
  const catIcon = (key) =>
    categories.find(c => c.category_id === key)?.icon || '📦';

  const [activeTab, setActiveTab] = useState('overview');
  const [dowry, setDowry]         = useState(null);

  // Purchase History state
  const [orders, setOrders]             = useState([]);
  const [bnplApps, setBnplApps]         = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'this_month' | 'last_month'
  const [historyPage, setHistoryPage]   = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  // Mount: load from localStorage, seed from MongoDB if empty
  useEffect(() => {
    const local = readDowry(buyerId);
    if (local) { setDowry(local); return; }
    if (!buyerId) return;

    getFullBuyerData(buyerId).then(res => {
      if (!res?.success || !res.dowry_estimation) return;
      const est     = res.dowry_estimation;
      const budgets = est.category_budgets;
      if (!budgets || !Object.keys(budgets).length) return;
      const total   = Object.values(budgets).reduce((s, v) => s + (v?.estimated || 0), 0);
      const payload = {
        estimation_id:    est._id,
        total_budget:     total || est.total_recommended_budget,
        category_budgets: budgets,
        saved_at:         est.updated_at || est.created_at || new Date().toISOString(),
      };
      const s = JSON.stringify(payload);
      localStorage.setItem(`ss_dowry_${buyerId}`, s);
      localStorage.setItem('ss_dowry_latest', s);
      setDowry(payload);
    }).catch(() => {});
  }, [buyerId]);

  // Re-read when any component shifts budget
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail?.buyerId || e.detail.buyerId === buyerId) {
        setDowry(readDowry(buyerId));
      }
    };
    window.dispatchEvent(new CustomEvent('dowry-updated', { detail: { buyerId } }));
    window.addEventListener('dowry-updated', handler);
    return () => window.removeEventListener('dowry-updated', handler);
  }, [buyerId]);

  // Fetch buyer orders + BNPL apps (for the Purchase History section)
  useEffect(() => {
    if (!buyerId) return;
    orderApi.listBuyerOrders(buyerId, { page: 1, limit: 100 }).then(r => {
      setOrders(r.success ? r.orders : []);
    }).catch(() => {});
    bnplApi.listMyApplications(buyerId).then(r => {
      setBnplApps(r.success ? r.applications : []);
    }).catch(() => {});
  }, [buyerId]);

  // Build the Purchase History entries — completed/delivered PAID orders,
  // expanded to one row per paid BNPL installment where the offer letter
  // exposes the installments array.
  const bnplAppByOrderId = useMemo(() => {
    const m = new Map();
    bnplApps.forEach(a => { if (a.order_id) m.set(a.order_id, a); });
    return m;
  }, [bnplApps]);

  const purchaseHistory = useMemo(() => {
    const completedStatuses = ['COMPLETED', 'DELIVERED'];
    const rows = [];
    orders.forEach(o => {
      // Only completed/delivered orders with PAID payment status
      if (!completedStatuses.includes(o.status)) return;
      if (o.payment_status !== 'PAID') return;
      const productLabel =
        (o.items?.[0]?.title || 'Order') + (o.items?.length > 1 ? ` +${o.items.length - 1}` : '');
      const paidAt =
        (o.timeline || []).slice().reverse().find(t => (t.status || '').toUpperCase() === 'PAID')?.at ||
        o.delivered_at ||
        o.created_at;

      // If BNPL order has a matching application whose offer carries
      // installments, expand to one row per PAID installment.
      const bnplApp = o.payment_method === 'BNPL' && o.bnpl_application_id
        ? bnplAppByOrderId.get(o.order_id)
        : null;
      const installments = bnplApp?.offer?.installments;
      if (Array.isArray(installments) && installments.length > 0) {
        installments.forEach((inst, idx) => {
          if ((inst.status || '').toUpperCase() !== 'PAID') return;
          rows.push({
            id:         `${o.order_id}-inst-${idx + 1}`,
            orderId:    o.order_id,
            product:    productLabel,
            date:       inst.paid_at || paidAt,
            amount:     inst.amount || 0,
            method:     'BNPL',
            methodNote: `Installment ${idx + 1} of ${installments.length}`,
          });
        });
      } else {
        rows.push({
          id:         o.order_id,
          orderId:    o.order_id,
          product:    productLabel,
          date:       paidAt,
          amount:     o.total_amount || 0,
          method:     o.payment_method,
          methodNote: o.payment_method === 'BNPL' ? 'BNPL plan' : 'Cash on Delivery',
        });
      }
    });
    // Most recent first
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    return rows;
  }, [orders, bnplAppByOrderId]);

  // Date filter + pagination on the history rows
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return purchaseHistory;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based
    return purchaseHistory.filter(r => {
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return false;
      if (historyFilter === 'this_month')  return d.getFullYear() === y && d.getMonth() === m;
      if (historyFilter === 'last_month') {
        const lm = m === 0 ? 11 : m - 1;
        const ly = m === 0 ? y - 1 : y;
        return d.getFullYear() === ly && d.getMonth() === lm;
      }
      return true;
    });
  }, [purchaseHistory, historyFilter]);

  const lifetimeTotalSpent = useMemo(
    () => purchaseHistory.reduce((s, r) => s + (r.amount || 0), 0),
    [purchaseHistory]
  );
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const historyPaged = filteredHistory.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );
  // Reset page when filter changes
  useEffect(() => { setHistoryPage(1); }, [historyFilter]);

  if (!dowry?.category_budgets) {
    return (
      <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
        <div className="bg-gradient-to-tr from-[#1a0a1e] via-[#2d2d44] to-[#3d3455] rounded-3xl p-8 text-white shadow-xl relative overflow-hidden border border-white/10">
          <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-slate-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide mb-3">
            <span>👰</span> Buyer Portal · Dashboard
          </div>
          <h1 className="text-3xl font-black mb-2 flex items-center gap-2 bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent">
            <BarChart3 size={32} className="text-white" /> Dashboard & Analytics
          </h1>
          <p className="bg-gradient-to-r from-slate-300 via-purple-200 to-pink-200 bg-clip-text text-transparent font-light max-w-xl">
            Live budget analytics, category charts, and real-time tracking metrics.
          </p>
        </div>
        <div className="bg-white rounded-3xl p-16 text-center border border-[#FBEFF1] shadow-xl">
          <div className="w-20 h-20 bg-[#FFF5F8] text-[#a37b3d] rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-[#FDF2F3]">
            <Compass className="animate-pulse" size={40} />
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 mb-2">No Active Estimates Found</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed font-light mb-6">
            To view detailed dashboard analytics, please initialize the Dowry Budget Estimation process inside the Budget Estimator tool.
          </p>
        </div>
      </div>
    );
  }

  const catBudgets  = dowry.category_budgets;
  const dbCatIds    = categories.map(c => c.category_id);
  const activeCats  = Object.entries(catBudgets).filter(
    ([key, v]) => v.active !== false && (dbCatIds.length === 0 || dbCatIds.includes(key))
  );

  const totalEst    = activeCats.reduce((s, [, v]) => s + (v.estimated || 0), 0);
  const totalSpent  = activeCats.reduce((s, [, v]) => s + (v.spent || 0), 0);
  const totalRemain = activeCats.reduce((s, [, v]) => s + (v.remaining ?? (v.estimated - (v.spent || 0))), 0);
  const spentPct    = totalEst > 0 ? Math.round((totalSpent / totalEst) * 100) : 0;

  // Bar-chart data — keep ALL active categories so the comparison grid
  // shows the full picture (including any unspent-but-allocated cats).
  const chartData = activeCats.map(([cat, info]) => ({
    name: catLabel(cat),
    Estimated: info.estimated || 0,
    Spent: info.spent || 0,
    Remaining: Math.max(0, info.remaining ?? ((info.estimated || 0) - (info.spent || 0))),
  }));

  // Pie-chart data + Category Breakdown + Remaining Cashflow sections must
  // ONLY show categories that have actually been allocated a budget via the
  // "Reallocate Budget Between Categories" flow. Zero-allocated cats are
  // hidden from these views (per spec).
  const rawChartData = activeCats.map(([cat, info]) => ({
    name: catLabel(cat),
    Estimated: info.estimated || 0,
    Spent: info.spent || 0,
    Remaining: Math.max(0, info.remaining ?? ((info.estimated || 0) - (info.spent || 0))),
  }));
  const pieChartData = rawChartData.filter(item => item.Estimated > 0 || item.Spent > 0);

  const categoryComparison = activeCats
    .filter(([, info]) => (info.estimated || 0) > 0 || (info.spent || 0) > 0)
    .map(([cat, info]) => ({
      category:  catLabel(cat),
      cat,
      estimated: info.estimated || 0,
      actual:    info.spent     || 0,
      remaining: info.remaining ?? (info.estimated - (info.spent || 0)),
    }));

  return (
    <div className="animate-fade-in space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-tr from-[#1a0a1e] via-[#2d2d44] to-[#3d3455] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-white/10">
        <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-slate-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide mb-3">
              <span>👰</span> Buyer Portal · Dashboard
            </div>
            <h1 className="text-3xl font-black mb-1.5 flex items-center gap-2 tracking-tight">
              <span className="bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
                <BarChart3 size={32} className="text-white" /> Dashboard Analytics
              </span>
            </h1>
            <p className="bg-gradient-to-r from-slate-300 via-purple-200 to-pink-200 bg-clip-text text-transparent font-light text-sm sm:text-base">
              Synchronized with your real-time Dowry Estimator data and purchase history.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3 shrink-0 flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl text-white shadow-sm">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Active Budget</p>
              <p className="text-sm font-black text-white">{formatPKRFull(totalEst)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-3xl p-5 border border-[#FBEFF1] shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Allocation</span>
            <div className="w-8 h-8 rounded-xl bg-[#FFF5F8] text-[#a37b3d] flex items-center justify-center">
              <Wallet size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">{formatPKR(totalEst)}</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-[#a37b3d] font-bold bg-[#FFF5F8] px-2 py-0.5 rounded-md w-fit">
            <span>Configured Budget</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#FBEFF1] shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Expensed</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
              <ShoppingBag size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">{formatPKR(totalSpent)}</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md w-fit">
            <ArrowUpRight size={10} />
            <span>{spentPct}% utilized</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#FBEFF1] shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Remaining Balance</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <h3 className={`text-xl font-black ${totalRemain < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {formatPKR(totalRemain)}
          </h3>
          <div className={`flex items-center gap-1 mt-2 text-[10px] font-bold px-2 py-0.5 rounded-md w-fit ${
            totalRemain < 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'
          }`}>
            {totalRemain < 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            <span>{totalRemain < 0 ? 'Over limit' : 'Safe zone'}</span>
          </div>
        </div>
      </div>

      {/* Modern Tabs Navigator */}
      <div className="flex gap-1.5 bg-gray-100/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-200/40 w-fit">
        {[
          { id: 'overview',  label: 'Overview',    icon: <CheckCircle2 size={14} /> },
          { id: 'category',  label: 'Categories Breakdown', icon: <BarChart3 size={14} /> },
          { id: 'remaining', label: 'Remaining Cashflow',   icon: <Wallet size={14} /> },
          { id: 'history',   label: 'Purchase History',     icon: <Receipt size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-[#a37b3d] shadow-md border border-[#FBEFF1]'
                : 'text-gray-500 hover:text-gray-950 hover:bg-white/40'
            }`}>
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Visual Charts Container */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart: Estimated vs Spent — scrollable so all categories stay reachable */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#FBEFF1]">
              <h3 className="text-base font-extrabold text-gray-900 mb-1">Category Budget vs Expenditure</h3>
              <p className="text-xs text-gray-400 mb-4">Comparison of estimated vs actual spent per category</p>
              <div className="overflow-y-auto max-h-96 w-full pr-1">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip formatter={(value) => `PKR ${value.toLocaleString()}`} />
                      <Bar dataKey="Estimated" fill="#ECD4A8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Spent" fill="#a37b3d" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Pie Chart: Category Budget Share — only categories with an allocated amount */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#FBEFF1]">
              <h3 className="text-base font-extrabold text-gray-900 mb-1">Category Allocation Distribution</h3>
              <p className="text-xs text-gray-400 mb-4">Percentage share of total budget across categories</p>
              <div className="h-64 w-full">
                {pieChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 text-center px-4">
                    Allocate a budget to one or more categories via the Dowry Budget Estimator to see the distribution.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="Estimated"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={2}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `PKR ${value.toLocaleString()}`} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1] space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Overall Spending Progress</h2>
              <p className="text-xs text-gray-400 font-light">Calculates aggregate funds spent against the defined target limit.</p>
            </div>
            
            <div className="bg-[#FCFBFB] p-6 border border-[#FBEFF1] rounded-2xl">
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Aggregate progress</span>
                <span className="text-xs font-mono font-black text-[#a37b3d]">{spentPct}% Spent</span>
              </div>
              <div className="w-full bg-gray-200/60 rounded-full h-3 overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-violet-600 to-purple-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
            </div>

            <div className="border border-[#FBEFF1] rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#FCFBFB] border-b border-[#FBEFF1]">
                    <th className="text-left px-5 py-3.5 text-gray-500 font-bold uppercase tracking-wider">Budget Parameter</th>
                    <th className="text-right px-5 py-3.5 text-gray-500 font-bold uppercase tracking-wider">Balance Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FBEFF1]">
                  {[
                    { label: 'Total Allocated Budget', val: formatPKRFull(totalEst),    cls: 'text-gray-900 font-extrabold' },
                    { label: 'Total Actual Spending',  val: formatPKRFull(totalSpent),  cls: 'text-[#a37b3d] font-black' },
                    { label: 'Remaining Disposable Funds', val: formatPKRFull(totalRemain), cls: totalRemain < 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black' },
                    { label: 'Remaining Percentage',  val: `${totalEst > 0 ? Math.round((totalRemain / totalEst) * 100) : 0}%`, cls: totalRemain < 0 ? 'text-rose-600' : 'text-emerald-600' },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-[#FCFBFB] transition-colors">
                      <td className="px-5 py-3.5 text-gray-700 font-semibold">{row.label}</td>
                      <td className={`text-right px-5 py-3.5 font-mono ${row.cls}`}>{row.val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: By Category */}
      {activeTab === 'category' && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1] space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Estimated vs Actual Category Spending</h2>
            <p className="text-xs text-gray-400 font-light font-medium">Detailed category metrics highlighting budget headroom vs current expenditure.</p>
          </div>
          
          <div className="space-y-6">
            {categoryComparison.map((item, idx) => {
              const pct    = item.estimated > 0 ? Math.min(100, Math.round((item.actual / item.estimated) * 100)) : 0;
              const isOver = item.actual > item.estimated;
              const icon   = catIcon(item.cat);
              return (
                <div key={idx} className="p-5 bg-[#FCFBFB] border border-[#FBEFF1] rounded-2xl hover:bg-[#FFF5F8]/50 transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl p-2 bg-white rounded-xl shadow-sm border border-[#FBEFF1]">{icon}</span>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 capitalize">{item.category}</h4>
                        <span className="text-[10px] text-gray-400 font-medium">Tracking category code: {item.cat}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border w-fit ${
                      isOver ? 'bg-rose-50 border-rose-200 text-rose-700' : pct > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>
                      {isOver ? `Over by ${formatPKRFull(item.actual - item.estimated)}` : `${pct}% Used`}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white p-3.5 rounded-xl border border-[#FBEFF1]">
                      <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Allocated Default</p>
                      <p className="text-sm font-black text-[#a37b3d] mt-1">{formatPKRFull(item.estimated)}</p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-[#FBEFF1]">
                      <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Expensed Amount</p>
                      <p className="text-sm font-black text-rose-500 mt-1">{formatPKRFull(item.actual)}</p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-[#FBEFF1]">
                      <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Available Cash</p>
                      <p className={`text-sm font-black mt-1 ${item.remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatPKRFull(item.remaining)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="w-full bg-gray-200/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${isOver ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-600 to-purple-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: Remaining */}
      {activeTab === 'remaining' && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1] space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Cashflow Headroom</h2>
            <p className="text-xs text-gray-400 font-light font-medium">Available balance leftovers remaining in each custom category.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categoryComparison.map((item, idx) => {
              const pctUsed   = item.estimated > 0 ? Math.min(100, Math.round((item.actual / item.estimated) * 100)) : 0;
              const isOver    = item.remaining < 0;
              const icon      = catIcon(item.cat);
              return (
                <div key={idx} className="p-5 border border-[#FBEFF1] rounded-2xl bg-[#FCFBFB] flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{icon}</span>
                      <span className="text-xs font-bold text-gray-800 capitalize">{item.category}</span>
                    </div>
                    <span className={`text-xs font-mono font-black ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatPKRFull(item.remaining)}
                    </span>
                  </div>
                  
                  <div className="w-full bg-gray-200/50 rounded-full h-1.5 overflow-hidden mb-2">
                    <div
                      className={`h-1.5 rounded-full ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.max(0, 100 - pctUsed)}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[9px] text-gray-400 font-medium">
                    <span>{isOver ? 'Limits exceeded' : `${100 - pctUsed}% Cash Free`}</span>
                    <span>Total: {formatPKR(item.estimated)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: Purchase History */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Lifetime total stat */}
          <div className="bg-gradient-to-tr from-[#1a0a1e] via-[#2d2d44] to-[#3d3455] rounded-3xl p-6 text-white shadow-md border border-white/10 relative overflow-hidden">
            <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-48 h-48 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/15 rounded-2xl text-white shadow-sm">
                  <Receipt size={22} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Lifetime Total Spent</p>
                  <p className="text-2xl font-black">{formatPKRFull(lifetimeTotalSpent)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Calendar size={14} className="text-slate-300" />
                <span className="text-slate-300">
                  {filteredHistory.length} payment{filteredHistory.length === 1 ? '' : 's'}
                  {historyFilter === 'all' ? ' · all time' : historyFilter === 'this_month' ? ' · this month' : ' · last month'}
                </span>
              </div>
            </div>
          </div>

          {/* Date filter + table */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#FBEFF1] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 mb-0.5">Completed Payments</h3>
                <p className="text-xs text-gray-400">Only delivered &amp; paid orders. BNPL installments shown individually when available.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-semibold">Filter:</label>
                <select
                  value={historyFilter}
                  onChange={e => setHistoryFilter(e.target.value)}
                  className="px-3 py-1.5 border border-[#FBEFF1] rounded-lg text-xs bg-white text-gray-700 font-semibold focus:outline-none focus:border-[#a37b3d]"
                >
                  <option value="all">All Time</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                </select>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-5xl mb-3">🧾</div>
                <p className="text-sm text-gray-500 font-medium">No completed payments in this period.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#FCFBFB] border-b border-[#FBEFF1] text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                        <th className="text-left px-4 py-3">Product</th>
                        <th className="text-left px-4 py-3">Date / Time Paid</th>
                        <th className="text-right px-4 py-3">Amount</th>
                        <th className="text-right px-4 py-3">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FBEFF1]">
                      {historyPaged.map(row => (
                        <tr key={row.id} className="hover:bg-[#FFF5F8]/40 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800 truncate max-w-[260px]">{row.product}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{row.orderId}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {row.date ? new Date(row.date).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                            PKR {(row.amount || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md ${
                              row.method === 'BNPL'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              <CreditCard size={11} />
                              {row.method}
                            </span>
                            {row.methodNote && row.methodNote !== row.method && (
                              <p className="text-[10px] text-gray-500 mt-1">{row.methodNote}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      disabled={historyPage === 1}
                      onClick={() => setHistoryPage(p => p - 1)}
                      className="px-3 py-1 rounded-lg border text-xs disabled:opacity-40 hover:bg-[#FFF5F8]"
                    >←</button>
                    <span className="text-xs text-gray-600">Page {historyPage} / {historyTotalPages}</span>
                    <button
                      disabled={historyPage === historyTotalPages}
                      onClick={() => setHistoryPage(p => p + 1)}
                      className="px-3 py-1 rounded-lg border text-xs disabled:opacity-40 hover:bg-[#FFF5F8]"
                    >→</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
