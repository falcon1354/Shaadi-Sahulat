import React from 'react';

// Level → badge color classes
const LEVEL_STYLES = {
  1: { bg: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  2: { bg: 'bg-blue-100   text-blue-700',   dot: 'bg-blue-500'   },
  3: { bg: 'bg-teal-100   text-teal-700',   dot: 'bg-teal-500'   },
  4: { bg: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  5: { bg: 'bg-gray-100   text-gray-600',   dot: 'bg-gray-400'   },
};

function ScoreBar({ label, value, colorClass }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-10 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${colorClass} h-1.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-7 text-right">{pct}%</span>
    </div>
  );
}

export default function ResultsGrid({ result, onNavigateToProduct }) {
  const { results, validation, search_metadata } = result;

  if (!results || results.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-8 text-center">
        <span className="text-4xl">🔍</span>
        <p className="text-gray-600 mt-2">No similar dresses found.</p>
        <p className="text-xs text-gray-400 mt-1">
          Run <code className="bg-gray-100 px-1 rounded">python seed_dummy_data.py</code> first.
        </p>
      </div>
    );
  }

  const categoryLabel = validation?.predicted_category?.replace(/_/g, ' ') || 'dress';
  const queryColor    = result.query_analysis?.color || '';
  const embDim        = search_metadata?.embedding_dim || 1280;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800">
            ✨ {results.length} similar {categoryLabel}s found
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {search_metadata?.search_time_ms || 0}ms &nbsp;·&nbsp;
            {embDim}-dim EfficientNet-B0 &nbsp;·&nbsp;
            {queryColor && <span>Query colour: <strong>{queryColor}</strong></span>}
          </p>
        </div>
        {validation?.used_preferred_category && (
          <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
            🏷️ Category hint
          </span>
        )}
      </div>

      {/* Level legend */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {[
          [1, 'Visual Match'],
          [2, 'Color Match'],
          [3, 'Color Family'],
          [4, 'Category Match'],
          [5, 'Closest'],
        ].map(([lv, label]) => {
          const s = LEVEL_STYLES[lv];
          const used = results.some(r => r.match_level === lv);
          return used ? (
            <span key={lv} className={`${s.bg} text-[10px] font-medium px-2 py-0.5 rounded-full`}>
              L{lv} {label}
            </span>
          ) : null;
        })}
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((item) => {
          const style = LEVEL_STYLES[item.match_level] || LEVEL_STYLES[5];
          return (
            <div
              key={item.product_id}
              className="border border-gray-200 rounded-xl overflow-hidden
                         hover:shadow-md hover:border-purple-200 transition-all group"
            >
              {/* Image */}
              <div className="relative h-44 bg-gradient-to-br from-purple-50 to-pink-50 overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-5xl opacity-30">
                    👗
                  </span>
                )}

                {/* Rank */}
                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs
                                px-1.5 py-0.5 rounded-full font-medium">
                  #{item.rank}
                </div>

                {/* Match level badge */}
                <div className={`absolute top-2 right-2 ${style.bg}
                                 text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                  L{item.match_level} · {item.match_percentage}%
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                {/* Level label */}
                <div className={`inline-flex items-center gap-1 mb-1.5 text-[10px]
                                  font-semibold ${style.bg} px-2 py-0.5 rounded-full`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {item.match_label}
                </div>

                <h4 className="text-sm font-semibold text-gray-800 truncate">
                  {item.title || item.product_id}
                </h4>
                <p className="text-[11px] text-gray-500 truncate">
                  {item.category?.replace(/_/g, ' ')}
                  {item.seller_name && (
                    <span className="ml-1 text-purple-400">· {item.seller_name}</span>
                  )}
                </p>

                {/* Score breakdown */}
                <div className="mt-2 space-y-1">
                  <ScoreBar label="Image"  value={item.image_similarity}
                    colorClass="bg-gradient-to-r from-purple-400 to-purple-500" />
                  <ScoreBar label="Color"
                    value={Math.max(item.color_exact_sim || 0, item.color_family_sim || 0)}
                    colorClass="bg-gradient-to-r from-teal-400 to-teal-500" />
                  <ScoreBar label="Text"   value={item.text_similarity}
                    colorClass="bg-gradient-to-r from-orange-400 to-orange-500" />
                </div>

                {/* Price */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm font-bold text-purple-600">
                    {item.price
                      ? `PKR ${Number(item.price).toLocaleString()}`
                      : '—'}
                  </span>
                  {item.discount_price && item.discount_price < item.price && (
                    <span className="text-xs line-through text-gray-400">
                      PKR {Number(item.discount_price).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* View Details → cross-module navigate (§3.3) */}
                {item.product_id && onNavigateToProduct && (
                  <button
                    onClick={() => onNavigateToProduct(item.product_id)}
                    className="mt-2 w-full py-1.5 text-xs font-semibold text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors">
                    View in Marketplace →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-center mt-4">
        Cascade: L1 visual ≥ 55% · L2 visual+exact color · L3 color family · L4 TF-IDF · L5 fallback
      </p>
    </div>
  );
}
