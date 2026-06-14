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
        <div className="bg-gradient-to-br from-[#a37b3d] via-[#ECD4A8] to-[#FFF5F8] rounded-3xl p-8 text-[#3d2c12] shadow-xl shadow-[#ECD4A8]/20 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-white/20 rounded-full blur-2xl pointer-events-none" />
          <h1 className="text-3xl font-black mb-2 flex items-center gap-2">
            <BarChart3 size={32} /> Spending Projection
          </h1>
          <p className="text-[#5c4724] font-light max-w-xl">
            Live budget forecasting, historical comparison, and real-time tracking metrics.
          </p>
        </div>
        <div className="bg-white rounded-3xl p-16 text-center border border-[#FBEFF1] shadow-xl">
          <div className="w-20 h-20 bg-[#FFF5F8] text-[#a37b3d] rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-[#FDF2F3]">
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
    realistic:   { label: 'Realistic Path',    total: Math.round(totalEst * 0.85), pct: 85, desc: 'Standard shopping trajectory', color: 'from-[#a37b3d] to-[#ECD4A8]' },
    pessimistic: { label: 'Maximum Limit', total: totalEst,                    pct: 100, desc: 'Complete category consumption', color: 'from-rose-400 to-rose-500' },
  };

  return (
    <div className="animate-fade-in space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-[#a37b3d] via-[#ECD4A8] to-[#FFF5F8] rounded-3xl p-6 sm:p-8 text-[#3d2c12] shadow-xl shadow-[#ECD4A8]/20 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-white/20 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black mb-1.5 flex items-center gap-2 tracking-tight">
              <BarChart3 size={32} /> Spending Projection
            </h1>
            <p className="text-[#5c4724] font-light text-sm sm:text-base">
              Synchronized with your real-time Dowry Estimator data.
            </p>
          </div>
          <div className="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl px-5 py-3 shrink-0 flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl text-[#a37b3d] shadow-sm">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-[#7c6031]">Active Budget</p>
              <p className="text-sm font-black text-[#3d2c12]">{formatPKRFull(totalEst)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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

        <div className="bg-white rounded-3xl p-5 border border-[#FBEFF1] shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
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
                  className="bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] h-2 rounded-full transition-all duration-500"
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
                      className={`h-1.5 rounded-full ${isOver ? 'bg-rose-500' : 'bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8]'}`}
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

      {/* TAB: Projections */}
      {activeTab === 'projected' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1] space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Smart Spending Projections</h2>
              <p className="text-xs text-gray-400 font-light font-medium">Predictive scenarios calculated dynamically using baseline thresholds.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {Object.entries(projections).map(([key, proj]) => {
                const diff = proj.total - totalEst;
                return (
                  <div key={key} className="p-5 border border-[#FBEFF1] rounded-2xl bg-[#FCFBFB] flex flex-col justify-between">
                    <div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-gradient-to-r ${proj.color} mb-3`}>
                        {proj.label}
                      </span>
                      <h4 className="text-sm font-bold text-gray-900 mb-1">{proj.desc}</h4>
                      <p className="text-[10px] text-gray-400 font-medium leading-relaxed">System predicted threshold: {proj.pct}% of limit.</p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-[#FBEFF1]">
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

          <div className="bg-gradient-to-r from-[#FFF5F8] via-[#FCFBFB] to-[#FDF2F3] border border-[#FBEFF1] rounded-3xl p-6 relative overflow-hidden flex items-start gap-4">
            <div className="p-3 bg-white rounded-2xl shadow-inner border border-[#ECD4A8] text-[#a37b3d] shrink-0">
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
