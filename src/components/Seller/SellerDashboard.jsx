import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Package, Banknote, ShoppingCart, PlusCircle, BarChart3, Star, Sparkles, ChevronRight, Clock, ShieldCheck, ArrowUpRight, TrendingUp } from 'lucide-react';
import { listProducts, getSellerProfile } from '../../api/sellerApi';
import { listSellerPackages } from '../../api/orderApi';
import { useCategories } from '../../hooks/useCategories';
import SellerPageHero from '../Common/SellerPageHero';
import heroImg from '../../assets/hero/Dash_Overview.jpg';

export default function SellerDashboard({ seller, onNavigate }) {
  const navigate = useNavigate();
  const sellerId = seller?.seller_id;
  const { categories } = useCategories();
  const catLabel = (key) => categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');

  const [productCount, setProductCount] = useState(null);
  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Live data states
  const [revenue,       setRevenue]       = useState(0);
  const [totalOrders,   setTotalOrders]   = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  const handleNav = (route) => {
    if (onNavigate) onNavigate(route);
    else navigate(`/seller/${route}`);
  };

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
    }, 60000);
    return () => clearInterval(interval);
  }, [sellerId]);

  // Active categories — only categories the seller has actually uploaded products in
  const catCounts = products.reduce((acc, p) => {
    const cat = p.major_category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="animate-fade-in space-y-8 max-w-6xl mx-auto pb-12">
      {/* Editorial Luxury Hero */}
      <SellerPageHero
        badge={<><Store size={12} /> Merchant Atelier</>}
        title={`Welcome back, ${seller?.name?.split(' ')[0] || 'Partner'}!`}
        subtitle="Your bridal business command center. Monitor live catalog performance, fulfill orders, and inspect financial revenue."
        image={heroImg}
        imageAlt="ShaadiSahulat Merchant Atelier"
        rightSlot={
          <div className="px-4 py-3 rounded-2xl bg-white/90 border border-[#EADBCC] shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FAF7F2] text-[#9B7036] flex items-center justify-center font-serif font-bold text-lg border border-[#EADBCC]">
              {seller?.name?.[0]?.toUpperCase() || 'M'}
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-stone-400">Merchant Store</p>
              <p className="text-xs sm:text-sm font-bold text-stone-900 truncate max-w-[150px]">{seller?.name || 'Seller Account'}</p>
            </div>
          </div>
        }
      />

      {/* Quick Action Shortcuts */}
      <div className="bg-white rounded-2xl p-4 border border-[#EFEAE4] shadow-xs flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-stone-500 mr-1">Quick Actions:</span>
        <button
          onClick={() => handleNav('upload')}
          className="px-3.5 py-1.5 rounded-xl bg-[#FAF7F2] hover:bg-[#9B7036] text-stone-800 hover:text-white text-xs font-bold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
        >
          <PlusCircle size={14} className="text-[#9B7036] group-hover:text-white" />
          Upload New Listing
        </button>
        <button
          onClick={() => handleNav('orders')}
          className="px-3.5 py-1.5 rounded-xl bg-[#FAF7F2] hover:bg-[#9B7036] text-stone-800 hover:text-white text-xs font-bold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ShoppingCart size={14} className="text-[#9B7036]" />
          Orders to Fulfill {pendingOrders > 0 && `(${pendingOrders})`}
        </button>
        <button
          onClick={() => handleNav('products')}
          className="px-3.5 py-1.5 rounded-xl bg-[#FAF7F2] hover:bg-[#9B7036] text-stone-800 hover:text-white text-xs font-bold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Package size={14} className="text-[#9B7036]" />
          Manage Catalog
        </button>
        <button
          onClick={() => handleNav('finance')}
          className="px-3.5 py-1.5 rounded-xl bg-[#FAF7F2] hover:bg-[#9B7036] text-stone-800 hover:text-white text-xs font-bold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
        >
          <BarChart3 size={14} className="text-[#9B7036]" />
          Revenue Analytics
        </button>
      </div>

      {/* Luxury Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Total Products */}
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Catalog Inventory</span>
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mt-1">
                {loading ? '…' : (productCount ?? 0)} <span className="text-xs font-sans font-normal text-stone-400">items</span>
              </h3>
            </div>
            <div className="p-3 bg-[#FAF7F2] text-[#9B7036] rounded-2xl border border-[#EADBCC]/60 group-hover:bg-[#9B7036] group-hover:text-white transition-colors duration-300">
              <Package size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">Live products in store</span>
            <span className="inline-flex items-center text-[#9B7036] font-bold gap-1">Active Catalog <ArrowUpRight size={13} /></span>
          </div>
        </div>

        {/* Card 2: Total Revenue */}
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Gross Settled Revenue</span>
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mt-1">
                PKR {revenue.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-[#ECFDF5] text-emerald-700 rounded-2xl border border-emerald-100 group-hover:bg-emerald-700 group-hover:text-white transition-colors duration-300">
              <Banknote size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">From fulfilled orders</span>
            <span className="inline-flex items-center text-emerald-700 font-bold gap-1">Verified Sales <ShieldCheck size={13} /></span>
          </div>
        </div>

        {/* Card 3: Total Orders */}
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Order Packages</span>
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mt-1">
                {totalOrders} <span className="text-xs font-sans font-normal text-stone-400">packages</span>
              </h3>
            </div>
            <div className="p-3 bg-[#FFF5F8] text-[#800020] rounded-2xl border border-[#FBEFF1] group-hover:bg-[#800020] group-hover:text-white transition-colors duration-300">
              <ShoppingCart size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">Total customer orders</span>
            <span className={`inline-flex items-center font-bold px-2 py-0.5 rounded-md text-[11px] ${pendingOrders > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-stone-50 text-stone-600'}`}>
              {pendingOrders} need action
            </span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <PlusCircle size={22} />, label: 'Upload Product', sub: 'Add new couture listing', view: 'upload' },
          { icon: <Package size={22} />,    label: 'My Products',    sub: 'Manage stock & prices', view: 'products' },
          { icon: <BarChart3 size={22} />,  label: 'Analytics',      sub: 'Revenue & projections', view: 'finance' },
          { icon: <Star size={22} />,       label: 'Reviews & Store', sub: 'Ratings & feedback', view: 'reviews' },
        ].map(({ icon, label, sub, view }) => (
          <button
            key={view}
            onClick={() => handleNav(view)}
            className="p-5 bg-white rounded-3xl border border-[#EFEAE4] hover:border-[#ECD4A8] shadow-xs hover:shadow-luxury transition-all text-left flex flex-col justify-between group cursor-pointer h-36 hover:-translate-y-1 duration-300"
          >
            <div className="p-3 rounded-2xl bg-[#FAF7F2] text-[#9B7036] border border-[#EADBCC]/60 w-fit group-hover:bg-[#9B7036] group-hover:text-white transition-all duration-300">
              {icon}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-[#9B7036] transition-colors flex items-center justify-between">
                <span>{label}</span>
                <ChevronRight size={14} className="text-stone-300 group-hover:text-[#9B7036] transition-colors" />
              </p>
              <p className="text-[11px] text-stone-400 font-normal mt-0.5">{sub}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Active Categories — only categories the seller has actually uploaded products in */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-[#EADBCC] space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-serif font-bold text-stone-900 flex items-center gap-2">
              <TrendingUp className="text-[#9B7036]" size={20} /> Active Category Portfolio
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">Distribution of listings across your registered wedding categories.</p>
          </div>
          <span className="text-xs font-bold text-[#9B7036] bg-[#FAF7F2] px-3 py-1 rounded-full border border-[#EADBCC]">
            {Object.keys(catCounts).length} Active Categories
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin" />
          </div>
        ) : Object.keys(catCounts).length === 0 ? (
          <div className="text-center py-12 bg-[#FAF7F2]/50 rounded-2xl border border-dashed border-[#EADBCC]">
            <Package size={32} className="mx-auto text-stone-300 mb-2" />
            <p className="text-xs text-stone-500 font-medium">No products found in your inventory yet.</p>
            <button
              onClick={() => handleNav('upload')}
              className="mt-3 px-4 py-2 bg-[#9B7036] text-white text-xs font-bold rounded-xl hover:bg-[#835d2c] transition-all cursor-pointer"
            >
              Upload Your First Product
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(catCounts).sort(([, a], [, b]) => b - a).map(([cat, cnt]) => {
              const pct = productCount > 0 ? Math.round((cnt / productCount) * 100) : 0;
              return (
                <div key={cat} className="space-y-1.5 p-3 rounded-2xl bg-[#FAF7F2]/60 border border-[#EFEAE4]">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-stone-800 capitalize">{catLabel(cat)}</span>
                    <span className="text-[#9B7036]">{cnt} product{cnt !== 1 ? 's' : ''} <span className="text-stone-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-stone-200/70 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full bg-gradient-to-r from-[#9B7036] to-[#ECD4A8] transition-all duration-500" style={{ width: `${pct}%` }} />
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

