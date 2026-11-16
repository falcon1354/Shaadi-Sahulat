/**
 * Where the browser sends API calls.
 *
 * Local `npm run dev` leaves VITE_API_URL empty, so fetches stay relative
 * (`/api/...`) and the Vite proxy reaches the Express server.
 *
 * A Vercel build must set VITE_API_URL to the public API
 * (https://your-api.example.com or https://your-api.example.com/api).
 * The static site has no Express server, so a relative /api/auth/login
 * hits the HTML page and login shows "Something went wrong."
 */

function viteEnv(name) {
  try {
    const value = import.meta.env && import.meta.env[name];
    return value ? String(value) : "";
  } catch {
    return "";
  }
}

function apiPrefix() {
  const raw = viteEnv("VITE_API_URL").replace(/\/$/, "");
  if (!raw) return "/api";
  return /\/api$/i.test(raw) ? raw : `${raw}/api`;
}

const PREFIX = apiPrefix();

/** Public API host when VITE_API_URL is set. Empty during local dev. */
export const API_ORIGIN = PREFIX.startsWith("http") ? PREFIX.replace(/\/api$/i, "") : "";

export const ML_ORIGIN = (viteEnv("VITE_ML_URL") || "http://localhost:5002").replace(/\/$/, "");

const LOCAL_API = "http://localhost:5000";

/** `/api/...` locally. Absolute when VITE_API_URL is set. */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const suffix = p === "/api" ? "" : p.startsWith("/api/") ? p.slice(4) : p;
  return `${PREFIX}${suffix}`;
}

/** Always absolute. Used for new tabs, images, and Socket.io. */
export function absoluteApiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN || LOCAL_API}${p}`;
}
