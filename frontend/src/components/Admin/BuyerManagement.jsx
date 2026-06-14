import React, { useState, useEffect, useCallback } from 'react';
import adminApi from '../../api/adminApi';
import { getFullBuyerData } from '../../api/buyerApi';
import { useCategories } from '../../hooks/useCategories';

const TABS = ['Profile', 'Family & Finance', 'Dowry Estimation', 'Cart'];

function getBuyerLevel(orders = 0) {
  if (orders >= 7) return { level: 3, label: 'Loyal Buyer',  color: 'from-teal-500 to-green-500' };
  if (orders >= 3) return { level: 2, label: 'Active Buyer', color: 'from-blue-500 to-purple-500' };
  return { level: 1, label: 'New Buyer', color: 'from-gray-400 to-gray-500' };
}

export default function BuyerManagement() {
  const { categories } = useCategories();
  const catLabel = (id) =>
    categories.find(c => c.category_id === id)?.label
    || (id ? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');

  const [buyers,   setBuyers]   = useState([]);
  const [selected, setSelected] = useState(null); // full buyer+dowry from /full-data
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab,      setTab]      = useState('Profile');
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    adminApi.getAllBuyers().then(r => {
      setBuyers(r.buyers || []);
      setLoading(false);
    });
  }, []);

  const handleSelectBuyer = useCallback(async (b) => {
    setTab('Profile');
    setDetailLoading(true);
    try {
      const res = await getFullBuyerData(b.buyer_id);
      if (res.success) {
        setSelected({ ...res.buyer, _dowry: res.dowry_estimation });
      } else {
        setSelected({ ...b, _dowry: null });
      }
    } catch {
      setSelected({ ...b, _dowry: null });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const filtered = buyers.filter(b =>
    b.name?.toLowerCase().includes(search.toLowerCase()) ||
    b.email?.toLowerCase().includes(search.toLowerCase())
  );

  const est = selected?._dowry;
  // category_budgets = buyer's actual slider-adjusted + shift-updated values
  const estBudgets      = est?.category_budgets || {};
  const estBudgetEntries = Object.entries(estBudgets)
    .filter(([, v]) => v?.active !== false && (v?.estimated || 0) > 0)
    .sort(([, a], [, b]) => (b.estimated || 0) - (a.estimated || 0));
  const adjustedTotal   = estBudgetEntries.reduce((s, [, v]) => s + (v.estimated || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading buyers…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Buyer Management</h1>
        <p className="text-sm text-gray-500 mt-1">{buyers.length} buyers registered</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Buyers list */}
        <div className="lg:col-span-1 space-y-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 outline-none"
          />
          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filtered.map(b => {
              const lvl = getBuyerLevel(b.orders_count || 0);
              return (
                <button
                  key={b.buyer_id}
                  onClick={() => handleSelectBuyer(b)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selected?.buyer_id === b.buyer_id
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm">{b.name}</span>
                    {b.dowry_done && (
                      <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Dowry ✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{b.email}</p>
                  <p className="text-xs text-gray-500 mt-1">{b.city || '—'} · Level {lvl.level}</p>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No buyers found.</p>}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
              Select a buyer to view details
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{selected.name}</h3>
                  <p className="text-sm text-gray-500">{selected.email}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100">
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      tab === t ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-5">
                {tab === 'Profile' && (
                  <dl className="grid grid-cols-2 gap-4">
                    {[
                      ['Buyer ID',      selected.buyer_id],
                      ['Name',          selected.name],
                      ['Email',         selected.email],
                      ['Phone',         selected.phone || '—'],
                      ['City',          selected.city  || '—'],
                      ['Registered',    selected.created_at?.slice(0,10) || '—'],
                      ['Dowry Done',    selected.dowry_done ? 'Yes' : 'No'],
                      ['Wishlist Items',`${(selected.wishlist_items || selected.wishlist || []).length}`],
                      ['Cart Items',    `${(selected.cart_items || []).length}`],
                      ['Recently Viewed',`${(selected.recently_viewed_items || []).length}`],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-gray-50 rounded-xl p-3">
                        <dt className="text-xs text-gray-400 font-medium">{k}</dt>
                        <dd className="text-sm font-semibold text-gray-800 mt-0.5 break-all">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {tab === 'Family & Finance' && (
                  est ? (
                    <dl className="grid grid-cols-2 gap-4">
                      {[
                        ['Monthly Income',      `PKR ${est.income?.toLocaleString() || '—'}`],
                        ['Total Savings',       `PKR ${est.savings?.toLocaleString() || '—'}`],
                        ['Family Members',      est.total_family_members || '—'],
                        ['Married Siblings',    est.married_children   || 0],
                        ['Unmarried Siblings',  est.unmarried_children || 0],
                        ['Responsibility Score',est.responsibility_score
                          ? (est.responsibility_score * 100).toFixed(0) + '%' : '—'],
                        ['Youngest Sibling Age',est.ages_of_unmarried?.length > 0
                          ? Math.min(...est.ages_of_unmarried) : '—'],
                        ['Estimation Date',     est.created_at?.slice(0,10) || '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="bg-gray-50 rounded-xl p-3">
                          <dt className="text-xs text-gray-400 font-medium">{k}</dt>
                          <dd className="text-sm font-semibold text-gray-800 mt-0.5">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-center text-gray-400 py-10">No dowry estimation available for this buyer.</p>
                  )
                )}

                {tab === 'Dowry Estimation' && (
                  est ? (
                    <div className="space-y-4">
                      {/* Total — shows buyer's actual adjusted budget (from category_budgets), not the original ML total */}
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                        <p className="text-xs text-purple-500 font-medium">
                          {adjustedTotal > 0 ? "Buyer's Actual Budget" : "System Recommended Budget"}
                        </p>
                        <p className="text-2xl font-bold text-purple-700 mt-1">
                          PKR {(adjustedTotal > 0 ? adjustedTotal : est.total_recommended_budget)?.toLocaleString() || '—'}
                        </p>
                        {adjustedTotal > 0 && adjustedTotal !== est.total_recommended_budget && (
                          <p className="text-xs text-purple-400 mt-1">
                            System estimate: PKR {est.total_recommended_budget?.toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Budget by category — actual adjusted values (slider + shifts) */}
                      {estBudgetEntries.length > 0 ? (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 font-medium mb-3">Budget by Category (Buyer's Adjusted Plan)</p>
                          <div className="space-y-3">
                            {estBudgetEntries.map(([cat, info]) => (
                              <div key={cat}>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700 font-medium capitalize">{catLabel(cat)}</span>
                                  <span className="font-bold text-gray-800">PKR {(info.estimated || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                                  <span>Spent: PKR {(info.spent || 0).toLocaleString()}</span>
                                  <span className={(info.remaining ?? 0) < 0 ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                                    Remaining: PKR {(info.remaining ?? info.estimated ?? 0).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Fallback: no adjusted budgets yet — show raw ML breakdown */
                        Object.keys(est.category_breakdown || {}).length > 0 && (
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 font-medium mb-3">System Estimate (not yet personalised)</p>
                            <div className="space-y-2">
                              {Object.entries(est.category_breakdown || {}).map(([cat, amt]) => (
                                <div key={cat} className="flex items-center justify-between text-sm">
                                  <span className="text-gray-600 capitalize">{catLabel(cat)}</span>
                                  <span className="font-semibold text-gray-800">PKR {Number(amt).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      )}

                      {/* Budget source split — from income vs savings */}
                      {(est.budget_sources?.from_income > 0 || est.income > 0) && (() => {
                        const bs = est.budget_sources || {};
                        const total = adjustedTotal || est.total_recommended_budget || 0;
                        const inc  = bs.from_income  || Math.floor(Math.min((est.income || 0) * 12 * 0.4, total));
                        const sav  = bs.from_savings || Math.max(0, total - inc);
                        return (
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'From Income',  value: `PKR ${inc.toLocaleString()}`,  sub: `${bs.income_percentage  || (total > 0 ? Math.round(inc/total*100) : 0)}% of budget` },
                              { label: 'From Savings', value: `PKR ${sav.toLocaleString()}`,  sub: `${bs.savings_percentage || (total > 0 ? Math.round(sav/total*100) : 0)}% of budget` },
                            ].map(c => (
                              <div key={c.label} className="bg-blue-50 rounded-xl p-3">
                                <dt className="text-xs text-blue-400 font-medium">{c.label}</dt>
                                <dd className="text-sm font-bold text-blue-700 mt-0.5">{c.value}</dd>
                                <dd className="text-xs text-blue-400 mt-0.5">{c.sub}</dd>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <dl className="grid grid-cols-2 gap-3">
                        {[
                          ['Monthly Income',  est.income   ? `PKR ${est.income.toLocaleString()}` : '—'],
                          ['Total Savings',   est.savings  ? `PKR ${est.savings.toLocaleString()}` : '—'],
                          ['Baseline Budget', est.baseline_budget ? `PKR ${est.baseline_budget.toLocaleString()}` : '—'],
                          ['ML Adjustment',   est.ml_adjustment_factor ? `×${est.ml_adjustment_factor.toFixed(3)}` : '—'],
                          ['Source',          est.source || '—'],
                          ['Last Updated',    est.updated_at?.slice(0,10) || est.created_at?.slice(0,10) || '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-gray-50 rounded-xl p-3">
                            <dt className="text-xs text-gray-400">{k}</dt>
                            <dd className="text-sm font-semibold text-gray-700 mt-0.5">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <p className="text-center text-gray-400 py-10">No dowry estimation found for this buyer.</p>
                  )
                )}

                {tab === 'Cart' && (
                  <div>
                    {(selected.cart_items || []).length === 0 ? (
                      <div className="text-center py-10">
                        <p className="text-4xl mb-3">🛒</p>
                        <p className="text-gray-400 text-sm">No items in this buyer's cart.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(selected.cart_items || []).map((item, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-800">{item.title || item.product_id}</p>
                              <p className="text-xs text-gray-500 capitalize">
                                {catLabel(item.major_category)} · Qty: {item.qty}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-purple-600">
                              PKR {((item.discount_price || item.price || 0) * (item.qty || 1)).toLocaleString()}
                            </p>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-gray-100 text-right">
                          <span className="text-sm text-gray-500">Cart Total: </span>
                          <span className="font-bold text-purple-700">
                            PKR {(selected.cart_items || [])
                              .reduce((s, i) => s + (i.discount_price || i.price || 0) * (i.qty || 1), 0)
                              .toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
