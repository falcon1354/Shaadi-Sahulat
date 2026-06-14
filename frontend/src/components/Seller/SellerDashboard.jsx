import React, { useState, useEffect } from 'react';
import { Store, Package, Banknote, ShoppingCart, PlusCircle, BarChart3, Star, TrendingUp } from 'lucide-react';
import { listProducts } from '../../api/sellerApi';
import { useCategories } from '../../hooks/useCategories';

const MONTHLY_SALES_DEMO = [
  { month: 'Mar', sales: 45000 },
  { month: 'Apr', sales: 68000 },
  { month: 'May', sales: 52000 },
  { month: 'Jun', sales: 91000 },
];

export default function SellerDashboard({ seller, onNavigate }) {
  const sellerId = seller?.seller_id;
  const { categories } = useCategories();
  const catLabel = (key) => categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');

  const [productCount, setProductCount] = useState(null);
  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!sellerId) { setLoading(false); return; }
    listProducts({ sellerId, limit: 100 })
      .then(r => {
        const prods = r.products || [];
        setProductCount(r.total ?? prods.length);
        setProducts(prods);
      })
      .catch(() => setProductCount(0))
      .finally(() => setLoading(false));
  }, [sellerId]);

  // Top 3 products by price (simulated "best sellers" until order system exists)
  const topProducts = [...products]
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, 3);

  // Category distribution from seller's own products
  const catCounts = products.reduce((acc, p) => {
    const cat = p.major_category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const maxMonthlySale = Math.max(...MONTHLY_SALES_DEMO.map(m => m.sales));

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-red-500 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          Welcome back, {seller?.name?.split(' ')[0]}! <Store className="text-yellow-300" size={32} />
        </h1>
        <p className="text-pink-100">Manage your store and track your sales</p>
        {sellerId && <p className="text-pink-200 text-xs mt-1 font-mono">{sellerId}</p>}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Products</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">
                {loading ? '…' : (productCount ?? 0)}
              </h3>
            </div>
            <Package className="text-pink-400" size={28} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Your catalog (live)</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Monthly Sales</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">PKR 91K</h3>
            </div>
            <Banknote className="text-pink-400" size={28} />
          </div>
          <p className="text-xs text-amber-500 mt-2">Demo data · live tracking soon</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Orders</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">—</h3>
            </div>
            <ShoppingCart className="text-pink-400" size={28} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Order tracking coming soon</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Avg. Product Price</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">
                {products.length > 0
                  ? `PKR ${Math.round(products.reduce((s, p) => s + (p.price || 0), 0) / products.length).toLocaleString()}`
                  : '—'}
              </h3>
            </div>
            <TrendingUp className="text-pink-400" size={28} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Across your listings</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <PlusCircle size={28} />, label: 'Upload Product', sub: 'Add new item', view: 'upload' },
          { icon: <Package size={28} />,    label: 'My Products',    sub: 'View all',    view: 'my-products' },
          { icon: <BarChart3 size={28} />,  label: 'Analytics',      sub: 'View insights', view: 'fin-projection' },
          { icon: <Star size={28} />,       label: 'Account',         sub: 'Profile settings', view: 'seller-account' },
        ].map(({ icon, label, sub, view }) => (
          <button
            key={view}
            onClick={() => onNavigate && onNavigate(view)}
            className="p-4 bg-white rounded-xl border border-pink-100 hover:shadow-md transition-all text-center flex flex-col items-center group"
          >
            <span className="text-gray-400 mb-2 group-hover:scale-110 group-hover:text-pink-500 transition-all">{icon}</span>
            <p className="text-sm font-medium text-gray-800">{label}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Sales Chart (demo) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="text-pink-500" size={20} /> Monthly Sales
            </h2>
            <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">Demo</span>
          </div>
          <div className="flex items-end gap-3 h-32">
            {MONTHLY_SALES_DEMO.map(m => {
              const pct = Math.round((m.sales / maxMonthlySale) * 100);
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {m.sales >= 1000 ? `${(m.sales / 1000).toFixed(0)}K` : m.sales}
                  </span>
                  <div className="w-full rounded-t-lg bg-gradient-to-t from-pink-500 to-red-400 transition-all"
                    style={{ height: `${pct}%` }} />
                  <span className="text-xs text-gray-500">{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category breakdown (live) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 className="text-blue-500" size={20} /> Products by Category
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : Object.keys(catCounts).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No products yet. Upload your first product!</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(catCounts).sort(([, a], [, b]) => b - a).map(([cat, cnt]) => {
                const pct = productCount > 0 ? Math.round((cnt / productCount) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 capitalize font-medium">{catLabel(cat)}</span>
                      <span className="text-gray-500">{cnt} product{cnt !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-red-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Products (live from DB) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Star className="text-yellow-500" size={20} /> Your Top Listings
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : topProducts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No products yet. Start by uploading a product!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium text-right">Price</th>
                  <th className="pb-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map(p => (
                  <tr key={p.product_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800 max-w-[200px] truncate">{p.title}</td>
                    <td className="py-3 text-gray-500 capitalize">{catLabel(p.major_category)}</td>
                    <td className="py-3 text-right text-pink-600 font-semibold">
                      PKR {(p.price || 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.availability_status === 'available'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.availability_status || 'available'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
