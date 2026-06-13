import React from 'react';

function StepFamily({ formData, updateForm }) {
  const {
    father_approval,
    mother_approval,
    total_siblings,
    unmarried_siblings,
    married_siblings,
  } = formData;

  const totalNum    = Number(total_siblings    || 0);
  const unmarriedN  = Number(unmarried_siblings || 0);
  const marriedN    = Number(married_siblings   || 0);
  const siblingMismatch = totalNum > 0 && (unmarriedN + marriedN) !== totalNum;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Family Context</h2>
        <p className="text-sm text-gray-500">
          Family information affects the responsibility score and budget calculation.
        </p>
      </div>

      {/* ── Parent Approvals ─────────────────────────────────────────── */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Parent Approval</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Father */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Father's Approval</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => updateForm({ father_approval: true })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  father_approval === true
                    ? 'bg-green-100 border-green-400 text-green-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-300'
                }`}
              >
                ✓ Yes
              </button>
              <button
                type="button"
                onClick={() => updateForm({ father_approval: false })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  father_approval === false
                    ? 'bg-red-100 border-red-400 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-red-300'
                }`}
              >
                ✗ No
              </button>
            </div>
            {father_approval === false && (
              <p className="mt-2 text-xs text-red-500">Father's approval is pending — budget may be adjusted.</p>
            )}
          </div>

          {/* Mother */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Mother's Approval</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => updateForm({ mother_approval: true })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  mother_approval === true
                    ? 'bg-green-100 border-green-400 text-green-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-300'
                }`}
              >
                ✓ Yes
              </button>
              <button
                type="button"
                onClick={() => updateForm({ mother_approval: false })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  mother_approval === false
                    ? 'bg-red-100 border-red-400 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-red-300'
                }`}
              >
                ✗ No
              </button>
            </div>
            {mother_approval === false && (
              <p className="mt-2 text-xs text-red-500">Mother's approval is pending — budget may be adjusted.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Siblings ─────────────────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Siblings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Total Siblings
            </label>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Unmarried Siblings
            </label>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Married Siblings
            </label>
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
      </div>

      {/* ── Impact Explanation ───────────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">How this affects your estimate</h4>
        <ul className="space-y-1 text-xs text-blue-600">
          <li>• Unmarried siblings reduce available budget (future wedding obligations)</li>
          <li>• Both parents approving unlocks the full estimated budget</li>
          <li>• Each unapproved parent applies a conservative adjustment to the estimate</li>
        </ul>
      </div>
    </div>
  );
}

export default StepFamily;
