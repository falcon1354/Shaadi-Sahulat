"""
tone_router.py — ToneProfile → EmotionRoute

Decides WHERE the emotional expression lives: in the LLM's rewritten
words, or in the Voice Model's prosody/SSML, or both. This is the core
of the "Tone Focus" — the router determines who carries the emotion.

Routing logic (in priority order):
R5: mismatch == true → LLM-dominant (words resolve contradictions)
R1: high intensity + voice-dominant emotion → Voice-dominant (prosody carries it)
R2: high intensity + LLM-dominant emotion → LLM-dominant (words carry it)
R3: mid intensity → Balanced
R4: low intensity → Star-only (speed adjustment, no emotion injection)
"""

from typing import Dict, Any, List

from tone_config import (
    get_high_intensity_threshold,
    get_low_intensity_threshold,
    get_voice_dominant_emotions,
    get_llm_dominant_emotions,
    get_balanced_emotions,
    get_routing_rules,
    get_routing_priority,
    get_speed_for_rating,
)


# LLM instruction templates per rewrite strength
_LLM_INSTRUCTIONS = {
    "mild": (
        "Do a LIGHT-TO-MODERATE rewrite. The voice model will carry the prosody, "
        "but your words should ALSO show clear emotional colour. "
        "Open with a natural spoken hook (an interjection like 'oh', 'wow', 'yes', a light 'haha' "
        "if the emotion is joy/excitement, or a soft 'hmm' if it's concern). "
        "Add at least one <emphasis level=\"strong\">key word</emphasis> and one "
        "<break time=\"0.3s\"/> where a pause helps the feeling land. "
        "Keep the original facts intact — do not invent anything."
    ),
    "moderate": (
        "Do a MODERATE rewrite — both your words and the voice model share the emotional load. "
        "Add a warm opener, natural spoken-language touches (interjections like 'oh', 'well', 'you know'), "
        "at least one <emphasis> and one <break>, and — if the emotion is positive — an occasional "
        "light 'haha' or 'yay' where it fits naturally. Keep the original facts."
    ),
    "strong": (
        "Do a STRONG rewrite — your words carry the emotion. "
        "Use exclamations, sigh-like phrases ('phew', 'ugh', 'oh no'), warm openers, ironic phrasing, "
        "or laughter ('haha', 'hehe') where the emotion invites it. "
        "Embed multiple <break> markers so heavy moments land, and use <emphasis level=\"strong\"> "
        "on the words carrying the most feeling. Keep the original facts."
    ),
    "minimal": (
        "Do a MINIMAL rewrite — just clean up the text for natural speech. "
        "Remove awkward written constructions, but do NOT inject any emotion. "
        "The star rating alone sets the voice speed; your job is clarity, not feeling."
    ),
}

# Emotion-specific expressive boosters — appended after the strength template
# so R1 (voice-dominant joy/anger) still gets text that colours the emotion.
_EMOTION_BOOSTERS = {
    "joy": (
        " EXTRA: The primary emotion is JOY — sprinkle a natural laugh marker "
        "(e.g. 'haha!' or '<say-as interpret-as=\"interjection\">yay</say-as>') early in the line, "
        "use exclamation marks, and prefer <prosody rate=\"fast\">…</prosody> on the most upbeat phrase."
    ),
    "excitement": (
        " EXTRA: The primary emotion is EXCITEMENT — open with an energetic interjection "
        "('<say-as interpret-as=\"interjection\">wow</say-as>' or 'oh my'), use exclamation marks, "
        "and wrap the peak phrase in <prosody rate=\"fast\">…</prosody>."
    ),
    "gratitude": (
        " EXTRA: The primary emotion is GRATITUDE — open with a warm 'thank you' or 'honestly,', "
        "use an <emphasis level=\"strong\"> on the grateful word, and add a soft <break time=\"0.4s\"/> "
        "before the closing thought."
    ),
    "satisfaction": (
        " EXTRA: The primary emotion is SATISFACTION — sound quietly pleased. "
        "Use a gentle opener like 'you know,' or 'honestly,', one <emphasis> on the positive verb, "
        "and keep the pace even (no fast prosody)."
    ),
    "sadness": (
        " EXTRA: The primary emotion is SADNESS — use a soft sigh word ('*sigh*' or 'ah…'), "
        "wrap the heaviest phrase in <prosody rate=\"slow\">…</prosody>, and add <break time=\"0.6s\"/> "
        "before the reflective conclusion."
    ),
    "frustration": (
        " EXTRA: The primary emotion is FRUSTRATION — open with a terse 'honestly,' or 'ugh,', "
        "use <emphasis level=\"strong\"> on the frustrating word, and add a firm <break time=\"0.4s\"/>."
    ),
    "anger": (
        " EXTRA: The primary emotion is ANGER — clip the sentences short, use "
        "<emphasis level=\"strong\"> on the strongest negative word, and add <break time=\"0.5s\"/> "
        "for weight. Do not shout — controlled anger reads louder."
    ),
    "sarcasm": (
        " EXTRA: The primary emotion is SARCASM — use ironic phrasing, wrap the ironic phrase in "
        "<prosody rate=\"slow\">…</prosody>, and add <break time=\"0.4s\"/> before the punchline "
        "so the irony lands."
    ),
    "disappointment": (
        " EXTRA: The primary emotion is DISAPPOINTMENT — open with 'honestly,' or 'unfortunately,', "
        "use <prosody rate=\"slow\"> on the disappointed phrase, and let a <break time=\"0.5s\"/> "
        "sit before the reason."
    ),
}


