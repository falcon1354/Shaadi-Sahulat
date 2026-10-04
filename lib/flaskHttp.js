/**
 * Node → internal Python services (visual-ml-service :5002, ml-service :5001).
 *
 * Both services require `X-Internal-Secret: <INTERNAL_API_SECRET>` on every
 * non-public route (Phase 2I), so the Node backend is the only gateway to them.
 *
 *  - `flaskHttp` (default export): dedicated axios instance for visual-ml-service.
 *  - `installInternalServiceAuth(axios)`: adds the header to requests made with the
 *    shared axios instance, but ONLY when the request's origin (scheme + host +
 *    port) is exactly one of the configured internal service origins. Third-party
 *    APIs (Groq, Kling, Cloudinary, …) never receive the secret, and look-alike
 *    hosts such as `localhost:5002.evil.test` do not match.
 *
 * The secret is never logged.
 */

const axios = require("axios");

const SECRET_HEADER = "X-Internal-Secret";

function _origin(url) {
  try { return new URL(url).origin; } catch { return null; }
}

/** Origins of the internal services, read at request time (env may change in tests). */
function internalOrigins() {
  return new Set([
    _origin(process.env.VISUAL_ML_URL || "http://localhost:5002"),
    _origin(process.env.ML_SERVICE_URL || "http://localhost:5001"),
  ].filter(Boolean));
}

function _setHeader(config, value) {
  config.headers = config.headers || {};
  if (typeof config.headers.set === "function") config.headers.set(SECRET_HEADER, value);
  else config.headers[SECRET_HEADER] = value;
}

function _deleteHeader(config) {
  if (!config.headers) return;
  if (typeof config.headers.delete === "function") config.headers.delete(SECRET_HEADER);
  else delete config.headers[SECRET_HEADER];
}

/** True when this request goes to an internal service origin. */
function isInternalRequest(instance, config) {
  let target;
  try { target = instance.getUri(config); } catch { return false; }
  const origin = _origin(target);
  return origin !== null && internalOrigins().has(origin);
}

const _installed = new WeakSet();

function installInternalServiceAuth(instance = axios) {
  if (_installed.has(instance)) return instance;
  _installed.add(instance);
  instance.interceptors.request.use((config) => {
    if (!isInternalRequest(instance, config)) {
      _deleteHeader(config); // never forward the secret anywhere else
      return config;
    }
    const secret = process.env.INTERNAL_API_SECRET;
    if (secret) _setHeader(config, secret);
    return config;
  });
  return instance;
}

// Dedicated instance for visual-ml-service (relative paths resolve against VISUAL_ML_URL).
// Axios runs request interceptors last-registered-first, so the auth interceptor is
// registered BEFORE the baseURL one: baseURL is applied first, then the origin check.
const flaskHttp = axios.create({ timeout: 30000 });
installInternalServiceAuth(flaskHttp);
flaskHttp.interceptors.request.use((config) => {
  config.baseURL = process.env.VISUAL_ML_URL || "http://localhost:5002";
  if (!process.env.INTERNAL_API_SECRET) throw new Error("INTERNAL_API_SECRET is not configured");
  return config;
});

// Every existing Node → Flask/ML call uses the shared axios instance.
installInternalServiceAuth(axios);

module.exports = flaskHttp;
module.exports.installInternalServiceAuth = installInternalServiceAuth;
module.exports.isInternalRequest = isInternalRequest;
module.exports.internalOrigins = internalOrigins;
module.exports.SECRET_HEADER = SECRET_HEADER;
