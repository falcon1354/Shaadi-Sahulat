import React, { useState, useEffect, createContext, useContext } from 'react';
import {
  Routes, Route, Navigate, useNavigate, useLocation, Outlet, useParams
} from 'react-router-dom';

// ── Page component imports ────────────────────────────────────────────────────
import VisualRecPage       from './components/VisualRec/VisualRecPage';
import SellerPage          from './components/Seller/SellerPage';
import SellerAuthPage      from './components/Seller/SellerAuthPage';
import SellerDashboard     from './components/Seller/SellerDashboard';
import ProductList         from './components/Seller/ProductList';
import SellerFinancialProj from './components/Seller/SellerFinancialProjection';
import MarketplacePage     from './components/Marketplace/MarketplacePage';
import ProductDetailPage   from './components/Marketplace/ProductDetailPage';
import DowryPage           from './components/Dowry/DowryPage';
import BuyerAuthPage       from './components/Buyer/BuyerAuthPage';
import BuyerDashboard      from './components/Buyer/BuyerDashboard';
import FinalProjection     from './components/Buyer/FinalProjection';
import CartDrawer          from './components/Cart/CartDrawer';
import LandingPage         from './components/LandingPage';
import AdminLogin          from './components/Admin/AdminLogin';
import AdminLayout         from './components/Admin/AdminLayout';
import FinancialDashboard  from './components/Admin/FinancialDashboard';
import SellerManagement    from './components/Admin/SellerManagement';
import BuyerManagement     from './components/Admin/BuyerManagement';
import CategoryManager     from './components/Admin/CategoryManager';
import OrdersPage          from './components/Admin/OrdersPage';
import { CartProvider, useCart } from './context/CartContext';
import {
  getBuyerFromStorage, saveBuyerToStorage,
  clearBuyerFromStorage, getFullBuyerData
} from './api/buyerApi';
import {
  LayoutDashboard, ShoppingBag, Camera, Calculator, TrendingUp, User,
  ShoppingCart, PlusCircle, Package, LineChart
} from 'lucide-react';
import logo from './assets/ShaadiSahulat Logo PNG.png';

// ── Auth Context ──────────────────────────────────────────────────────────────

