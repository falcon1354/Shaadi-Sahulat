/**
 * Open a document URL that may be absolute (Cloudinary) or an API path
 * requiring auth headers. Uses a blob tab so Authorization / custom headers work.
 */
export function resolveMediaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = "http://localhost:5000";
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export async function openProtectedDocument(url, headers = {}) {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return;

  // Public / Cloudinary — open directly
  if (/^https?:\/\/(?!localhost:5000\/api)/i.test(resolved) && !resolved.includes("/api/")) {
    window.open(resolved, "_blank", "noopener,noreferrer");
    return;
  }
  if (resolved.includes("/uploads/")) {
    window.open(resolved, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    const res = await fetch(resolved, { headers });
    if (!res.ok) throw new Error(`Failed to open document (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (err) {
    console.error("[openDoc]", err);
    alert(err.message || "Could not open document");
  }
}
