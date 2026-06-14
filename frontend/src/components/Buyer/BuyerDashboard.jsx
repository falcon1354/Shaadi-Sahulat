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
      {/* Premium Gradient Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-pink-500 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-purple-500/10 border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-72 h-72 bg-pink-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold tracking-wide backdrop-blur-sm border border-white/20 mb-4 animate-pulse-glow">
              <Sparkles size={12} className="text-yellow-300" />
              <span>Smart Wedding Planner</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              Welcome back, {buyer?.name?.split(' ')[0]}! <Hand className="text-yellow-300 animate-bounce" size={32} />
            </h1>
            <p className="text-purple-100 max-w-xl text-sm md:text-base font-light">
              Here is an overview of your wedding budget, wishlist, and recommendations. Take charge of your wedding preparations with ease!
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Clock size={20} className="text-pink-200" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-purple-200">System Time</p>
              <p className="text-sm font-semibold">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modern High-End Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Budget */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 shadow-sm border border-purple-50 hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
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
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
              <Wallet size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">{noEstimate ? 'Complete the wizard' : `${activeCats.length} Categories included`}</span>
            {!noEstimate && <span className="inline-flex items-center text-purple-600 font-semibold gap-0.5">Active <CheckCircle2 size={12} /></span>}
          </div>
        </div>

        {/* Card 2: Total Spent */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 shadow-sm border border-purple-50 hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Spent So Far</span>
              <h3 className="text-2xl font-bold text-gray-900">
                {noEstimate ? <span className="text-sm font-medium text-gray-400">—</span> : `PKR ${totalSpent.toLocaleString()}`}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
              <Banknote size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">{noEstimate ? 'No transactions' : `${spentPct}% utilized`}</span>
            {!noEstimate && (
              <span className={`inline-flex items-center font-bold gap-0.5 ${spentPct > 80 ? 'text-red-600' : 'text-blue-600'}`}>
                {spentPct > 80 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} Trend
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Remaining Budget */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 shadow-sm border border-purple-50 hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Remaining Balance</span>
              <h3 className={`text-2xl font-bold ${totalRemain < 0 ? 'text-rose-600 animate-pulse' : 'text-gray-900'}`}>
                {noEstimate ? <span className="text-sm font-medium text-gray-400">—</span> : `PKR ${totalRemain.toLocaleString()}`}
              </h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition-colors duration-300">
              <Gem size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">Available to spend</span>
            {!noEstimate && (
              <span className={`font-semibold ${totalRemain < 0 ? 'text-rose-600' : 'text-green-600'}`}>
                {totalRemain < 0 ? 'Deficit' : 'In Safe Zone'}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Wishlist Items */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 shadow-sm border border-purple-50 hover-lift relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-pink-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Wishlist Items</span>
              <h3 className="text-2xl font-bold text-gray-900">{wishlist.length}</h3>
            </div>
            <div className="p-3 bg-pink-50 text-pink-600 rounded-xl group-hover:bg-pink-600 group-hover:text-white transition-colors duration-300">
              <Heart size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <span className="text-gray-500">Curated by you</span>
            {wishlist.length > 0 && (
              <button 
                onClick={handleClearWishlist} 
                className="text-pink-600 hover:text-pink-800 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Clear <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* No Estimate Beautiful Onboarding Callout */}
      {noEstimate && (
        <div className="bg-white rounded-3xl p-10 text-center border border-purple-100 shadow-xl max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto text-purple-600 shadow-inner">
            <Sparkles size={40} className="animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-gray-950">Unlock Your Personalized Budget Planner</h2>
            <p className="text-sm text-gray-600 leading-relaxed max-w-lg mx-auto">
              You haven't generated a budget estimation yet. Complete the Dowry Estimation wizard, specify your preferences, and receive a tailor-made allocation strategy that updates dynamically with your purchases.
            </p>
          </div>
          <div className="pt-2">
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold shadow-lg shadow-purple-500/20 hover:scale-105 transition-transform cursor-pointer">
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
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2.5">
                    <TrendingUp className="text-purple-600" size={24} /> Budget Allocation
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
                    <div key={cat} className="group p-4 bg-gray-50/50 hover:bg-purple-50/30 rounded-2xl border border-gray-100/80 transition-all duration-300">
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
                          className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : itemPct > 80 ? 'bg-amber-400' : 'bg-purple-500'}`}
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
                <span className="text-purple-600">{spentPct}% used (PKR {totalSpent.toLocaleString()} spent)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 p-0.5 border border-purple-100">
                <div
                  className="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 h-2 rounded-full transition-all duration-500 shadow-md"
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Spending Analytics Tabbed view */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50/50">
            <div className="mb-6">
              <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2.5">
                <BarChart3 className="text-purple-600" size={24} /> Insights & Projections
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
                    analyticsTab === tab ? 'bg-white text-purple-700 shadow-sm border border-purple-100/50' : 'text-gray-400 hover:text-gray-600'
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
                      { label: 'Estimated', value: `PKR ${totalEst.toLocaleString()}`, bg: 'bg-purple-50/60', text: 'text-purple-800' },
                      { label: 'Spent', value: `PKR ${totalSpent.toLocaleString()}`, bg: 'bg-blue-50/60', text: 'text-blue-800' },
                      { label: 'Remaining', value: `PKR ${totalRemain.toLocaleString()}`, bg: 'bg-green-50/60', text: 'text-green-800' },
                    ].map(c => (
                      <div key={c.label} className={`${c.bg} rounded-2xl p-4 text-center border border-white`}>
                        <p className={`text-sm md:text-base font-extrabold ${c.text}`}>{c.value}</p>
                        <p className="text-[10px] text-gray-500 font-semibold mt-1 uppercase tracking-wide">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-5 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-100/50 relative">
                    <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5">
                      <Sparkles size={16} className="text-purple-600" /> Smart Advisory
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
                          <div className={`h-2 rounded-full transition-all duration-300 ${pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-purple-600 to-pink-500'}`}
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
                    { label: 'Target Model (85%)', total: Math.round(totalEst * 0.85), desc: 'Average vendor negotiations', color: 'bg-violet-50 text-violet-700 border-violet-100' },
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
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50/50">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2">
                    <Heart className="text-pink-500 fill-pink-500" size={22} /> Wishlist Collection
                  </h2>
                  <p className="text-gray-400 text-xs mt-0.5">Quick access to your curated design highlights</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-pink-50 text-pink-600 rounded-lg">
                  {wishlist.length} Saved
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-1">
                {wishlist.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className="group p-4 bg-pink-50/30 hover:bg-pink-50/60 rounded-2xl border border-pink-100/60 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-pink-600 uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-pink-100">
                          {catLabel(item.major_category)}
                        </span>
                        <ArrowUpRight size={14} className="text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug">{item.title}</p>
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-2.5 border-t border-pink-100/50">
                      <span className="text-[10px] text-gray-400 font-semibold">Original Price</span>
                      <span className="text-sm font-extrabold text-pink-600">PKR {(item.price || 0).toLocaleString()}</span>
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
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-purple-50/50">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2">
                    <Eye className="text-purple-600" size={22} /> Recently Explored
                  </h2>
                  <p className="text-gray-400 text-xs mt-0.5">Pick up right where you left off browsing</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-600 rounded-lg">
                  History
                </span>
              </div>

              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                {recentlyViewed.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className="group flex items-center gap-4 p-3 bg-gray-50/60 hover:bg-purple-50/30 rounded-2xl border border-gray-100/80 transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 shrink-0 shadow-sm border border-purple-200/20">
                      <ShoppingBag size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-950 truncate group-hover:text-purple-700 transition-colors">{item.title}</p>
                      <p className="text-[10px] text-gray-400 font-semibold capitalize mt-0.5">{catLabel(item.major_category)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-extrabold text-gray-950">PKR {(item.price || 0).toLocaleString()}</p>
                      <span className="text-[9px] text-purple-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-0.5 mt-0.5">
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