const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [buyer, setBuyerState] = useState(() => getBuyerFromStorage());
  const [seller, setSellerState] = useState(() => {
    const s = localStorage.getItem('ss_seller');
    return s ? JSON.parse(s) : null;
  });
  const [admin, setAdminState] = useState(() => {
    const s = localStorage.getItem('ss_admin');
    return s ? JSON.parse(s) : null;
  });

  const loginBuyer = (b) => {
    saveBuyerToStorage(b);
    setBuyerState(b);
    if (b?.buyer_id) {
      if (Array.isArray(b.wishlist_items)) {
        localStorage.setItem(`ss_wishlist_${b.buyer_id}`, JSON.stringify(b.wishlist_items));
      }
      if (Array.isArray(b.recently_viewed_items)) {
        localStorage.setItem(`ss_recently_viewed_${b.buyer_id}`, JSON.stringify(b.recently_viewed_items));
      }
      if (Array.isArray(b.cart_items) && b.cart_items.length > 0) {
        const existing = localStorage.getItem(`ss_cart_${b.buyer_id}`);
        if (!existing || existing === '[]') {
          localStorage.setItem(`ss_cart_${b.buyer_id}`, JSON.stringify(b.cart_items));
        }
      }
      if (!localStorage.getItem(`ss_dowry_${b.buyer_id}`)) {
        getFullBuyerData(b.buyer_id).then(res => {
          if (!res?.success || !res.dowry_estimation) return;
          const est     = res.dowry_estimation;
          const budgets = est.category_budgets;
          if (!budgets || !Object.keys(budgets).length) return;
          const total   = Object.values(budgets).reduce((s, v) => s + (v?.estimated || 0), 0);
          const payload = JSON.stringify({
            estimation_id:    est._id,
            total_budget:     total || est.total_recommended_budget,
            category_budgets: budgets,
            saved_at:         est.updated_at || est.created_at || new Date().toISOString(),
          });
          localStorage.setItem(`ss_dowry_${b.buyer_id}`, payload);
          localStorage.setItem('ss_dowry_latest', payload);
        }).catch(() => {});
      }
    }
  };

  const loginSeller = (s) => {
    localStorage.setItem('ss_seller', JSON.stringify(s));
    setSellerState(s);
  };

  const loginAdmin = (a) => {
    setAdminState(a);
    // AdminLogin.jsx already saves to localStorage
  };

  const logoutBuyer = () => {
    clearBuyerFromStorage();
    setBuyerState(null);
  };

  const logoutSeller = () => {
    localStorage.removeItem('ss_seller');
    setSellerState(null);
  };

  const logoutAdmin = () => {
    localStorage.removeItem('ss_admin');
    setAdminState(null);
  };

  return (
    <AuthContext.Provider value={{
      buyer, seller, admin,
      loginBuyer, loginSeller, loginAdmin,
      logoutBuyer, logoutSeller, logoutAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Level helpers ─────────────────────────────────────────────────────────────

function getBuyerLevel(orders = 0) {
  if (orders >= 7) return { level: 3, label: 'Loyal Buyer',  color: 'from-teal-500 to-green-500',  next: null, nextAt: null };
  if (orders >= 3) return { level: 2, label: 'Active Buyer', color: 'from-[#a37b3d] to-[#ECD4A8]', next: 3,    nextAt: 7,   progress: (orders - 3) / 4 };
  return            { level: 1, label: 'New Buyer',    color: 'from-[#c09858] to-[#ECD4A8]', next: 2,    nextAt: 3,   progress: orders / 3 };
}

function getSellerLevel(orders = 0) {
  if (orders >= 50) return { level: 3, label: 'Elite Seller',   color: 'from-amber-500 to-orange-500', next: null, nextAt: null };
  if (orders >= 10) return { level: 2, label: 'Trusted Seller', color: 'from-blue-500 to-teal-500',   next: 3,    nextAt: 50,  progress: (orders - 10) / 40 };
  return             { level: 1, label: 'Starter Seller', color: 'from-[#ECD4A8] to-[#a37b3d]',  next: 2,    nextAt: 10,  progress: orders / 10 };
}

function LevelBadge({ level, label, colorClass }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold text-white bg-gradient-to-r ${colorClass}`}>
      L{level} · {label}
    </span>
  );
}

function LevelProgress({ info, ordersLabel }) {
  if (!info.next) return <p className="text-xs text-gray-400 mt-1">Max level achieved</p>;
  const pct = Math.round((info.progress || 0) * 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{ordersLabel} · progress to L{info.next}</span>
        <span>{pct}% ({info.nextAt} needed)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full bg-gradient-to-r ${info.color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Account views ─────────────────────────────────────────────────────────────

function BuyerAccountView({ buyer }) {
  const orders    = buyer?.orders_count || 0;
  const levelInfo = getBuyerLevel(orders);
  const joined    = buyer?.created_at
    ? new Date(buyer.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short' })
    : 'Recently';

  return (
    <div className="animate-fade-in max-w-lg mx-auto space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
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
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Buyer Level</h3>
        <LevelBadge level={levelInfo.level} label={levelInfo.label} colorClass={levelInfo.color} />
        <LevelProgress info={levelInfo} ordersLabel={`${orders} order${orders !== 1 ? 's' : ''}`} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
          {[
            { l: 1, label: 'New Buyer',    at: 'On registration' },
            { l: 2, label: 'Active Buyer', at: '3+ orders' },
            { l: 3, label: 'Loyal Buyer',  at: '7+ orders' },
          ].map(({ l, label, at }) => (
            <div key={l} className={`rounded-xl p-2 border ${levelInfo.level >= l ? 'bg-[#FFF5F8] border-[#ECD4A8] text-[#a37b3d]' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
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
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
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
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Seller Level</h3>
        <LevelBadge level={levelInfo.level} label={levelInfo.label} colorClass={levelInfo.color} />
        <LevelProgress info={levelInfo} ordersLabel={`${orders} completed order${orders !== 1 ? 's' : ''}`} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
          {[
            { l: 1, label: 'Starter Seller', at: 'On registration' },
            { l: 2, label: 'Trusted Seller', at: '10+ orders' },
            { l: 3, label: 'Elite Seller',   at: '50+ orders' },
          ].map(({ l, label, at }) => (
            <div key={l} className={`rounded-xl p-2 border ${levelInfo.level >= l ? 'bg-[#FFF5F8] border-[#ECD4A8] text-[#a37b3d]' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
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

// ── Nav view lists ────────────────────────────────────────────────────────────

const BUYER_VIEWS = [
  { id: 'dashboard',   label: 'Dashboard',        icon: <LayoutDashboard size={20} /> },
  { id: 'marketplace', label: 'Marketplace',       icon: <ShoppingBag size={20} /> },
  { id: 'visual',      label: 'Find by Photo',     icon: <Camera size={20} /> },
  { id: 'dowry',       label: 'Budget Estimator',  icon: <Calculator size={20} /> },
  { id: 'projection',  label: 'Final Projection',  icon: <TrendingUp size={20} /> },
  { id: 'account',     label: 'My Account',        icon: <User size={20} /> },
];

const SELLER_VIEWS = [
  { id: 'dashboard', label: 'Dashboard',            icon: <LayoutDashboard size={20} /> },
  { id: 'upload',    label: 'Upload Product',       icon: <PlusCircle size={20} /> },
  { id: 'products',  label: 'My Products',          icon: <Package size={20} /> },
  { id: 'finance',   label: 'Financial Projection', icon: <LineChart size={20} /> },
  { id: 'account',   label: 'My Account',           icon: <User size={20} /> },
];

// Maps old view IDs (used by SellerDashboard's onNavigate) to new URL segments
const SELLER_NAV_MAP = {
  'upload': 'upload',
  'my-products': 'products',
  'fin-projection': 'finance',
  'seller-account': 'account',
  'seller-dashboard': 'dashboard',
};

// ── Route guards ──────────────────────────────────────────────────────────────

function RequireBuyer() {
  const { buyer } = useAuth();
  return buyer ? <Outlet /> : <Navigate to="/buyer/login" replace />;
}

function RequireSeller() {
  const { seller } = useAuth();
  return seller ? <Outlet /> : <Navigate to="/seller/login" replace />;
}

function RequireAdmin() {
  const { admin } = useAuth();
  return admin ? <Outlet /> : <Navigate to="/admin/login" replace />;
}

// ── Buyer Layout ──────────────────────────────────────────────────────────────

function BuyerLayout() {
  const { buyer, logoutBuyer } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { totalItems, setBuyerId } = useCart();
  const [cartOpen, setCart] = useState(false);

  useEffect(() => {
    setBuyerId(buyer?.buyer_id || null);
  }, [buyer?.buyer_id, setBuyerId]);

  const seg = location.pathname.split('/')[2] || 'dashboard';

  const handleLogout = () => {
    logoutBuyer();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#FCFBFB] flex">
      {/* Sidebar */}
      <aside className="fixed md:static w-64 h-screen bg-white/60 backdrop-blur-xl border-r border-white/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-y-auto z-40">
        <div className="p-5 border-b border-gray-100/50">
          <div className="flex items-center gap-3 mb-4">
            <img src={logo} alt="ShaadiSahulat" className="w-10 h-10 object-contain flex-shrink-0" />
            <div>
              <h1 className="font-heading font-bold text-gray-800 text-base leading-tight tracking-tight">ShaadiSahulat</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">Buyer Portal</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1.5 mt-2">
          {BUYER_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => navigate(`/buyer/${v.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                seg === v.id
                  ? 'bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3] text-[#a37b3d] shadow-sm border border-[#FBEFF1]'
                  : 'text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800'
              }`}
            >
              <span className={`text-lg transition-transform duration-300 ${seg === v.id ? 'scale-110' : ''}`}>{v.icon}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100/50 bg-white/40 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg shadow-sm bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8]">
              {buyer?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{buyer?.name}</p>
              <p className="text-xs text-gray-500 truncate">{buyer?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="md:hidden flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
              <h1 className="font-bold text-gray-800">ShaadiSahulat</h1>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden sm:block text-xs text-gray-500">Hi, {buyer?.name?.split(' ')[0]}</span>
              <button
                onClick={() => setCart(true)}
                className="relative flex items-center gap-2 px-3 py-1.5 bg-[#a37b3d] text-white rounded-xl text-sm font-medium hover:bg-[#8a6633] transition-colors shadow-sm"
              >
                <ShoppingCart size={16} />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {totalItems > 9 ? '9+' : totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </div>
        <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
          ShaadiSahulat — FYP 2026 | NUCES Chiniot-Faisalabad
        </footer>
      </main>

      <CartDrawer open={cartOpen} onClose={() => setCart(false)} buyerId={buyer?.buyer_id} />
    </div>
  );
}

// ── Seller Layout ─────────────────────────────────────────────────────────────

function SellerLayout() {
  const { seller, logoutSeller } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const seg = location.pathname.split('/')[2] || 'dashboard';

  const handleLogout = () => {
    logoutSeller();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#FCFBFB] flex">
      {/* Sidebar */}
      <aside className="fixed md:static w-64 h-screen bg-white/60 backdrop-blur-xl border-r border-white/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-y-auto z-40">
        <div className="p-5 border-b border-gray-100/50">
          <div className="flex items-center gap-3 mb-4">
            <img src={logo} alt="ShaadiSahulat" className="w-10 h-10 object-contain flex-shrink-0" />
            <div>
              <h1 className="font-heading font-bold text-gray-800 text-base leading-tight tracking-tight">ShaadiSahulat</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">Seller Portal</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1.5 mt-2">
          {SELLER_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => navigate(`/seller/${v.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                seg === v.id
                  ? 'bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3] text-[#a37b3d] shadow-sm border border-[#FBEFF1]'
                  : 'text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800'
              }`}
            >
              <span className={`text-lg transition-transform duration-300 ${seg === v.id ? 'scale-110' : ''}`}>{v.icon}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100/50 bg-white/40 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg shadow-sm bg-gradient-to-br from-[#c09858] to-[#a37b3d]">
              {seller?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{seller?.name}</p>
              <p className="text-xs text-gray-500 truncate">{seller?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="md:hidden flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[#c09858] to-[#a37b3d] rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
              <h1 className="font-bold text-gray-800">ShaadiSahulat</h1>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden sm:block text-xs text-gray-500">Hi, {seller?.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </div>
        <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
          ShaadiSahulat — FYP 2026 | NUCES Chiniot-Faisalabad
        </footer>
      </main>
    </div>
  );
}

// ── Admin layout wrapper (passes auth props) ──────────────────────────────────

function AdminLayoutWrapper() {
  const { admin, logoutAdmin } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logoutAdmin();
    navigate('/');
  };
  return <AdminLayout admin={admin} onLogout={handleLogout} />;
}

// ── Buyer page components ─────────────────────────────────────────────────────

function BuyerDashboardPage() {
  const { buyer } = useAuth();
  const navigate = useNavigate();
  return (
    <BuyerDashboard
      buyer={buyer}
      onViewProduct={(p) => navigate(`/buyer/product/${p.product_id}`, { state: { product: p, from: 'dashboard' } })}
    />
  );
}

function BuyerMarketplacePage() {
  const { buyer } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [highlightId, setHighlightId] = useState(location.state?.highlightProductId || null);

  return (
    <MarketplacePage
      highlightProductId={highlightId}
      onHighlightCleared={() => setHighlightId(null)}
      buyer={buyer}
      onViewProduct={(p) => navigate(`/buyer/product/${p.product_id}`, { state: { product: p, from: 'marketplace' } })}
    />
  );
}

function BuyerVisualPage() {
  const { buyer } = useAuth();
  const navigate  = useNavigate();
  return (
    <VisualRecPage
      userId={buyer?.buyer_id}
      onNavigateToProduct={(productId) =>
        navigate('/buyer/marketplace', { state: { highlightProductId: productId } })
      }
    />
  );
}

function BuyerDowryPage() {
  const { buyer } = useAuth();
  return <DowryPage userId={buyer?.buyer_id} />;
}

function BuyerProjectionPage() {
  const { buyer } = useAuth();
  return <FinalProjection buyer={buyer} />;
}

function BuyerAccountPage() {
  const { buyer } = useAuth();
  return <BuyerAccountView buyer={buyer} />;
}

function BuyerProductDetailPage() {
  const { buyer }    = useAuth();
  const navigate     = useNavigate();
  const { productId } = useParams();
  const location     = useLocation();
  const product      = location.state?.product || null;
  const from         = location.state?.from || 'marketplace';

  return (
    <ProductDetailPage
      product={product}
      productId={productId}
      buyer={buyer}
      onBack={() => navigate(`/buyer/${from}`)}
    />
  );
}

// ── Seller page components ────────────────────────────────────────────────────

function SellerDashboardPage() {
  const { seller } = useAuth();
  const navigate   = useNavigate();
  return (
    <SellerDashboard
      seller={seller}
      onNavigate={(id) => navigate(`/seller/${SELLER_NAV_MAP[id] || id}`)}
    />
  );
}

function SellerUploadPage() {
  return <SellerPage />;
}

function SellerProductsPage() {
  const { seller } = useAuth();
  return <ProductList sellerId={seller?.seller_id} />;
}

function SellerFinancePage() {
  const { seller } = useAuth();
  return <SellerFinancialProj seller={seller} />;
}

function SellerAccountPage() {
  const { seller } = useAuth();
  return <SellerAccountView seller={seller} />;
}

// ── Login pages ───────────────────────────────────────────────────────────────

function BuyerLoginPage() {
  const { buyer, loginBuyer } = useAuth();
  const navigate = useNavigate();
  if (buyer) return <Navigate to="/buyer/dashboard" replace />;
  return <BuyerAuthPage onLogin={(b) => { loginBuyer(b); navigate('/buyer/dashboard'); }} />;
}

function SellerLoginPage() {
  const { seller, loginSeller } = useAuth();
  const navigate = useNavigate();
  if (seller) return <Navigate to="/seller/dashboard" replace />;
  return <SellerAuthPage onLogin={(s) => { loginSeller(s); navigate('/seller/dashboard'); }} />;
}

function AdminLoginPage() {
  const { admin, loginAdmin } = useAuth();
  const navigate = useNavigate();
  if (admin) return <Navigate to="/admin/dashboard" replace />;
  return (
    <AdminLogin
      onLogin={(a) => { loginAdmin(a); navigate('/admin/dashboard'); }}
      onBack={() => navigate('/')}
    />
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────

function Landing() {
  const { buyer, seller } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FCFBFB] relative">
      <LandingPage
        onSelectBuyer={() => navigate(buyer ? '/buyer/dashboard' : '/buyer/login')}
        onSelectSeller={() => navigate(seller ? '/seller/dashboard' : '/seller/login')}
      />
      <button
        onClick={() => navigate('/admin/login')}
        className="fixed bottom-4 right-4 text-xs text-gray-400 hover:text-gray-600 bg-white/80 border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
      >
        Admin Portal
      </button>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <CartProvider>
      <AuthProvider>
        <Routes>
          {/* Landing */}
          <Route path="/" element={<Landing />} />

          {/* Buyer */}
          <Route path="/buyer/login" element={<BuyerLoginPage />} />
          <Route path="/buyer" element={<RequireBuyer />}>
            <Route element={<BuyerLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"           element={<BuyerDashboardPage />} />
              <Route path="marketplace"         element={<BuyerMarketplacePage />} />
              <Route path="visual"              element={<BuyerVisualPage />} />
              <Route path="dowry"               element={<BuyerDowryPage />} />
              <Route path="projection"          element={<BuyerProjectionPage />} />
              <Route path="account"             element={<BuyerAccountPage />} />
              <Route path="product/:productId"  element={<BuyerProductDetailPage />} />
            </Route>
          </Route>

          {/* Seller */}
          <Route path="/seller/login" element={<SellerLoginPage />} />
          <Route path="/seller" element={<RequireSeller />}>
            <Route element={<SellerLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<SellerDashboardPage />} />
              <Route path="upload"    element={<SellerUploadPage />} />
              <Route path="products"  element={<SellerProductsPage />} />
              <Route path="finance"   element={<SellerFinancePage />} />
              <Route path="account"   element={<SellerAccountPage />} />
            </Route>
          </Route>

          {/* Admin */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<RequireAdmin />}>
            <Route element={<AdminLayoutWrapper />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"   element={<FinancialDashboard />} />
              <Route path="sellers"     element={<SellerManagement />} />
              <Route path="buyers"      element={<BuyerManagement />} />
              <Route path="marketplace" element={<MarketplacePage isAdminView={true} />} />
              <Route path="categories"  element={<CategoryManager />} />
              <Route path="orders"      element={<OrdersPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </CartProvider>
  );
}
