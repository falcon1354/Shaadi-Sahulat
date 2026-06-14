import React from 'react';
import { Sparkles } from 'lucide-react';

function StepFinancial({ formData, updateForm }) {
  const handleChange = (field) => (e) => {
    updateForm({ [field]: e.target.value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight mb-1">Financial Profile</h2>
        <p className="text-sm text-gray-500 font-light">
          Specify your household financial capabilities so our recommendation engine can map safe spending limits.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Household Income */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
            Monthly Household Income (PKR) <span className="text-rose-500">*</span>
          </label>
          <div className="relative rounded-2xl shadow-sm">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">PKR</span>
            <input
              type="number"
              value={formData.monthly_household_income}
              onChange={handleChange('monthly_household_income')}
              placeholder="e.g., 80,000"
              min="1"
              className="w-full pl-14 pr-4 py-3.5 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-sm font-medium"
            />
          </div>
          <p className="text-[10px] text-gray-400 font-medium">Your total monthly household earnings</p>
        </div>

        {/* Total Savings */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
            Total Savings Available (PKR) <span className="text-rose-500">*</span>
          </label>
          <div className="relative rounded-2xl shadow-sm">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">PKR</span>
            <input
              type="number"
              value={formData.total_savings_available}
              onChange={handleChange('total_savings_available')}
              placeholder="e.g., 500,000"
              min="0"
              className="w-full pl-14 pr-4 py-3.5 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-sm font-medium"
            />
          </div>
          <p className="text-[10px] text-gray-400 font-medium">Total savings you have accumulated</p>
        </div>

        {/* Expected Contribution */}
        <div className="md:col-span-2 space-y-2">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
            Expected Contribution from Relatives/Parents (PKR)
          </label>
          <div className="relative rounded-2xl shadow-sm">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">PKR</span>
            <input
              type="number"
              value={formData.expected_contribution}
              onChange={handleChange('expected_contribution')}
              placeholder="Optional — e.g., 100,000"
              min="0"
              className="w-full pl-14 pr-4 py-3.5 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-sm font-medium"
            />
          </div>
          <p className="text-[10px] text-gray-400 font-medium">
            Additional financial help expected from family (optional)
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-purple-50/60 to-pink-50/60 border border-purple-100/50 rounded-2xl p-5 relative overflow-hidden">
        <h4 className="text-xs font-extrabold text-purple-900 mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles size={14} className="text-purple-600 animate-pulse" /> Safety Limit Allocation Rules
        </h4>
        <ul className="text-xs text-purple-700/90 space-y-1.5 leading-relaxed font-medium">
          <li>• Cap 1: Maximum 40% of your annual income is allocated</li>
          <li>• Cap 2: Maximum 80% of your savings can be utilized</li>
          <li>• Base Pool: Determined by the lower value between Cap 1 and Cap 2</li>
          <li>• Final Budget: Your family contribution is added on top of the Base Pool</li>
        </ul>
      </div>
    </div>
  );
}

export default StepFinancial;
