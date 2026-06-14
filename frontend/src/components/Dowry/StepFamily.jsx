import React from 'react';
import { Sparkles, Users, HelpCircle } from 'lucide-react';

const PARENT_OPTIONS = [
  {
    value: 'both',
    label: 'Both Alive',
    icon: '👨‍👩‍👦',
    desc: 'Full budget support from both parents',
    color: 'bg-emerald-50/70 border-emerald-300 text-emerald-950',
    hover: 'hover:border-emerald-300 hover:bg-emerald-50/20',
  },
  {
    value: 'only_father',
    label: 'Only Father',
    icon: '👨',
    desc: 'Conservative adjustment applied for missing mother',
    color: 'bg-primary-50/70 border-primary-300 text-primary-900',
    hover: 'hover:border-primary-300 hover:bg-primary-50/20',
  },
  {
    value: 'only_mother',
    label: 'Only Mother',
    icon: '👩',
    desc: 'Conservative adjustment applied for missing father',
    color: 'bg-primary-100/70 border-primary-400 text-primary-950',
    hover: 'hover:border-primary-400 hover:bg-primary-50/20',
  },
  {
    value: 'neither',
    label: 'Neither',
    icon: '🕊️',
    desc: 'Significant conservative adjustment applied',
    color: 'bg-gray-100 border-gray-400 text-gray-950',
    hover: 'hover:border-gray-300 hover:bg-gray-50/20',
  },
];

function StepFamily({ formData, updateForm }) {
  const {
    parents_alive,
    total_siblings,
    unmarried_siblings,
    married_siblings,
    youngest_sibling_age,
  } = formData;

  const totalNum   = Number(total_siblings    || 0);
  const unmarriedN = Number(unmarried_siblings || 0);
  const marriedN   = Number(married_siblings   || 0);
  const siblingMismatch = totalNum > 0 && (unmarriedN + marriedN) !== totalNum;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight mb-1">Family Context</h2>
        <p className="text-sm text-gray-500 font-light">
          Your family size and context help the engine determine safety score buffers.
        </p>
      </div>

      {/* Parents status check */}
      <div className="bg-primary-50/30 border border-primary-200/50 rounded-3xl p-6">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          Parents Status Context
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PARENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateForm({ parents_alive: opt.value })}
              className={`flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-left transition-all duration-300 cursor-pointer ${
                parents_alive === opt.value
                  ? opt.color
                  : `bg-white border-gray-100 text-gray-600 ${opt.hover}`
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{opt.icon}</span>
                <span className="text-sm font-bold leading-tight">{opt.label}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-medium leading-relaxed">{opt.desc}</span>
            </button>
          ))}
        </div>
        {parents_alive === 'neither' && (
          <p className="mt-4 text-xs text-amber-800 bg-amber-50/50 border border-amber-200/50 rounded-2xl px-4 py-3 font-medium">
            Note: A larger safety buffer will be injected to protect your leftover savings.
          </p>
        )}
      </div>

      {/* Sibling counts */}
      <div className="bg-gray-50/50 border border-gray-100 rounded-3xl p-6 space-y-6">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
          <Users size={14} className="text-primary-800" /> Sibling Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide">Total Siblings</label>
            <input
              type="number"
              value={total_siblings}
              onChange={(e) => updateForm({ total_siblings: e.target.value })}
              placeholder="e.g., 3"
              min="0"
              className="w-full px-4 py-3 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all bg-white text-sm font-semibold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide">Unmarried Siblings</label>
            <input
              type="number"
              value={unmarried_siblings}
              onChange={(e) => updateForm({ unmarried_siblings: e.target.value })}
              placeholder="e.g., 2"
              min="0"
              className="w-full px-4 py-3 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all bg-white text-sm font-semibold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide">Married Siblings</label>
            <input
              type="number"
              value={married_siblings}
              onChange={(e) => updateForm({ married_siblings: e.target.value })}
              placeholder="e.g., 1"
              min="0"
              className="w-full px-4 py-3 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all bg-white text-sm font-semibold"
            />
          </div>
        </div>

        {siblingMismatch && (
          <p className="text-xs text-amber-700 bg-amber-50/50 border border-amber-200/50 rounded-2xl px-4 py-3 font-medium">
            Attention: Married ({marriedN}) + Unmarried ({unmarriedN}) equals {marriedN + unmarriedN}, but total is set to {totalNum}.
          </p>
        )}

        {unmarriedN > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200/60 space-y-2">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
              Age of Youngest Unmarried Sibling
            </label>
            <p className="text-[10px] text-gray-400 font-medium">
              Obligation weight limits: Under 18 will trigger future wedding buffers (-10%), ages 18–22 triggers (-5%).
            </p>
            <input
              type="number"
              value={youngest_sibling_age}
              onChange={(e) => updateForm({ youngest_sibling_age: e.target.value })}
              placeholder="e.g., 20"
              min="1"
              max="60"
              className="w-full sm:w-48 px-4 py-3 border border-gray-200/80 rounded-2xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all bg-white text-sm font-semibold"
            />
          </div>
        )}
      </div>

      {/* Explanation banner */}
      <div className="bg-gradient-to-r from-primary-50/60 to-primary-100/60 border border-primary-200/50 rounded-2xl p-5 relative overflow-hidden">
        <h4 className="text-xs font-extrabold text-primary-900 mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <HelpCircle size={14} className="text-primary-800" /> Sibling & Parent Scoring Impact
        </h4>
        <ul className="text-xs text-primary-900/90 space-y-1.5 leading-relaxed font-medium">
          <li>• Active unmarried siblings reduce current spending capacity to preserve future sibling wedding options</li>
          <li>• Both parents present allows full capital allocation, while missing parents result in protective capital limits</li>
        </ul>
      </div>
    </div>
  );
}

export default StepFamily;
