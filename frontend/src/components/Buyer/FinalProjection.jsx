import React, { useState, useEffect } from 'react';
import { useCategories } from '../../hooks/useCategories';
import { getFullBuyerData } from '../../api/buyerApi';

function readDowry(buyerId) {
  try {
    if (buyerId) return JSON.parse(localStorage.getItem(`ss_dowry_${buyerId}`) || 'null');
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

export default function FinalProjection({ buyer }) {
  const buyerId = buyer?.buyer_id;
  const { categories } = useCategories();
  const catLabel = (key) =>
    categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');

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
    window.addEventListener('dowry-updated', handler);
    return () => window.removeEventListener('dowry-updated', handler);
  }, [buyerId]);

  if (!dowry?.category_budgets) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-1">📊 Spending Projection</h1>
          <p className="text-purple-100">Complete budget analysis</p>
        </div>
        <div className="bg-white rounded-2xl p-10 text-center border border-purple-100 shadow-sm">
          <p className="text-4xl mb-3">💍</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No Estimate Yet</h2>
          <p className="text-sm text-gray-500">Complete the Dowry Estimation wizard first to see your projections here.</p>
        </div>
      </div>
    );
  }

  const catBudgets  = dowry.category_budgets;
  const dbCatIds    = categories.map(c => c.category_id);
  // Filter out orphaned categories (not in DB) and inactive (Not_Wanted) ones
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
    optimistic:  { label: 'Optimistic (70%)',   total: Math.round(totalEst * 0.70), desc: 'Minimal additional purchases' },
    realistic:   { label: 'Realistic (85%)',    total: Math.round(totalEst * 0.85), desc: 'Current spending trends continue' },
    pessimistic: { label: 'Pessimistic (100%)', total: totalEst,                    desc: 'All budget categories fully utilized' },
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-1">📊 Spending Projection</h1>
        <p className="text-purple-100">Live analysis from your Dowry Estimation data</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <p className="text-gray-500 text-sm font-medium">Total Budget</p>
          <h3 className="text-2xl font-bold text-gray-800 mt-1">PKR {totalEst.toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-2">Across all categories</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <p className="text-gray-500 text-sm font-medium">Total Spent</p>
          <h3 className="text-2xl font-bold text-purple-600 mt-1">PKR {totalSpent.toLocaleString()}</h3>
          <p className="text-xs text-purple-400 mt-2">{spentPct}% of budget</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <p className="text-gray-500 text-sm font-medium">Remaining</p>
          <h3 className={`text-2xl font-bold mt-1 ${totalRemain < 0 ? 'text-red-600' : 'text-green-600'}`}>
            PKR {totalRemain.toLocaleString()}
          </h3>
          <p className="text-xs text-green-400 mt-2">Available to spend</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
          <p className="text-gray-500 text-sm font-medium">Active Shopping</p>
          <h3 className="text-2xl font-bold text-orange-600 mt-1">{activeCatCount}/{activeCats.length}</h3>
          <p className="text-xs text-orange-400 mt-2">Categories with purchases</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {[
          { id: 'overview',  label: 'Overview',    icon: '📋' },
          { id: 'category',  label: 'By Category', icon: '📊' },
          { id: 'remaining', label: 'Remaining',   icon: '💰' },
          { id: 'projected', label: 'Projections', icon: '🔮' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}>
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Overall Budget Usage</h2>
            <div className="mb-5">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Total Spending Progress</span>
                <span className="text-sm font-bold text-gray-800">{spentPct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all"
                  style={{ width: `${spentPct}%` }}
                />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Metric</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Total Budget', val: `PKR ${totalEst.toLocaleString()}`,    cls: 'text-gray-800' },
                  { label: 'Total Spent',  val: `PKR ${totalSpent.toLocaleString()}`,  cls: 'text-purple-600' },
                  { label: 'Remaining',    val: `PKR ${totalRemain.toLocaleString()}`, cls: totalRemain < 0 ? 'text-red-600' : 'text-green-600' },
                  { label: 'Remaining %',  val: `${Math.round((totalRemain / totalEst) * 100)}%`, cls: 'text-green-600' },
                ].map(row => (
                  <tr key={row.label} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 px-2 text-gray-700">{row.label}</td>
                    <td className={`text-right py-3 px-2 font-bold ${row.cls}`}>{row.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: By Category */}
      {activeTab === 'category' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Estimated vs Actual Spending</h2>
          <div className="space-y-5">
            {categoryComparison.map((item, idx) => {
              const pct    = item.estimated > 0 ? Math.min(100, Math.round((item.actual / item.estimated) * 100)) : 0;
              const isOver = item.actual > item.estimated;
              return (
                <div key={idx} className="pb-4 border-b border-gray-100 last:border-0">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-gray-800">{item.category}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      isOver ? 'bg-red-100 text-red-700' : pct > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isOver ? `Over by PKR ${(item.actual - item.estimated).toLocaleString()}` : `${pct}% used`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Estimated</p>
                      <p className="text-lg font-bold text-purple-600">PKR {item.estimated.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Spent</p>
                      <p className="text-lg font-bold text-orange-600">PKR {item.actual.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Remaining</p>
                      <p className={`text-lg font-bold ${item.remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        PKR {item.remaining.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isOver ? 'bg-red-500' : 'bg-gradient-to-r from-orange-400 to-red-400'}`}
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
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Budget Remaining by Category</h2>
          <div className="space-y-3">
            {categoryComparison.map((item, idx) => {
              const pctUsed   = item.estimated > 0 ? Math.min(100, Math.round((item.actual / item.estimated) * 100)) : 0;
              const isOver    = item.remaining < 0;
              return (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-800">{item.category}</span>
                    <span className={`text-sm font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                      PKR {item.remaining.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className={`h-2 rounded-full ${isOver ? 'bg-red-500' : 'bg-gradient-to-r from-green-400 to-green-600'}`}
                      style={{ width: `${Math.max(0, 100 - pctUsed)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{isOver ? 'Over budget' : `${100 - pctUsed}% remaining`}</span>
                    <span>Budget: PKR {item.estimated.toLocaleString()}</span>
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
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Projected Final Spending</h2>
            <div className="space-y-4">
              {Object.entries(projections).map(([key, proj]) => (
                <div key={key} className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 mb-1">{proj.label}</h3>
                      <p className="text-sm text-gray-600">{proj.desc}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-purple-600">PKR {proj.total.toLocaleString()}</p>
                      <p className={`text-xs mt-1 ${proj.total > totalEst ? 'text-red-500' : 'text-green-500'}`}>
                        {proj.total > totalEst
                          ? `+PKR ${(proj.total - totalEst).toLocaleString()} over budget`
                          : `PKR ${(totalEst - proj.total).toLocaleString()} under budget`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
              <span>💡</span> Recommendation
            </h3>
            <p className="text-gray-700 text-sm">
              Based on your current spending ({spentPct}% of budget used), the{' '}
              <strong>Realistic projection (85%)</strong> is most likely. You have{' '}
              <strong>PKR {totalRemain.toLocaleString()}</strong> remaining across {activeCats.length} categories.
              {totalRemain >= 0
                ? ' You are on track to stay within budget.'
                : ' Consider shifting budget from lower-priority categories.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
