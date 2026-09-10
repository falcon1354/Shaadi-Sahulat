/**
 * ReviewForm — AI-powered review writing + tone-voice (4 agents).
 *
 * Voice flow (matches tone-voice demo):
 *   1. Write comment + pick rating
 *   2. Enable "Convert text to voice"
 *   3. Choose one of 4 voices → Generate / Preview
 *   4. Press Apply Done → voice locked for submit
 *   5. Submit → text + voice stored (Cloudinary) and shown on marketplace
 */
import React, { useState, useEffect, useRef } from 'react';
import StarRating from './StarRating';
import AIReviewGenerator from './AIReviewGenerator';
import { suggestRating, previewReviewVoice } from '../../api/aiReviewApi';

const TITLE_TAGS = [
  'Fast Delivery', 'Beautiful', 'Great Quality', 'Value for Money',
  'Exactly as Shown', 'Well Packaged', 'On Time', 'Recommended',
  'Comfortable Fit', 'Loved It', 'Needs Improvement', 'Not as Expected',
];

const VOICE_AGENTS = [
  { id: 'en_female', label: 'English · Female', hint: 'af_bella' },
  { id: 'en_male', label: 'English · Male', hint: 'am_michael' },
  { id: 'hi_female', label: 'Urdu/Hindi · Female', hint: 'hf_beta' },
  { id: 'hi_male', label: 'Urdu/Hindi · Male', hint: 'hm_omega' },
];

