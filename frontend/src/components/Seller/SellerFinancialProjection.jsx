import React, { useState, useEffect } from 'react';
import { listSellerPackages } from '../../api/orderApi';
import { getSellerProfile } from '../../api/sellerApi';

export default function SellerFinancialProjection({ seller }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Live data state
  const [financials, setFinancials] = useState({
    thisMonth: { revenue: 0, expenses: 0, profit: 0, orders: 0, avgOrderValue: 0 },
    lastMonth: { revenue: 0, expenses: 0, profit: 0, orders: 0, avgOrderValue: 0 },
    thisQuarter: { revenue: 0, expenses: 0, profit: 0, orders: 0, avgOrderValue: 0 },
  });
  const [transactions, setTransactions] = useState([]);
  const [revenueByCategory, setRevenueByCategory] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);

  const sellerId = seller?.seller_id;

  useEffect(() => {
    if (!sellerId) return;
    setLoading(true);

    // Fetch packages to compute live financial data
    listSellerPackages(sellerId).then(r => {
      if (!r.success) { setLoading(false); return; }
      const pkgs = r.packages || [];

      const completed = pkgs.filter(p => ['DELIVERED', 'COMPLETED'].includes(p.status));
      const totalRevenue = completed.reduce((s, p) => s + (p.subtotal || 0), 0);
      const totalOrders = completed.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Compute monthly breakdown
      const monthMap = {};
      completed.forEach(p => {
        const d = new Date(p.delivered_at || p.updated_at || p.created_at);
        const key = d.toLocaleDateString('en', { month: 'short' });
        monthMap[key] = (monthMap[key] || 0) + (p.subtotal || 0);
      });

      const monthlyData = Object.entries(monthMap).map(([month, sales]) => ({ month, sales }));
      setMonthlyRevenue(monthlyData);

      // Revenue by category
      const catRevenue = {};
      completed.forEach(p => {
        (p.items || []).forEach(it => {
          const cat = it.major_category || 'other';
          catRevenue[cat] = (catRevenue[cat] || 0) + (it.price * it.qty || 0);
        });
      });
      const catData = Object.entries(catRevenue).map(([category, revenue]) => ({
        category, revenue,
        percentage: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0,
      }));
      setRevenueByCategory(catData);

      // Transaction history from packages
      const txns = completed.map(p => ({
        id: p.package_id,
        type: 'income',
        description: `Sale: ${(p.items || []).map(i => i.title).join(', ')}`,
        amount: p.subtotal || 0,
        date: (p.delivered_at || p.updated_at || p.created_at || '').split('T')[0],
      }));
      setTransactions(txns);

      setFinancials({
        thisMonth: { revenue: totalRevenue, expenses: 0, profit: totalRevenue, orders: totalOrders, avgOrderValue },
        lastMonth: { revenue: 0, expenses: 0, profit: 0, orders: 0, avgOrderValue: 0 },
        thisQuarter: { revenue: totalRevenue, expenses: 0, profit: totalRevenue, orders: totalOrders, avgOrderValue },
      });

      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, [sellerId]);

  const formatPKR = (v) => `PKR ${v.toLocaleString()}`;

  const profitMargin = financials.thisMonth.revenue > 0
    ? Math.round((financials.thisMonth.profit / financials.thisMonth.revenue) * 100)
    : 0;
  const growthRate = financials.lastMonth.revenue > 0
    ? Math.round(((financials.thisMonth.revenue - financials.lastMonth.revenue) / financials.lastMonth.revenue) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-12 h-12 border-4 border-[#FBEFF1] border-t-[#a37b3d] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-tr from-[#1a0a1e]/90 via-[#2d2d44]/90 to-[#3d3455]/90 rounded-2xl p-6 text-white shadow-lg border border-white/10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide mb-3">
          <span>🏪</span> Seller Portal · Financial Projections
        </div>
        <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent">💹 Financial Projections</h1>
        <p className="text-slate-400">Revenue, expenses, and profit analysis — live data from your orders</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Total Revenue</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">PKR {financials.thisMonth.revenue.toLocaleString()}</h3>
          <p className={`text-xs mt-2 font-medium ${growthRate >= 0 ? 'text-[#a37b3d]' : 'text-red-600'}`}>
            {financials.thisMonth.orders} completed orders
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Net Profit</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">PKR {financials.thisMonth.profit.toLocaleString()}</h3>
          <p className="text-xs text-[#a37b3d] mt-2">{profitMargin}% profit margin</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Total Orders</p>
          <h3 className="text-2xl font-bold text-primary-900 mt-1">{financials.thisMonth.orders}</h3>
          <p className="text-xs text-gray-500 mt-2">Avg: PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Revenue Trend</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">
            {monthlyRevenue.length > 0 ? `${monthlyRevenue.length} months` : 'No data'}
          </h3>
          <p className="text-xs text-emerald-600 mt-2">From completed deliveries</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'revenue', label: 'Revenue', icon: '💰' },
          { id: 'transactions', label: 'Transactions', icon: '📋' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-white text-[#a37b3d] shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}>
            <span>{tab.icon}</span><span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Revenue Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Revenue (completed orders)</span>
                <span className="font-bold text-[#a37b3d]">PKR {financials.thisMonth.revenue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Orders Completed</span>
                <span className="font-bold text-primary-900">{financials.thisMonth.orders}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-sm font-medium text-gray-700">Avg Order Value</span>
                <span className="font-bold text-[#a37b3d]">PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {revenueByCategory.length > 0 && (
            <div className="bg-gradient-to-r from-[#FFF5F8] to-teal-50 rounded-2xl p-6 border border-[#FBEFF1]">
              <h3 className="font-bold text-gray-800 mb-3">📊 Key Insights</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                {revenueByCategory.slice(0, 3).map((item, i) => (
                  <li key={i}>✓ Top category: {item.category} ({item.percentage}% of revenue — PKR {item.revenue.toLocaleString()})</li>
                ))}
                <li>✓ Average order value: PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Revenue by Category</h2>
            {revenueByCategory.length > 0 ? (
              <div className="space-y-4">
                {revenueByCategory.map((item, idx) => (
                  <div key={idx} className="pb-4 border-b border-gray-100 last:border-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-800 capitalize">{item.category.replace(/_/g, ' ')}</span>
                      <span className="text-lg font-bold text-[#a37b3d]">PKR {item.revenue.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                        <div className="bg-gradient-to-r from-violet-600 to-indigo-400 h-2 rounded-full" style={{ width: `${item.percentage}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-700 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-8">No revenue data yet. Complete your first delivery to see stats.</p>
            )}
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Transaction History</h2>
            {transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.map((trans) => (
                  <div key={trans.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#a37b3d]" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{trans.description}</p>
                        <p className="text-xs text-gray-500">{trans.date}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#a37b3d]">+ PKR {trans.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-8">No transactions yet. Completed deliveries will appear here.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
