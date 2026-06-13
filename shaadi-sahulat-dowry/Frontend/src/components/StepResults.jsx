import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const CATEGORY_COLORS = {
  bridal_dress: '#C026D3',
  groom_dress: '#7C3AED',
  furniture: '#2563EB',
  electronics: '#0891B2',
  jewelry: '#D97706',
  kitchen_items: '#059669',
  decoration: '#DC2626',
  miscellaneous: '#6B7280',
};

const CATEGORY_LABELS = {
  bridal_dress: 'Bridal Dress',
  groom_dress: 'Groom Dress',
  furniture: 'Furniture',
  electronics: 'Electronics',
  jewelry: 'Jewelry',
  kitchen_items: 'Kitchen Items',
  decoration: 'Decoration',
  miscellaneous: 'Miscellaneous',
};

const formatPKR = (value) => {
  if (value >= 1000000) return `PKR ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `PKR ${(value / 1000).toFixed(0)}K`;
  return `PKR ${value}`;
};

const formatPKRFull = (value) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(value);

function StepResults({ result, loading, saved, onSave, onReset }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Running Hybrid Engine (Rule-Based + ML)...</p>
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

  // Prepare chart data
  const pieData = Object.entries(result.category_breakdown || {}).map(
    ([key, value]) => ({
      name: CATEGORY_LABELS[key] || key,
      value,
      key,
      color: CATEGORY_COLORS[key] || '#999',
    })
  );

  const barData = Object.entries(result.category_breakdown || {}).map(
    ([key, value]) => ({
      name: CATEGORY_LABELS[key] || key,
      amount: value,
      color: CATEGORY_COLORS[key] || '#999',
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Results Dashboard</h2>
        <p className="text-sm text-gray-500">
          Your personalized dowry budget estimation powered by the Hybrid Engine.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Total Recommended Budget</p>
          <p className="text-xl font-bold mt-1">
            {formatPKRFull(result.total_recommended_budget)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Budget from Income</p>
          <p className="text-xl font-bold mt-1">
            {formatPKR(result.budget_sources?.from_income || 0)}
          </p>
          <p className="text-xs opacity-70 mt-1">
            {result.budget_sources?.income_percentage || 0}% of budget
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Budget from Savings</p>
          <p className="text-xl font-bold mt-1">
            {formatPKR(result.budget_sources?.from_savings || 0)}
          </p>
          <p className="text-xs opacity-70 mt-1">
            {result.budget_sources?.savings_percentage || 0}% of budget
          </p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Responsibility Score</p>
          <p className="text-xl font-bold mt-1">
            {(result.responsibility_score * 100).toFixed(0)}%
          </p>
          <p className="text-xs opacity-70 mt-1">
            ML Adjustment: {(result.ml_adjustment_factor * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Category Breakdown (Pie Chart)
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={120}
                innerRadius={50}
                paddingAngle={2}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
                labelLine={true}
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatPKRFull(value)}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Category Amounts (Bar Chart)
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={formatPKR} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatPKRFull(value)} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600">Category</th>
              <th className="text-right px-4 py-3 text-gray-600">Amount (PKR)</th>
              <th className="text-right px-4 py-3 text-gray-600">Percentage</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.category_breakdown || {}).map(([key, value]) => {
              const pct = result.total_recommended_budget > 0
                ? ((value / result.total_recommended_budget) * 100).toFixed(1)
                : 0;
              return (
                <tr key={key} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[key] }}
                    />
                    {CATEGORY_LABELS[key] || key}
                  </td>
                  <td className="text-right px-4 py-3 font-mono">
                    {formatPKRFull(value)}
                  </td>
                  <td className="text-right px-4 py-3">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {result.notes && result.notes.length > 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Estimation Notes</h3>
          <ul className="space-y-1">
            {result.notes.map((note, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>
                {note}
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
            <div>
              <span className="text-blue-500">Cluster ID</span>
              <p className="font-bold text-blue-800">{result.ml_metadata.cluster_id}</p>
            </div>
            <div>
              <span className="text-blue-500">Similar Users</span>
              <p className="font-bold text-blue-800">{result.ml_metadata.similar_users_count}</p>
            </div>
            <div>
              <span className="text-blue-500">Adjustment Factor</span>
              <p className="font-bold text-blue-800">
                {(result.ml_metadata.adjustment_factor * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <span className="text-blue-500">Cluster Deviation</span>
              <p className="font-bold text-blue-800">
                {(result.ml_metadata.cluster_mean_deviation * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Saved Confirmation */}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-green-700 font-semibold">
            ✅ Estimation saved successfully! Your data has been added to the ML dataset.
          </p>
        </div>
      )}
    </div>
  );
}

export default StepResults;
