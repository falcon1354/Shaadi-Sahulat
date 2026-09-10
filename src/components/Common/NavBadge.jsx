import React from 'react';

/** Small red count pill for sidebar nav items. */
export default function NavBadge({ count }) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return (
    <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}
