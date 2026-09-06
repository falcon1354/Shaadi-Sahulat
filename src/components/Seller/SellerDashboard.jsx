import React, { useState, useEffect } from 'react';
import { Store, Package, Banknote, ShoppingCart, PlusCircle, BarChart3, Star, Sparkles, ChevronRight, Calendar, ShieldAlert, Image } from 'lucide-react';
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

  // Active categories — only categories the seller has actually uploaded products in
  const catCounts = products.reduce((acc, p) => {
    const cat = p.major_category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

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

      {/* Stats Grid (Total Products, Total Revenue, Total Orders — all DB-driven) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: <PlusCircle size={22} />, label: 'Upload Product', sub: 'Add new listing', view: 'upload', color: 'text-primary-900 bg-primary-50' },
          { icon: <Package size={22} />,    label: 'My Products',    sub: 'Manage listings',    view: 'my-products', color: 'text-primary-900 bg-primary-100' },
          { icon: <Image size={22} />,      label: 'Banner Requests', sub: 'Create banner offers', view: 'offers', color: 'text-pink-600 bg-pink-50' },
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

      {/* Active Categories — only categories the seller has actually uploaded products in */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary-200/50 space-y-6">
        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Active Categories</h2>
          <p className="text-[10px] text-gray-400 font-medium">Proportion of listings across category groups you sell in.</p>
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
  );
}
