
import React, { useState } from 'react';
import { HelpCircle, Star } from 'lucide-react';

const PRIORITY_OPTIONS = [
  { value: 'High',       label: 'High',       color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'Medium',     label: 'Medium',     color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'Low',        label: 'Low',        color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'Not_Wanted', label: 'Excluded',   color: 'bg-gray-50 text-gray-500 border-gray-200' },
];

const PRIORITY_BADGE_COLOR = {
  High:       'bg-rose-50 text-rose-700 border-rose-200',
  Medium:     'bg-amber-50 text-amber-700 border-amber-200',
  Low:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  Not_Wanted: 'bg-gray-50 text-gray-500 border-gray-200',
};

function StepPriority({ formData, categories, updatePriority, updateRedistribution, updateForm }) {
  const [promptShown, setPromptShown] = useState({});

  const handlePriorityClick = (catKey, value) => {
    updatePriority(catKey, value);
    if (value === 'Not_Wanted') {
      setPromptShown((prev) => ({ ...prev, [catKey]: true }));
    } else {
      setPromptShown((prev) => ({ ...prev, [catKey]: false }));
      updateRedistribution(catKey, undefined);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight mb-1">Priority Settings</h2>
        <p className="text-sm text-gray-500 font-light">
          Set the relative importance of each category. Exclude items to transfer their budget to higher priorities.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {categories.map((cat) => {
          const currentPriority  = formData.priorities[cat.key] || 'Medium';
          const isNotWanted      = currentPriority === 'Not_Wanted';
          const showPrompt       = isNotWanted && promptShown[cat.key];
          const redistribution   = formData.redistributions[cat.key];

          return (
            <div
              key={cat.key}
              className={`border rounded-3xl p-5 transition-all duration-300 relative overflow-hidden ${
                isNotWanted 
                  ? 'border-gray-200 bg-gray-50/40 shadow-inner' 
                  : 'border-primary-100 hover:border-primary-300 bg-white shadow-sm hover:shadow-md'
              }`}
            >
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className={`text-xl p-2 bg-gray-50 rounded-xl shrink-0 ${isNotWanted ? 'opacity-30' : ''}`}>{cat.icon}</span>
                  <span className={`text-sm font-bold capitalize ${isNotWanted ? 'text-gray-400 line-through' : 'text-gray-950'}`}>
                    {cat.label}
                  </span>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${PRIORITY_BADGE_COLOR[currentPriority]}`}>
                  {currentPriority === 'Not_Wanted' ? 'Excluded' : currentPriority}
                </span>
              </div>

              {/* Wedding Dress type selector (bridal / groom) */}
              {cat.hasTypeSelector && !isNotWanted && (
                <div className="flex gap-2 mb-4 bg-gray-50 p-1 rounded-2xl">
                  {['bridal', 'groom'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateForm({ wedding_dress_type: type })}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all capitalize cursor-pointer ${
                        formData.wedding_dress_type === type
                          ? 'bg-white text-primary-900 shadow-sm border border-primary-100/50'
                          : 'text-gray-400 hover:text-gray-600'
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
                    type="button"
                    onClick={() => handlePriorityClick(cat.key, opt.value)}
                    className={`py-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                      currentPriority === opt.value
                        ? opt.color + ' border-current ring-1 ring-primary-100'
                        : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300 hover:text-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Not Wanted redistribution sub-prompt */}
              {showPrompt && (
                <div className="mt-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl p-4 space-y-3 animate-fade-in">
                  <p className="text-xs text-amber-900 font-bold">
                    Transfer this category's budget to active items?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateRedistribution(cat.key, true);
                        setPromptShown((prev) => ({ ...prev, [cat.key]: false }));
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        redistribution === true
                          ? 'bg-emerald-600 text-white border-transparent'
                          : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      Yes, distribute
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateRedistribution(cat.key, false);
                        setPromptShown((prev) => ({ ...prev, [cat.key]: false }));
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        redistribution === false
                          ? 'bg-rose-600 text-white border-transparent'
                          : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      No, discard budget
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Priority weights overview */}
      <div className="bg-gradient-to-r from-primary-50/60 to-primary-100/60 border border-primary-200/50 rounded-3xl p-6 relative overflow-hidden">
        <h4 className="text-xs font-extrabold text-primary-900 mb-3 uppercase tracking-wider flex items-center gap-1.5">
          <Star size={14} className="text-primary-800" /> Priority Budget Weights
        </h4>
        <div className="grid grid-cols-4 gap-3 text-center mb-4">
          {[
            { rate: '30%', name: 'High', color: 'text-rose-600' },
            { rate: '20%', name: 'Medium', color: 'text-amber-600' },
            { rate: '10%', name: 'Low', color: 'text-emerald-600' },
            { rate: '0%', name: 'Excluded', color: 'text-gray-400' },
          ].map(w => (
            <div key={w.name} className="bg-white rounded-2xl p-3 border border-primary-200/30 shadow-sm">
              <div className={`font-extrabold text-lg ${w.color}`}>{w.rate}</div>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">{w.name}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-primary-900/90 leading-relaxed font-medium">
          Categories are normalized so the total matches your calculated budget. Excluded categories receive zero budget, which is either redistributed to boost remaining items or saved as surplus cash.
        </p>
      </div>

      <div className="text-center py-2">
        <p className="text-xs text-gray-500 font-medium">
          Ready! Click <strong className="text-primary-900">"Calculate Estimate"</strong> to run the Hybrid Price Engine.
        </p>
      </div>
    </div>
  );
}

export default StepPriority;
