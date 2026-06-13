import React, { useState, useEffect } from 'react';
import VisualRecPage       from './components/VisualRec/VisualRecPage';
import SellerPage          from './components/Seller/SellerPage';
import SellerDashboard     from './components/Seller/SellerDashboard';
import SellerFinancialProj from './components/Seller/SellerFinancialProjection';
import MarketplacePage     from './components/Marketplace/MarketplacePage';
import DowryPage           from './components/Dowry/DowryPage';
import BuyerAuthPage       from './components/Buyer/BuyerAuthPage';
import BuyerDashboard      from './components/Buyer/BuyerDashboard';
import FinalProjection     from './components/Buyer/FinalProjection';
import CartDrawer          from './components/Cart/CartDrawer';
import LandingPage         from './components/LandingPage';
import { CartProvider, useCart } from './context/CartContext';
import { getBuyerFromStorage, clearBuyerFromStorage } from './api/buyerApi';

// ── Level helpers ─────────────────────────────────────────────────────────

function getBuyerLevel(orders = 0) {
  if (orders >= 7)  return { level: 3, label: 'Loyal Buyer',  color: 'from-teal-500 to-green-500',   next: null,  nextAt: null };
  if (orders >= 3)  return { level: 2, label: 'Active Buyer', color: 'from-blue-500 to-purple-500',  next: 3,     nextAt: 7,   progress: (orders - 3) / 4 };
  return             { level: 1, label: 'New Buyer',    color: 'from-purple-500 to-pink-500',  next: 2,     nextAt: 3,   progress: orders / 3 };
}

function getSellerLevel(orders = 0) {
  if (orders >= 50) return { level: 3, label: 'Elite Seller',   color: 'from-amber-500 to-orange-500', next: null, nextAt: null };
  if (orders >= 10) return { level: 2, label: 'Trusted Seller', color: 'from-blue-500 to-teal-500',   next: 3,    nextAt: 50,  progress: (orders - 10) / 40 };
  return             { level: 1, label: 'Starter Seller', color: 'from-purple-500 to-pink-500',  next: 2,    nextAt: 10,  progress: orders / 10 };
}

