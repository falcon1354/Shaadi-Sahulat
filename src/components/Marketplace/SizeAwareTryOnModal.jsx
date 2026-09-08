import React, { useEffect, useMemo, useState } from 'react';
import { Camera, X, Ruler, AlertTriangle, CheckCircle2, Shirt } from 'lucide-react';
import tryonApi from '../../api/tryonApi';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

const VERDICT_STYLE = {
  FIT: {
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  TOO_SMALL: {
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: AlertTriangle,
  },
  TOO_LARGE: {
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: AlertTriangle,
  },
};

/**
 * Size-aware try-on modal for wedding attire product pages.
 */
export default function SizeAwareTryOnModal({ open, onClose, product }) {
  const [buyerSize, setBuyerSize] = useState('M');
  const [heightCm, setHeightCm] = useState('');
  const [personFile, setPersonFile] = useState(null);
  const [personPreview, setPersonPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fitPreview, setFitPreview] = useState(null);

  const productSize = product?.size || '';
  const category = product?.item_type || product?.major_category || 'wedding_dress';

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    // Live fit verdict as size changes
    tryonApi
      .fitOnly({
        product_size: productSize,
        buyer_size: buyerSize,
        height_cm: heightCm ? Number(heightCm) : undefined,
        category,
      })
      .then((d) => setFitPreview(d.fit || null))
      .catch(() => setFitPreview(null));
  }, [open, buyerSize, heightCm, productSize, category]);

  useEffect(() => {
    return () => {
      if (personPreview) URL.revokeObjectURL(personPreview);
    };
  }, [personPreview]);

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (personPreview) URL.revokeObjectURL(personPreview);
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setResult(null);
    setError('');
  };

  const canRun = Boolean(personFile) && !loading;

  const runTryOn = async () => {
    if (!canRun) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await tryonApi.preview({
        personFile,
        productId: product?.product_id,
        productSize,
        buyerSize,
        heightCm: heightCm ? Number(heightCm) : undefined,
        category,
      });
      if (!data.success) {
        setError(data.error || 'Try-on failed');
      } else {
        setResult(data);
        if (data.provider === 'local' && data.provider_fallback_reason) {
          setError(data.provider_fallback_reason);
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'Could not reach try-on service. Is the Visual ML service running?'
      );
    } finally {
      setLoading(false);
    }
  };

  const fit = result?.fit || fitPreview;
  const verdictStyle = fit ? VERDICT_STYLE[fit.verdict] || VERDICT_STYLE.FIT : null;
  const VerdictIcon = verdictStyle?.icon || Shirt;

  const tips = useMemo(
    () => [
      'Use a full or half-body photo, standing facing the camera',
      'Plain background and good lighting work best',
      'Pick your real size so the preview can show fit vs mismatch',
    ],
    []
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl border border-[#FBEFF1]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Fitting room</p>
            <h2 className="text-lg font-bold text-gray-800 leading-snug">
              {product?.title || 'See how it looks on you'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Listed size: <span className="font-semibold text-gray-700">{productSize || 'Not listed'}</span>
              {' · '}Upload a photo to check the fit
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left controls */}
          <div className="space-y-4">
            <div className="bg-[#FFF8F3] border border-[#F3E4D0] rounded-2xl p-4">
              <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Ruler size={16} className="text-[#a37b3d]" /> Your size
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setBuyerSize(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      buyerSize === s
                        ? 'bg-[#a37b3d] text-white border-[#a37b3d] shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#ECD4A8]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-gray-500 mb-1">Height (cm) — optional, improves length fit</label>
              <input
                type="number"
                min="120"
                max="220"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 165"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
              />
            </div>

            {fit && (
              <div className={`rounded-2xl border p-4 ${verdictStyle.chip}`}>
                <div className="flex items-center gap-2 font-bold text-sm mb-1">
                  <VerdictIcon size={16} />
                  {fit.label}
                </div>
                <p className="text-xs opacity-90">
                  Confidence {Math.round((fit.confidence || 0) * 100)}%
                  {fit.product_size && fit.buyer_size
                    ? ` · You ${fit.buyer_size} vs Dress ${fit.product_size}`
                    : ''}
                </p>
                {Array.isArray(fit.reasons) && fit.reasons[0] && (
                  <p className="text-xs mt-2 opacity-90">{fit.reasons[0]}</p>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Camera size={16} className="text-[#a37b3d]" /> Your photo
              </p>
              <label className="block border-2 border-dashed border-[#ECD4A8] rounded-2xl p-4 text-center cursor-pointer hover:bg-[#FFF8F3] transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
                {personPreview ? (
                  <img
                    src={personPreview}
                    alt="Your upload"
                    className="mx-auto max-h-56 rounded-xl object-contain"
                  />
                ) : (
                  <div className="py-8 text-gray-500">
                    <Camera className="mx-auto mb-2 text-[#a37b3d]" size={28} />
                    <p className="text-sm font-semibold">Click to upload full/half-body photo</p>
                    <p className="text-xs mt-1">JPG, PNG, WebP · max 5MB</p>
                  </div>
                )}
              </label>
            </div>

            <ul className="text-[11px] text-gray-500 space-y-1">
              {tips.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>

            <button
              onClick={runTryOn}
              disabled={!canRun}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#a37b3d] to-[#c09858] shadow-md hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Preparing your preview…
                </>
              ) : (
                <>
                  <Shirt size={16} /> See how it looks
                </>
              )}
            </button>

            {error && (
              <div className={`text-xs rounded-xl px-3 py-2 border ${
                result
                  ? 'text-amber-800 bg-amber-50 border-amber-200'
                  : 'text-rose-700 bg-rose-50 border-rose-100'
              }`}>
                {result ? `Kling unavailable — showing local preview. ${error}` : error}
              </div>
            )}
          </div>

          {/* Right result */}
          <div className="bg-gray-50 border border-gray-100 rounded-3xl min-h-[360px] flex items-center justify-center p-3 relative overflow-hidden">
            {result?.result_image_url ? (
              <div className="w-full space-y-3">
                <img
                  src={result.result_image_url}
                  alt="Try-on result"
                  className="w-full rounded-2xl shadow-md object-contain max-h-[520px] mx-auto bg-white"
                />
                <div className="text-center text-[11px] text-gray-500">
                  Provider: <span className="font-semibold">{result.provider}</span>
                  {result.fit?.verdict === 'TOO_SMALL' && ' · Dress appears too small for your size'}
                  {result.fit?.verdict === 'TOO_LARGE' && ' · Dress appears too large for your size'}
                  {result.fit?.verdict === 'FIT' && ' · Dress appears to fit your size'}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 px-6">
                <Shirt className="mx-auto mb-2 text-gray-300" size={32} />
                <p className="text-sm font-semibold text-gray-600">Your preview will show up here</p>
                <p className="text-xs mt-1">
                  If the size doesn’t match yours, the preview will look too small or too large.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
