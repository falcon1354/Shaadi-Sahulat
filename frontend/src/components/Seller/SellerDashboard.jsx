import React, { useState, useEffect } from 'react';
import { Store, Package, Banknote, ShoppingCart, PlusCircle, BarChart3, Star, TrendingUp, Sparkles, ChevronRight, Activity, Calendar, ShieldAlert } from 'lucide-react';
import { listProducts, getSellerProfile } from '../../api/sellerApi';
import { listSellerPackages } from '../../api/orderApi';
import { useCategories } from '../../hooks/useCategories';

export default function SellerDashboard({ seller, onNavigate }) {
  const sellerId = seller?.seller_id;
  const { categories } = useCategories();
  const catLabel = (key) => categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');

  const [productCount, setProductCount] = useState(null);
  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Live data states
  const [revenue,      setRevenue]      = useState(0);
  const [totalOrders,  setTotalOrders]  = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [recentCompleted, setRecentCompleted] = useState([]);
  const [monthlySales, setMonthlySales] = useState([]);

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

  // Fetch live order/revenue data
  useEffect(() => {
    if (!sellerId) return;
    listSellerPackages(sellerId).then(r => {
      if (!r.success) return;
      const pkgs = r.packages || [];
      setTotalOrders(pkgs.length);
      setPendingOrders(pkgs.filter(p => p.status === 'PENDING' || p.status === 'PREPARING').length);

      // Compute revenue from completed/delivered packages
      const completedPkgs = pkgs.filter(p => ['DELIVERED', 'COMPLETED'].includes(p.status));
      const totalRev = completedPkgs.reduce((s, p) => s + (p.subtotal || 0), 0);
      setRevenue(totalRev);

      // Recent completed orders feed
      const recent = completedPkgs
        .sort((a, b) => new Date(b.delivered_at || b.updated_at || 0) - new Date(a.delivered_at || a.updated_at || 0))
        .slice(0, 5);
      setRecentCompleted(recent);

      // Group by month for chart
      const monthMap = {};
      completedPkgs.forEach(p => {
        const d = new Date(p.delivered_at || p.updated_at || p.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = (monthMap[key] || 0) + (p.subtotal || 0);
      });
      const chartData = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([key, sales]) => ({
          month: new Date(key + '-01').toLocaleDateString('en', { month: 'short' }),
          sales,
        }));
      setMonthlySales(chartData.length > 0 ? chartData : []);
    }).catch(() => {});
  }, [sellerId]);

  // Periodic seller profile refresh
  useEffect(() => {
    if (!sellerId) return;
    const interval = setInterval(() => {
      getSellerProfile(sellerId).catch(() => {});
    }, 60000); // refresh every 60 seconds
    return () => clearInterval(interval);
  }, [sellerId]);

  const topProducts = [...products]
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, 3);

  const catCounts = products.reduce((acc, p) => {
    const cat = p.major_category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const maxMonthlySale = Math.max(...(monthlySales.length > 0 ? monthlySales.map(m => m.sales) : [1]));

  return (
    <div className="animate-fade-in space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-gradient-to-tr from-[#1a0a1e]/80 via-[#2d2d44]/80 to-[#3d3455]/80 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-white/10 backdrop-blur-sm">
        <div className="absolute right-0 bottom-0 translate-y-12 translate-x-12 w-64 h-64 bg-slate-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide backdrop-blur-sm mb-3">
              <span>🏪</span> Seller Portal
            </div>
            <h1 className="text-3xl font-black mb-1.5 flex items-center gap-2.5 tracking-tight">
              <span className="bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent">
                Welcome back, {seller?.name?.split(' ')[0]}!
              </span>
              <Sparkles className="text-yellow-400 animate-pulse" size={28} />
            </h1>
            <p className="bg-gradient-to-r from-slate-300 via-purple-200 to-pink-200 bg-clip-text text-transparent font-light text-sm sm:text-base">
              Manage your business catalog, track revenue metrics, and inspect system orders.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3 shrink-0 flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl shadow-sm">
              <Store size={20} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Merchant Store</p>
              <p className="text-sm font-black tracking-tight text-white">{seller?.name || 'Seller Account'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
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
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Banknote size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">PKR {revenue.toLocaleString()}</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md w-fit">
            <span>From completed orders</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-primary-200/50 shadow-sm relative overflow-hidden hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Orders</span>
            <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary-900 flex items-center justify-center">
              <ShoppingCart size={16} />
            </div>
          </div>
          <h3 className="text-xl font-black text-gray-900">{totalOrders}</h3>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md w-fit">
            <span>{pendingOrders} pending</span>
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
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <PlusCircle size={22} />, label: 'Upload Product', sub: 'Add new listing', view: 'upload', color: 'text-primary-900 bg-primary-50' },
          { icon: <Package size={22} />,    label: 'My Products',    sub: 'Manage listings',    view: 'my-products', color: 'text-primary-900 bg-primary-100' },
          { icon: <BarChart3 size={22} />,  label: 'Analytics',      sub: 'View finances', view: 'fin-projection', color: 'text-emerald-600 bg-emerald-50' },
          { icon: <Star size={22} />,       label: 'Account',         sub: 'Edit details', view: 'seller-account', color: 'text-amber-600 bg-amber-50' },
        ].map(({ icon, label, sub, view, color }) => (
          <button key={view} onClick={() => onNavigate && onNavigate(view)}
            className="p-5 bg-white rounded-3xl border border-primary-200/40 hover:shadow-lg transition-all text-left flex flex-col justify-between group cursor-pointer h-32 hover:-translate-y-1 duration-300">
            <div className={`p-2.5 rounded-xl ${color} w-fit group-hover:scale-110 transition-transform duration-300`}>{icon}</div>
            <div>
              <p className="text-xs font-bold text-gray-900 tracking-tight">{label}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">{sub}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Sales Chart (live data) */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Revenue Trend</h2>
              <p className="text-[10px] text-gray-400 font-medium">Monthly earnings from completed orders.</p>
            </div>
            {monthlySales.length > 0 && (
              <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-2.5 py-0.5 rounded-md font-bold">LIVE DATA</span>
            )}
          </div>
          
          {monthlySales.length > 0 ? (
            <div className="flex items-end gap-3 h-36 pt-4 px-2">
              {monthlySales.map(m => {
                const pct = Math.round((m.sales / maxMonthlySale) * 100);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-[9px] text-gray-500 font-mono font-bold">
                      {m.sales >= 1000 ? `${(m.sales / 1000).toFixed(0)}K` : m.sales}
                    </span>
                    <div className="w-full rounded-t-xl bg-gradient-to-t from-violet-700 to-indigo-400 transition-all duration-500 hover:opacity-90"
                      style={{ height: `${pct}%` }} />
                    <span className="text-xs text-gray-500 font-bold">{m.month}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Activity size={24} className="mb-2" />
              <p className="text-xs font-medium">No completed orders yet. Data appears after first delivery.</p>
            </div>
          )}
        </div>

        {/* Category breakdown */}
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
            <p className="text-xs text-gray-400 text-center py-12 font-medium">No products found in database yet.</p>
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
                      <div className="h-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Completed Orders Feed */}
      {recentCompleted.length > 0 && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Recent Orders Completed</h2>
            <p className="text-[10px] text-gray-400 font-medium">Latest delivered orders with payout released.</p>
          </div>
          <div className="border border-primary-200/40 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="px-5 py-3.5 text-left text-gray-500 font-bold uppercase tracking-wider">Order ID</th>
                  <th className="px-5 py-3.5 text-left text-gray-500 font-bold uppercase tracking-wider">Buyer</th>
                  <th className="px-5 py-3.5 text-right text-gray-500 font-bold uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3.5 text-right text-gray-500 font-bold uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentCompleted.map(p => (
                  <tr key={p.package_id} className="hover:bg-primary-50/10 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-gray-800">{p.package_id}</td>
                    <td className="px-5 py-3.5 text-gray-500">{p.order?.buyer_name || '—'}</td>
                    <td className="px-5 py-3.5 text-right text-primary-900 font-black font-mono">
                      PKR {(p.subtotal || 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-500">
                      {p.delivered_at ? new Date(p.delivered_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Listings */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Top Merchant Listings</h2>
          <p className="text-[10px] text-gray-400 font-medium">Highest value active products in your shop.</p>
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>
        ) : topProducts.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-12 font-medium">No active listings yet.</p>
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
                    <td className="px-5 py-3.5 text-right text-primary-900 font-black font-mono">{p.price ? p.price.toLocaleString() : '0'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        p.availability_status === 'available' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-500'
                      }`}>{p.availability_status || 'available'}</span>
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
