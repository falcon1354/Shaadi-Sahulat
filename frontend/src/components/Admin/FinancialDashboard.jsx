import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import adminApi from '../../api/adminApi';
import { resolveImageUrl } from '../../api/sellerApi';
import { useCategories } from '../../hooks/useCategories';

const CAT_COLORS = ['#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626','#C026D3','#0D9488','#EA580C','#4F46E5'];

export default function FinancialDashboard() {
  const { categories } = useCategories();
  const [stats, setStats]       = useState(null);
  const [products, setProducts] = useState([]);
  const [sellers, setSellers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage]         = useState(1);
  const LIMIT = 12;

  // Build label map dynamically from DB categories
  const catLabels = Object.fromEntries(categories.map(c => [c.category_id, c.label]));

  useEffect(() => {
    Promise.all([
      adminApi.getStats(),
      adminApi.getAllProducts({ limit: 200 }),
      adminApi.getAllSellers(),
    ]).then(([s, p, sv]) => {
      setStats(s);
      setProducts(p.products || []);
      setSellers(sv.sellers || []);
      setLoading(false);
    });
  }, []);

  const filtered = catFilter ? products.filter(p => p.major_category === catFilter) : products;
  const pages    = Math.ceil(filtered.length / LIMIT);
  const paged    = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading dashboard…</div>;

  const catStats  = (stats?.category_stats || []).map((c, i) => ({ ...c, fill: CAT_COLORS[i % CAT_COLORS.length] }));
  const pieData   = catStats.map(c => ({ name: catLabels[c.category] || c.category, value: c.count }));

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sellers',    value: stats?.seller_count     || 0, icon: '🏪', color: 'from-[#a37b3d] to-[#ECD4A8]'   },
          { label: 'Total Buyers',     value: stats?.buyer_count      || 0, icon: '👰', color: 'from-blue-500 to-cyan-500'     },
          { label: 'Products Listed',  value: stats?.product_count    || 0, icon: '📦', color: 'from-orange-500 to-red-500'    },
          { label: 'Dowry Estimations',value: stats?.estimation_count || 0, icon: '📊', color: 'from-green-500 to-teal-500'   },
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

      {/* Charts */}
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

      {/* Product browser */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">All Products (Read-Only)</h3>
          <select
            value={catFilter}
            onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paged.map(prod => (
            <div key={prod.product_id} className="border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-36 bg-gray-100 overflow-hidden">
                <img
                  src={resolveImageUrl(prod.primary_image_url)}
                  alt={prod.title}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display='none'; }}
                />
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold text-gray-700 line-clamp-2 leading-tight">{prod.title}</p>
                <p className="text-xs text-[#a37b3d] font-bold mt-1">PKR {prod.price?.toLocaleString()}</p>
                <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {catLabels[prod.major_category] || prod.major_category}
                </span>
              </div>
            </div>
          ))}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">←</button>
            <span className="text-sm text-gray-600">Page {page} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">→</button>
          </div>
        )}
      </div>

      {/* Per-Seller Product Breakdown */}
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
    </div>
  );
}
