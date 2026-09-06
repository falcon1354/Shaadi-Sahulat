import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { listSellerPackages } from '../../api/orderApi';

const PLATFORM_FEE_PCT = 5; // 5% platform fee deduction for Sales History

export default function SellerFinancialProjection({ seller }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Live data state
  const [financials, setFinancials] = useState({
    thisMonth: { revenue: 0, orders: 0, avgOrderValue: 0 },
  });
  const [transactions, setTransactions]         = useState([]);
  const [revenueByCategory, setRevenueByCategory] = useState([]);
  const [last7Days, setLast7Days]               = useState({ orders: [], revenue: [] });
  const [recentCompleted, setRecentCompleted]   = useState([]);
  const [salesHistory, setSalesHistory]         = useState([]);
  const [salesPage, setSalesPage]               = useState(1);
  const SALES_PAGE_SIZE = 10;

  const sellerId = seller?.seller_id;

  useEffect(() => {
    if (!sellerId) return;
    setLoading(true);

    listSellerPackages(sellerId).then(r => {
      if (!r.success) { setLoading(false); return; }
      const pkgs = r.packages || [];

      const completed = pkgs.filter(p => ['DELIVERED', 'COMPLETED'].includes(p.status));
      const totalRevenue = completed.reduce((s, p) => s + (p.subtotal || 0), 0);
      const totalOrders = completed.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // ── Past 7 days — orders + revenue ────────────────────────────────
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const dayPkgs = completed.filter(p => {
          const t = new Date(p.delivered_at || p.updated_at || p.created_at);
          return t >= d && t < next;
        });
        days.push({
          label: d.toLocaleDateString('en', { weekday: 'short' }),
          date: d.toISOString().slice(0, 10),
          orders: dayPkgs.length,
          revenue: dayPkgs.reduce((s, p) => s + (p.subtotal || 0), 0),
        });
      }
      setLast7Days({ orders: days, revenue: days });

      // ── Revenue by category ───────────────────────────────────────────
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

      // ── Transaction history (split multi-product orders) ──────────────
      const txns = [];
      completed.forEach(p => {
        const items = p.items || [];
        if (items.length === 0) {
          txns.push({
            id: p.package_id,
            type: 'income',
            description: `Sale: ${p.package_id}`,
            amount: p.subtotal || 0,
            date: (p.delivered_at || p.updated_at || p.created_at || '').split('T')[0],
            itemCount: 0,
          });
        } else {
          items.forEach(it => {
            txns.push({
              id: `${p.package_id}-${it.product_id}`,
              type: 'income',
              description: `Sale: ${it.title} × ${it.qty}`,
              amount: it.subtotal || (it.price * it.qty) || 0,
              date: (p.delivered_at || p.updated_at || p.created_at || '').split('T')[0],
              itemCount: items.length,
            });
          });
        }
      });
      txns.sort((a, b) => (a.date < b.date ? 1 : -1));
      setTransactions(txns);

      // ── Recent completed feed (top 5) ────────────────────────────────
      const recent = [...completed]
        .sort((a, b) => new Date(b.delivered_at || b.updated_at || 0) - new Date(a.delivered_at || a.updated_at || 0))
        .slice(0, 5);
      setRecentCompleted(recent);

      // ── Sales History (split multi-product orders, one row per product) ─
      // Includes 5% platform fee deduction.
      const sales = [];
      completed.forEach(p => {
        const items = p.items || [];
        const pkgSubtotal = p.subtotal || 0;
        const itemsTotal = items.reduce((s, it) => s + (it.subtotal || (it.price * it.qty) || 0), 0) || pkgSubtotal;
        items.forEach((it, idx) => {
          // Proportional split of the package subtotal if package total ≠ items sum.
          const itemSubtotal = it.subtotal || (it.price * it.qty) || 0;
          const proportional = itemsTotal > 0 ? (itemSubtotal / itemsTotal) * pkgSubtotal : itemSubtotal;
          const gross = idx === items.length - 1
            ? pkgSubtotal - sales.filter(s => s.package_id === p.package_id).reduce((s2, x) => s2 + x.gross, 0)
            : proportional;
          const net = Math.round(gross * (1 - PLATFORM_FEE_PCT / 100));
          sales.push({
            id: `${p.package_id}-${it.product_id}`,
            package_id: p.package_id,
            order_id: p.order_id,
            productName: it.title || '—',
            buyer: p.order?.buyer_name || '—',
            completedAt: p.delivered_at || p.updated_at || p.created_at || '',
            gross,
            net,
            qty: it.qty || 1,
          });
        });
      });
      sales.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
      setSalesHistory(sales);

      setFinancials({
        thisMonth: { revenue: totalRevenue, orders: totalOrders, avgOrderValue },
      });

      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, [sellerId]);

  // ── Lifetime total revenue (after 5% platform fee) for Sales History ─
  const lifetimeNetRevenue = useMemo(
    () => salesHistory.reduce((s, x) => s + (x.net || 0), 0),
    [salesHistory],
  );
  const salesPageCount = Math.max(1, Math.ceil(salesHistory.length / SALES_PAGE_SIZE));
  const pagedSales = salesHistory.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE);

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
        <p className="text-slate-400">Live revenue & sales data — driven by your completed orders</p>
      </div>

      {/* Past 7 Days — Orders + Revenue (dynamic-scale line charts) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#FBEFF1]">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Past 7 Days — Orders</h3>
          <p className="text-[10px] text-gray-400 mb-3">Daily completed order count</p>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={last7Days.orders} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Line type="monotone" dataKey="orders" stroke="#a37b3d" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#FBEFF1]">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Past 7 Days — Revenue</h3>
          <p className="text-[10px] text-gray-400 mb-3">Daily completed-order revenue (PKR)</p>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={last7Days.revenue} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip formatter={v => `PKR ${Number(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Total Orders metric (kept — Total Revenue / Net Profit cards removed) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Total Orders (completed)</p>
          <h3 className="text-2xl font-bold text-primary-900 mt-1">{financials.thisMonth.orders}</h3>
          <p className="text-xs text-gray-500 mt-2">Avg: PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Total Revenue (completed)</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">PKR {financials.thisMonth.revenue.toLocaleString()}</h3>
          <p className="text-xs text-emerald-600 mt-2">From completed deliveries</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {[
          { id: 'overview',    label: 'Overview',    icon: '📊' },
          { id: 'revenue',     label: 'Revenue',     icon: '💰' },
          { id: 'transactions',label: 'Transactions',icon: '📋' },
          { id: 'recent',      label: 'Recent',      icon: '🚚' },
          { id: 'sales',       label: 'Sales History',icon: '📈' },
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
                  <li key={i}>✓ Top category: {item.category.replace(/_/g,' ')} ({item.percentage}% of revenue — PKR {item.revenue.toLocaleString()})</li>
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

      {/* Transactions Tab — one row per product sold */}
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
                        <p className="text-xs text-gray-500">
                          {trans.date}
                          {trans.itemCount > 1 && <span className="ml-1 text-gray-400">• part of {trans.itemCount}-item order</span>}
                        </p>
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

      {/* Recent Tab — moved from SellerDashboard */}
      {activeTab === 'recent' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Recent Orders Completed</h2>
          {recentCompleted.length > 0 ? (
            <div className="overflow-hidden border border-gray-100 rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-gray-500 font-bold uppercase">Order ID</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-bold uppercase">Buyer</th>
                    <th className="px-4 py-3 text-right text-gray-500 font-bold uppercase">Amount</th>
                    <th className="px-4 py-3 text-right text-gray-500 font-bold uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentCompleted.map(p => (
                    <tr key={p.package_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-bold text-gray-800">{p.order?.order_id || p.order_id}</td>
                      <td className="px-4 py-3 text-gray-500">{p.order?.buyer_name || '—'}</td>
                      <td className="px-4 py-3 text-right text-[#a37b3d] font-mono font-black">PKR {(p.subtotal || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {p.delivered_at ? new Date(p.delivered_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-8">No completed orders yet.</p>
          )}
        </div>
      )}

      {/* Sales History Tab — one row per product, paginated 10/page, with platform fee */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Sales History</h2>
                <p className="text-xs text-gray-500">All completed sales (5% platform fee already deducted)</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Lifetime revenue received</p>
                <p className="text-2xl font-black text-[#a37b3d]">PKR {lifetimeNetRevenue.toLocaleString()}</p>
              </div>
            </div>

            {salesHistory.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No completed sales yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-3 text-left text-gray-500 font-bold uppercase">Product</th>
                        <th className="px-3 py-3 text-left text-gray-500 font-bold uppercase">Buyer</th>
                        <th className="px-3 py-3 text-left text-gray-500 font-bold uppercase">Date &amp; Time</th>
                        <th className="px-3 py-3 text-right text-gray-500 font-bold uppercase">Gross</th>
                        <th className="px-3 py-3 text-right text-gray-500 font-bold uppercase">Received (−5% fee)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pagedSales.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50/50">
                          <td className="px-3 py-3 font-medium text-gray-800 max-w-[200px] truncate">
                            {s.productName}
                            {s.qty > 1 && <span className="ml-1 text-gray-400">× {s.qty}</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-600">{s.buyer}</td>
                          <td className="px-3 py-3 text-gray-500">
                            {s.completedAt ? new Date(s.completedAt).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-500">PKR {Math.round(s.gross).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right text-[#a37b3d] font-bold">PKR {s.net.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {salesPageCount > 1 && (
                  <div className="flex justify-center gap-3 mt-4">
                    <button onClick={() => setSalesPage(p => Math.max(1, p - 1))} disabled={salesPage <= 1}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:border-[#ECD4A8]">Prev</button>
                    <span className="px-3 py-1 text-xs text-gray-500">Page {salesPage} / {salesPageCount}</span>
                    <button onClick={() => setSalesPage(p => Math.min(salesPageCount, p + 1))} disabled={salesPage >= salesPageCount}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:border-[#ECD4A8]">Next</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
