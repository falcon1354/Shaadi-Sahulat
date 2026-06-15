import React, { useState, useEffect, useMemo } from 'react';
import { Gem, Hand, Banknote, Heart, TrendingUp, Eye, Wallet, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Sparkles, CheckCircle2, ChevronRight, Clock, Trash2, ShoppingBag } from 'lucide-react';
import { useCategories } from '../../hooks/useCategories';
import { getFullBuyerData } from '../../api/buyerApi';

// ── Buyer-isolated storage helpers ───────────────────────────────────────────
function readDowry(buyerId) {
  try {
    if (buyerId) {
      const v = localStorage.getItem(`ss_dowry_${buyerId}`);
      return v ? JSON.parse(v) : null;
    }
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

function readWishlist(buyerId) {
  try {
    if (buyerId) {
      const v = localStorage.getItem(`ss_wishlist_${buyerId}`);
      return v ? JSON.parse(v) : [];
    }
    return [];
  } catch { return []; }
}

function readRecentlyViewed(buyerId) {
  try {
    if (buyerId) {
      const v = localStorage.getItem(`ss_recently_viewed_${buyerId}`);
      return v ? JSON.parse(v) : [];
    }
    return [];
  } catch { return []; }
}

const ANALYTICS_TABS = ['Overview', 'By Category', 'Remaining', 'Projections'];

export default function BuyerDashboard({ buyer, onViewProduct }) {
  const buyerId = buyer?.buyer_id;
  const { categories } = useCategories();

  const catLabel = (key) =>
    categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');

  const [dowry,          setDowry]          = useState(null);
  const [wishlist,       setWishlist]       = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [analyticsTab,   setAnalyticsTab]   = useState('Overview');

  // Mount: load from localStorage, fall back to MongoDB seed if empty
  useEffect(() => {
    setWishlist(readWishlist(buyerId));
    setRecentlyViewed(readRecentlyViewed(buyerId));

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

  // Re-read when any component shifts budget (cart checkout, marketplace, dowry reallocation)
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail?.buyerId || e.detail.buyerId === buyerId) {
        setDowry(readDowry(buyerId));
      }
    };
    window.addEventListener('dowry-updated', handler);
    return () => window.removeEventListener('dowry-updated', handler);
  }, [buyerId]);

  // Merge new DB categories into buyer's category_budgets with default 0
  const mergedDowry = useMemo(() => {
    if (!dowry || !categories.length) return dowry;
    const budgets = { ...(dowry.category_budgets || {}) };
    let changed = false;
    for (const cat of categories) {
      if (!(cat.category_id in budgets)) {
        budgets[cat.category_id] = { estimated: 0, spent: 0, remaining: 0, active: true };
        changed = true;
      }
    }
    if (!changed) return dowry;
    const updated = { ...dowry, category_budgets: budgets };
    const s = JSON.stringify(updated);
    localStorage.setItem('ss_dowry_latest', s);
    if (buyerId) localStorage.setItem(`ss_dowry_${buyerId}`, s);
    return updated;
  }, [dowry, categories, buyerId]);

  const dbCatIds   = categories.map(c => c.category_id);
  const catBudgets = mergedDowry?.category_budgets || {};

  // Only show categories that exist in DB
  const activeCats = Object.entries(catBudgets).filter(([key, v]) =>
    v.active !== false && (dbCatIds.length === 0 || dbCatIds.includes(key))
  );

  const totalEst    = activeCats.reduce((s, [, v]) => s + (v.estimated || 0), 0);
  const totalSpent  = activeCats.reduce((s, [, v]) => s + (v.spent || 0), 0);
  const totalRemain = activeCats.reduce((s, [, v]) => s + (v.remaining ?? (v.estimated - (v.spent || 0))), 0);
  const spentPct    = totalEst > 0 ? Math.round((totalSpent / totalEst) * 100) : 0;

  const noEstimate = !mergedDowry;

  const handleClearWishlist = () => {
    if (buyerId) {
      localStorage.setItem(`ss_wishlist_${buyerId}`, JSON.stringify([]));
      setWishlist([]);
    }
  };

  return (
    <div className="animate-fade-in space-y-8 pb-12">
      {/* Premium Dark Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-tr from-[#1a0a1e] via-[#2d2d44] to-[#3d3455] rounded-3xl p-8 md:p-10 text-white shadow-xl border border-white/10">
        <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-slate-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide backdrop-blur-sm">
                <Sparkles size={12} className="text-slate-300" />
                <span>Buyer Portal</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-slate-400 text-xs font-semibold tracking-wide backdrop-blur-sm">
                <span>Smart Wedding Planner</span>
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              <span className="bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent">
                Welcome back, {buyer?.name?.split(' ')[0]}!
              </span>
              <Hand className="text-white animate-bounce" size={32} />
            </h1>
            <p className="bg-gradient-to-r from-slate-300 via-purple-200 to-pink-200 bg-clip-text text-transparent max-w-xl text-sm md:text-base font-light">
              Here is an overview of your wedding budget, wishlist, and recommendations. Take charge of your wedding preparations with ease!
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Clock size={20} className="text-slate-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">System Time</p>
              <p className="text-sm font-semibold text-white">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modern High-End Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Budget */}
        <div className="bg-[#FCFBFB] rounded-2xl p-6 shadow-sm border border-[#FBEFF1] hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFF5F8] rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Recommended Budget</span>
              <h3 className="text-2xl font-bold text-gray-900">
                {noEstimate ? (
                  <span className="text-sm font-medium text-gray-400">No estimation yet</span>
                ) : (
                  `PKR ${totalEst.toLocaleString()}`
                )}
              </h3>
            </div>
            <div className="p-3 bg-[#FFF5F8] text-[#a37b3d] rounded-xl group-hover:bg-[#ECD4A8] group-hover:text-gray-900 transition-colors duration-300">
              <Wallet size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">{noEstimate ? 'Complete the wizard' : `${activeCats.length} Categories included`}</span>
            {!noEstimate && <span className="inline-flex items-center text-[#a37b3d] font-semibold gap-0.5">Active <CheckCircle2 size={12} /></span>}
          </div>
        </div>

        {/* Card 2: Total Spent */}
        <div className="bg-[#FCFBFB] rounded-2xl p-6 shadow-sm border border-[#FBEFF1] hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FDF2F3] rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Spent So Far</span>
              <h3 className="text-2xl font-bold text-gray-900">
                {noEstimate ? <span className="text-sm font-medium text-gray-400">—</span> : `PKR ${totalSpent.toLocaleString()}`}
              </h3>
            </div>
            <div className="p-3 bg-[#FDF2F3] text-rose-500 rounded-xl group-hover:bg-rose-500 group-hover:text-white transition-colors duration-300">
              <Banknote size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">{noEstimate ? 'No transactions' : `${spentPct}% utilized`}</span>
            {!noEstimate && (
              <span className={`inline-flex items-center font-bold gap-0.5 ${spentPct > 80 ? 'text-red-600' : 'text-emerald-600'}`}>
                {spentPct > 80 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} Trend
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Remaining Budget */}
        <div className="bg-[#FCFBFB] rounded-2xl p-6 shadow-sm border border-[#FBEFF1] hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FEF4F7] rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Remaining Balance</span>
              <h3 className={`text-2xl font-bold ${totalRemain < 0 ? 'text-rose-600 animate-pulse' : 'text-gray-900'}`}>
                {noEstimate ? <span className="text-sm font-medium text-gray-400">—</span> : `PKR ${totalRemain.toLocaleString()}`}
              </h3>
            </div>
            <div className="p-3 bg-[#FEF4F7] text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
              <Gem size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">Available to spend</span>
            {!noEstimate && (
              <span className={`font-semibold ${totalRemain < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {totalRemain < 0 ? 'Deficit' : 'In Safe Zone'}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Wishlist Items */}
        <div className="bg-[#FCFBFB] rounded-2xl p-6 shadow-sm border border-[#FBEFF1] hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFF5F8] rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Wishlist Items</span>
              <h3 className="text-2xl font-bold text-gray-900">{wishlist.length}</h3>
            </div>
            <div className="p-3 bg-[#FFF5F8] text-rose-400 rounded-xl group-hover:bg-rose-500 group-hover:text-white transition-colors duration-300">
              <Heart size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">Curated by you</span>
            {wishlist.length > 0 && (
              <button 
                onClick={handleClearWishlist} 
                className="text-rose-500 hover:text-rose-800 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Clear <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* No Estimate Beautiful Onboarding Callout */}
      {noEstimate && (
        <div className="bg-[#FCFBFB] rounded-3xl p-10 text-center border border-[#FBEFF1] shadow-xl max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 bg-[#FFF5F8] rounded-full flex items-center justify-center mx-auto text-[#a37b3d] shadow-inner">
            <Sparkles size={40} className="animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-gray-950">Unlock Your Personalized Budget Planner</h2>
            <p className="text-sm text-gray-600 leading-relaxed max-w-lg mx-auto">
              You haven't generated a budget estimation yet. Complete the Dowry Estimation wizard, specify your preferences, and receive a tailor-made allocation strategy that updates dynamically with your purchases.
            </p>
          </div>
          <div className="pt-2">
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#ECD4A8] text-gray-900 font-bold shadow-lg shadow-[#ECD4A8]/20 hover:scale-105 transition-transform cursor-pointer">
              <span>Go to Budget Estimator Wizard</span>
              <ChevronRight size={16} />
            </div>
          </div>
        </div>
      )}

      {/* Main Budget Breakdown & Analytics Panel */}
      {!noEstimate && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Panel: Category budgets */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2.5">
                    <TrendingUp className="text-[#a37b3d]" size={24} /> Budget Allocation
                  </h2>
                  <p className="text-gray-400 text-xs mt-1">Detailed breakdown of recommended versus spent per category</p>
                </div>
                {mergedDowry?.saved_at && (
                  <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-3 py-1.5 rounded-xl">
                    Created: {new Date(mergedDowry.saved_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                {activeCats.map(([cat, info]) => {
                  const spent     = info.spent || 0;
                  const est       = info.estimated || 0;
                  const remaining = info.remaining ?? (est - spent);
                  const isOver    = remaining < 0;
                  const itemPct   = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : 0;
                  
                  return (
                    <div key={cat} className="group p-4 bg-[#FCFBFB] hover:bg-[#FFF5F8]/70 rounded-2xl border border-[#FBEFF1] transition-all duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-bold text-gray-900 capitalize tracking-wide">{catLabel(cat)}</p>
                          <p className="text-[11px] text-gray-400 font-medium">
                            Spent: PKR {spent.toLocaleString()} · Total: PKR {est.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-extrabold ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {isOver ? `Over PKR ${Math.abs(remaining).toLocaleString()}` : `PKR ${remaining.toLocaleString()} left`}
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold">
                            {itemPct}% used
                          </p>
                        </div>
                      </div>
                      
                      {/* Individual Category progress bar */}
                      <div className="w-full bg-gray-200/80 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : itemPct > 80 ? 'bg-amber-400' : 'bg-violet-500'}`}
                          style={{ width: `${itemPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Overall progress bar */}
            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex justify-between text-xs font-semibold text-gray-600 mb-2">
                <span>Total Budget Progress</span>
                <span className="text-[#a37b3d]">{spentPct}% used (PKR {totalSpent.toLocaleString()} spent)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 p-0.5 border border-[#FBEFF1]">
                <div
                  className="bg-gradient-to-r from-violet-600 to-purple-400 h-2 rounded-full transition-all duration-500 shadow-md"
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Spending Analytics Tabbed view */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1]">
            <div className="mb-6">
              <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2.5">
                <BarChart3 className="text-[#a37b3d]" size={24} /> Insights & Projections
              </h2>
              <p className="text-gray-400 text-xs mt-1">Select views to analyze trends and forecasts</p>
            </div>

            {/* Analytics navigation */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2 bg-gray-50 p-1.5 rounded-2xl mb-6">
              {ANALYTICS_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setAnalyticsTab(tab)}
                  className={`py-2 px-1 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    analyticsTab === tab ? 'bg-white text-[#a37b3d] shadow-sm border border-[#FBEFF1]' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content area */}
            <div className="space-y-6 min-h-[300px] flex flex-col justify-between">
              
              {/* Tab 1: Overview */}
              {analyticsTab === 'Overview' && (
                <div className="space-y-6 my-auto">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Estimated', value: `PKR ${totalEst.toLocaleString()}`, bg: 'bg-[#FFF5F8]', text: 'text-[#a37b3d]' },
                      { label: 'Spent', value: `PKR ${totalSpent.toLocaleString()}`, bg: 'bg-[#FDF2F3]', text: 'text-rose-600' },
                      { label: 'Remaining', value: `PKR ${totalRemain.toLocaleString()}`, bg: 'bg-[#FEF4F7]', text: 'text-emerald-800' },
                    ].map(c => (
                      <div key={c.label} className={`${c.bg} rounded-2xl p-4 text-center border border-white`}>
                        <p className={`text-sm md:text-base font-extrabold ${c.text}`}>{c.value}</p>
                        <p className="text-[10px] text-gray-500 font-semibold mt-1 uppercase tracking-wide">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-5 bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3] border border-[#FBEFF1] rounded-2xl relative">
                    <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5">
                      <Sparkles size={16} className="text-[#a37b3d]" /> Smart Advisory
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {spentPct < 40 ? 'Your budget is in highly optimized health. Feel free to explore premium collections for your focal items!' :
                       spentPct < 75 ? 'You have utilized a fair share. Maintain this shopping speed to stay aligned with your targeted limits.' :
                       'Warning: You are approaching budget limit. Filter marketplace items using the lower bounds in your leftover categories.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: By Category List */}
              {analyticsTab === 'By Category' && (
                <div className="space-y-4 overflow-y-auto max-h-[320px] pr-1">
                  {activeCats.map(([cat, info]) => {
                    const spent = info.spent || 0;
                    const est   = info.estimated || 0;
                    const pct   = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : 0;
                    return (
                      <div key={cat} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-gray-700 capitalize">{catLabel(cat)}</span>
                          <span className="text-gray-400">PKR {spent.toLocaleString()} / PKR {est.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-300 ${pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-violet-600 to-purple-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: Remaining Sorted List */}
              {analyticsTab === 'Remaining' && (
                <div className="space-y-4 my-auto">
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {[...activeCats]
                      .sort(([, a], [, b]) => (b.remaining ?? (b.estimated - (b.spent || 0))) - (a.remaining ?? (a.estimated - (a.spent || 0))))
                      .map(([cat, info]) => {
                        const rem   = info.remaining ?? (info.estimated - (info.spent || 0));
                        const isOvr = rem < 0;
                        return (
                          <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-xs font-medium">
                            <span className="text-gray-700 capitalize">{catLabel(cat)}</span>
                            <span className={`font-bold ${isOvr ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {isOvr ? `-PKR ${Math.abs(rem).toLocaleString()}` : `PKR ${rem.toLocaleString()}`}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="pt-4 border-t border-gray-100 flex justify-between text-sm font-extrabold text-gray-800">
                    <span>Net Surplus Balance</span>
                    <span className={totalRemain < 0 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}>
                      PKR {totalRemain.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 4: Projections */}
              {analyticsTab === 'Projections' && (
                <div className="space-y-3 my-auto">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-2">Simulated Scenarios (Based on estimation)</p>
                  {[
                    { label: 'Savings Focus (70%)', total: Math.round(totalEst * 0.70), desc: 'Aggressive bargains & rentals', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                    { label: 'Target Model (85%)', total: Math.round(totalEst * 0.85), desc: 'Average vendor negotiations', color: 'bg-[#FFF5F8] text-[#a37b3d] border-[#FBEFF1]' },
                    { label: 'Upper Bound (100%)', total: totalEst, desc: 'Full premium purchasing tier', color: 'bg-rose-50 text-rose-700 border-rose-100' },
                  ].map(p => (
                    <div key={p.label} className={`p-3.5 rounded-2xl border flex items-center justify-between ${p.color}`}>
                      <div>
                        <p className="text-xs font-bold">{p.label}</p>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">{p.desc}</p>
                      </div>
                      <span className="text-xs font-extrabold bg-white px-3 py-1.5 rounded-xl shadow-sm border border-black/5">
                        PKR {p.total.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

        </div>
      )}

      {/* Wishlist + Recently Viewed Dual Section */}
      {(wishlist.length > 0 || recentlyViewed.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Wishlist Grid */}
          {wishlist.length > 0 && (
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2">
                    <Heart className="text-[#a37b3d] fill-[#a37b3d]" size={22} /> Wishlist Collection
                  </h2>
                  <p className="text-gray-400 text-xs mt-0.5">Quick access to your curated design highlights</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-[#FFF5F8] text-[#a37b3d] rounded-lg">
                  {wishlist.length} Saved
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-1">
                {wishlist.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className="group p-4 bg-[#FFF5F8]/30 hover:bg-[#FFF5F8]/60 rounded-2xl border border-[#FBEFF1]/60 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-[#a37b3d] uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-[#FBEFF1]">
                          {catLabel(item.major_category)}
                        </span>
                        <ArrowUpRight size={14} className="text-[#ECD4A8] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug">{item.title}</p>
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-2.5 border-t border-[#FBEFF1]/50">
                      <span className="text-[10px] text-gray-400 font-semibold">Original Price</span>
                      <span className="text-sm font-extrabold text-[#a37b3d]">PKR {(item.price || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {wishlist.length > 6 && (
                <p className="text-xs text-gray-400 mt-4 text-center font-medium">+{wishlist.length - 6} more saved items in your catalog</p>
              )}
            </div>
          )}

          {/* Recently Viewed Grid */}
          {recentlyViewed.length > 0 && (
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2">
                    <Eye className="text-[#a37b3d]" size={22} /> Recently Explored
                  </h2>
                  <p className="text-gray-400 text-xs mt-0.5">Pick up right where you left off browsing</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-[#FFF5F8] border border-[#FDF2F3] text-[#a37b3d] rounded-lg">
                  History
                </span>
              </div>

              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                {recentlyViewed.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className="group flex items-center gap-4 p-3 bg-gray-50/60 hover:bg-[#FFF5F8]/30 rounded-2xl border border-gray-100/80 transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-[#FFF5F8] text-[#a37b3d] border border-[#FDF2F3] rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                      <ShoppingBag size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-950 truncate group-hover:text-[#a37b3d] transition-colors">{item.title}</p>
                      <p className="text-[10px] text-gray-400 font-semibold capitalize mt-0.5">{catLabel(item.major_category)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-extrabold text-gray-950">PKR {(item.price || 0).toLocaleString()}</p>
                      <span className="text-[9px] text-[#a37b3d] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-0.5 mt-0.5">
                        View <ChevronRight size={10} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
