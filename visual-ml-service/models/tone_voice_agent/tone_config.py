"""
tone_config.py — Loads tone_config.json and provides accessor helpers.
Adapted for integration with Shaadi-Sahulat visual-ml-service.
Config path now reads from the models/tone_voice_agent/ directory.
"""

import json
import os
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional

# Config directory is now inside models/tone_voice_agent/
_MODELS_DIR = Path(__file__).parent
_CONFIG: Optional[Dict[str, Any]] = None
_CONFIG_PATH = _MODELS_DIR / "tone_config.json"
_PIPELINE_PKL_PATH = _MODELS_DIR / "tone_pipeline.pkl"


def _load_config() -> Dict[str, Any]:
    global _CONFIG
    if _CONFIG is None:
        # Try loading from PKL first (one-file convenience)
        if _PIPELINE_PKL_PATH.exists():
            with open(_PIPELINE_PKL_PATH, "rb") as f:
                _CONFIG = pickle.load(f)
        else:
            # Fall back to JSON config
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                _CONFIG = json.load(f)
    return _CONFIG


def reload_config():
    """Force reload from disk (useful after editing tone_config.json)."""
    global _CONFIG
    _CONFIG = None
    return _load_config()


# ── Star rating helpers ──────────────────────────────────────────────

def get_speed_for_rating(rating: int) -> float:
    cfg = _load_config()
    return cfg["star_speed_map"].get(str(rating), 1.0)


def get_tone_label_for_rating(rating: int) -> str:
    cfg = _load_config()
    return cfg["star_tone_labels"].get(str(rating), "Neutral / Balanced")


# ── Emotion routing helpers ──────────────────────────────────────────

def get_high_intensity_threshold() -> float:
    return _load_config()["emotion_routing"]["high_intensity_threshold"]


def get_low_intensity_threshold() -> float:
    return _load_config()["emotion_routing"]["low_intensity_threshold"]


def get_voice_dominant_emotions() -> List[str]:
    return _load_config()["emotion_routing"]["voice_dominant_emotions"]


def get_llm_dominant_emotions() -> List[str]:
    return _load_config()["emotion_routing"]["llm_dominant_emotions"]


def get_balanced_emotions() -> List[str]:
    return _load_config()["emotion_routing"]["balanced_emotions"]


def get_routing_rules() -> List[Dict[str, Any]]:
    return _load_config()["routing_rules"]


def get_routing_priority() -> List[str]:
    return _load_config()["routing_priority"]


# ── Mismatch helpers ─────────────────────────────────────────────────

def get_mismatch_rules() -> Dict[str, Any]:
    return _load_config()["mismatch_rules"]


# ── SSML bridge helpers ──────────────────────────────────────────────

def get_ssml_bridge_config() -> Dict[str, Any]:
    return _load_config()["ssml_bridge"]


# ── Voice ID helpers ─────────────────────────────────────────────────

def get_voice_id(agent: str) -> str:
    cfg = _load_config()
    return cfg["voice_ids"].get(agent, "af_bella")


# ── Groq helpers ─────────────────────────────────────────────────────

def get_groq_config() -> Dict[str, Any]:
    return _load_config()["groq"]


# ── Limits helpers ───────────────────────────────────────────────────

def get_max_review_words() -> int:
    return _load_config()["limits"]["max_review_words"]


def get_max_rewrite_words() -> int:
    return _load_config()["limits"]["max_rewrite_words"]


# ── Cache helpers ────────────────────────────────────────────────────

def get_cache_config() -> Dict[str, Any]:
    return _load_config()["cache"]


# ── Full config access ───────────────────────────────────────────────

def get_full_config() -> Dict[str, Any]:
    return _load_config()
