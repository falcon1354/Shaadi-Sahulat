import React, { useState } from 'react';
import sellerApi from '../../api/sellerApi';

// Compact similarity breakdown shown in a tooltip on hover
function SimilarityTooltip({ item }) {
  const img   = Math.round((item.image_similarity    || 0) * 100);
  const color = Math.round(Math.max(item.color_exact_sim || 0, item.color_family_sim || 0) * 100);
  const text  = Math.round((item.text_similarity     || 0) * 100);

  return (
    <div className="absolute bottom-full right-0 mb-2 z-20 w-48 bg-white rounded-xl shadow-xl border border-gray-200 p-3 text-xs pointer-events-none">
      <p className="font-semibold text-gray-700 mb-2">Similarity Breakdown</p>
      {[
        { label: 'Image',  pct: img,   color: 'bg-purple-500' },
        { label: 'Colour', pct: color, color: 'bg-teal-500' },
        { label: 'Text',   pct: text,  color: 'bg-orange-400' },
      ].map(({ label, pct, color: cls }) => (
        <div key={label} className="flex items-center gap-2 mb-1.5">
          <span className="w-12 text-gray-500 shrink-0">{label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div className={`${cls} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-8 text-right text-gray-600 font-medium">{pct}%</span>
        </div>
      ))}
      {item.color_name && (
        <p className="mt-2 pt-2 border-t border-gray-100 text-gray-500">
          Colour: <strong className="text-gray-700">{item.color_name}</strong>
          {item.color_hex && (
            <span
              className="ml-1.5 inline-block w-3 h-3 rounded-full border border-gray-300 align-middle"
              style={{ backgroundColor: item.color_hex }}
            />
          )}
        </p>
      )}
    </div>
  );
}

// One result card — matches marketplace ProductCard layout
function ResultCard({ item }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const imageUrl = item.image_url
    ? (item.image_url.startsWith('http') ? item.image_url : `http://localhost:5002${item.image_url}`)
    : null;

  const hasDiscount = item.discount_price && item.discount_price < item.price;
  const matchPct    = item.match_percentage ?? Math.round((item.hybrid_score || 0) * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all overflow-hidden flex flex-col">
      {/* Image */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">👗</div>
        )}

        {/* Match % badge — top-left */}
        <span className="absolute top-2 left-2 bg-purple-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          {matchPct}% match
        </span>

        {/* Sale badge */}
        {hasDiscount && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            SALE
          </span>
        )}

        {/* Similarity breakdown icon — bottom-right, hover shows tooltip */}
        <div
          className="absolute bottom-2 right-2"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <button
            className="w-6 h-6 rounded-full bg-white/80 border border-gray-200 flex items-center justify-center text-[10px] text-gray-500 hover:bg-white hover:border-purple-300 transition-all shadow-sm"
            title="Similarity breakdown"
          >
            ℹ
          </button>
          {showTooltip && <SimilarityTooltip item={item} />}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-xs text-purple-500 font-medium mb-0.5 capitalize">
          {item.category?.replace(/_/g, ' ')}
        </p>
        <p className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1">
          {item.title || item.product_id}
        </p>

        <div className="mt-2 flex items-center gap-2">
          {hasDiscount ? (
            <>
              <span className="text-sm font-bold text-green-600">
                PKR {Number(item.discount_price).toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 line-through">
                PKR {Number(item.price).toLocaleString()}
              </span>
            </>
          ) : item.price ? (
            <span className="text-sm font-bold text-purple-700">
              PKR {Number(item.price).toLocaleString()}
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
          <span>{item.seller_name || 'Seller'}</span>
          {item.city && <span>📍 {item.city}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ResultsGrid({ result }) {
  const { results, validation, search_metadata } = result;

  if (!results || results.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-8 text-center">
        <span className="text-4xl">🔍</span>
        <p className="text-gray-600 mt-2">No similar dresses found.</p>
        <p className="text-xs text-gray-400 mt-1">
          Run <code className="bg-gray-100 px-1 rounded">python seed_all_categories.py</code> first.
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
            {embDim}-dim EfficientNet-B0
            {queryColor && <span> &nbsp;·&nbsp; Query colour: <strong>{queryColor}</strong></span>}
          </p>
        </div>
        {validation?.used_preferred_category && (
          <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
            🏷️ Hint used
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map(item => (
          <ResultCard key={item.product_id} item={item} />
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        Hover the ℹ icon on any card to see image · colour · text similarity scores
      </p>
    </div>
  );
}
