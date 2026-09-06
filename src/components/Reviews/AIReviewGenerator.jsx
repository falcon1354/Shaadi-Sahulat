/**
 * AIReviewGenerator — picks a review length (Short / Medium / Long) and
 * calls the AI to produce 3 draft reviews. Default length is Medium.
 * Switching to Short/Long auto-regenerates. No manual Regenerate button.
 */
import React, { useState, useEffect } from 'react';
import { generateReviews } from '../../api/aiReviewApi';

const LENGTH_OPTIONS = [
  { id: 'short',  label: 'Short',  desc: '15–30 words · 1 sentence' },
  { id: 'medium', label: 'Medium', desc: '35–50 words · 2 sentences' },
  { id: 'long',   label: 'Long',   desc: '50–60 words · 3 sentences' },
];

export default function AIReviewGenerator({
  productTitle, productDescription, rating, keywordTags = [],
  onPick, onClose,
}) {
  const [length, setLength] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState(null);
  const [pickedIdx, setPickedIdx] = useState(null);

  const generate = async (lengthOverride) => {
    const useLen = lengthOverride || length;
    if (!productTitle || !rating) return;
    setLoading(true);
    setError(null);
    setDrafts([]);
    setPickedIdx(null);
    const tagStr = keywordTags.length ? ` Keywords: ${keywordTags.join(', ')}.` : '';
    const res = await generateReviews({
      product_title: productTitle,
      product_description: (productDescription || '') + tagStr,
      rating,
      length: useLen,
    });
    setLoading(false);
    if (res?.success && Array.isArray(res.reviews)) {
      setDrafts(res.reviews);
    } else {
      setError(res?.error || 'Failed to generate reviews');
    }
  };

  // Auto-generate on first open (default = Medium)
  useEffect(() => {
    generate('medium');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLengthChange = (id) => {
    if (id === length || loading) return;
    setLength(id);
    generate(id);   // auto-regenerate at the new length
  };

  const handlePick = (idx) => {
    setPickedIdx(idx);
    onPick?.(drafts[idx].text);
  };

  return (
    // Full-screen blur backdrop (no white margins on the sides)
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
         style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                ✨ AI Review Generator
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                3 drafts based on the product, your rating ({rating}★){keywordTags.length ? `, tags (${keywordTags.join(', ')})` : ''}, and length.
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">REVIEW LENGTH (switching auto-regenerates)</p>
          <div className="grid grid-cols-3 gap-2">
            {LENGTH_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleLengthChange(opt.id)}
                disabled={loading}
                className={`p-3 rounded-xl text-left transition-all border-2 ${
                  length === opt.id
                    ? 'border-[#a37b3d] bg-[#FFF5F8]'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading && (
            <div className="text-center text-gray-500 text-sm py-8 flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-gray-200 border-t-[#a37b3d] rounded-full animate-spin" />
              Generating {length} drafts…
            </div>
          )}
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm border border-red-100">
              ⚠ {error}
            </div>
          )}
          {!loading && drafts.map((d, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                pickedIdx === i
                  ? 'border-green-400 bg-green-50/50'
                  : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'
              }`}
              onClick={() => handlePick(i)}
            >
              <div className="flex items-start gap-2 mb-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  pickedIdx === i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {pickedIdx === i ? '✓' : i + 1}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{d.text}</p>
              </div>
              <div className="flex items-center justify-between ml-8">
                <span className="text-[10px] text-gray-400">{(d.text?.split(/\s+/) || []).length} words</span>
                {pickedIdx === i && (
                  <span className="text-[10px] text-green-600 font-semibold">Selected — click "Use this" below</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            Drafts are suggestions — you can edit freely before posting.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onClose()}
              disabled={pickedIdx === null}
              className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] rounded-xl disabled:opacity-50"
            >
              Use this
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
