import React, { useState } from 'react';

export default function SellerFinancialProjection({ seller }) {
  const [activeTab, setActiveTab] = useState('overview');

  // Financial metrics
  const financials = {
    thisMonth: {
      revenue: 285000,
      expenses: 120000,
      profit: 165000,
      orders: 24,
      avgOrderValue: 11875,
    },
    lastMonth: {
      revenue: 240000,
      expenses: 105000,
      profit: 135000,
      orders: 20,
      avgOrderValue: 12000,
    },
    thisQuarter: {
      revenue: 605000,
      expenses: 265000,
      profit: 340000,
      orders: 52,
      avgOrderValue: 11635,
    }
  };

  // Transaction history
  const [transactions] = useState([
    { id: 1, type: 'income', description: 'Sale: Bridal Lehenga', amount: 28000, date: '2024-01-15' },
    { id: 2, type: 'expense', description: 'Material Purchase', amount: -8000, date: '2024-01-14' },
    { id: 3, type: 'income', description: 'Sale: Groom Sherwani', amount: 12000, date: '2024-01-12' },
    { id: 4, type: 'expense', description: 'Delivery Charges', amount: -2500, date: '2024-01-11' },
    { id: 5, type: 'income', description: 'Sale: Jewelry Set', amount: 5000, date: '2024-01-08' },
    { id: 6, type: 'expense', description: 'Packaging Materials', amount: -1500, date: '2024-01-07' },
  ]);

  // Revenue by category
  const [revenueByCategory] = useState([
    { category: 'Bridal Dresses', revenue: 168000, percentage: 59 },
    { category: 'Groom Dresses', revenue: 72000, percentage: 25 },
    { category: 'Jewelry & Accessories', revenue: 25000, percentage: 9 },
    { category: 'Other', revenue: 20000, percentage: 7 },
  ]);

  // Expense breakdown
  const [expenses] = useState([
    { category: 'Materials & Supplies', amount: 60000, percentage: 50 },
    { category: 'Shipping & Delivery', amount: 30000, percentage: 25 },
    { category: 'Packaging', amount: 15000, percentage: 12 },
    { category: 'Marketing', amount: 10000, percentage: 8 },
    { category: 'Miscellaneous', amount: 5000, percentage: 5 },
  ]);

  // Profit projections
  const [projections] = useState([
    { month: 'Jan', projected: 165000, confidence: '95%' },
    { month: 'Feb', projected: 195000, confidence: '85%' },
    { month: 'Mar', projected: 220000, confidence: '70%' },
    { month: 'Apr', projected: 210000, confidence: '60%' },
  ]);

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const profitMargin = Math.round((financials.thisMonth.profit / financials.thisMonth.revenue) * 100);
  const growthRate = Math.round(((financials.thisMonth.revenue - financials.lastMonth.revenue) / financials.lastMonth.revenue) * 100);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-tr from-[#1a0a1e]/90 via-[#2d2d44]/90 to-[#3d3455]/90 rounded-2xl p-6 text-white shadow-lg border border-white/10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-slate-300 text-xs font-bold tracking-wide mb-3">
          <span>🏪</span> Seller Portal · Financial Projections
        </div>
        <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-slate-200 via-white to-slate-400 bg-clip-text text-transparent">💹 Financial Projections</h1>
        <p className="text-slate-400">Revenue, expenses, and profit analysis</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Monthly Revenue</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">Rs {(financials.thisMonth.revenue / 1000).toLocaleString()}K</h3>
          <p className={`text-xs mt-2 font-medium ${growthRate >= 0 ? 'text-[#a37b3d]' : 'text-red-600'}`}>
            {growthRate >= 0 ? '↑' : '↓'} {Math.abs(growthRate)}% vs last month
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Monthly Profit</p>
          <h3 className="text-2xl font-bold text-[#a37b3d] mt-1">Rs {(financials.thisMonth.profit / 1000).toLocaleString()}K</h3>
          <p className="text-xs text-[#a37b3d] mt-2">{profitMargin}% profit margin</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Total Expenses</p>
          <h3 className="text-2xl font-bold text-[#8a6633] mt-1">Rs {(totalExpenses / 1000).toLocaleString()}K</h3>
          <p className="text-xs text-[#ECD4A8] mt-2">
            {Math.round((totalExpenses / financials.thisMonth.revenue) * 100)}% of revenue
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#FBEFF1]">
          <p className="text-gray-500 text-sm font-medium">Orders This Month</p>
          <h3 className="text-2xl font-bold text-primary-900 mt-1">{financials.thisMonth.orders}</h3>
          <p className="text-xs text-gray-500 mt-2">
            Avg: Rs {financials.thisMonth.avgOrderValue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'revenue', label: 'Revenue', icon: '💰' },
          { id: 'expenses', label: 'Expenses', icon: '💸' },
          { id: 'transactions', label: 'Transactions', icon: '📋' },
          { id: 'projection', label: 'Projection', icon: '🔮' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-white text-[#a37b3d] shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
              <h3 className="text-sm font-medium text-gray-500 mb-3">This Month</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Revenue</span>
                  <span className="font-bold text-[#a37b3d]">Rs {financials.thisMonth.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Expenses</span>
                  <span className="font-bold text-[#8a6633]">Rs {financials.thisMonth.expenses.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Net Profit</span>
                  <span className="font-bold text-[#a37b3d]">Rs {financials.thisMonth.profit.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Last Month</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Revenue</span>
                  <span className="font-bold text-[#a37b3d]">Rs {financials.lastMonth.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Expenses</span>
                  <span className="font-bold text-[#8a6633]">Rs {financials.lastMonth.expenses.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Net Profit</span>
                  <span className="font-bold text-[#a37b3d]">Rs {financials.lastMonth.profit.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary-200">
              <h3 className="text-sm font-medium text-gray-500 mb-3">This Quarter</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Revenue</span>
                  <span className="font-bold text-[#a37b3d]">Rs {(financials.thisQuarter.revenue / 1000).toLocaleString()}K</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Expenses</span>
                  <span className="font-bold text-[#8a6633]">Rs {(financials.thisQuarter.expenses / 1000).toLocaleString()}K</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Net Profit</span>
                  <span className="font-bold text-[#a37b3d]">Rs {(financials.thisQuarter.profit / 1000).toLocaleString()}K</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key Insights */}
          <div className="bg-gradient-to-r from-[#FFF5F8] to-teal-50 rounded-2xl p-6 border border-[#FBEFF1]">
            <h3 className="font-bold text-gray-800 mb-3">📊 Key Insights</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>✓ Revenue increased by {growthRate}% compared to last month</li>
              <li>✓ Profit margin is {profitMargin}% - excellent performance</li>
              <li>✓ Average order value: Rs {financials.thisMonth.avgOrderValue.toLocaleString()}</li>
              <li>✓ Top category: Bridal Dresses (59% of revenue)</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB: Revenue */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Revenue by Category</h2>
            
            <div className="space-y-4">
              {revenueByCategory.map((item, idx) => (
                <div key={idx} className="pb-4 border-b border-gray-100 last:border-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-800">{item.category}</span>
                    <span className="text-lg font-bold text-[#a37b3d]">Rs {item.revenue.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                      <div
                        className="bg-gradient-to-r from-violet-600 to-indigo-400 h-2 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-700 w-12 text-right">{item.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-[#FFF5F8] rounded-lg border border-[#FBEFF1]">
              <p className="text-sm text-gray-700">
                <strong>Total Monthly Revenue:</strong> Rs {financials.thisMonth.revenue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Expenses */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Expense Breakdown</h2>
            
            <div className="space-y-4">
              {expenses.map((exp, idx) => (
                <div key={idx} className="pb-4 border-b border-gray-100 last:border-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-800">{exp.category}</span>
                    <span className="text-lg font-bold text-[#8a6633]">Rs {exp.amount.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                      <div
                        className="bg-gradient-to-r from-violet-600 to-indigo-400 h-2 rounded-full"
                        style={{ width: `${exp.percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-700 w-12 text-right">{exp.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-[#FFF5F8] rounded-lg border border-[#FBEFF1]">
              <p className="text-sm text-gray-700">
                <strong>Total Monthly Expenses:</strong> Rs {totalExpenses.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                <strong>Expense Ratio:</strong> {Math.round((totalExpenses / financials.thisMonth.revenue) * 100)}% of revenue
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Transactions */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#FBEFF1]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Transaction History</h2>
            
            <div className="space-y-2">
              {transactions.map((trans) => (
                <div key={trans.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      trans.type === 'income' ? 'bg-[#a37b3d]' : 'bg-red-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{trans.description}</p>
                      <p className="text-xs text-gray-500">{trans.date}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${
                    trans.type === 'income' ? 'text-[#a37b3d]' : 'text-red-600'
                  }`}>
                    {trans.type === 'income' ? '+' : ''} Rs {Math.abs(trans.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Projection */}
      {activeTab === 'projection' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Profit Projection (Next 4 Months)</h2>
            
            <div className="flex items-end justify-around h-48 gap-4 mb-6">
              {projections.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center flex-1">
                  <div className="text-xs text-gray-500 mb-1">{item.confidence}</div>
                  <div className="text-xs text-gray-500 mb-2">Rs {(item.projected / 1000).toLocaleString()}K</div>
                  <div className="w-full bg-gray-200 rounded-t-lg hover:opacity-75 transition-opacity cursor-pointer" style={{
                    height: '120px',
                    background: 'linear-gradient(to top, #10b981, #6ee7b7)',
                    opacity: idx === 0 ? 1 : 0.8
                  }} />
                  <div className="text-sm font-bold text-gray-700 mt-2">{item.month}</div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {projections.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{item.month}</p>
                    <p className="text-xs text-gray-500">Confidence: {item.confidence}</p>
                  </div>
                  <p className="text-lg font-bold text-[#a37b3d]">Rs {item.projected.toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-300">
              <h4 className="font-bold text-gray-800 mb-2">📈 Projection Insights</h4>
              <p className="text-sm text-gray-700">
                Based on current trends, projected profit shows steady growth with Feb being your strongest month. 
                Confidence decreases for future months due to market variables.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
