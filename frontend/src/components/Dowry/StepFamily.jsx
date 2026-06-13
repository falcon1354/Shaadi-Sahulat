import React from 'react';

const PARENT_OPTIONS = [
  {
    value: 'both',
    label: 'Both Alive',
    icon: '👨‍👩',
    desc: 'Full budget support from both parents',
    color: 'bg-green-100 border-green-400 text-green-700',
    hover: 'hover:border-green-300',
  },
  {
    value: 'only_father',
    label: 'Only Father',
    icon: '👨',
    desc: 'Conservative adjustment applied for missing mother',
    color: 'bg-blue-100 border-blue-400 text-blue-700',
    hover: 'hover:border-blue-300',
  },
  {
    value: 'only_mother',
    label: 'Only Mother',
    icon: '👩',
    desc: 'Conservative adjustment applied for missing father',
    color: 'bg-pink-100 border-pink-400 text-pink-700',
    hover: 'hover:border-pink-300',
  },
  {
    value: 'neither',
    label: 'Neither',
    icon: '🕊️',
    desc: 'Significant conservative adjustment applied',
    color: 'bg-gray-100 border-gray-400 text-gray-700',
    hover: 'hover:border-gray-300',
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Family Context</h2>
        <p className="text-sm text-gray-500">
          Family information affects the responsibility score and budget calculation.
        </p>
      </div>

      {/* ── Are both parents alive? ──────────────────────────────── */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Are both your parents alive?
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {PARENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateForm({ parents_alive: opt.value })}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                parents_alive === opt.value
                  ? opt.color
                  : `bg-white border-gray-200 text-gray-600 ${opt.hover}`
              }`}
            >
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-sm font-semibold leading-tight">{opt.label}</span>
              <span className="text-[10px] text-gray-400 leading-tight">{opt.desc}</span>
            </button>
          ))}
        </div>
        {parents_alive === 'neither' && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            A larger safety buffer is added to your estimate when neither parent is present.
          </p>
        )}
      </div>

      {/* ── Siblings ─────────────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Siblings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Total Siblings</label>
            <input
              type="number"
              value={total_siblings}
              onChange={(e) => updateForm({ total_siblings: e.target.value })}
              placeholder="e.g. 3"
              min="0"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Unmarried Siblings</label>
            <input
              type="number"
              value={unmarried_siblings}
              onChange={(e) => updateForm({ unmarried_siblings: e.target.value })}
              placeholder="e.g. 2"
              min="0"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Married Siblings</label>
            <input
              type="number"
              value={married_siblings}
              onChange={(e) => updateForm({ married_siblings: e.target.value })}
              placeholder="e.g. 1"
              min="0"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
            />
          </div>
        </div>

        {siblingMismatch && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Note: Unmarried ({unmarriedN}) + Married ({marriedN}) = {unmarriedN + marriedN}, but Total Siblings is {totalNum}. Please check your numbers.
          </p>
        )}

        {/* Youngest unmarried sibling age — drives age-based budget reduction */}
        {unmarriedN > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Age of Youngest Unmarried Sibling
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Used to calculate future wedding obligations.
              Under 18 → -10% budget. Age 18–22 → -5% budget.
            </p>
            <input
              type="number"
              value={youngest_sibling_age}
              onChange={(e) => updateForm({ youngest_sibling_age: e.target.value })}
              placeholder="e.g. 20"
              min="1"
              max="60"
              className="w-40 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
            />
          </div>
        )}
      </div>

      {/* ── Impact Explanation ───────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">How this affects your estimate</h4>
        <ul className="space-y-1 text-xs text-blue-600">
          <li>• Unmarried siblings reduce available budget (future wedding obligations)</li>
          <li>• Both parents alive → full recommended budget is used as the base</li>
          <li>• Each missing parent applies a conservative buffer to the estimate</li>
        </ul>
      </div>
    </div>
  );
}

export default StepFamily;
