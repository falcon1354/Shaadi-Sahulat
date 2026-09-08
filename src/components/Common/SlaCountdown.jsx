import React, { useEffect, useState } from "react";

/**
 * Live countdown for dispute / order confirmation SLAs.
 */
export default function SlaCountdown({
  deadline,
  label,
  className = "",
  showExpired = true,
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  const expired = ms <= 0;

  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const formatted =
    days > 0
      ? `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`
      : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let tone = "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (expired) tone = "bg-red-50 text-red-800 border-red-300";
  else if (ms < 24 * 3600 * 1000) tone = "bg-red-50 text-red-800 border-red-200";
  else if (ms < 48 * 3600 * 1000) tone = "bg-amber-50 text-amber-900 border-amber-200";

  if (expired && !showExpired) return null;

  return (
    <div className={`rounded-xl border px-3 py-2 ${tone} ${className}`}>
      {label && <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>}
      <p className="font-mono text-sm font-bold">
        {expired ? "Expired" : formatted}
      </p>
    </div>
  );
}
