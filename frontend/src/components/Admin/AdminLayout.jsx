import React, { useState } from 'react';
import FinancialDashboard from './FinancialDashboard';
import SellerManagement  from './SellerManagement';
import BuyerManagement   from './BuyerManagement';
import CategoryManager   from './CategoryManager';
import OrdersPage        from './OrdersPage';
import MarketplacePage   from '../Marketplace/MarketplacePage';

const VIEWS = [
  { id: 'dashboard',  label: 'Dashboard',        icon: '📊' },
  { id: 'sellers',    label: 'Sellers',           icon: '🏪' },
  { id: 'buyers',     label: 'Buyers',            icon: '👰' },
  { id: 'marketplace',label: 'Marketplace',       icon: '🛍️' },
  { id: 'categories', label: 'Category Manager',  icon: '🗂️' },
  { id: 'orders',     label: 'Orders',            icon: '📦' },
];

export default function AdminLayout({ admin, onLogout }) {
  const [view, setView] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col fixed h-screen">
        {/* Logo */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center text-xl">
              🛡️
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">ShaadiSahulat</h1>
              <p className="text-gray-400 text-xs">Admin Portal</p>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-400">Signed in as</p>
            <p className="text-sm font-semibold text-white truncate">{admin?.name}</p>
            <p className="text-xs text-gray-400 truncate">{admin?.email}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                view === v.id
                  ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onLogout}
            className="w-full py-2.5 rounded-xl border border-gray-600 text-gray-400 text-sm hover:bg-gray-800 hover:text-white transition-all"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1 p-8 overflow-y-auto min-h-screen">
        {view === 'dashboard'   && <FinancialDashboard />}
        {view === 'sellers'     && <SellerManagement />}
        {view === 'buyers'      && <BuyerManagement />}
        {view === 'marketplace' && <MarketplacePage isAdminView={true} />}
        {view === 'categories'  && <CategoryManager />}
        {view === 'orders'      && <OrdersPage />}
      </main>
    </div>
  );
}
