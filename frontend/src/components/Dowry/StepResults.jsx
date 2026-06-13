import React, { useState, useEffect } from 'react';
import { patchDowryBudgets } from '../../api/buyerApi';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// 10-colour palette — repeats for more than 10 categories
const PALETTE = [
  '#C026D3','#2563EB','#0891B2','#D97706','#059669',
  '#DC2626','#6B7280','#7C3AED','#EA580C','#0D9488',
];

const formatPKR = (v) => {
  if (v >= 1000000) return `PKR ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `PKR ${(v / 1000).toFixed(0)}K`;
  return `PKR ${v}`;
};

const formatPKRFull = (v) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(v);

function getSliderStep(amount) {
  if (amount > 1500000) return 500;
  if (amount > 1000000) return 1000;
  if (amount > 500000)  return 2000;
  return 5000;
}

function getDeviationColor(current, original) {
  if (!original || original === 0) return 'green';
  const pct = Math.abs((current - original) / original) * 100;
  if (pct <= 10) return 'green';
  if (pct <= 30) return 'yellow';
  return 'red';
}

const DEVIATION_STYLES = {
  green:  { bar: 'bg-green-500',  label: 'text-green-700',  badge: 'bg-green-50 text-green-700 border-green-200' },
  yellow: { bar: 'bg-yellow-500', label: 'text-yellow-700', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  red:    { bar: 'bg-red-500',    label: 'text-red-700',    badge: 'bg-red-50 text-red-700 border-red-200' },
};

// ── helpers ───────────────────────────────────────────────────────────────────
function readDowry(buyerId) {
  try {
    if (buyerId) return JSON.parse(localStorage.getItem(`ss_dowry_${buyerId}`) || 'null');
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

function writeDowry(data, buyerId) {
  const s = JSON.stringify(data);
  localStorage.setItem('ss_dowry_latest', s);
  if (buyerId) localStorage.setItem(`ss_dowry_${buyerId}`, s);
}

// ── StepResults ───────────────────────────────────────────────────────────────
function StepResults({ result, loading, saved, adjustedEstimates, onAdjust, onSave, onReset, priorities, categories = [], buyerId }) {
  // Build label + color maps from live categories prop
  const catLabel = (key) => categories.find(c => c.category_id === key)?.label || key.replace(/_/g,' ');
  const catColor = (key) => {
    const idx = categories.findIndex(c => c.category_id === key);
    return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Running Hybrid Engine (Rule + Market Prices + ML)...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📊</p>
        <p>Complete the previous steps to see your estimation results.</p>
      </div>
    );
  }

  const displayBreakdown = {};
  for (const [key, val] of Object.entries(result.category_breakdown || {})) {
    displayBreakdown[key] = adjustedEstimates[key] !== undefined ? adjustedEstimates[key] : val;
  }

  const adjustedTotal = Object.values(displayBreakdown).reduce((a, b) => a + b, 0);

  // Pie/bar: top 10 by highest estimated amount
  const sortedEntries = Object.entries(displayBreakdown)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const pieData = sortedEntries.map(([key, value]) => ({
    name: catLabel(key), value, key, color: catColor(key),
  }));

  const barData = sortedEntries.map(([key, value]) => ({
    name: catLabel(key), amount: value, color: catColor(key),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Results Dashboard</h2>
        <p className="text-sm text-gray-500">
          Personalized estimate from Hybrid Engine (Rule + Market Prices + ML). Adjust sliders below.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Total Budget</p>
          <p className="text-xl font-bold mt-1">{formatPKRFull(adjustedTotal)}</p>
          {adjustedTotal !== result.total_recommended_budget && (
            <p className="text-xs opacity-70 mt-0.5">System: {formatPKR(result.total_recommended_budget)}</p>
          )}
        </div>
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">From Income</p>
          <p className="text-xl font-bold mt-1">{formatPKR(result.budget_sources?.from_income || 0)}</p>
          <p className="text-xs opacity-70 mt-1">{result.budget_sources?.income_percentage || 0}% of budget</p>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">From Savings</p>
          <p className="text-xl font-bold mt-1">{formatPKR(result.budget_sources?.from_savings || 0)}</p>
          <p className="text-xs opacity-70 mt-1">{result.budget_sources?.savings_percentage || 0}% of budget</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Responsibility Score</p>
          <p className="text-xl font-bold mt-1">{(result.responsibility_score * 100).toFixed(0)}%</p>
          <p className="text-xs opacity-70 mt-1">ML: {(result.ml_adjustment_factor * 100).toFixed(1)}%</p>
        </div>
      </div>

      {/* Adjustable sliders */}
      <div className="border border-gray-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Adjust Category Budgets</h3>
        <p className="text-xs text-gray-400 mb-4">Drag sliders to fine-tune each category. Total updates live.</p>
        <div className="space-y-5">
          {Object.entries(result.category_breakdown || {}).map(([key, originalAmt]) => {
            const current   = displayBreakdown[key] ?? originalAmt;
            const step      = getSliderStep(originalAmt);
            const maxVal    = Math.max(originalAmt * 2, step * 20);
            const deviation = getDeviationColor(current, originalAmt);
            const styles    = DEVIATION_STYLES[deviation];
            const devPct    = originalAmt > 0
              ? (((current - originalAmt) / originalAmt) * 100).toFixed(0)
              : 0;
            const color = catColor(key);

            if (priorities && priorities[`priority_${key}`] === 'Not_Wanted') return null;
            if (!priorities && originalAmt === 0) return null;

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-gray-700">{catLabel(key)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles.badge}`}>
                      {devPct > 0 ? `+${devPct}%` : devPct < 0 ? `${devPct}%` : 'On target'}
                    </span>
                    <span className={`text-sm font-semibold font-mono ${styles.label}`}>
                      {formatPKR(current)}
                    </span>
                  </div>
                </div>
                <input
                  type="range" min={0} max={maxVal} step={step} value={current}
                  onChange={(e) => onAdjust(key, Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${color} ${(current / maxVal) * 100}%, #e5e7eb ${(current / maxVal) * 100}%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>PKR 0</span>
                  <span>System: {formatPKR(originalAmt)}</span>
                  <span>{formatPKR(maxVal)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">Adjusted Total:</span>
          <span className="text-lg font-bold text-purple-700">{formatPKRFull(adjustedTotal)}</span>
        </div>
      </div>

      {/* Charts — top 10 by highest amount */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Category Breakdown (Pie)</h3>
          <p className="text-xs text-gray-400 mb-3">Top {pieData.length} categories by estimated amount</p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={110} innerRadius={45} paddingAngle={2}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => formatPKRFull(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Category Amounts (Bar)</h3>
          <p className="text-xs text-gray-400 mb-3">Sorted highest to lowest</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={formatPKR} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatPKRFull(v)} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Community Insights */}
      {result.training_matches?.length > 0 && (
        <CommunityInsights matches={result.training_matches} myBudget={adjustedTotal} />
      )}

      {/* Breakdown Table */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600">Category</th>
              <th className="text-right px-4 py-3 text-gray-600">System Estimate</th>
              <th className="text-right px-4 py-3 text-gray-600">Your Amount</th>
              <th className="text-right px-4 py-3 text-gray-600">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.category_breakdown || {}).map(([key, sysAmt]) => {
              const adjusted = displayBreakdown[key] ?? sysAmt;
              const pct      = adjustedTotal > 0 ? ((adjusted / adjustedTotal) * 100).toFixed(1) : 0;
              const dev      = getDeviationColor(adjusted, sysAmt);
              const styles   = DEVIATION_STYLES[dev];
              return (
                <tr key={key} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: catColor(key) }} />
                    {catLabel(key)}
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-gray-400 text-xs">{formatPKRFull(sysAmt)}</td>
                  <td className={`text-right px-4 py-3 font-mono font-semibold ${styles.label}`}>{formatPKRFull(adjusted)}</td>
                  <td className="text-right px-4 py-3 text-gray-500">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {result.notes?.length > 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Estimation Notes</h3>
          <ul className="space-y-1">
            {result.notes.map((note, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>{note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ML Metadata */}
      {result.ml_metadata && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">ML Analysis Details</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><span className="text-blue-500">Cluster ID</span><p className="font-bold text-blue-800">{result.ml_metadata.cluster_id}</p></div>
            <div><span className="text-blue-500">Similar Users</span><p className="font-bold text-blue-800">{result.ml_metadata.similar_users_count}</p></div>
            <div><span className="text-blue-500">Adjustment</span><p className="font-bold text-blue-800">{(result.ml_metadata.adjustment_factor * 100).toFixed(1)}%</p></div>
            <div><span className="text-blue-500">Cluster Deviation</span><p className="font-bold text-blue-800">{(result.ml_metadata.cluster_mean_deviation * 100).toFixed(1)}%</p></div>
          </div>
        </div>
      )}

      {/* Saved + budget management */}
      {saved && <BudgetManageSection categories={categories} buyerId={buyerId} />}
    </div>
  );
}

// ── Community Insights ────────────────────────────────────────────────────────
function incomeBucket(income) {
  if (income <  30000) return "< 30K";
  if (income <  50000) return "30K–50K";
  if (income <  75000) return "50K–75K";
  if (income < 100000) return "75K–100K";
  if (income < 150000) return "100K–150K";
  if (income < 200000) return "150K–200K";
  if (income < 300000) return "200K–300K";
  return "300K+";
}

function CommunityInsights({ matches, myBudget }) {
  return (
    <div className="border border-purple-100 rounded-xl overflow-hidden">
      <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
        <h3 className="text-sm font-semibold text-purple-800">Community Insights</h3>
        <p className="text-xs text-purple-500 mt-0.5">
          {matches.length} similar profiles found
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Income Range</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Family</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Their Budget</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">vs Yours</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const dev      = m.deviation_pct;
            const devColor = Math.abs(dev) <= 10 ? "text-green-600" : Math.abs(dev) <= 25 ? "text-amber-600" : "text-red-600";
            return (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-700 font-medium">PKR {incomeBucket(m.income)}/mo</td>
                <td className="px-4 py-2.5 text-center text-gray-500">{m.total_family_members} members</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatPKR(m.total_recommended_budget)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${devColor}`}>
                  {dev > 0 ? `+${dev}%` : dev < 0 ? `${dev}%` : 'Same'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Budget Shift Section ──────────────────────────────────────────────────────
function BudgetManageSection({ categories = [], buyerId }) {
  const [open,    setOpen]    = useState(false);
  const [fromCat, setFromCat] = useState('');
  const [toCat,   setToCat]   = useState('');
  const [amount,  setAmount]  = useState('');
  const [msg,     setMsg]     = useState('');
  const [dowry,   setDowry]   = useState(() => readDowry(buyerId));

  // Re-read whenever localStorage changes (e.g. after cart checkout updates it)
  useEffect(() => {
    setDowry(readDowry(buyerId));
  }, [buyerId, open]);

  const budgets   = dowry?.category_budgets || {};
  const dbCatIds  = categories.map(c => c.category_id);
  const cats      = Object.entries(budgets).filter(([key, v]) =>
    v.active !== false && (dbCatIds.length === 0 || dbCatIds.includes(key))
  );

  const getLabel  = (key) => categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');
  const fromAvail = fromCat ? (budgets[fromCat]?.remaining ?? budgets[fromCat]?.estimated ?? 0) : 0;

  const handleShift = async () => {
    const amt = Number(amount);
    if (!fromCat || !toCat)  return setMsg('Select both categories.');
    if (fromCat === toCat)   return setMsg('Cannot shift to the same category.');
    if (!amt || amt <= 0)    return setMsg('Enter a valid amount.');
    if (amt > fromAvail)     return setMsg(`Max available: PKR ${fromAvail.toLocaleString()}`);

    try {
      const d = readDowry(buyerId);
      if (!d?.category_budgets) return setMsg('No estimation found.');
      const b = { ...d.category_budgets };
      if (!b[fromCat] || !b[toCat]) return setMsg('Category not found in budget.');
      b[fromCat] = { ...b[fromCat], estimated: (b[fromCat].estimated || 0) - amt, remaining: (b[fromCat].remaining ?? b[fromCat].estimated) - amt };
      b[toCat]   = { ...b[toCat],   estimated: (b[toCat].estimated   || 0) + amt, remaining: (b[toCat].remaining   ?? b[toCat].estimated) + amt };
      const updated = { ...d, category_budgets: b };
      writeDowry(updated, buyerId);
      setDowry(updated);  // update local state so dropdowns refresh
      // Persist to MongoDB
      if (buyerId) patchDowryBudgets(buyerId, b).catch(() => {});
      setMsg(`Shifted PKR ${amt.toLocaleString()} from ${getLabel(fromCat)} to ${getLabel(toCat)}.`);
      setAmount('');
      setTimeout(() => setMsg(''), 4000);
    } catch { setMsg('Shift failed.'); }
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-green-700 font-semibold">Estimation saved! Your data has been added to the ML dataset.</p>
        <button onClick={() => setOpen(v => !v)}
          className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium">
          {open ? 'Close' : 'Manage Budget'}
        </button>
      </div>

      {open && (
        <div className="bg-white border border-purple-100 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-gray-800">Budget Shift</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Category</label>
              <select value={fromCat} onChange={e => { setFromCat(e.target.value); setMsg(''); }}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="">Select…</option>
                {cats.map(([k, v]) => (
                  <option key={k} value={k}>
                    {getLabel(k)} — PKR {(v.remaining ?? v.estimated ?? 0).toLocaleString()} left
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (PKR)</label>
              <input type="number" value={amount} min="1" max={fromAvail}
                onChange={e => { setAmount(e.target.value); setMsg(''); }}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Category</label>
              <select value={toCat} onChange={e => { setToCat(e.target.value); setMsg(''); }}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="">Select…</option>
                {cats.filter(([k]) => k !== fromCat).map(([k]) => (
                  <option key={k} value={k}>{getLabel(k)}</option>
                ))}
              </select>
            </div>
          </div>
          {msg && (
            <p className={`text-xs px-3 py-2 rounded-lg ${msg.startsWith('Shifted') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {msg}
            </p>
          )}
          <button onClick={handleShift}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold">
            Confirm Shift
          </button>
        </div>
      )}
    </div>
  );
}

export default StepResults;