export default function ReviewForm({
  productTitle, productDescription,
  buyerId, productId,
  onSubmit, onCancel, submitting = false,
}) {
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceAgent, setVoiceAgent] = useState('en_female');
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const [spokenPreview, setSpokenPreview] = useState('');
  const [voiceApplied, setVoiceApplied] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiProvider, setAiProvider] = useState('');

  const [generatorOpen, setGeneratorOpen] = useState(false);

  const debounceRef = useRef(null);
  const lastTextRef = useRef('');

  useEffect(() => {
    const text = comment.trim();
    if (!text || text.length < 3 || text === lastTextRef.current) return;
    lastTextRef.current = text;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      const res = await suggestRating({
        text,
        product_title: productTitle || '',
        product_description: productDescription || '',
      });
      setAiLoading(false);
      if (res?.success) {
        setAiSuggestion(res);
        if (res.provider) setAiProvider(res.provider);
      }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [comment, productTitle, productDescription]);

  // Changing text/agent invalidates applied preview
  useEffect(() => {
    if (voiceApplied) {
      setVoiceApplied(false);
      setVoicePreviewUrl('');
      setSpokenPreview('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment, voiceAgent]);

  const acceptAiSuggestion = () => {
    if (!aiSuggestion) return;
    setRating(aiSuggestion.suggested_rating);
    setAiUsed(true);
  };

  const toggleTag = (t) => {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleGeneratorPick = (text) => {
    setComment(text);
    setAiGenerated(true);
  };

  const generateVoicePreview = async (agentOverride) => {
    const agent = agentOverride || voiceAgent;
    if (!comment.trim() || comment.trim().length < 2) {
      setVoiceError('Write your review text first (at least 2 characters).');
      return;
    }
    if (rating < 0.5) {
      setVoiceError('Select a star rating before generating voice.');
      return;
    }
    setVoiceLoading(true);
    setVoiceError('');
    setVoiceApplied(false);
    try {
      const res = await previewReviewVoice({
        text: comment.trim(),
        rating,
        agent,
        buyer_id: buyerId || '',
        product_id: productId || '',
      });
      if (!res.success) {
        setVoiceError(res.error || 'Voice generation failed. Is tone-voice running on port 8000?');
        setVoicePreviewUrl('');
        return;
      }
      setVoiceAgent(agent);
      setVoicePreviewUrl(res.audio_data_url || '');
      setSpokenPreview(res.spoken_text || comment.trim());
    } catch (err) {
      setVoiceError(err.message || 'Could not reach voice service.');
    } finally {
      setVoiceLoading(false);
    }
  };

  const applyVoiceDone = () => {
    if (!voicePreviewUrl) {
      setVoiceError('Generate a voice preview first, then press Apply Done.');
      return;
    }
    setVoiceApplied(true);
    setVoiceError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating < 0.5) { alert('Please select a star rating'); return; }
    if (!comment.trim() || comment.trim().length < 2) {
      alert('Please write at least 1-2 words in the comment box');
      return;
    }
    if (voiceEnabled && !voiceApplied) {
      const ok = window.confirm(
        'Voice is enabled but not applied. Submit with selected voice agent anyway (synthesizes on save)?\n\nClick Cancel to preview & Apply Done first.'
      );
      if (!ok) return;
    }
    onSubmit?.({
      rating,
      title: selectedTags.join(', '),
      comment: comment.trim(),
      voice_agent: voiceEnabled ? voiceAgent : undefined,
      skip_voice: !voiceEnabled,
      ai_suggested_rating: aiSuggestion?.suggested_rating ?? null,
      ai_used: aiUsed,
      ai_generated: aiGenerated,
      ai_provider: aiProvider || aiSuggestion?.provider || '',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800">Write a Review</h3>
          <p className="text-xs text-gray-500 mt-0.5">Share your experience — text + optional spoken voice</p>
        </div>
        <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
          ✨ AI-powered
        </span>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">YOUR RATING *</label>
        <div className="flex items-center gap-3">
          <StarRating value={rating} onChange={(v) => { setRating(v); setAiUsed(false); }} size="lg" allowHalf />
          {rating > 0 && (
            <span className="text-sm font-semibold text-gray-700">{rating.toFixed(1)} / 5</span>
          )}
        </div>

        {(aiLoading || aiSuggestion) && (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100">
            {aiLoading ? (
              <p className="text-xs text-blue-700 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                AI is analysing your review text…
              </p>
            ) : aiSuggestion && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-base">🤖</span>
                  <div>
                    <p className="text-xs font-semibold text-blue-800">
                      AI suggests: <span className="text-yellow-600">{aiSuggestion.suggested_rating.toFixed(1)} ★</span>
                    </p>
                    <p className="text-[10px] text-gray-600">{aiSuggestion.sentiment} sentiment</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={acceptAiSuggestion}
                  disabled={aiUsed}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                    aiUsed ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {aiUsed ? `✓ Applied (${aiSuggestion.suggested_rating.toFixed(1)}★)` : 'Apply suggestion'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          PICK A FEW TAGS (used as review title + fed to AI)
        </label>
        <div className="flex flex-wrap gap-2">
          {TITLE_TAGS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                selectedTags.includes(t)
                  ? 'bg-[#a37b3d] text-white border-[#a37b3d]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#ECD4A8]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-gray-600">YOUR REVIEW *</label>
          <button
            type="button"
            onClick={() => setGeneratorOpen(true)}
            disabled={!rating}
            className="text-[11px] font-bold px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            ✨ AI Generate
          </button>
        </div>
        <textarea
          value={comment}
          onChange={(e) => { setComment(e.target.value); setAiGenerated(false); }}
          rows={4}
          maxLength={500}
          placeholder="Write your honest review here…"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#a37b3d] focus:ring-2 focus:ring-[#FBEFF1] outline-none transition-all resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">{comment.length} / 500</span>
          {aiGenerated && (
            <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full font-medium">
              ✨ AI-generated (editable)
            </span>
          )}
        </div>
      </div>

      {/* Tone-voice: convert text → 4 voices */}
      <div className="rounded-2xl border border-[#ECD4A8]/70 bg-[#FFFBF5] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-bold text-gray-800">Convert text into voice</label>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Same 4 agents as Tone-Voice. Preview, then Apply Done — text + voice appear on the marketplace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setVoiceEnabled((v) => !v);
              setVoiceApplied(false);
              setVoicePreviewUrl('');
            }}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border ${
              voiceEnabled
                ? 'bg-[#a37b3d] text-white border-[#a37b3d]'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {voiceEnabled ? 'Voice ON' : 'Voice OFF'}
          </button>
        </div>

        {voiceEnabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {VOICE_AGENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={voiceLoading}
                  onClick={() => {
                    setVoiceAgent(a.id);
                    generateVoicePreview(a.id);
                  }}
                  className={`px-3 py-2.5 rounded-xl text-left text-xs font-semibold border transition-all ${
                    voiceAgent === a.id
                      ? 'bg-[#a37b3d] text-white border-[#a37b3d] shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#ECD4A8]'
                  }`}
                >
                  <span className="block">{a.label}</span>
                  <span className={`text-[9px] ${voiceAgent === a.id ? 'text-white/80' : 'text-gray-400'}`}>
                    Tap to preview · {a.hint}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => generateVoicePreview()}
                disabled={voiceLoading || !comment.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {voiceLoading ? 'Generating…' : 'Generate / Preview'}
              </button>
              <button
                type="button"
                onClick={applyVoiceDone}
                disabled={!voicePreviewUrl || voiceLoading}
                className={`px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                  voiceApplied
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-white text-[#a37b3d] border-[#a37b3d]'
                }`}
              >
                {voiceApplied ? '✓ Applied Done' : 'Apply Done'}
              </button>
            </div>

            {voiceError && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {voiceError}
              </p>
            )}

            {voicePreviewUrl && (
              <div className="rounded-xl bg-white border border-gray-100 px-3 py-2 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-500">
                  Preview · {VOICE_AGENTS.find((a) => a.id === voiceAgent)?.label}
                  {voiceApplied ? ' · locked for submit' : ''}
                </p>
                {spokenPreview && (
                  <p className="text-[11px] text-gray-600 italic line-clamp-3">&ldquo;{spokenPreview}&rdquo;</p>
                )}
                <audio controls src={voicePreviewUrl} className="w-full h-9" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || rating < 0.5}
          className="flex-1 py-3 bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
      </div>

      {generatorOpen && (
        <AIReviewGenerator
          productTitle={productTitle}
          productDescription={productDescription}
          rating={rating}
          keywordTags={selectedTags}
          onPick={handleGeneratorPick}
          onClose={() => setGeneratorOpen(false)}
        />
      )}
    </form>
  );
}
