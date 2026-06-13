import React from 'react';

const PRIORITY_OPTIONS = [
  { value: 'High', label: 'High', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'Medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'Low', label: 'Low', color: 'bg-green-100 text-green-700 border-green-300' },
];

function StepPriority({ formData, categories, updatePriority }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Priority Settings</h2>
        <p className="text-sm text-gray-500">
          Set the priority level for each of the 8 dowry categories.
          High priority increases allocation, Low priority reduces it.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((cat) => (
          <div
            key={cat.key}
            className="border border-gray-100 rounded-xl p-4 hover:border-purple-200 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{cat.icon}</span>
                <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  formData.priorities[cat.key] === 'High'
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : formData.priorities[cat.key] === 'Low'
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                }`}
              >
                {formData.priorities[cat.key]}
              </span>
            </div>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updatePriority(cat.key, opt.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                    formData.priorities[cat.key] === opt.value
                      ? opt.color + ' ring-2 ring-offset-1 ring-purple-300'
                      : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Multiplier Info */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-purple-800 mb-1">Priority Multiplier Effects</h4>
        <div className="grid grid-cols-3 gap-4 text-center text-xs">
          <div className="bg-white rounded-lg p-2">
            <div className="text-red-600 font-bold text-lg">1.2x</div>
            <div className="text-gray-500">High Priority</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-yellow-600 font-bold text-lg">1.0x</div>
            <div className="text-gray-500">Medium Priority</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-green-600 font-bold text-lg">0.8x</div>
            <div className="text-gray-500">Low Priority</div>
          </div>
        </div>
        <p className="text-xs text-purple-600 mt-2">
          After applying multipliers, all categories are normalized so the total matches the budget.
        </p>
      </div>

      {/* Ready to Calculate */}
      <div className="text-center py-2">
        <p className="text-sm text-gray-500">
          All set! Click <strong>"Calculate Estimate"</strong> to run the Hybrid Engine
          (Rule-Based + ML Personalization).
        </p>
      </div>
    </div>
  );
}

export default StepPriority;
