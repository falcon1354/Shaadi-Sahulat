import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { listSellerPackages } from '../../api/orderApi';
import ExpandableItems from '../Common/ExpandableItems';

const PLATFORM_FEE_PCT = 5;

function inRange(dateStr, range) {
  if (range === 'total' || !dateStr) return true;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return true;
  const now = Date.now();
  if (range === '7d') return t >= now - 7 * 86400000;
  if (range === '1m') return t >= now - 30 * 86400000;
  return true;
}

export default function SellerFinancialProjection({ seller }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('total'); // 7d | 1m | total
  const [allPkgs, setAllPkgs] = useState([]);
  const [salesPage, setSalesPage] = useState(1);
  const SALES_PAGE_SIZE = 10;

  const sellerId = seller?.seller_id;

  useEffect(() => {
    if (!sellerId) return;
    setLoading(true);
    listSellerPackages(sellerId).then(r => {
      setAllPkgs(r.success ? (r.packages || []) : []);
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, [sellerId]);

  const derived = useMemo(() => {
    // Recent = deliveries in progress toward completion (DELIVERED etc.)
    const recentPool = allPkgs.filter(p =>
      ['DELIVERED', 'COMPLETED', 'RESOLVED'].includes(p.status)
    );

    // Finalized sales = genuinely completed (buyer confirmed / released)
    const finalized = allPkgs.filter(p => {
      const orderStatus = p.order?.status || p.status;
      return orderStatus === 'COMPLETED' || p.status === 'COMPLETED';
    }).filter(p => inRange(p.delivered_at || p.updated_at || p.created_at || p.order?.updated_at, range));

    const recentCompleted = [...recentPool]
      .filter(p => inRange(p.delivered_at || p.updated_at || p.created_at, range))
      .sort((a, b) => new Date(b.delivered_at || b.updated_at || 0) - new Date(a.delivered_at || a.updated_at || 0))
      .slice(0, 8);

    const totalRevenue = finalized.reduce((s, p) => s + (p.subtotal || 0), 0);
    const totalOrders = finalized.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Charts — last 7 day buckets within selected range window
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const dayPkgs = finalized.filter(p => {
        const t = new Date(p.delivered_at || p.updated_at || p.created_at);
        return t >= d && t < next;
      });
      days.push({
        label: d.toLocaleDateString('en', { weekday: 'short' }),
        orders: dayPkgs.length,
        revenue: dayPkgs.reduce((s, p) => s + (p.subtotal || 0), 0),
      });
    }

    // Revenue by category — prefer order.items (has major_category), else package items
    const catRevenue = {};
    finalized.forEach(p => {
      const sourceItems = (p.order?.items || []).filter(it => !it.seller_id || it.seller_id === sellerId);
      const items = sourceItems.length ? sourceItems : (p.items || []);
      items.forEach(it => {
        const cat = it.major_category || it.subcategory || 'uncategorized';
        catRevenue[cat] = (catRevenue[cat] || 0) + (it.subtotal || (it.price * it.qty) || 0);
      });
    });
    const revenueByCategory = Object.entries(catRevenue).map(([category, revenue]) => ({
      category, revenue,
      percentage: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    // Unified sales / transaction rows (one per order/package, expandable items)
    const salesHistory = finalized.map(p => {
      const items = p.order?.items?.length
        ? p.order.items.filter(it => !it.seller_id || it.seller_id === sellerId)
        : (p.items || []);
      const gross = p.subtotal || 0;
      const net = Math.round(gross * (1 - PLATFORM_FEE_PCT / 100));
      return {
        id: p.package_id,
        package_id: p.package_id,
        order_id: p.order_id || p.order?.order_id,
        items,
        buyer: p.order?.buyer_name || '—',
        completedAt: p.delivered_at || p.updated_at || p.created_at || '',
        gross,
        net,
      };
    }).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    return {
      financials: { thisMonth: { revenue: totalRevenue, orders: totalOrders, avgOrderValue } },
      last7Days: days,
      revenueByCategory,
      recentCompleted,
      salesHistory,
    };
  }, [allPkgs, range, sellerId]);

  const salesPageCount = Math.max(1, Math.ceil(derived.salesHistory.length / SALES_PAGE_SIZE));
  const pagedSales = derived.salesHistory.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE);
  const lifetimeNetRevenue = derived.salesHistory.reduce((s, x) => s + (x.net || 0), 0);

  useEffect(() => { setSalesPage(1); }, [range]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-12 h-12 border-4 border-[#FBEFF1] border-t-[#a37b3d] rounded-full animate-spin" />
      </div>
    );
  }

  const { financials, last7Days, revenueByCategory, recentCompleted } = derived;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-gradient-to-tr from-[#1a0a1e]/90 via-[#2d2d44]/90 to-[#3d3455]/90 rounded-2xl p-6 text-white shadow-lg border border-white/10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide mb-3">
          <span>🏪</span> Seller Portal · Financial Projections
        </div>
        <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent">💹 Financial Projections</h1>
        <p className="text-slate-400">Live revenue from finalized completed orders</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { id: '7d', label: '7 Days' },
            { id: '1m', label: '1 Month' },
            { id: 'total', label: 'Total' },
          ].map(opt => (
            <label key={opt.id} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
              range === opt.id ? 'bg-white text-[#a37b3d] border-white' : 'bg-white/10 text-white border-white/20'
            }`}>
              <input type="radio" className="sr-only" name="fin-range" checked={range === opt.id}
                onChange={() => setRange(opt.id)} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#FBEFF1]">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Past 7 Days — Orders</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Line type="monotone" dataKey="orders" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#FBEFF1]">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Past 7 Days — Revenue</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7Days}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Finalized Orders</p>
          <h3 className="text-2xl font-bold text-primary-900 mt-1">{financials.thisMonth.orders}</h3>
          <p className="text-xs text-gray-500 mt-2">Avg: PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Finalized Revenue</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">PKR {financials.thisMonth.revenue.toLocaleString()}</h3>
          <p className="text-xs text-emerald-600 mt-2">Status COMPLETED only</p>
        </div>
      </div>

      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'revenue', label: 'Revenue', icon: '💰' },
          { id: 'history', label: 'Sales & Transactions', icon: '📋' },
          { id: 'recent', label: 'Recent', icon: '🚚' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-white text-[#a37b3d] shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}>
            <span>{tab.icon}</span><span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1] space-y-2">
          <div className="flex justify-between"><span className="text-sm text-gray-600">Finalized Revenue</span><span className="font-bold text-[#a37b3d]">PKR {financials.thisMonth.revenue.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-sm text-gray-600">Orders Completed</span><span className="font-bold">{financials.thisMonth.orders}</span></div>
          <div className="border-t pt-2 flex justify-between"><span className="text-sm font-medium">Avg Order Value</span><span className="font-bold text-[#a37b3d]">PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</span></div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Revenue by Category</h2>
          {revenueByCategory.length > 0 ? revenueByCategory.map((item, idx) => (
            <div key={idx} className="pb-4 border-b border-gray-100 last:border-0">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-800 capitalize">{item.category.replace(/_/g, ' ')}</span>
                <span className="text-lg font-bold text-[#a37b3d]">PKR {item.revenue.toLocaleString()}</span>
              </div>
              <div className="flex items-center">
                <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                  <div className="bg-gradient-to-r from-violet-600 to-indigo-400 h-2 rounded-full" style={{ width: `${item.percentage}%` }} />
                </div>
                <span className="text-sm font-bold w-12 text-right">{item.percentage}%</span>
              </div>
            </div>
          )) : (
            <p className="text-xs text-gray-400 text-center py-8">No finalized category revenue yet.</p>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Sales &amp; Transactions</h2>
              <p className="text-xs text-gray-500">Finalized COMPLETED orders only · click item text to expand</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Net after 5% fee</p>
              <p className="text-2xl font-black text-[#a37b3d]">PKR {lifetimeNetRevenue.toLocaleString()}</p>
            </div>
          </div>
          {derived.salesHistory.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No finalized sales in this period.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-3 text-left text-gray-500 font-bold uppercase">Items</th>
                      <th className="px-3 py-3 text-left text-gray-500 font-bold uppercase">Buyer</th>
                      <th className="px-3 py-3 text-left text-gray-500 font-bold uppercase">Date</th>
                      <th className="px-3 py-3 text-right text-gray-500 font-bold uppercase">Gross</th>
                      <th className="px-3 py-3 text-right text-gray-500 font-bold uppercase">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pagedSales.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-3"><ExpandableItems items={s.items} fallback={s.order_id} /></td>
                        <td className="px-3 py-3 text-gray-600">{s.buyer}</td>
                        <td className="px-3 py-3 text-gray-500">{s.completedAt ? new Date(s.completedAt).toLocaleString() : '—'}</td>
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
                    className="px-3 py-1 text-xs border rounded-lg disabled:opacity-40">Prev</button>
                  <span className="px-3 py-1 text-xs text-gray-500">Page {salesPage} / {salesPageCount}</span>
                  <button onClick={() => setSalesPage(p => Math.min(salesPageCount, p + 1))} disabled={salesPage >= salesPageCount}
                    className="px-3 py-1 text-xs border rounded-lg disabled:opacity-40">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'recent' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Recent Activity</h2>
          <p className="text-xs text-gray-500 mb-4">Delivered / in-progress toward completion (not yet finalized sales).</p>
          {recentCompleted.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentCompleted.map(p => (
                  <tr key={p.package_id}>
                    <td className="px-4 py-3 font-bold">{p.order?.order_id || p.order_id}</td>
                    <td className="px-4 py-3"><ExpandableItems items={p.items || p.order?.items || []} /></td>
                    <td className="px-4 py-3">{p.status}</td>
                    <td className="px-4 py-3 text-right text-[#a37b3d] font-bold">PKR {(p.subtotal || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400 text-center py-8">No recent deliveries.</p>
          )}
        </div>
      )}
    </div>
  );
}
