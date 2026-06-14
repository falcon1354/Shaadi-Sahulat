import React, { useState, useEffect, useMemo } from 'react';
import { Gem, Hand, Banknote, Heart, TrendingUp, Eye, Wallet, BarChart3, PieChart } from 'lucide-react';
import { useCategories } from '../../hooks/useCategories';
import { getFullBuyerData } from '../../api/buyerApi';

// ── Buyer-isolated storage helpers ───────────────────────────────────────────
// When buyerId is present, NEVER fall back to global keys.
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

  // Only show categories that exist in DB (removes stale "jewelry" etc.)
  const activeCats = Object.entries(catBudgets).filter(([key, v]) =>
    v.active !== false && (dbCatIds.length === 0 || dbCatIds.includes(key))
  );

  const totalEst    = activeCats.reduce((s, [, v]) => s + (v.estimated || 0), 0);
  const totalSpent  = activeCats.reduce((s, [, v]) => s + (v.spent || 0), 0);
  const totalRemain = activeCats.reduce((s, [, v]) => s + (v.remaining ?? (v.estimated - (v.spent || 0))), 0);
  const spentPct    = totalEst > 0 ? Math.round((totalSpent / totalEst) * 100) : 0;

  const noEstimate = !mergedDowry;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          Welcome back, {buyer?.name?.split(' ')[0]}! <Hand className="text-yellow-300" size={32} />
        </h1>
        <p className="text-purple-100">Track your wedding planning journey</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Budget</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">
                {noEstimate ? <span className="text-sm text-gray-400">No estimate yet</span> : `PKR ${totalEst.toLocaleString()}`}
              </h3>
            </div>
            <Wallet className="text-purple-400" size={28} />
          </div>
          <p className="text-xs text-gray-400 mt-2">{noEstimate ? 'Complete the wizard' : `${activeCats.length} active categories`}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Spent</p>
              <h3 className="text-2xl font-bold text-purple-600 mt-1">
                {noEstimate ? <span className="text-sm text-gray-400">—</span> : `PKR ${totalSpent.toLocaleString()}`}
              </h3>
            </div>
            <Banknote className="text-purple-400" size={28} />
          </div>
          <p className="text-xs text-gray-400 mt-2">{noEstimate ? '—' : `${spentPct}% of budget`}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Remaining</p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">
                {noEstimate ? <span className="text-sm text-gray-400">—</span> : `PKR ${totalRemain.toLocaleString()}`}
              </h3>
            </div>
            <Gem className="text-green-500" size={28} />
          </div>
          <p className="text-xs text-green-500 mt-2">{noEstimate ? '—' : 'Available to spend'}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Wishlist</p>
              <h3 className="text-2xl font-bold text-pink-600 mt-1">{wishlist.length}</h3>
            </div>
            <Heart className="text-pink-500" size={28} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Saved items</p>
        </div>
      </div>

      {/* No Estimate State */}
      {noEstimate && (
        <div className="bg-white rounded-2xl p-8 text-center border border-purple-100 shadow-sm">
          <Gem className="text-purple-300 mx-auto mb-3" size={48} />
          <h2 className="text-lg font-bold text-gray-800 mb-2">No Budget Estimate Yet</h2>
          <p className="text-sm text-gray-500 mb-1">Complete the Dowry Estimation wizard to see your personalised budget breakdown here.</p>
          <p className="text-xs text-gray-400">Go to Budget Estimator → fill the wizard → Save Estimation</p>
        </div>
      )}

      {/* Budget by Category (text only, no bar chart) */}
      {!noEstimate && activeCats.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="text-blue-500" size={24} /> Budget by Category
            </h2>
            {mergedDowry?.saved_at && (
              <span className="text-xs text-gray-400">
                Estimated {new Date(mergedDowry.saved_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {activeCats.map(([cat, info]) => {
              const spent     = info.spent || 0;
              const est       = info.estimated || 0;
              const remaining = info.remaining ?? (est - spent);
              const isOver    = remaining < 0;
              return (
                <div key={cat} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 capitalize">{catLabel(cat)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Spent: PKR {spent.toLocaleString()} · Budget: PKR {est.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className={`text-sm font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                      {isOver ? `Over PKR ${Math.abs(remaining).toLocaleString()}` : `PKR ${remaining.toLocaleString()} left`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {est > 0 ? `${Math.min(100, Math.round((spent / est) * 100))}% used` : '0% used'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall progress bar */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Overall spending</span>
              <span>{spentPct}% of PKR {totalEst.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, spentPct)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Spending Analytics Tabs */}
      {!noEstimate && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 className="text-purple-500" size={24} /> Spending Analytics
          </h2>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 overflow-x-auto">
            {ANALYTICS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setAnalyticsTab(tab)}
                className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  analyticsTab === tab ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {analyticsTab === 'Overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Budget', value: `PKR ${totalEst.toLocaleString()}`, color: 'text-purple-700' },
                  { label: 'Total Spent',  value: `PKR ${totalSpent.toLocaleString()}`,  color: 'text-blue-700' },
                  { label: 'Remaining',    value: `PKR ${totalRemain.toLocaleString()}`,  color: 'text-green-700' },
                ].map(c => (
                  <div key={c.label} className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-purple-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-purple-700 mb-2">Budget Usage: {spentPct}%</p>
                <div className="w-full bg-purple-200 rounded-full h-3">
                  <div className="bg-purple-600 h-3 rounded-full transition-all" style={{ width: `${Math.min(100, spentPct)}%` }} />
                </div>
                <p className="text-xs text-purple-500 mt-2">
                  {spentPct < 50 ? 'On track! You have plenty of budget remaining.' :
                   spentPct < 80 ? 'Getting there — monitor spending closely.' :
                   'Budget nearly exhausted — consider reviewing your plan.'}
                </p>
              </div>
            </div>
          )}

          {/* By Category tab */}
          {analyticsTab === 'By Category' && (
            <div className="space-y-3">
              {activeCats.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No categories in your estimation.</p>
              ) : activeCats.map(([cat, info]) => {
                const spent = info.spent || 0;
                const est   = info.estimated || 0;
                const pct   = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 capitalize">{catLabel(cat)}</span>
                      <span className="text-gray-500">PKR {spent.toLocaleString()} / PKR {est.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-orange-400' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{pct}% used</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Remaining tab */}
          {analyticsTab === 'Remaining' && (
            <div className="space-y-2">
              {activeCats.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No categories in your estimation.</p>
              ) : [...activeCats].sort(([, a], [, b]) => (b.remaining ?? 0) - (a.remaining ?? 0)).map(([cat, info]) => {
                const rem   = info.remaining ?? (info.estimated - (info.spent || 0));
                const isOvr = rem < 0;
                return (
                  <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium text-gray-700 capitalize">{catLabel(cat)}</p>
                    <p className={`text-sm font-bold ${isOvr ? 'text-red-600' : 'text-green-600'}`}>
                      {isOvr ? `-PKR ${Math.abs(rem).toLocaleString()}` : `PKR ${rem.toLocaleString()}`}
                    </p>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-gray-100 flex justify-between text-sm font-bold">
                <span className="text-gray-700">Total Remaining</span>
                <span className={totalRemain < 0 ? 'text-red-600' : 'text-green-600'}>
                  PKR {totalRemain.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Projections tab */}
          {analyticsTab === 'Projections' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 mb-3">Based on your total estimated budget of PKR {totalEst.toLocaleString()}</p>
              {[
                { label: 'Optimistic (70%)',    total: Math.round(totalEst * 0.70), desc: 'Minimal additional purchases',          color: 'from-green-500 to-teal-500' },
                { label: 'Realistic (85%)',     total: Math.round(totalEst * 0.85), desc: 'Current spending trends continue',      color: 'from-blue-500 to-purple-500' },
                { label: 'Pessimistic (100%)',  total: totalEst,                    desc: 'All budget categories fully utilized',  color: 'from-orange-500 to-red-500'  },
              ].map(p => (
                <div key={p.label} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                  </div>
                  <div className={`bg-gradient-to-r ${p.color} text-white px-3 py-1.5 rounded-xl text-sm font-bold`}>
                    PKR {p.total.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Wishlist + Recently Viewed */}
      {(wishlist.length > 0 || recentlyViewed.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {wishlist.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Heart className="text-pink-500" size={24} /> Wishlist ({wishlist.length})
              </h2>
              <div className="space-y-3">
                {wishlist.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className={`p-3 bg-pink-50 rounded-lg border border-pink-100 transition-colors ${
                      onViewProduct ? 'cursor-pointer hover:bg-pink-100 hover:border-pink-300 hover:shadow-sm' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 line-clamp-2 flex-1">{item.title}</p>
                      {onViewProduct && <span className="text-purple-400 text-xs shrink-0 mt-0.5">View →</span>}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500 capitalize">{catLabel(item.major_category)}</span>
                      <span className="text-sm font-bold text-pink-600">PKR {(item.price || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              {wishlist.length > 6 && (
                <p className="text-xs text-gray-400 mt-3 text-center">+{wishlist.length - 6} more saved items</p>
              )}
            </div>
          )}

          {recentlyViewed.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Eye className="text-gray-500" size={24} /> Recently Viewed
              </h2>
              <div className="space-y-3">
                {recentlyViewed.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className={`p-3 bg-gray-50 rounded-lg transition-colors ${
                      onViewProduct ? 'cursor-pointer hover:bg-purple-50 hover:shadow-sm border border-transparent hover:border-purple-100' : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 line-clamp-1 flex-1">{item.title}</p>
                      {onViewProduct && <span className="text-purple-400 text-xs shrink-0 mt-0.5">View →</span>}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-500 capitalize">{catLabel(item.major_category)}</span>
                      <span className="text-xs font-bold text-purple-600">PKR {(item.price || 0).toLocaleString()}</span>
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
