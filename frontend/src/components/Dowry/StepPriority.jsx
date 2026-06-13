import React, { useState } from 'react';

// §2.2 — 4 priority options
const PRIORITY_OPTIONS = [
  { value: 'High',       label: 'High',       color: 'bg-red-100    text-red-700    border-red-300' },
  { value: 'Medium',     label: 'Medium',     color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'Low',        label: 'Low',        color: 'bg-green-100  text-green-700  border-green-300' },
  { value: 'Not_Wanted', label: 'Not Wanted', color: 'bg-gray-100   text-gray-500   border-gray-300' },
];

const PRIORITY_BADGE_COLOR = {
  High:       'bg-red-100    text-red-700    border-red-300',
  Medium:     'bg-yellow-100 text-yellow-700 border-yellow-300',
  Low:        'bg-green-100  text-green-700  border-green-300',
  Not_Wanted: 'bg-gray-100   text-gray-500   border-gray-300',
};

function StepPriority({ formData, categories, updatePriority, updateRedistribution, updateForm }) {
  // Track which "Not Wanted" categories have been shown the sub-prompt
  const [promptShown, setPromptShown] = useState({});

  const handlePriorityClick = (catKey, value) => {
    updatePriority(catKey, value);
    if (value === 'Not_Wanted') {
      setPromptShown((prev) => ({ ...prev, [catKey]: true }));
    } else {
      // Clear redistribution choice when priority changes away from Not_Wanted
      setPromptShown((prev) => ({ ...prev, [catKey]: false }));
      updateRedistribution(catKey, undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Priority Settings</h2>
        <p className="text-sm text-gray-500">
          Set the importance of each dowry category. Use "Not Wanted" to exclude a category entirely.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((cat) => {
          const currentPriority  = formData.priorities[cat.key] || 'Medium';
          const isNotWanted      = currentPriority === 'Not_Wanted';
          const showPrompt       = isNotWanted && promptShown[cat.key];
          const redistribution   = formData.redistributions[cat.key]; // true | false | undefined

          return (
            <div
              key={cat.key}
              className={`border rounded-xl p-4 transition-all ${
                isNotWanted ? 'border-gray-200 bg-gray-50' : 'border-gray-100 hover:border-purple-200'
              }`}
            >
              {/* Category header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${isNotWanted ? 'opacity-40' : ''}`}>{cat.icon}</span>
                  <span className={`text-sm font-semibold ${isNotWanted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {cat.label}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_BADGE_COLOR[currentPriority]}`}>
                  {currentPriority === 'Not_Wanted' ? 'Not Wanted' : currentPriority}
                </span>
              </div>

              {/* §2.1 — Wedding Dress type selector (bridal / groom) */}
              {cat.hasTypeSelector && !isNotWanted && (
                <div className="flex gap-2 mb-3">
                  {['bridal', 'groom'].map((type) => (
                    <button
                      key={type}
                      onClick={() => updateForm({ wedding_dress_type: type })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                        formData.wedding_dress_type === type
                          ? 'bg-purple-100 text-purple-700 border-purple-300 ring-2 ring-offset-1 ring-purple-300'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {type === 'bridal' ? '👗 Bridal' : '🤵 Groom'}
                    </button>
                  ))}
                </div>
              )}

              {/* Priority buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handlePriorityClick(cat.key, opt.value)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      currentPriority === opt.value
                        ? opt.color + ' ring-2 ring-offset-1 ring-purple-300'
                        : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* §2.2 — Not Wanted sub-prompt: redistribute? */}
              {showPrompt && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800 font-medium mb-2">
                    Move this category's budget to your priority categories?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        updateRedistribution(cat.key, true);
                        setPromptShown((prev) => ({ ...prev, [cat.key]: false }));
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        redistribution === true
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      Yes, redistribute
                    </button>
                    <button
                      onClick={() => {
                        updateRedistribution(cat.key, false);
                        setPromptShown((prev) => ({ ...prev, [cat.key]: false }));
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        redistribution === false
                          ? 'bg-red-100 text-red-700 border-red-300'
                          : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      No, skip it
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Priority info box */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-purple-800 mb-2">Priority Budget Weights</h4>
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <div className="bg-white rounded-lg p-2">
            <div className="text-red-600 font-bold text-base">30%</div>
            <div className="text-gray-500">High</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-yellow-600 font-bold text-base">20%</div>
            <div className="text-gray-500">Medium</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-green-600 font-bold text-base">10%</div>
            <div className="text-gray-500">Low</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-gray-500 font-bold text-base">0%</div>
            <div className="text-gray-400">Not Wanted</div>
          </div>
        </div>
        <p className="text-xs text-purple-600 mt-2">
          Categories are normalized so the total matches your budget. "Not Wanted" gets zero allocation.
        </p>
      </div>

      <div className="text-center py-2">
        <p className="text-sm text-gray-500">
          All set! Click <strong>"Calculate Estimate"</strong> to run the Hybrid Engine
          (Rule-Based + Live Market Prices + ML).
        </p>
      </div>
    </div>
  );
}

export default StepPriority;
