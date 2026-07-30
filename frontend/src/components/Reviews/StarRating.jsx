/**
 * StarRating — visual star rating supporting 0.5-step increments.
 *
 * Props:
 *   value    : number (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)
 *   onChange : (newValue) => void   (omit for read-only)
 *   size     : "sm" | "md" | "lg"
 *   allowHalf: bool (default true for selectable, false for display)
 *   showLabel: bool — show numeric label like "4.5 / 5"
 */
import React from 'react';

const SIZES = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-3xl',
};

export default function StarRating({
  value = 0,
  onChange,
  size = 'md',
  allowHalf = true,
  showLabel = false,
}) {
  const readOnly = typeof onChange !== 'function';
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (e, starIdx) => {
    if (readOnly) return;
    if (!allowHalf) {
      onChange?.(starIdx);
      return;
    }
    // Determine if click was on left half (→ x.5) or right half (→ x+1)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;
    const rating = isLeftHalf ? starIdx - 0.5 : starIdx;
    onChange?.(Math.max(0.5, rating));
  };

  return (
    <div className="inline-flex items-center gap-1">
      <div className={`inline-flex ${SIZES[size] || SIZES.md}`}>
        {stars.map((s) => {
          const filled = value >= s;
          const half = !filled && value >= s - 0.5;
          return (
            <button
              key={s}
              type="button"
              disabled={readOnly}
              onClick={(e) => handleClick(e, s)}
              className={`relative leading-none select-none ${
                readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'
              }`}
              title={`${s - 0.5} / ${s} stars`}
            >
              {/* Background empty star */}
              <span className="text-gray-300">★</span>
              {/* Half or full filled overlay */}
              {(filled || half) && (
                <span
                  className="absolute top-0 left-0 overflow-hidden text-yellow-400"
                  style={{ width: filled ? '100%' : '50%' }}
                >
                  ★
                </span>
              )}
            </button>
          );
        })}
      </div>
      {showLabel && (
        <span className="text-xs font-semibold text-gray-600 ml-1">
          {value > 0 ? `${value.toFixed(1)} / 5` : 'Not rated'}
        </span>
      )}
    </div>
  );
}
