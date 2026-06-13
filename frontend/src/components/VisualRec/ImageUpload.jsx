import React, { useRef, useState } from 'react';

export default function ImageUpload({ onFileSelect, preview, loading }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">📸 Upload Dress Image</h3>

      {!preview ? (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-purple-400 bg-purple-50'
              : 'border-gray-300 hover:border-purple-300 hover:bg-purple-50/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="text-4xl mb-3">👗</div>
          <p className="text-sm text-gray-600 font-medium">
            Drag & drop your dress photo here
          </p>
          <p className="text-xs text-gray-400 mt-1">
            or click to browse — JPG, PNG, WebP (max 5MB)
          </p>
        </div>
      ) : (
        <div className="relative">
          <img
            src={preview}
            alt="Uploaded dress"
            className={`w-full h-64 object-contain rounded-xl bg-gray-50 ${
              loading ? 'opacity-60' : ''
            }`}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/90 rounded-full p-4 animate-pulse-glow">
                <svg className="animate-spin h-8 w-8 text-purple-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="absolute bottom-2 right-2 bg-white/90 rounded-lg px-3 py-1.5 text-xs text-purple-600 font-medium shadow-sm hover:bg-white"
          >
            Change Image
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
      />

      <div className="mt-3 text-xs text-gray-400 space-y-1">
        <p>✅ Full dress photos work best</p>
        <p>✅ White/light background preferred</p>
        <p>⚠️ Avoid: face-only, jewelry-only, fabric swatches</p>
      </div>
    </div>
  );
}
