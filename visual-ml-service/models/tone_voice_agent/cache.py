"""
cache.py — Simple in-memory cache with TTL support.
Caches EmotionProfile, ToneProfile, EmotionRoute, toned text, and Hindi translation.
"""

import hashlib
import time
from typing import Any, Dict, Optional

from tone_config import get_cache_config


class TTLCache:
    """Time-to-live cache with max entry limit."""

    def __init__(self, ttl_seconds: int = 3600, max_entries: int = 500):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._store: Dict[str, tuple] = {}  # key -> (value, timestamp)

    @staticmethod
    def make_key(*parts: str) -> str:
        """Create a deterministic cache key from string parts."""
        raw = "|".join(str(p) for p in parts)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]

    def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            value, ts = self._store[key]
            if time.time() - ts < self.ttl_seconds:
                return value
            else:
                del self._store[key]  # expired
        return None

    def set(self, key: str, value: Any):
        # Evict oldest entries if at capacity
        if len(self._store) >= self.max_entries:
            oldest_key = min(self._store, key=lambda k: self._store[k][1])
            del self._store[oldest_key]
        self._store[key] = (value, time.time())

    def clear(self):
        self._store.clear()

    def size(self) -> int:
        return len(self._store)


# ── Global cache instances ───────────────────────────────────────────

def _init_cache() -> TTLCache:
    cfg = get_cache_config()
    return TTLCache(
        ttl_seconds=cfg.get("ttl_seconds", 3600),
        max_entries=cfg.get("max_entries", 500),
    )


# Lazily initialized on first use
_emotion_cache: Optional[TTLCache] = None
_tone_cache: Optional[TTLCache] = None
_route_cache: Optional[TTLCache] = None
_text_en_cache: Optional[TTLCache] = None
_text_hi_cache: Optional[TTLCache] = None


def get_emotion_cache() -> TTLCache:
    global _emotion_cache
    if _emotion_cache is None:
        _emotion_cache = _init_cache()
    return _emotion_cache


def get_tone_cache() -> TTLCache:
    global _tone_cache
    if _tone_cache is None:
        _tone_cache = _init_cache()
    return _tone_cache


def get_route_cache() -> TTLCache:
    global _route_cache
    if _route_cache is None:
        _route_cache = _init_cache()
    return _route_cache


def get_text_en_cache() -> TTLCache:
    global _text_en_cache
    if _text_en_cache is None:
        _text_en_cache = _init_cache()
    return _text_en_cache


def get_text_hi_cache() -> TTLCache:
    global _text_hi_cache
    if _text_hi_cache is None:
        _text_hi_cache = _init_cache()
    return _text_hi_cache


def clear_all_caches():
    """Clear every cache — useful for debugging or after config reload."""
    for c in [_emotion_cache, _tone_cache, _route_cache, _text_en_cache, _text_hi_cache]:
        if c is not None:
            c.clear()
