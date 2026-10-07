import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { listSellerPackages } from '../../api/orderApi';
import ExpandableItems from '../Common/ExpandableItems';
import SellerPageHero from '../Common/SellerPageHero';

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
      <div className="flex flex-col items-center justify-center min-h-[400px] text-stone-500">
        <div className="w-10 h-10 border-3 border-[#FAF3E8] border-t-[#9B7036] rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium font-serif italic text-stone-600">Calculating financial metrics...</p>
      </div>
    );
  }

  const { financials, last7Days, revenueByCategory, recentCompleted } = derived;

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Page Hero */}
      <SellerPageHero
        badge="Merchant Treasury"
        title="Financial Analytics & Revenue"
        subtitle="Track live earnings from fulfilled orders, sales volume, category distributions, and automated payout releases."
        imageKey="finances"
        rightSlot={
          <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm p-1 rounded-2xl border border-[#EADBCC]">
            {[
              { id: '7d', label: 'Last 7 Days' },
              { id: '1m', label: 'Past Month' },
              { id: 'total', label: 'All-Time' },
            ].map(opt => {
              const active = range === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setRange(opt.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#9B7036] to-[#7d5624] text-white shadow-sm'
                      : 'text-stone-600 hover:text-[#9B7036]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-3xl p-6 shadow-luxury border border-[#EFEAE4]">
          <div className="w-10 h-10 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-lg mb-3">
            💰
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Finalized Revenue</p>
          <h3 className="font-serif text-3xl font-bold text-[#9B7036] mt-1">
            PKR {financials.thisMonth.revenue.toLocaleString()}
          </h3>
          <p className="text-xs text-emerald-700 font-medium mt-2 flex items-center gap-1">
            <span>✓</span> Completed &amp; verified orders
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-luxury border border-[#EFEAE4]">
          <div className="w-10 h-10 rounded-2xl bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] flex items-center justify-center text-lg mb-3">
            📦
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Fulfilled Orders</p>
          <h3 className="font-serif text-3xl font-bold text-stone-900 mt-1">
            {financials.thisMonth.orders}
          </h3>
          <p className="text-xs text-stone-500 mt-2">
            Average Order Value: <span className="font-semibold text-stone-700">PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</span>
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-luxury border border-[#EFEAE4]">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center text-lg mb-3">
            🏦
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Net Merchant Payout</p>
          <h3 className="font-serif text-3xl font-bold text-emerald-700 mt-1">
            PKR {lifetimeNetRevenue.toLocaleString()}
          </h3>
          <p className="text-xs text-stone-500 mt-2">
            After 5% standard platform commission
          </p>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-3xl p-6 shadow-luxury border border-[#EFEAE4]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-stone-900">Weekly Order Volume</h3>
              <p className="text-xs text-stone-500">Fulfilled orders per day</p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
              Orders Trend
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0ECE1" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #EADBCC', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                />
                <Line type="monotone" dataKey="orders" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4, fill: '#7c3aed' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-luxury border border-[#EFEAE4]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-stone-900">Weekly Revenue Inflow</h3>
              <p className="text-xs text-stone-500">Daily gross revenue (PKR)</p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-[#FAF3E8] text-[#9B7036] rounded-full border border-[#ECD4A8]">
              PKR Volume
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0ECE1" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip
                  formatter={v => [`PKR ${Number(v).toLocaleString()}`, 'Revenue']}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #EADBCC', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#9B7036" strokeWidth={2.5} dot={{ r: 4, fill: '#9B7036' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 bg-white/80 backdrop-blur-sm p-1.5 rounded-2xl border border-[#EFEAE4] overflow-x-auto">
        {[
          { id: 'overview', label: 'Summary Overview', icon: '📊' },
          { id: 'revenue', label: 'Category Revenue', icon: '💎' },
          { id: 'history', label: 'Sales & Transactions', icon: '📋' },
          { id: 'recent', label: 'Recent Dispatches', icon: '🚚' },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#9B7036] to-[#7d5624] text-white shadow-sm'
                  : 'text-stone-600 hover:text-[#9B7036] hover:bg-stone-50'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-3xl p-7 shadow-luxury border border-[#EFEAE4] space-y-4">
          <h3 className="font-serif text-lg font-bold text-stone-900 border-b border-[#FAF7F2] pb-3">Financial Performance Summary</h3>
          <div className="divide-y divide-[#FAF7F2] text-sm">
            <div className="flex justify-between py-3">
              <span className="text-stone-600">Gross Finalized Revenue</span>
              <span className="font-serif font-bold text-lg text-[#9B7036]">PKR {financials.thisMonth.revenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-stone-600">Total Confirmed Orders</span>
              <span className="font-semibold text-stone-900">{financials.thisMonth.orders}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-stone-600">Average Basket Size</span>
              <span className="font-serif font-bold text-[#9B7036]">PKR {Math.round(financials.thisMonth.avgOrderValue).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-stone-600">Standard Platform Commission (5%)</span>
              <span className="font-mono text-stone-500">- PKR {Math.round(financials.thisMonth.revenue * 0.05).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-3 bg-[#FAF3E8]/40 -mx-7 px-7 rounded-b-2xl">
              <span className="font-bold text-stone-900">Estimated Net Payout</span>
              <span className="font-serif text-xl font-bold text-emerald-700">PKR {Math.round(financials.thisMonth.revenue * 0.95).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Revenue by Category */}
      {activeTab === 'revenue' && (
        <div className="bg-white rounded-3xl p-7 shadow-luxury border border-[#EFEAE4]">
          <h3 className="font-serif text-lg font-bold text-stone-900 mb-4">Revenue Breakdown by Bridal Category</h3>
          {revenueByCategory.length > 0 ? (
            <div className="space-y-4">
              {revenueByCategory.map((item, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-[#FAF7F2]/60 border border-[#EFEAE4]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-stone-800 capitalize">{item.category.replace(/_/g, ' ')}</span>
                    <span className="font-serif text-lg font-bold text-[#9B7036]">PKR {item.revenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-stone-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#9B7036] to-[#ECD4A8] h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-stone-600 w-12 text-right">{item.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400 text-center py-12">No categorized sales recorded for this timeframe.</p>
          )}
        </div>
      )}

      {/* Tab: Sales History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl p-7 shadow-luxury border border-[#EFEAE4]">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h3 className="font-serif text-lg font-bold text-stone-900">Sales &amp; Transaction Ledger</h3>
              <p className="text-xs text-stone-500">Fully settled and completed buyer orders</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Net Settled</p>
              <p className="font-serif text-2xl font-bold text-[#9B7036]">PKR {lifetimeNetRevenue.toLocaleString()}</p>
            </div>
          </div>

          {derived.salesHistory.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-12">No finalized sales recorded in this period.</p>
          ) : (
            <>
              <div className="overflow-x-auto border border-[#EFEAE4] rounded-2xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#EFEAE4]">
                      <th className="px-4 py-3.5 text-left text-stone-600 font-bold uppercase tracking-wider text-[11px]">Items</th>
                      <th className="px-4 py-3.5 text-left text-stone-600 font-bold uppercase tracking-wider text-[11px]">Buyer</th>
                      <th className="px-4 py-3.5 text-left text-stone-600 font-bold uppercase tracking-wider text-[11px]">Date</th>
                      <th className="px-4 py-3.5 text-right text-stone-600 font-bold uppercase tracking-wider text-[11px]">Gross (PKR)</th>
                      <th className="px-4 py-3.5 text-right text-stone-600 font-bold uppercase tracking-wider text-[11px]">Net Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF7F2]">
                    {pagedSales.map(s => (
                      <tr key={s.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                        <td className="px-4 py-3.5"><ExpandableItems items={s.items} fallback={s.order_id} /></td>
                        <td className="px-4 py-3.5 text-stone-700 font-medium">{s.buyer}</td>
                        <td className="px-4 py-3.5 text-stone-500">{s.completedAt ? new Date(s.completedAt).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3.5 text-right text-stone-600 font-mono">PKR {Math.round(s.gross).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right font-serif font-bold text-base text-[#9B7036]">PKR {s.net.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {salesPageCount > 1 && (
                <div className="flex items-center justify-center gap-3 mt-5">
                  <button
                    onClick={() => setSalesPage(p => Math.max(1, p - 1))}
                    disabled={salesPage <= 1}
                    className="px-4 py-1.5 text-xs font-semibold border border-[#EADBCC] rounded-xl hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-stone-500 font-medium">Page {salesPage} of {salesPageCount}</span>
                  <button
                    onClick={() => setSalesPage(p => Math.min(salesPageCount, p + 1))}
                    disabled={salesPage >= salesPageCount}
                    className="px-4 py-1.5 text-xs font-semibold border border-[#EADBCC] rounded-xl hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Recent Activity */}
      {activeTab === 'recent' && (
        <div className="bg-white rounded-3xl p-7 shadow-luxury border border-[#EFEAE4]">
          <h3 className="font-serif text-lg font-bold text-stone-900 mb-1">Recent In-Flight Dispatches</h3>
          <p className="text-xs text-stone-500 mb-4">Orders delivered or awaiting final buyer acceptance release</p>

          {recentCompleted.length > 0 ? (
            <div className="overflow-x-auto border border-[#EFEAE4] rounded-2xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#EFEAE4]">
                    <th className="px-4 py-3.5 text-left text-stone-600 font-bold uppercase tracking-wider text-[11px]">Order Code</th>
                    <th className="px-4 py-3.5 text-left text-stone-600 font-bold uppercase tracking-wider text-[11px]">Items</th>
                    <th className="px-4 py-3.5 text-left text-stone-600 font-bold uppercase tracking-wider text-[11px]">Package Status</th>
                    <th className="px-4 py-3.5 text-right text-stone-600 font-bold uppercase tracking-wider text-[11px]">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FAF7F2]">
                  {recentCompleted.map(p => (
                    <tr key={p.package_id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-stone-800">#{p.order?.order_id || p.order_id}</td>
                      <td className="px-4 py-3.5"><ExpandableItems items={p.items || p.order?.items || []} /></td>
                      <td className="px-4 py-3.5">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px] uppercase">
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-serif font-bold text-[#9B7036] text-base">
                        PKR {(p.subtotal || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-stone-400 text-center py-12">No recent deliveries currently in progress.</p>
          )}
        </div>
      )}
    </div>
  );
}
