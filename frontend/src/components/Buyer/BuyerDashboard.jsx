import React, { useState, useEffect } from 'react';

const CAT_LABELS = {
  wedding_dress: 'Wedding Dress',
  furniture:     'Furniture',
  electronics:   'Electronics',
  jewelry:       'Jewelry',
  kitchen_items: 'Kitchen Items',
  decoration:    'Decoration',
  miscellaneous: 'Miscellaneous',
};

function readDowry() {
  try { return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null'); }
  catch { return null; }
}
function readWishlist() {
  try { return JSON.parse(localStorage.getItem('ss_wishlist') || '[]'); }
  catch { return []; }
}
function readRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem('ss_recently_viewed') || '[]'); }
  catch { return []; }
}

export default function BuyerDashboard({ buyer }) {
  const [dowry,         setDowry]         = useState(null);
  const [wishlist,      setWishlist]      = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  useEffect(() => {
    setDowry(readDowry());
    setWishlist(readWishlist());
    setRecentlyViewed(readRecentlyViewed());
  }, []);

  const catBudgets   = dowry?.category_budgets || {};
  const activeCats   = Object.entries(catBudgets).filter(([, v]) => v.active !== false);
  const totalEst     = activeCats.reduce((s, [, v]) => s + (v.estimated || 0), 0);
  const totalSpent   = activeCats.reduce((s, [, v]) => s + (v.spent || 0), 0);
  const totalRemain  = activeCats.reduce((s, [, v]) => s + (v.remaining ?? (v.estimated - (v.spent || 0))), 0);
  const spentPct     = totalEst > 0 ? Math.round((totalSpent / totalEst) * 100) : 0;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {buyer?.name?.split(' ')[0]}! 👋</h1>
        <p className="text-purple-100">Track your wedding planning journey</p>
      </div>

      {!dowry ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-purple-100 shadow-sm">
          <p className="text-4xl mb-3">💍</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No Budget Estimate Yet</h2>
          <p className="text-sm text-gray-500 mb-1">Complete the Dowry Estimation wizard to see your personalised budget breakdown here.</p>
          <p className="text-xs text-gray-400">Go to Dowry Estimation → fill the wizard → Save Estimation</p>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Budget</p>
                  <h3 className="text-2xl font-bold text-gray-800 mt-1">PKR {totalEst.toLocaleString()}</h3>
                </div>
                <span className="text-2xl">💍</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">{activeCats.length} active categories</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Spent</p>
                  <h3 className="text-2xl font-bold text-purple-600 mt-1">PKR {totalSpent.toLocaleString()}</h3>
                </div>
                <span className="text-2xl">💸</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">{spentPct}% of budget</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Remaining</p>
                  <h3 className="text-2xl font-bold text-green-600 mt-1">PKR {totalRemain.toLocaleString()}</h3>
                </div>
                <span className="text-2xl">💰</span>
              </div>
              <p className="text-xs text-green-500 mt-2">✓ Available to spend</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Wishlist</p>
                  <h3 className="text-2xl font-bold text-pink-600 mt-1">{wishlist.length}</h3>
                </div>
                <span className="text-2xl">❤️</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">Saved items</p>
            </div>
          </div>

          {/* Budget Breakdown */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span>📈</span> Budget by Category
              </h2>
              {dowry.saved_at && (
                <span className="text-xs text-gray-400">
                  Estimated {new Date(dowry.saved_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Overall progress */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Overall Spending</span>
                <span>{spentPct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${spentPct}%` }}
                />
              </div>
            </div>

            <div className="space-y-4">
              {activeCats.map(([cat, info]) => {
                const spent     = info.spent || 0;
                const pct       = info.estimated > 0 ? Math.min(100, Math.round((spent / info.estimated) * 100)) : 0;
                const remaining = info.remaining ?? (info.estimated - spent);
                const isOver    = remaining < 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">{CAT_LABELS[cat] || cat}</span>
                      <span className="text-sm text-gray-500">
                        PKR {spent.toLocaleString()} / PKR {info.estimated.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          isOver ? 'bg-red-500' : pct > 80 ? 'bg-orange-400' : 'bg-gradient-to-r from-purple-500 to-pink-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">{pct}% used</span>
                      <span className={`text-xs font-medium ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                        {isOver ? `Over by PKR ${Math.abs(remaining).toLocaleString()}` : `PKR ${remaining.toLocaleString()} left`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Wishlist + Recently Viewed */}
      {(wishlist.length > 0 || recentlyViewed.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {wishlist.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>❤️</span> Wishlist ({wishlist.length})
              </h2>
              <div className="space-y-3">
                {wishlist.slice(0, 6).map((item) => (
                  <div key={item.product_id} className="p-3 bg-pink-50 rounded-lg border border-pink-100 hover:bg-pink-100 transition-colors">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{item.title}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500 capitalize">
                        {CAT_LABELS[item.major_category] || item.major_category?.replace('_', ' ')}
                      </span>
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
                <span>👁️</span> Recently Viewed
              </h2>
              <div className="space-y-3">
                {recentlyViewed.slice(0, 6).map((item) => (
                  <div key={item.product_id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.title}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-500 capitalize">
                        {CAT_LABELS[item.major_category] || item.major_category?.replace('_', ' ')}
                      </span>
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
