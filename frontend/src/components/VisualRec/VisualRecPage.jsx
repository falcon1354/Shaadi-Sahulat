import React, { useState, useCallback } from 'react';
import ImageUpload from './ImageUpload';
import PipelineStatus from './PipelineStatus';
import ResultsGrid from './ResultsGrid';
import ServiceStatus from './ServiceStatus';
import visualApi from '../../api/visualApi';

// All wedding-dress subcategories — match seller upload CATEGORY_TREE
const CATEGORIES = [
  // Bridal
  { id: 'bridal_lehenga', label: 'Bridal Lehenga',    icon: '👗', group: 'Bridal' },
  { id: 'bridal_sharara', label: 'Bridal Sharara',    icon: '💃', group: 'Bridal' },
  { id: 'bridal_gharara', label: 'Bridal Gharara',    icon: '👗', group: 'Bridal' },
  { id: 'bridal_gown',    label: 'Bridal Gown',       icon: '🤍', group: 'Bridal' },
  // Groom
  { id: 'groom_sherwani',       label: 'Sherwani',       icon: '🎩', group: 'Groom' },
  { id: 'groom_shalwar_kameez', label: 'Shalwar Kameez', icon: '👔', group: 'Groom' },
  { id: 'groom_suit',           label: 'Suit',           icon: '🕴️', group: 'Groom' },
];

// Error stage → display config
const STAGE_DISPLAY = {
  content_safety:    { icon: '🚫', title: 'Content Safety Check Failed',    color: 'bg-red-50 border-red-200' },
  category_validation: { icon: '⚠️', title: 'Dress Category Not Recognised', color: 'bg-yellow-50 border-yellow-200' },
  similarity_gate:   { icon: '🔍', title: 'No Matching Dress Found',         color: 'bg-orange-50 border-orange-200' },
};

export default function VisualRecPage({ userId, onNavigateToProduct }) {
  const [selectedFile,       setSelectedFile]       = useState(null);
  const [preview,            setPreview]            = useState(null);
  const [preferredCategory,  setPreferredCategory]  = useState(null);
  const [userDescription,    setUserDescription]    = useState('');
  const [loading,            setLoading]            = useState(false);
  const [result,             setResult]             = useState(null);
  const [error,              setError]              = useState(null);
  const [pipelineStages,     setPipelineStages]     = useState({
    stage1: 'pending', stage2: 'pending', stage3: 'pending',
  });

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setPipelineStages({ stage1: 'pending', stage2: 'pending', stage3: 'pending' });
  }, []);

  // Both image AND description required before search
  const canSearch = selectedFile && userDescription.trim().length >= 5 && !loading;

  const handleRecommend = async () => {
    if (!canSearch) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setPipelineStages({ stage1: 'active', stage2: 'pending', stage3: 'pending' });

    try {
      setTimeout(() => setPipelineStages(p => ({ ...p, stage1: 'active' })), 300);
      setTimeout(() => setPipelineStages(p => ({ ...p, stage2: 'active' })), 800);

      const response = await visualApi.recommend(
        selectedFile,
        preferredCategory,
        10,
        userId,
        userDescription.trim(),
      );

      if (response.status === 'success') {
        setPipelineStages({ stage1: 'passed', stage2: 'passed', stage3: 'passed' });
        setResult(response);
      } else if (response.stage === 'content_safety') {
        setPipelineStages({ stage1: 'failed', stage2: 'pending', stage3: 'pending' });
        setError(response);
      } else if (response.stage === 'category_validation') {
        setPipelineStages({ stage1: 'passed', stage2: 'failed', stage3: 'pending' });
        setError(response);
      } else if (response.stage === 'similarity_gate') {
        setPipelineStages({ stage1: 'passed', stage2: 'passed', stage3: 'failed' });
        setError(response);
      } else {
        setPipelineStages({ stage1: 'failed', stage2: 'failed', stage3: 'failed' });
        setError(response);
      }
    } catch (err) {
      setPipelineStages({ stage1: 'failed', stage2: 'failed', stage3: 'failed' });
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
    setPreferredCategory(null);
    setUserDescription('');
    setPipelineStages({ stage1: 'pending', stage2: 'pending', stage3: 'pending' });
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
          Upload a bridal dress photo, describe it, and our AI finds the most similar
          options using EfficientNet-B0 visual + colour + TF-IDF text matching.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column ─────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Image Upload */}
          <ImageUpload onFileSelect={handleFileSelect} preview={preview} loading={loading} />

          {/* Mandatory Description */}
          <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
              📝 Describe the Dress
              <span className="text-red-500 text-xs font-bold">*</span>
              <span className="ml-auto text-[10px] text-gray-400 font-normal">Required</span>
            </h3>
            <p className="text-[10px] text-gray-400 mb-2">
              Colour, fabric, embroidery — even rough spelling is OK (e.g. "redd lehnga zardozy")
            </p>
            <textarea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder="e.g. deep red bridal lehenga with heavy zardozi embroidery on silk fabric"
              rows={3}
              className={`w-full border rounded-lg px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors
                         ${userDescription.trim().length >= 5
                           ? 'border-green-300 bg-green-50/40'
                           : 'border-gray-200'}`}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-gray-400">
                {userDescription.trim().length < 5
                  ? `${5 - userDescription.trim().length} more chars needed`
                  : '✓ Description looks good'}
              </p>
              <span className="text-[10px] text-gray-300">{userDescription.length}/300</span>
            </div>
          </div>

          {/* Category Hint */}
          <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              🏷️ Dress Type Hint
              <span className="ml-2 text-[10px] font-normal text-purple-500">
                (overrides AI prediction)
              </span>
            </h3>
            {['Bridal', 'Groom'].map(group => (
              <div key={group} className="mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{group}</p>
                <div className="grid grid-cols-2 gap-1">
                  {CATEGORIES.filter(c => c.group === group).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setPreferredCategory(preferredCategory === cat.id ? null : cat.id)}
                      className={`text-xs px-2 py-1.5 rounded-lg border transition-all text-left flex items-center gap-1 ${
                        preferredCategory === cat.id
                          ? 'bg-purple-100 border-purple-400 text-purple-700 font-semibold'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {preferredCategory && (
              <button onClick={() => setPreferredCategory(null)}
                className="mt-1 text-[10px] text-gray-400 hover:text-gray-600">
                Clear selection
              </button>
            )}
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
                  Analyzing...
                </span>
              ) : !selectedFile ? '📸 Upload an image first'
                : userDescription.trim().length < 5 ? '📝 Add a description first'
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
          <PipelineStatus stages={pipelineStages} result={result} error={error} />

          {/* Success results */}
          {result?.status === 'success' && <ResultsGrid result={result} onNavigateToProduct={onNavigateToProduct} />}

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

                  {/* Similarity gate: show best score */}
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
                  {error.supported_categories && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {error.supported_categories.map(cat => (
                        <span key={cat} className="px-2 py-0.5 bg-white rounded text-xs text-gray-500 border">
                          {cat.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <ServiceStatus />
        </div>
      </div>
    </div>
  );
}
