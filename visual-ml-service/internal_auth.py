"""
Internal-only access control for the visual-ml-service (Phase 2I).

The Node backend (:5000) is the only gateway to this service. Every route except
the explicit public allow-list requires the shared INTERNAL_API_SECRET in the
`X-Internal-Secret` header (constant-time comparison). The check fails closed:
if the secret is not configured, protected routes answer 503.

Public (no secret):
  GET/HEAD /images/<path>   product images loaded by the browser
  GET/HEAD /health          liveness check
"""

import hmac
import os

from flask import jsonify, request

SECRET_HEADER = "X-Internal-Secret"


def internal_request_allowed() -> tuple[bool, int]:
    expected = os.environ.get("INTERNAL_API_SECRET", "")
    if not expected:
        return False, 503  # fail closed when not configured
    provided = request.headers.get(SECRET_HEADER, "")
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        return False, 401
    return True, 200


def is_public_request() -> bool:
    if request.method not in ("GET", "HEAD"):
        return False
    path = request.path or ""
    return path == "/health" or path.startswith("/images/")


def install_internal_guard(app) -> None:
    """Register a before_request hook that protects every non-public route."""

    @app.before_request
    def _require_internal_secret():
        if is_public_request():
            return None
        allowed, status = internal_request_allowed()
        if not allowed:
            return jsonify({"success": False, "error": "Forbidden"}), status
        return None


def frontend_origins() -> list[str]:
    origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")
    return [origin]


def debug_enabled() -> bool:
    """Werkzeug's debugger allows code execution — never on unless explicitly asked for."""
    return os.environ.get("FLASK_DEBUG", "").strip().lower() in ("1", "true", "yes")
