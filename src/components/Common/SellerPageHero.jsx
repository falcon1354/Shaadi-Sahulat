import React from 'react';

/**
 * Shared cream/gold luxury hero banner for seller portal pages.
 * Keeps editorial layout consistent with the buyer portal with rich wedding aesthetics.
 */
export default function SellerPageHero({
  badge,
  title,
  subtitle,
  image,
  imageAlt = '',
  rightSlot = null,
  className = '',
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border shadow-sm bg-gradient-to-br from-[#FAF7F2] via-[#FDFBF7] to-[#F5EFEB] border-[#EADBCC]/80 shadow-[0_4px_24px_rgba(163,123,61,0.06)] ${className}`}
    >
      {image && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-30"
            style={{ backgroundImage: `url(${image})` }}
            aria-hidden
          />
          <div
            className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#FAF7F2] via-[#FAF7F2]/92 to-[#FAF7F2]/40"
          />
          <img src={image} alt={imageAlt} className="sr-only" />
        </>
      )}

      <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          {badge && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border bg-white/80 border-[#EADBCC] text-[#9B7036] shadow-2xs">
              {badge}
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-stone-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm font-normal text-stone-600 leading-relaxed max-w-xl">
              {subtitle}
            </p>
          )}
        </div>

        {(rightSlot || image) && (
          <div className="shrink-0 flex items-center gap-3">
            {rightSlot}
            {image && (
              <div className="hidden sm:block w-36 h-24 md:w-44 md:h-28 rounded-2xl overflow-hidden border border-[#EADBCC] shadow-md">
                <img
                  src={image}
                  alt={imageAlt || title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
