import React, { useState, useEffect } from 'react';
import { useCategories } from '../../hooks/useCategories';
import { getFullBuyerData } from '../../api/buyerApi';
import { 
  Sparkles, DollarSign, Wallet, ArrowUpRight, TrendingUp, Info, HelpCircle, 
  CheckCircle2, ChevronRight, BarChart3, PieChart, AlertCircle, ShoppingBag, 
  Percent, ShieldAlert, ArrowDownRight, Compass
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

export default function FinalProjection({ buyer }) {
  const buyerId = buyer?.buyer_id;
  const { categories } = useCategories();
  const catLabel = (key) =>
    categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');
  
  const catIcon = (key) =>
    categories.find(c => c.category_id === key)?.icon || '📦';

  const [activeTab, setActiveTab] = useState('overview');
  const [dowry, setDowry]         = useState(null);

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

  if (!dowry?.category_budgets) {
    return (
      <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
        <div className="bg-gradient-to-tr from-violet-600 via-purple-600 to-pink-500 rounded-3xl p-8 text-white shadow-xl shadow-purple-500/10 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <h1 className="text-3xl font-black mb-2 flex items-center gap-2">
            <BarChart3 size={32} /> Spending Projection
          </h1>
          <p className="text-purple-100 font-light max-w-xl">
            Live budget forecasting, historical comparison, and real-time tracking metrics.
          </p>
        </div>
        <div className="bg-white/85 backdrop-blur-md rounded-3xl p-16 text-center border border-purple-100/60 shadow-xl shadow-purple-900/[0.02]">
          <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-purple-100">
            <Compass className="animate-pulse" size={40} />
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 mb-2">No Active Estimates Found</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed font-light mb-6">
            To view detailed projections, please initialize the Dowry Budget Estimation process inside your workspace dashboard.
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
  const activeCatCount = activeCats.filter(([, v]) => (v.spent || 0) > 0).length;

  const categoryComparison = activeCats.map(([cat, info]) => ({
    category:  catLabel(cat),
    cat,
    estimated: info.estimated || 0,
    actual:    info.spent     || 0,
    remaining: info.remaining ?? (info.estimated - (info.spent || 0)),
  }));

  const projections = {
    optimistic:  { label: 'Optimistic Track',   total: Math.round(totalEst * 0.70), pct: 70, desc: 'Calculated minimal requirements', color: 'from-emerald-500 to-teal-500' },
    realistic:   { label: 'Realistic Path',    total: Math.round(totalEst * 0.85), pct: 85, desc: 'Standard shopping trajectory', color: 'from-purple-600 to-indigo-600' },
    pessimistic: { label: 'Maximum Limit', total: totalEst,                    pct: 100, desc: 'Complete category consumption', color: 'from-pink-500 to-rose-500' },
  };

  return (
    <div className="animate-fade-in space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-tr from-violet-600 via-purple-600 to-pink-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-500/10 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black mb-1.5 flex items-center gap-2 tracking-tight">
              <BarChart3 size={32} /> Spending Projection
            </h1>
            <p className="text-purple-100 font-light text-sm sm:text-base">
              Synchronized with your real-time Dowry Estimator data.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3 shrink-0 flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl text-purple-600 shadow-sm">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-purple-200">Active Budget</p>
              <p className="text-sm font-black">{formatPKRFull(totalEst)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Allocation</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Wallet size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">{formatPKR(totalEst)}</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded-md w-fit">
            <span>Configured Budget</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Expensed</span>
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center">
              <ShoppingBag size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">{formatPKR(totalSpent)}</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-pink-600 font-bold bg-pink-50 px-2 py-0.5 rounded-md w-fit">
            <ArrowUpRight size={10} />
            <span>{spentPct}% utilized</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
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

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Active Shopping</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Percent size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">{activeCatCount} <span className="text-xs text-gray-400 font-normal">/ {activeCats.length}</span></h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md w-fit">
            <span>Started buying</span>
          </div>
        </div>
      </div>

      {/* Modern Tabs Navigator */}
      <div className="flex gap-1.5 bg-gray-100/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-200/40 w-fit">
        {[
          { id: 'overview',  label: 'Overview',    icon: <CheckCircle2 size={14} /> },
          { id: 'category',  label: 'Categories Breakdown', icon: <BarChart3 size={14} /> },
          { id: 'remaining', label: 'Remaining Cashflow',   icon: <Wallet size={14} /> },
          { id: 'projected', label: 'Smart Projections', icon: <TrendingUp size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-purple-700 shadow-md border border-purple-100/50'
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
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Overall Spending Progress</h2>
              <p className="text-xs text-gray-400 font-light">Calculates aggregate funds spent against the defined target limit.</p>
            </div>
            
            <div className="bg-gray-50/50 p-6 border border-gray-100 rounded-2xl">
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Aggregate progress</span>
                <span className="text-xs font-mono font-black text-purple-700">{spentPct}% Spent</span>
              </div>
              <div className="w-full bg-gray-200/60 rounded-full h-3 overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
            </div>

            <div className="border border-purple-100/40 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="text-left px-5 py-3.5 text-gray-500 font-bold uppercase tracking-wider">Budget Parameter</th>
                    <th className="text-right px-5 py-3.5 text-gray-500 font-bold uppercase tracking-wider">Balance Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { label: 'Total Allocated Budget', val: formatPKRFull(totalEst),    cls: 'text-gray-900 font-extrabold' },
                    { label: 'Total Actual Spending',  val: formatPKRFull(totalSpent),  cls: 'text-purple-600 font-black' },
                    { label: 'Remaining Disposable Funds', val: formatPKRFull(totalRemain), cls: totalRemain < 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black' },
                    { label: 'Remaining Percentage',  val: `${totalEst > 0 ? Math.round((totalRemain / totalEst) * 100) : 0}%`, cls: totalRemain < 0 ? 'text-rose-600' : 'text-emerald-600' },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-purple-50/10 transition-colors">
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
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50 space-y-6">
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
                <div key={idx} className="p-5 bg-gray-50/40 border border-gray-100 rounded-2xl hover:bg-gray-50/90 transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl p-2 bg-white rounded-xl shadow-sm border border-gray-100/50">{icon}</span>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 capitalize">{item.category}</h4>
                        <span className="text-[10px] text-gray-400 font-medium">Tracking category code: {item.cat}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border w-fit ${
                      isOver ? 'bg-rose-50 border-rose-200 text-rose-700' : pct > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>
                      {isOver ? `Over by ${formatPKRFull(item.actual - item.estimated)}` : `${pct}% Used`}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white p-3.5 rounded-xl border border-gray-100/80">
                      <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Allocated Default</p>
                      <p className="text-sm font-black text-purple-600 mt-1">{formatPKRFull(item.estimated)}</p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-gray-100/80">
                      <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Expensed Amount</p>
                      <p className="text-sm font-black text-pink-600 mt-1">{formatPKRFull(item.actual)}</p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-gray-100/80">
                      <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Available Cash</p>
                      <p className={`text-sm font-black mt-1 ${item.remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatPKRFull(item.remaining)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="w-full bg-gray-200/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${isOver ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-600 to-pink-500'}`}
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
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50 space-y-6">
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
                <div key={idx} className="p-5 border border-purple-50/50 rounded-2xl bg-gray-50/20 flex flex-col justify-between">
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

      {/* TAB: Projections */}
      {activeTab === 'projected' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Smart Spending Projections</h2>
              <p className="text-xs text-gray-400 font-light font-medium">Predictive scenarios calculated dynamically using baseline thresholds.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {Object.entries(projections).map(([key, proj]) => {
                const diff = proj.total - totalEst;
                return (
                  <div key={key} className="p-5 border border-gray-100 rounded-2xl bg-gray-50/50 flex flex-col justify-between">
                    <div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-gradient-to-r ${proj.color} mb-3`}>
                        {proj.label}
                      </span>
                      <h4 className="text-sm font-bold text-gray-900 mb-1">{proj.desc}</h4>
                      <p className="text-[10px] text-gray-400 font-medium leading-relaxed">System predicted threshold: {proj.pct}% of limit.</p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-gray-100">
                      <p className="text-xl font-mono font-black text-gray-900">{formatPKRFull(proj.total)}</p>
                      <p className={`text-[10px] font-bold mt-1 ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {diff > 0
                          ? `+${formatPKR(diff)} over target`
                          : `${formatPKR(Math.abs(diff))} under target`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-pink-50 border border-purple-100/60 rounded-3xl p-6 relative overflow-hidden flex items-start gap-4">
            <div className="p-3 bg-white rounded-2xl shadow-inner border border-purple-200 text-purple-600 shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="font-extrabold text-gray-900 text-sm mb-1">Hybrid Projection Recommendation</h4>
              <p className="text-xs text-gray-600 leading-relaxed font-light">
                Based on your current activity ({spentPct}% utilized), we recommend targeting the <strong>{projections.realistic.label}</strong> scenario. Ensure you leverage reallocations if you go over limit in specific categories.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

