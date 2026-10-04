import React, { useState } from "react";

/**
 * Truncated item summary that expands on click and collapses on mouse leave.
 * Used in Buyer / Seller / Admin transaction & wallet lists.
 */
export default function ExpandableItems({ items = [], fallback = "—" }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return <span>{fallback}</span>;

  const label = (it) => {
    if (typeof it === "string") return it;
    const title = it.title || it.productName || "Item";
    const qty = it.qty || 1;
    return `${title} × ${qty}`;
  };

  const summary =
    list.length === 1
      ? label(list[0])
      : `${label(list[0])} + ${list.length - 1} more`;

  return (
    <button
      type="button"
      className="text-left max-w-full"
      onClick={() => setOpen((v) => !v)}
      onMouseLeave={() => setOpen(false)}
      title="Click to expand / leave to collapse"
    >
      {open ? (
        <ul className="space-y-0.5 text-xs">
          {list.map((it, i) => (
            <li key={i} className="text-gray-800">{label(it)}</li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-[#a37b3d] underline-offset-2 hover:underline truncate block max-w-[280px]">
          {summary}
        </span>
      )}
    </button>
  );
}
