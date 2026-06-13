import React, { useEffect } from 'react';

function StepFamily({ formData, updateForm }) {
  const {
    total_family_members,
    married_children_count,
    unmarried_children_count,
    age_of_each_unmarried_child,
  } = formData;

  const handleChange = (field) => (e) => {
    updateForm({ [field]: e.target.value });
  };

  // Auto-generate age input fields when unmarried_children_count changes
  useEffect(() => {
    const count = Number(unmarried_children_count || 0);
    const currentAges = age_of_each_unmarried_child || [];
    if (count !== currentAges.length) {
      const newAges = Array.from({ length: count }, (_, i) =>
        currentAges[i] !== undefined ? currentAges[i] : ''
      );
      updateForm({ age_of_each_unmarried_child: newAges });
    }
  }, [unmarried_children_count]);

  const handleAgeChange = (index, value) => {
    const newAges = [...(age_of_each_unmarried_child || [])];
    newAges[index] = value;
    updateForm({ age_of_each_unmarried_child: newAges });
  };

  const youngestAge =
    age_of_each_unmarried_child &&
    age_of_each_unmarried_child.length > 0 &&
    age_of_each_unmarried_child.every((a) => a !== '')
      ? Math.min(...age_of_each_unmarried_child.map(Number))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Family Context</h2>
        <p className="text-sm text-gray-500">
          Family information affects the responsibility score — future weddings reduce current spending capacity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Family Members */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Total Family Members
          </label>
          <input
            type="number"
            value={total_family_members}
            onChange={handleChange('total_family_members')}
            placeholder="e.g., 6"
            min="2"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Married Children Count */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Married Children Count
          </label>
          <input
            type="number"
            value={married_children_count}
            onChange={handleChange('married_children_count')}
            placeholder="e.g., 1"
            min="0"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Unmarried Children Count */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Unmarried Children Count <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={unmarried_children_count}
            onChange={handleChange('unmarried_children_count')}
            placeholder="e.g., 2"
            min="0"
            max="10"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
          />
        </div>
      </div>

      {/* Age of Each Unmarried Child */}
      {Number(unmarried_children_count || 0) > 0 && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Age of Each Unmarried Child
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {(age_of_each_unmarried_child || []).map((age, idx) => (
              <div key={idx}>
                <label className="block text-xs text-gray-500 mb-1">
                  Child {idx + 1}
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => handleAgeChange(idx, e.target.value)}
                  placeholder="Age"
                  min="1"
                  max="40"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impact Explanation */}
      {youngestAge !== null && (
        <div className={`rounded-xl p-4 border ${
          youngestAge < 18
            ? 'bg-red-50 border-red-100'
            : youngestAge <= 22
            ? 'bg-yellow-50 border-yellow-100'
            : 'bg-green-50 border-green-100'
        }`}>
          <h4 className="text-sm font-semibold mb-1">
            Impact Analysis: Youngest child is {youngestAge} years old
          </h4>
          <p className="text-xs">
            {youngestAge < 18
              ? '⚠️ Budget will be reduced by 10% — young child means long-term financial obligations ahead.'
              : youngestAge <= 22
              ? '⚡ Budget will be reduced by 5% — child is near marriage age, moderate constraint.'
              : '✅ No age-based reduction — immediate planning allowed, full budget available.'}
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-1">Why does family matter?</h4>
        <div className="overflow-x-auto">
          <table className="text-xs text-blue-600 w-full">
            <thead>
              <tr>
                <th className="text-left py-1 pr-4">Youngest Child Age</th>
                <th className="text-left py-1">Impact on Budget</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="py-1 pr-4">Under 18</td><td>10% reduction</td></tr>
              <tr><td className="py-1 pr-4">18–22 years</td><td>5% reduction</td></tr>
              <tr><td className="py-1 pr-4">Over 22 years</td><td>No reduction</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default StepFamily;