function LevelBadge({ level, label, colorClass }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold text-white bg-gradient-to-r ${colorClass}`}>
      L{level} · {label}
    </span>
  );
}

function LevelProgress({ info, ordersLabel }) {
  if (!info.next) {
    return <p className="text-xs text-gray-400 mt-1">Max level achieved</p>;
  }
  const pct = Math.round((info.progress || 0) * 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{ordersLabel} · progress to L{info.next}</span>
        <span>{pct}% ({info.nextAt} needed)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full bg-gradient-to-r ${info.color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BuyerAccountView({ buyer }) {
  const orders    = buyer?.orders_count || 0;
  const levelInfo = getBuyerLevel(orders);
  const joined    = buyer?.created_at
    ? new Date(buyer.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short' })
    : 'Recently';

  return (
    <div className="animate-fade-in max-w-lg mx-auto space-y-4">
      {/* Profile card */}
      <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {buyer?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800 truncate">{buyer?.name}</h2>
            <p className="text-sm text-gray-400 truncate">{buyer?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {buyer?.phone && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
              <p className="font-semibold text-gray-700">{buyer.phone}</p>
            </div>
          )}
          {buyer?.city && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">City</p>
              <p className="font-semibold text-gray-700">📍 {buyer.city}</p>
            </div>
          )}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Member Since</p>
            <p className="font-semibold text-gray-700">{joined}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Orders</p>
            <p className="font-semibold text-gray-700">{orders}</p>
          </div>
        </div>
      </div>

      {/* Level card */}
      <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Buyer Level</h3>
        <LevelBadge level={levelInfo.level} label={levelInfo.label} colorClass={levelInfo.color} />
        <LevelProgress info={levelInfo} ordersLabel={`${orders} order${orders !== 1 ? 's' : ''}`} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
          {[
            { l: 1, label: 'New Buyer',    at: 'On registration' },
            { l: 2, label: 'Active Buyer', at: '3+ orders' },
            { l: 3, label: 'Loyal Buyer',  at: '7+ orders' },
          ].map(({ l, label, at }) => (
            <div key={l} className={`rounded-xl p-2 border ${levelInfo.level >= l ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
              <p className="font-bold">L{l}</p>
              <p className="font-medium text-[10px]">{label}</p>
              <p className="text-[9px] mt-0.5">{at}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SellerAccountView({ seller }) {
  const orders    = seller?.completed_orders || seller?.orders_count || 0;
  const levelInfo = getSellerLevel(orders);
  const joined    = seller?.created_at
    ? new Date(seller.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short' })
    : 'Recently';
  const maxListings = seller?.max_listings ?? (seller?.seller_type === 'company' ? '∞' : 5);

  return (
    <div className="animate-fade-in max-w-lg mx-auto space-y-4">
      {/* Profile card */}
      <div className="bg-white rounded-2xl shadow-sm border border-pink-100 p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-red-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {seller?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800 truncate">{seller?.name}</h2>
            <p className="text-sm text-gray-400 truncate">{seller?.email}</p>
            {seller?.seller_id && (
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{seller.seller_id}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {seller?.phone && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
              <p className="font-semibold text-gray-700">{seller.phone}</p>
            </div>
          )}
          {seller?.city && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">City</p>
              <p className="font-semibold text-gray-700">📍 {seller.city}</p>
            </div>
          )}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Member Since</p>
            <p className="font-semibold text-gray-700">{joined}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Orders Done</p>
            <p className="font-semibold text-gray-700">{orders}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Seller Type</p>
            <p className="font-semibold text-gray-700 capitalize">{seller?.seller_type || 'Individual'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Max Listings</p>
            <p className="font-semibold text-gray-700">{maxListings}</p>
          </div>
        </div>
      </div>

      {/* Level card */}
      <div className="bg-white rounded-2xl shadow-sm border border-pink-100 p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Seller Level</h3>
        <LevelBadge level={levelInfo.level} label={levelInfo.label} colorClass={levelInfo.color} />
        <LevelProgress info={levelInfo} ordersLabel={`${orders} completed order${orders !== 1 ? 's' : ''}`} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
          {[
            { l: 1, label: 'Starter Seller',  at: 'On registration' },
            { l: 2, label: 'Trusted Seller',  at: '10+ orders' },
            { l: 3, label: 'Elite Seller',    at: '50+ orders' },
          ].map(({ l, label, at }) => (
            <div key={l} className={`rounded-xl p-2 border ${levelInfo.level >= l ? 'bg-pink-50 border-pink-200 text-pink-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
              <p className="font-bold">L{l}</p>
              <p className="font-medium text-[10px]">{label}</p>
              <p className="text-[9px] mt-0.5">{at}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── App Views ──────────────────────────────────────────────────────────────

const BUYER_VIEWS = [
  { id: 'buyer-dashboard', label: 'Dashboard',       icon: '📊' },
  { id: 'marketplace',     label: 'Marketplace',     icon: '🛍️' },
  { id: 'visual',          label: 'Find by Photo',   icon: '📸' },
  { id: 'dowry',           label: 'Budget Estimator',icon: '💰' },
  { id: 'projection',      label: 'Final Projection',icon: '📈' },
  { id: 'account',         label: 'My Account',      icon: '👤' },
];

const SELLER_VIEWS = [
  { id: 'seller-dashboard', label: 'Dashboard',            icon: '📊' },
  { id: 'upload',           label: 'Upload Product',       icon: '➕' },
  { id: 'my-products',      label: 'My Products',          icon: '📦' },
  { id: 'fin-projection',   label: 'Financial Projection', icon: '💹' },
  { id: 'seller-account',   label: 'My Account',           icon: '👤' },
];

function AppContent() {
  const [showLanding, setShowLanding] = useState(true);
  const [userRole, setUserRole] = useState(null); // 'buyer' or 'seller'
  const [view, setView]       = useState(null);
  const [cartOpen, setCart]   = useState(false);
  const [buyer, setBuyer]     = useState(() => getBuyerFromStorage());
  const [seller, setSeller]   = useState(() => {
    const stored = localStorage.getItem('ss_seller');
    return stored ? JSON.parse(stored) : null;
  });

  // cross-module navigation
  const [highlightProductId, setHighlightProductId] = useState(null);

  const { totalItems, setBuyerId } = useCart();

  // Isolate cart per buyer — switch storage key on login/logout
  useEffect(() => {
    setBuyerId(buyer?.buyer_id || null);
  }, [buyer?.buyer_id]);

  const handleSelectBuyer = () => {
    setUserRole('buyer');
    setView('buyer-dashboard');
    setShowLanding(false);
  };

  const handleSelectSeller = () => {
    setUserRole('seller');
    setView('seller-dashboard');
    setShowLanding(false);
  };

  const handleBuyerLogin = (b) => {
    setBuyer(b);
    setUserRole('buyer');
    setView('buyer-dashboard');
    setShowLanding(false);
  };

  const handleSellerLogin = (s) => {
    setSeller(s);
    localStorage.setItem('ss_seller', JSON.stringify(s));
    setUserRole('seller');
    setView('seller-dashboard');
    setShowLanding(false);
  };

  const handleLogout = () => {
    if (userRole === 'buyer') {
      clearBuyerFromStorage();
      setBuyer(null);
    } else {
      localStorage.removeItem('ss_seller');
      setSeller(null);
    }
    setShowLanding(true);
    setUserRole(null);
    setView(null);
  };

  const navigateToProduct = (productId) => {
    setHighlightProductId(productId);
    setView('marketplace');
  };

  // If landing page should be shown
  if (showLanding) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        {buyer ? (
          <LandingPage
            onSelectBuyer={() => handleBuyerLogin(buyer)}
            onSelectSeller={handleSelectSeller}
          />
        ) : seller ? (
          <LandingPage
            onSelectBuyer={handleSelectBuyer}
            onSelectSeller={() => handleSellerLogin(seller)}
          />
        ) : (
          <LandingPage
            onSelectBuyer={handleSelectBuyer}
            onSelectSeller={handleSelectSeller}
          />
        )}
      </div>
    );
  }

  // Determine which view list to use
  const VIEWS = userRole === 'buyer' ? BUYER_VIEWS : SELLER_VIEWS;
  const isLoggedIn = userRole === 'buyer' ? buyer : seller;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex">

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className={`fixed md:static w-64 h-screen bg-white border-r border-gray-200 overflow-y-auto z-40 transform transition-transform md:translate-x-0 ${
        isLoggedIn ? 'translate-x-0' : 'translate-x-0'
      }`}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-10 h-10 bg-gradient-to-br ${userRole === 'buyer' ? 'from-purple-600 to-pink-500' : 'from-pink-600 to-red-500'} rounded-lg flex items-center justify-center text-white font-bold`}>
              {userRole === 'buyer' ? '👰' : '🏪'}
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-sm leading-tight">ShaadiSahulat</h1>
              <p className="text-xs text-gray-400">{userRole === 'buyer' ? 'Buyer' : 'Seller'}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                view === v.id
                  ? userRole === 'buyer'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-pink-100 text-pink-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-base">{v.icon}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </nav>

        {/* User Info */}
        {isLoggedIn && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg ${
                userRole === 'buyer'
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500'
                  : 'bg-gradient-to-br from-pink-500 to-red-500'
              }`}>
                {userRole === 'buyer' ? isLoggedIn?.name?.[0] : isLoggedIn?.name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800 truncate">{isLoggedIn?.name}</p>
                <p className="text-xs text-gray-500 truncate">{isLoggedIn?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="md:hidden flex items-center gap-3">
              <div className={`w-8 h-8 bg-gradient-to-br ${userRole === 'buyer' ? 'from-purple-600 to-pink-500' : 'from-pink-600 to-red-500'} rounded-lg flex items-center justify-center text-white font-bold text-sm`}>
                S
              </div>
              <h1 className="font-bold text-gray-800">ShaadiSahulat</h1>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {isLoggedIn && (
                <span className="hidden sm:block text-xs text-gray-500">
                  Hi, {isLoggedIn.name?.split(' ')[0]}
                </span>
              )}
              
              {userRole === 'buyer' && (
                <button
                  onClick={() => setCart(true)}
                  className="relative flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  <span>🛒</span>
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {totalItems > 9 ? '9+' : totalItems}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* BUYER VIEWS */}
            {userRole === 'buyer' && !isLoggedIn && view === 'buyer-dashboard' && (
              <BuyerAuthPage onLogin={handleBuyerLogin} />
            )}
            {userRole === 'buyer' && isLoggedIn && view === 'buyer-dashboard' && (
              <BuyerDashboard buyer={buyer} />
            )}
            {userRole === 'buyer' && isLoggedIn && view === 'marketplace' && (
              <MarketplacePage
                highlightProductId={highlightProductId}
                onHighlightCleared={() => setHighlightProductId(null)}
                buyer={buyer}
              />
            )}
            {userRole === 'buyer' && isLoggedIn && view === 'visual' && (
              <VisualRecPage
                userId={buyer?.buyer_id}
                onNavigateToProduct={navigateToProduct}
              />
            )}
            {userRole === 'buyer' && isLoggedIn && view === 'dowry' && (
              <DowryPage userId={buyer?.buyer_id} />
            )}
            {userRole === 'buyer' && isLoggedIn && view === 'projection' && (
              <FinalProjection buyer={buyer} />
            )}
            {userRole === 'buyer' && isLoggedIn && view === 'account' && (
              <BuyerAccountView buyer={buyer} />
            )}

            {/* SELLER VIEWS */}
            {userRole === 'seller' && !isLoggedIn && view === 'seller-dashboard' && (
              <SellerPage onLogin={handleSellerLogin} />
            )}
            {userRole === 'seller' && isLoggedIn && view === 'seller-dashboard' && (
              <SellerDashboard seller={seller} />
            )}
            {userRole === 'seller' && isLoggedIn && view === 'upload' && (
              <SellerPage defaultTab={1} />
            )}
            {userRole === 'seller' && isLoggedIn && view === 'my-products' && (
              <SellerPage defaultTab={2} />
            )}
            {userRole === 'seller' && isLoggedIn && view === 'fin-projection' && (
              <SellerFinancialProj seller={seller} />
            )}
            {userRole === 'seller' && isLoggedIn && view === 'seller-account' && (
              <SellerAccountView seller={seller} />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
          ShaadiSahulat — FYP 2026 | NUCES Chiniot-Faisalabad
        </footer>
      </main>

      {/* ── CART DRAWER ──────────────────────────────────────────────────── */}
      <CartDrawer open={cartOpen} onClose={() => setCart(false)} />
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <AppContent />
    </CartProvider>
  );
}
