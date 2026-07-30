"""
tone_resolver.py — EmotionProfile + star rating → ToneProfile

Takes the emotion analysis results and the star rating, resolves any
mismatches, and produces a ToneProfile that is the single source of
truth for all downstream decisions (routing, rewriting, TTS).
"""

from typing import Dict, Any

from tone_config import get_tone_label_for_rating, get_mismatch_rules


# Mapping from primary_emotion to a tone flavor label
_EMOTION_TONE_MAP = {
    "joy": "happy",
    "excitement": "enthusiastic",
    "satisfaction": "satisfied",
    "gratitude": "warm_grateful",
    "neutral": "neutral",
    "concern": "cautious",
    "disappointment": "disappointed",
    "frustration": "frustrated",
    "anger": "angry",
    "sadness": "sad",
    "sarcasm": "sarcastic",
    "surprise": "surprised",
}

# Positive emotions that conflict with low stars
_POSITIVE_EMOTIONS = {"joy", "excitement", "satisfaction", "gratitude"}

# Negative emotions that conflict with high stars
_NEGATIVE_EMOTIONS = {"disappointment", "frustration", "anger", "sadness", "sarcasm"}


def resolve_tone(emotion_profile: Dict[str, Any], rating: int) -> Dict[str, Any]:
    """
    Resolve a ToneProfile from the EmotionProfile and star rating.

    The resolution handles star-text mismatches:
    - High star + negative/sarcastic text → trust the text (text_dominant)
    - Low star + positive text → blend, text-leading (blended_text_leading)
    - Agreement → harmonic

    Args:
        emotion_profile: Dict with primary_emotion, secondary_emotion,
                         emotional_intensity, mismatch, mismatch_note
        rating: Star rating 0-5

    Returns:
        ToneProfile dict with keys:
            tone_label, base_energy, emotion_flavor, intensity,
            resolution_source
    """
    primary = emotion_profile.get("primary_emotion", "neutral")
    intensity = float(emotion_profile.get("emotional_intensity", 0.3))
    is_mismatch = bool(emotion_profile.get("mismatch", False))

    # Base energy from star rating (0★→0.0, 5★→1.0)
    base_energy = rating / 5.0

    # Emotion flavor label
    emotion_flavor = _EMOTION_TONE_MAP.get(primary, "neutral")

    # ── Resolution logic ──────────────────────────────────────────────

    if is_mismatch:
        # Determine the type of mismatch
        if rating >= 4 and primary in _NEGATIVE_EMOTIONS:
            # High star + negative/sarcastic text → trust the text
            resolution_source = "text_dominant"
            tone_label = f"sarcastically_{emotion_flavor}" if primary == "sarcasm" else f"conflicted_{emotion_flavor}"
            # Dampen the base energy from the high star
            base_energy = base_energy * 0.5
        elif rating <= 1 and primary in _POSITIVE_EMOTIONS:
            # Low star + positive text → blend, text-leading
            resolution_source = "blended_text_leading"
            tone_label = f"cautiously_{emotion_flavor}"
            # Slightly boost energy from the positive text
            base_energy = min(1.0, base_energy + 0.2)
        else:
            # Generic mismatch — lean toward text
            resolution_source = "text_dominant"
            tone_label = f"ambivalently_{emotion_flavor}"
    else:
        # No mismatch — star and text agree
        resolution_source = "harmonic"
        tone_label = emotion_flavor

    # Special case: neutral text
    if primary == "neutral" and intensity < 0.2:
        resolution_source = "star_dominant"
        tone_label = get_tone_label_for_rating(rating).lower().replace(" / ", "_").replace(" ", "_")

    tone_profile = {
        "tone_label": tone_label,
        "base_energy": round(base_energy, 3),
        "emotion_flavor": emotion_flavor,
        "intensity": round(intensity, 3),
        "resolution_source": resolution_source,
    }

    return tone_profile
