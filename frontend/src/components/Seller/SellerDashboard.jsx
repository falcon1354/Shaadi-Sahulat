import React, { useState, useEffect } from 'react';
import { Store, Package, Banknote, ShoppingCart, PlusCircle, BarChart3, Star, TrendingUp, Sparkles, ChevronRight, Activity, Calendar, ShieldAlert } from 'lucide-react';
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
    <div className="animate-fade-in space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header - Premium Dynamic Gradient */}
      <div className="bg-gradient-to-tr from-[#a37b3d] via-[#ECD4A8] to-[#FFF5F8] rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-[#ECD4A8]/20 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black mb-1.5 flex items-center gap-2.5 tracking-tight">
              Welcome back, {seller?.name?.split(' ')[0]}! <Sparkles className="text-yellow-300 animate-pulse" size={28} />
            </h1>
            <p className="text-primary-100 font-light text-sm sm:text-base">
              Manage your business catalog, track revenue metrics, and inspect system orders.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3 shrink-0 flex items-center gap-3">
            <div className="p-2.5 bg-white rounded-xl text-primary-900 shadow-sm">
              <Store size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-primary-200">Merchant Store</p>
              <p className="text-sm font-black tracking-tight">{seller?.name || 'Seller Account'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid - Glassmorphism cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-3xl p-5 border border-primary-200/50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Products</span>
            <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary-900 flex items-center justify-center">
              <Package size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">
            {loading ? '…' : (productCount ?? 0)}
          </h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-primary-900 font-bold bg-primary-50 px-2 py-0.5 rounded-md w-fit">
            <span>Catalog items (live)</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-primary-200/50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Monthly Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Banknote size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">PKR 91,000</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md w-fit">
            <span>Monthly trend data</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-primary-200/50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Orders</span>
            <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary-900 flex items-center justify-center">
              <ShoppingCart size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">—</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-primary-900 font-bold bg-primary-50 px-2 py-0.5 rounded-md w-fit">
            <span>Tracking soon</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-primary-200/50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Avg. Item Price</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">
            {products.length > 0
              ? `PKR ${Math.round(products.reduce((s, p) => s + (p.price || 0), 0) / products.length).toLocaleString()}`
              : '—'}
          </h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md w-fit">
            <span>Catalog distribution</span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Panels */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <PlusCircle size={22} />, label: 'Upload Product', sub: 'Add new listing', view: 'upload', color: 'text-primary-900 bg-primary-50' },
          { icon: <Package size={22} />,    label: 'My Products',    sub: 'Manage listings',    view: 'my-products', color: 'text-primary-900 bg-primary-100' },
          { icon: <BarChart3 size={22} />,  label: 'Analytics',      sub: 'View finances', view: 'fin-projection', color: 'text-emerald-600 bg-emerald-50' },
          { icon: <Star size={22} />,       label: 'Account',         sub: 'Edit details', view: 'seller-account', color: 'text-amber-600 bg-amber-50' },
        ].map(({ icon, label, sub, view, color }) => (
          <button
            key={view}
            onClick={() => onNavigate && onNavigate(view)}
            className="p-5 bg-white rounded-3xl border border-primary-200/40 hover:shadow-lg transition-all text-left flex flex-col justify-between group cursor-pointer h-32 hover:-translate-y-1 duration-300"
          >
            <div className={`p-2.5 rounded-xl ${color} w-fit group-hover:scale-110 transition-transform duration-300`}>
              {icon}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 tracking-tight">{label}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">{sub}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Sales Chart (demo) */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Revenue Trend</h2>
              <p className="text-[10px] text-gray-400 font-medium">Visualizing monthly earnings metrics.</p>
            </div>
            <span className="text-[10px] bg-amber-50 border border-amber-100 text-amber-600 px-2.5 py-0.5 rounded-md font-bold">DEMO MODE</span>
          </div>
          
          <div className="flex items-end gap-3 h-36 pt-4 px-2">
            {MONTHLY_SALES_DEMO.map(m => {
              const pct = Math.round((m.sales / maxMonthlySale) * 100);
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-[9px] text-gray-500 font-mono font-bold">
                    {m.sales >= 1000 ? `${(m.sales / 1000).toFixed(0)}K` : m.sales}
                  </span>
                  <div className="w-full rounded-t-xl bg-gradient-to-t from-[#a37b3d] to-[#ECD4A8] transition-all duration-500 hover:opacity-90"
                    style={{ height: `${pct}%` }} />
                  <span className="text-xs text-gray-500 font-bold">{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category breakdown (live) */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Active Categories</h2>
            <p className="text-[10px] text-gray-400 font-medium">Proportion of listings across category groups.</p>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : Object.keys(catCounts).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12 font-medium">No products found in database yet. Try uploading a new product!</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(catCounts).sort(([, a], [, b]) => b - a).map(([cat, cnt]) => {
                const pct = productCount > 0 ? Math.round((cnt / productCount) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-gray-700 capitalize">{catLabel(cat)}</span>
                      <span className="text-gray-500">{cnt} product{cnt !== 1 ? 's' : ''} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100/80 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Listings (live from DB) */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Top Merchant Listings</h2>
          <p className="text-[10px] text-gray-400 font-medium">Highest value active products uploaded in your shop.</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          </div>
        ) : topProducts.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-12 font-medium">No active listings yet. Add a new listing to view details.</p>
        ) : (
          <div className="border border-primary-200/40 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="px-5 py-3.5 text-left text-gray-500 font-bold uppercase tracking-wider">Product Name</th>
                  <th className="px-5 py-3.5 text-left text-gray-500 font-bold uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3.5 text-right text-gray-500 font-bold uppercase tracking-wider">Price (PKR)</th>
                  <th className="px-5 py-3.5 text-right text-gray-500 font-bold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topProducts.map(p => (
                  <tr key={p.product_id} className="hover:bg-primary-50/10 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-gray-800 max-w-[240px] truncate">{p.title}</td>
                    <td className="px-5 py-3.5 text-gray-500 capitalize font-medium">{catLabel(p.major_category)}</td>
                    <td className="px-5 py-3.5 text-right text-primary-900 font-black font-mono">
                      {p.price ? p.price.toLocaleString() : '0'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        p.availability_status === 'available'
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                          : 'bg-gray-100 border-gray-200 text-gray-500'
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

