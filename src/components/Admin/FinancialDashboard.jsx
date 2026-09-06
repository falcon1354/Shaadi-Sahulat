import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import adminApi from '../../api/adminApi';
import adminExtApi from '../../api/adminExtApi';
import { useCategories } from '../../hooks/useCategories';

const CAT_COLORS = ['#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626','#C026D3','#0D9488','#EA580C','#4F46E5'];

export default function FinancialDashboard({ admin }) {
  const { categories } = useCategories();
  const [stats, setStats]         = useState(null);
  const [sellers, setSellers]     = useState([]);
  const [timeline, setTimeline]   = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading]     = useState(true);

  // Build label map dynamically from DB categories
  const catLabels = Object.fromEntries(categories.map(c => [c.category_id, c.label]));

  // The admin id is forwarded to the adminExt endpoints that require the
  // `x-user-id`/`x-user-role` headers. When admin isn't supplied (older call
  // sites), the adminExt calls simply won't be made.
  const adminId = admin?.admin_id || admin?._id || "";

  useEffect(() => {
    const tasks = [adminApi.getStats(), adminApi.getAllSellers()];
    if (adminId) {
      tasks.push(adminExtApi.getSalesTimeline(adminId));
      tasks.push(adminExtApi.getBreakdown(adminId));
    } else {
      tasks.push(Promise.resolve(null), Promise.resolve(null));
    }
    Promise.all(tasks).then(([s, sv, tl, bd]) => {
      setStats(s);
      setSellers(sv.sellers || []);
      setTimeline(tl?.timeline || []);
      setBreakdown(bd?.success ? bd : null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [adminId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading dashboard…</div>;

  // Charts data — both are already dynamic (sourced from /api/admin/stats →
  // ML /seller/stats → real seller uploads).
  const catStats = (stats?.category_stats || []).map((c, i) => ({ ...c, fill: CAT_COLORS[i % CAT_COLORS.length] }));
  const pieData  = catStats.map(c => ({ name: catLabels[c.category] || c.category, value: c.count }));

  // Top sellers sorted by completed_orders (from breakdown, if available) —
  // fallback to product_count.
  const topSellers = (breakdown?.top_sellers || []).slice(0, 10);
  const topBuyers  = (breakdown?.top_buyers  || []).slice(0, 10);
  const catBreakdown = (breakdown?.categories   || []).slice(0, 10);
  const topProducts = (breakdown?.top_products || []).slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold tracking-wide mb-3">
          <span>⚙</span> Admin Portal
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Financial Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Platform overview and product analytics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Sellers',    value: stats?.seller_count     || 0, icon: '🏪', color: 'from-[#a37b3d] to-[#ECD4A8]'   },
          { label: 'Total Buyers',     value: stats?.buyer_count      || 0, icon: '👰', color: 'from-blue-500 to-cyan-500'     },
          { label: 'Products Listed',  value: stats?.product_count    || 0, icon: '📦', color: 'from-orange-500 to-red-500'    },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-xl mb-3`}>
              {card.icon}
            </div>
            <p className="text-2xl font-bold text-gray-800">{card.value.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue banner */}
      <div className="bg-gradient-to-tr from-[#1a0a1e] via-[#2d2d44] to-[#3d3455] rounded-2xl p-6 text-white border border-white/10 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-y-8 translate-x-8 w-40 h-40 bg-slate-400/10 rounded-full blur-2xl pointer-events-none" />
        <p className="text-slate-400 text-sm font-medium relative z-10">Simulated Total Revenue</p>
        <h3 className="text-3xl font-bold mt-1 bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent relative z-10">PKR {(stats?.revenue_simulated || 0).toLocaleString()}</h3>
        <p className="text-slate-400 text-xs mt-2 relative z-10">Based on listed product prices × available inventory</p>
      </div>

      {/* Aggregate sales line chart across ALL sellers combined */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Aggregate Sales Activity — All Sellers (Past 30 Days)</h3>
          <span className="text-xs text-gray-400">{timeline.length} days with activity</span>
        </div>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No sales activity recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `PKR ${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Revenue (PKR)') return [`PKR ${Number(value).toLocaleString()}`, name];
                  return [value, name];
                }}
              />
              <Legend />
              <Line yAxisId="left"  type="monotone" dataKey="order_count" name="Orders"    stroke="#7C3AED" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="revenue"     name="Revenue (PKR)" stroke="#0891B2" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Charts — Products by Category (bar) + Category Distribution (pie).
          Both are dynamic: sourced from /api/admin/stats → /seller/stats →
          real seller uploads (see EXPLORE-3 §A1). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4">Products by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={catStats} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} tickFormatter={k => (catLabels[k] || k).split(' ')[0]} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n, p) => [v, catLabels[p.payload.category] || p.payload.category]} />
              <Bar dataKey="count" radius={[6,6,0,0]}>
                {catStats.map((c, i) => <Cell key={i} fill={c.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4">Category Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Seller Product Breakdown (live, dynamic) */}
      {sellers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Products per Seller (Live)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Seller Name</th>
                  <th className="pb-2 font-medium">Seller ID</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">City</th>
                  <th className="pb-2 font-medium text-right">Products</th>
                  <th className="pb-2 font-medium text-right">Level</th>
                </tr>
              </thead>
              <tbody>
                {[...sellers]
                  .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))
                  .map(s => (
                    <tr key={s.seller_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-800">{s.name}</td>
                      <td className="py-2.5 text-gray-400 font-mono text-xs">{s.seller_id}</td>
                      <td className="py-2.5 text-gray-500 capitalize">{s.seller_type || 'individual'}</td>
                      <td className="py-2.5 text-gray-500">{s.city || '—'}</td>
                      <td className="py-2.5 text-right font-bold text-[#a37b3d]">{s.product_count ?? 0}</td>
                      <td className="py-2.5 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.level === 3 ? 'bg-amber-100 text-amber-700' :
                          s.level === 2 ? 'bg-blue-100 text-blue-700' :
                                          'bg-gray-100 text-gray-600'
                        }`}>L{s.level || 1}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Breakdown section (Task 1f) ───────────────────────────────────
          Top buyers / sellers / categories / products — all from the new
          GET /api/admin/breakdown aggregate endpoint. */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-800">Marketplace Breakdown</h2>
          {!breakdown && <span className="text-xs text-gray-400">(unavailable — sign in as admin)</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 10 Buyers by order count */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Top 10 Buyers (by orders)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Buyer ID</th>
                    <th className="pb-2 font-medium text-right">Orders</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topBuyers.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-gray-400 text-xs">No buyer activity yet.</td></tr>
                  ) : topBuyers.map((b, i) => (
                    <tr key={(b.buyer_id || '') + i} className="border-b border-gray-50">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 font-mono text-xs text-gray-700">{b.buyer_id || '—'}</td>
                      <td className="py-2 text-right font-semibold text-gray-800">{b.order_count}</td>
                      <td className="py-2 text-right text-[#a37b3d] font-semibold">PKR {(b.revenue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 10 Sellers by completed orders */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Top 10 Sellers (by completed orders)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Seller ID</th>
                    <th className="pb-2 font-medium text-right">Completed</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topSellers.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-gray-400 text-xs">No completed seller orders yet.</td></tr>
                  ) : topSellers.map((s, i) => (
                    <tr key={(s.seller_id || '') + i} className="border-b border-gray-50">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 font-mono text-xs text-gray-700">{s.seller_id || '—'}</td>
                      <td className="py-2 text-right font-semibold text-gray-800">{s.completed_orders}</td>
                      <td className="py-2 text-right text-[#a37b3d] font-semibold">PKR {(s.revenue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Products sold per category (sum items_count) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Products Sold per Category</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium text-right">Items Sold</th>
                    <th className="pb-2 font-medium text-right">Orders</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {catBreakdown.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-gray-400 text-xs">No sales yet.</td></tr>
                  ) : catBreakdown.map((c, i) => (
                    <tr key={(c.major_category || '') + i} className="border-b border-gray-50">
                      <td className="py-2 font-medium text-gray-800">
                        <span className="inline-block w-3 h-3 rounded-sm mr-2 align-middle" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                        {catLabels[c.major_category] || c.major_category || 'unknown'}
                      </td>
                      <td className="py-2 text-right font-semibold text-gray-800">{c.items_count}</td>
                      <td className="py-2 text-right text-gray-600">{c.order_count}</td>
                      <td className="py-2 text-right text-[#a37b3d] font-semibold">PKR {(c.revenue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top selling products (by total_sold) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Top 10 Selling Products</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium text-right">Sold</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-gray-400 text-xs">No product sales yet.</td></tr>
                  ) : topProducts.map((p, i) => (
                    <tr key={(p.product_id || '') + i} className="border-b border-gray-50">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 text-gray-800 font-medium">{p.title || p.product_id}</td>
                      <td className="py-2 text-gray-500 text-xs">{catLabels[p.major_category] || p.major_category || '—'}</td>
                      <td className="py-2 text-right font-semibold text-gray-800">{p.total_sold}</td>
                      <td className="py-2 text-right text-[#a37b3d] font-semibold">PKR {(p.revenue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
