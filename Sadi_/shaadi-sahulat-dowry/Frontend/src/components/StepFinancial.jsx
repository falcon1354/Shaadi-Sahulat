import React from 'react';

function StepFinancial({ formData, updateForm }) {
  const handleChange = (field) => (e) => {
    updateForm({ [field]: e.target.value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Financial Profile</h2>
        <p className="text-sm text-gray-500">
          Enter your household financial information to calculate the dowry budget.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Household Income */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Monthly Household Income (PKR) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">PKR</span>
            <input
              type="number"
              value={formData.monthly_household_income}
              onChange={handleChange('monthly_household_income')}
              placeholder="e.g., 80000"
              min="1"
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Your total monthly household earnings</p>
        </div>

        {/* Total Savings */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Total Savings Available (PKR) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">PKR</span>
            <input
              type="number"
              value={formData.total_savings_available}
              onChange={handleChange('total_savings_available')}
              placeholder="e.g., 500000"
              min="0"
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Total savings you have accumulated</p>
        </div>

        {/* Expected Contribution */}
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Expected Contribution from Relatives/Parents (PKR)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">PKR</span>
            <input
              type="number"
              value={formData.expected_contribution}
              onChange={handleChange('expected_contribution')}
              placeholder="Optional — e.g., 100000"
              min="0"
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Additional financial help expected from family (optional)
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-purple-800 mb-1">How we use this data</h4>
        <ul className="text-xs text-purple-600 space-y-1">
          <li>• Maximum 40% of your annual income is allocated as budget cap</li>
          <li>• Maximum 80% of your savings can be used</li>
          <li>• The lower of these two caps forms the base budget pool</li>
          <li>• Contributions are added on top of the base pool</li>
        </ul>
      </div>
    </div>
  );
}

export default StepFinancial;