def route_emotion(tone_profile: Dict[str, Any], emotion_profile: Dict[str, Any], rating: int) -> Dict[str, Any]:
    """
    Determine the EmotionRoute from the ToneProfile and EmotionProfile.

    Args:
        tone_profile: Dict with tone_label, base_energy, emotion_flavor,
                      intensity, resolution_source
        emotion_profile: Dict with primary_emotion, secondary_emotion,
                         emotional_intensity, mismatch, mismatch_note
        rating: Star rating 0-5

    Returns:
        EmotionRoute dict with keys:
            carrier, llm_instruction, ssml_intensity, ssml_hints,
            speed_multiplier, pause_locations
    """
    intensity = tone_profile.get("intensity", 0.3)
    primary_emotion = emotion_profile.get("primary_emotion", "neutral")
    is_mismatch = emotion_profile.get("mismatch", False)
    resolution_source = tone_profile.get("resolution_source", "harmonic")

    high_thresh = get_high_intensity_threshold()
    low_thresh = get_low_intensity_threshold()
    voice_emotions = get_voice_dominant_emotions()
    llm_emotions = get_llm_dominant_emotions()
    priority_order = get_routing_priority()

    # ── Evaluate routing rules in priority order ──────────────────────

    matched_rule = None

    # Build a simple evaluation context
    def eval_condition(rule_id: str) -> bool:
        if rule_id == "R5":
            return is_mismatch
        elif rule_id == "R1":
            return intensity >= high_thresh and primary_emotion in voice_emotions and not is_mismatch
        elif rule_id == "R2":
            return intensity >= high_thresh and primary_emotion in llm_emotions and not is_mismatch
        elif rule_id == "R3":
            return low_thresh <= intensity < high_thresh and not is_mismatch
        elif rule_id == "R4":
            return intensity < low_thresh and not is_mismatch
        return False

    for rule_id in priority_order:
        if eval_condition(rule_id):
            # Find the matching rule config
            rules = get_routing_rules()
            for rule in rules:
                if rule["id"] == rule_id:
                    matched_rule = rule
                    break
            break

    # Fallback: if no rule matched, use balanced
    if matched_rule is None:
        matched_rule = {
            "carrier": "balanced",
            "llm_rewrite_strength": "moderate",
            "ssml_intensity": "moderate",
            "speed_adjustment": 1.0,
        }

    # ── Build the EmotionRoute ────────────────────────────────────────

    carrier = matched_rule["carrier"]
    rewrite_strength = matched_rule["llm_rewrite_strength"]
    ssml_intensity = matched_rule["ssml_intensity"]
    speed_adjustment = float(matched_rule.get("speed_adjustment", 1.0))

    # LLM instruction
    llm_instruction = _LLM_INSTRUCTIONS.get(rewrite_strength, _LLM_INSTRUCTIONS["moderate"])
    if rewrite_strength != "minimal":
        booster = _EMOTION_BOOSTERS.get(primary_emotion, "")
        if booster:
            llm_instruction = llm_instruction + booster

    # SSML hints — specific guidance for what markers to embed
    ssml_hints = _get_ssml_hints(carrier, ssml_intensity, primary_emotion, resolution_source)

    # Pause locations — where pauses help the emotion land
    pause_locations = _get_pause_locations(carrier, primary_emotion, resolution_source)

    # Final speed = base_speed_from_rating × route_speed_adjustment
    base_speed = get_speed_for_rating(rating)
    speed_multiplier = round(base_speed * speed_adjustment, 3)

    # Clamp speed to reasonable range
    speed_multiplier = max(0.75, min(1.25, speed_multiplier))

    return {
        "carrier": carrier,
        "llm_instruction": llm_instruction,
        "ssml_intensity": ssml_intensity,
        "ssml_hints": ssml_hints,
        "speed_multiplier": speed_multiplier,
        "pause_locations": pause_locations,
    }


def _get_ssml_hints(
    carrier: str,
    ssml_intensity: str,
    primary_emotion: str,
    resolution_source: str,
) -> List[str]:
    """Generate specific SSML hint types based on carrier and emotion."""
    hints = []

    if ssml_intensity == "none":
        return hints

    if ssml_intensity in ("heavy", "moderate"):
        hints.append("speed_up_exclamation")
        hints.append("emphasize_key_adjective")
        hints.append("pause_before_negative")

    if ssml_intensity == "heavy":
        if primary_emotion in ("joy", "excitement"):
            hints.append("fast_prosody_for_enthusiasm")
        if primary_emotion in ("anger", "frustration"):
            hints.append("slow_prosody_for_weight")
            hints.append("emphasis_on_negative_words")

    if ssml_intensity in ("light", "moderate"):
        hints.append("pause_after_emotional_word")

    if resolution_source == "text_dominant" or primary_emotion == "sarcasm":
        hints.append("pause_for_irony_to_land")
        hints.append("emphasis_on_ironic_words")

    return hints


def _get_pause_locations(
    carrier: str,
    primary_emotion: str,
    resolution_source: str,
) -> List[str]:
    """Determine where pauses should be inserted."""
    locations = []

    if carrier == "voice_dominant":
        locations.extend(["start", "before_key_point", "after_emotional_word", "end"])
    elif carrier == "llm_dominant":
        locations.extend(["before_key_point", "end"])
    elif carrier == "balanced":
        locations.extend(["before_key_point", "after_emotional_word"])
    # star_only → no pauses

    if resolution_source == "text_dominant" or primary_emotion == "sarcasm":
        if "before_key_point" not in locations:
            locations.append("before_key_point")

    return locations
