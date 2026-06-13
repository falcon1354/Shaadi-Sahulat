import React, { useState, useEffect } from 'react';
import adminApi from '../../api/adminApi';

const TABS = ['Profile', 'Family & Finance', 'Dowry Estimation', 'Cart'];

const CAT_LABELS = { wedding_dress:'Wedding Dress', furniture:'Furniture', electronics:'Electronics', kitchen_items:'Kitchen', decoration:'Decoration', miscellaneous:'Misc' };

function getBuyerLevel(orders = 0) {
  if (orders >= 7) return { level: 3, label: 'Loyal Buyer',  color: 'from-teal-500 to-green-500' };
  if (orders >= 3) return { level: 2, label: 'Active Buyer', color: 'from-blue-500 to-purple-500' };
  return { level: 1, label: 'New Buyer', color: 'from-gray-400 to-gray-500' };
}

export default function BuyerManagement() {
  const [buyers, setBuyers]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab]         = useState('Profile');
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    adminApi.getAllBuyers().then(r => {
      setBuyers(r.buyers || []);
      setLoading(false);
    });
  }, []);

  const filtered = buyers.filter(b =>
    b.name?.toLowerCase().includes(search.toLowerCase()) ||
    b.email?.toLowerCase().includes(search.toLowerCase())
  );

  const est = selected?.dowry_estimation;

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
                  onClick={() => { setSelected(b); setTab('Profile'); }}
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
                      ['Buyer ID',    selected.buyer_id],
                      ['Name',        selected.name],
                      ['Email',       selected.email],
                      ['Phone',       selected.phone || '—'],
                      ['City',        selected.city  || '—'],
                      ['Registered',  selected.created_at?.slice(0,10) || '—'],
                      ['Dowry Done',  selected.dowry_done ? 'Yes' : 'No'],
                      ['Wishlist',    `${selected.wishlist?.length || 0} items`],
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
                        ['Monthly Income',   `PKR ${est.income?.toLocaleString() || '—'}`],
                        ['Total Savings',    `PKR ${est.savings?.toLocaleString() || '—'}`],
                        ['Family Members',   est.total_family_members || '—'],
                        ['Total Siblings',   (est.married_children || 0) + (est.unmarried_children || 0)],
                        ['Married Siblings', est.married_children   || 0],
                        ['Unmarried Siblings',est.unmarried_children || 0],
                        ['Parents Alive',    est.priorities?.father_approval !== undefined
                          ? `Father: ${est.priorities.father_approval ? 'Yes':'No'}`
                          : '—'],
                        ['Youngest Sibling Age', est.ages_of_unmarried?.length > 0
                          ? Math.min(...est.ages_of_unmarried) : '—'],
                        ['Responsibility Score', est.responsibility_score
                          ? (est.responsibility_score * 100).toFixed(0) + '%' : '—'],
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
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                        <p className="text-xs text-purple-500 font-medium">Total Recommended Budget</p>
                        <p className="text-2xl font-bold text-purple-700 mt-1">
                          PKR {est.total_recommended_budget?.toLocaleString() || '—'}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs text-gray-500 font-medium mb-3">Category Breakdown</p>
                        <div className="space-y-2">
                          {Object.entries(est.category_breakdown || {}).map(([cat, amt]) => (
                            <div key={cat} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">{CAT_LABELS[cat] || cat}</span>
                              <span className="font-semibold text-gray-800">PKR {Number(amt).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-3">
                        {[
                          ['Baseline Budget', `PKR ${est.baseline_budget?.toLocaleString() || '—'}`],
                          ['ML Adjustment',   est.ml_adjustment_factor ? `×${est.ml_adjustment_factor.toFixed(3)}` : '—'],
                          ['Estimation Date', est.created_at?.slice(0,10) || '—'],
                          ['Source',          est.source || '—'],
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
                    {(selected.cart || []).length === 0 ? (
                      <p className="text-center text-gray-400 py-10">
                        Cart is stored in the buyer's browser (localStorage) and not synced to MongoDB.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selected.cart.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                              <p className="text-xs text-gray-500">Qty: {item.qty}</p>
                            </div>
                            <p className="text-sm font-bold text-purple-600">
                              PKR {((item.discount_price || item.price) * item.qty).toLocaleString()}
                            </p>
                          </div>
                        ))}
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
