import React, { useState, useCallback } from 'react';
import ImageUpload from './ImageUpload';
import ResultsGrid from './ResultsGrid';
import ServiceStatus from './ServiceStatus';
import visualApi from '../../api/visualApi';

// Only Bridal / Groom — map to a valid ML category for the backend
const HINT_OPTIONS = [
  { id: 'bridal', label: 'Bridal', icon: '👰', backendCat: 'bridal_lehenga' },
  { id: 'groom',  label: 'Groom',  icon: '🤵', backendCat: null },          // no dedicated model class; TF-IDF handles it
];

// Error stage → display config
const STAGE_DISPLAY = {
  content_safety:      { icon: '🚫', title: 'Content Safety Check Failed',    color: 'bg-red-50 border-red-200' },
  category_validation: { icon: '⚠️', title: 'Dress Category Not Recognised',  color: 'bg-yellow-50 border-yellow-200' },
  similarity_gate:     { icon: '🔍', title: 'No Matching Dress Found',         color: 'bg-orange-50 border-orange-200' },
};

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function VisualRecPage({ userId, onNavigateToProduct }) {
  const [selectedFile,      setSelectedFile]      = useState(null);
  const [preview,           setPreview]           = useState(null);
  const [hintId,            setHintId]            = useState(null);
  const [userDescription,   setUserDescription]   = useState('');
  const [loading,           setLoading]           = useState(false);
  const [result,            setResult]            = useState(null);
  const [error,             setError]             = useState(null);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }, []);

  const words = wordCount(userDescription);
  const canSearch = selectedFile && words >= 4 && !loading;

  const handleRecommend = async () => {
    if (!canSearch) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const hint = HINT_OPTIONS.find(h => h.id === hintId);
      const preferredCategory = hint?.backendCat || null;

      const response = await visualApi.recommend(
        selectedFile,
        preferredCategory,
        10,
        userId,
        userDescription.trim(),
      );

      if (response.status === 'success') {
        setResult(response);
      } else {
        setError(response);
      }
    } catch (err) {
      setError({
        status: 'error',
        reason: err.response?.data?.reason || err.message || 'Could not connect. Make sure both services are running.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setHintId(null);
    setUserDescription('');
  };

  const stageDisplay = error ? (STAGE_DISPLAY[error.stage] || STAGE_DISPLAY.content_safety) : null;

  return (
    <div className="animate-fade-in">
      {/* Title */}
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          👗 Visual Dress Recommendation
        </h2>
        <p className="text-gray-500 max-w-xl mx-auto text-sm">
          Upload a wedding dress photo, describe it in a few words, and our AI finds the most similar
          options using EfficientNet-B0 visual + colour + TF-IDF text matching.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column ─────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Image Upload */}
          <ImageUpload onFileSelect={handleFileSelect} preview={preview} loading={loading} />

          {/* Dress Type Hint — Bridal / Groom only */}
          <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Dress Type
              <span className="ml-2 text-[10px] font-normal text-purple-500">(optional — helps AI)</span>
            </h3>
            <div className="flex gap-3">
              {HINT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setHintId(hintId === opt.id ? null : opt.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    hintId === opt.id
                      ? 'bg-purple-100 border-purple-400 text-purple-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-300'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {hintId && (
              <button onClick={() => setHintId(null)}
                className="mt-2 text-[10px] text-gray-400 hover:text-gray-600">
                Clear hint
              </button>
            )}
          </div>

          {/* Mandatory Description */}
          <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
              📝 Describe the Dress
              <span className="text-red-500 text-xs font-bold">*</span>
              <span className="ml-auto text-[10px] text-gray-400 font-normal">Min 4 words</span>
            </h3>
            <p className="text-[10px] text-gray-400 mb-2">
              Colour, fabric, embroidery — rough spelling is OK (e.g. "redd lehnga zardozy heavy")
            </p>
            <textarea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder="e.g. deep red bridal lehenga heavy zardozi embroidery silk"
              rows={3}
              className={`w-full border rounded-lg px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors
                         ${words >= 4
                           ? 'border-green-300 bg-green-50/40'
                           : 'border-gray-200'}`}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-gray-400">
                {words < 4
                  ? `${4 - words} more word${4 - words !== 1 ? 's' : ''} needed`
                  : '✓ Description looks good'}
              </p>
              <span className="text-[10px] text-gray-300">{words} words</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleRecommend}
              disabled={!canSearch}
              className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
                canSearch
                  ? 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 shadow-lg hover:shadow-xl'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </span>
              ) : !selectedFile ? '📸 Upload an image first'
                : words < 4 ? '📝 Add at least 4 words'
                : '🔍 Find Similar Dresses'}
            </button>

            <button onClick={handleReset}
              className="w-full py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all">
              Reset
            </button>
          </div>
        </div>

        {/* ── Right Column ────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Success results */}
          {result?.status === 'success' && (
            <ResultsGrid result={result} onNavigateToProduct={onNavigateToProduct} />
          )}

          {/* Error / rejection display */}
          {error && stageDisplay && (
            <div className={`rounded-xl p-5 border-2 animate-slide-up ${stageDisplay.color}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{stageDisplay.icon}</span>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 mb-1">{stageDisplay.title}</h3>
                  <p className="text-gray-600 text-sm mb-2">{error.reason}</p>

                  {error.suggestion && (
                    <p className="text-gray-500 text-xs bg-white/60 rounded-lg p-2 mt-1">
                      💡 {error.suggestion}
                    </p>
                  )}

                  {error.stage === 'similarity_gate' && error.best_score !== undefined && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-400 h-2 rounded-full"
                          style={{ width: `${Math.round(error.best_score * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">
                        Best: {Math.round(error.best_score * 100)}% / need {Math.round(error.threshold * 100)}%
                      </span>
                    </div>
                  )}

                  {error.closest_category && (
                    <p className="text-xs text-gray-500 mt-1">
                      Closest category: <strong>{error.closest_category}</strong>
                      {' '}({(error.detected_confidence * 100).toFixed(1)}% confidence)
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Idle state hint */}
          {!result && !error && !loading && (
            <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-8 text-center text-gray-400">
              <p className="text-4xl mb-3">👗</p>
              <p className="text-sm">Upload a dress photo and describe it to find similar styles.</p>
            </div>
          )}

          <ServiceStatus />
        </div>
      </div>
    </div>
  );
}
