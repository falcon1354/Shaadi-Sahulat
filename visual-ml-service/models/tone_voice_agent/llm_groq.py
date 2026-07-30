"""
llm_groq.py — Groq API calls for tone rewriting and Hindustani translation.

Two main functions:
1. rewrite_tone() — Takes original text + ToneProfile + EmotionRoute,
   returns emotionally rewritten text with optional SSML markers.
2. translate_to_hindustani() — Takes toned English text (with SSML),
   translates to conversational Hindustani in Devanagari script,
   preserving all SSML markers.
"""

import os
from typing import Dict, Any

from groq import Groq
from tone_config import get_groq_config, get_max_rewrite_words


# ── System prompt for tone rewriting ─────────────────────────────────

REWRITE_SYSTEM_PROMPT = """You are a voice-over scriptwriter for an expressive TTS voice agent. You will receive a customer review (max 100 words), a tone profile describing the emotional direction, and routing instructions telling you how much emotional work your rewrite should carry.

Rewrite the review as something a warm, natural-sounding human would SAY OUT LOUD to a friend. This is spoken language — not written. Keep the same facts and opinions as the original, but let the emotion breathe.

RULES:
- Match the emotional tone. The tone_label tells you the overall feeling; the emotion_flavor tells you the specific shade; the intensity tells you how far to push it.
- Follow the LLM instruction from the route — it tells you the rewrite strength (mild / moderate / strong / minimal) AND may include an EXTRA block with emotion-specific expressive guidance. Follow the EXTRA block whenever it appears.
- Do NOT invent new facts, products, or claims not present in the original text.
- Keep it concise: roughly the same length as the input, max 120 words.

SSML MARKERS you may embed (unless ssml_intensity is "none"):
  - <break time="Xs"/>            — insert a pause. Use 0.2s for a beat, 0.4-0.6s for a reflective pause, 0.8-1.0s for a heavy pause.
  - <emphasis level="strong">W</emphasis> — stress a key word. Great for the word carrying the emotional weight (the adjective, the verb, the noun that matters).
  - <prosody rate="fast">T</prosody>  — speak this segment faster. Use for excited/joyful/rushed moments.
  - <prosody rate="slow">T</prosody>  — speak this segment slower. Use for heavy/sad/ironic/reflective moments.
  - <say-as interpret-as="interjection">W</say-as> — expressive interjection. Use for "wow", "yay", "oh", "hmm", "phew", "ugh", "aww", "yes", "no way".

LAUGHTER + NATURAL SOUNDS (when the emotion is JOY, EXCITEMENT, or a warm/positive vibe):
- You SHOULD add a natural laugh where it fits — write it as "haha!" or "hehe" inline in the sentence, NOT wrapped in an SSML tag. The TTS engine will read it as a laugh sound.
- You may also add "yay!", "woohoo!", "oh wow!" as an opener via <say-as interpret-as="interjection">…</say-as>.
- Use exclamation marks generously for joyful/excited lines.

EXPRESSIVE STYLE:
- Contractions ("it's", "that's", "I'm") always. Written-language stiffness kills the voice.
- Short punchy sentences beat long ones for high-intensity emotion.
- End punctuation matters: "!" for joy/excitement/anger; "." for calm/sad; "…" (ellipsis) for reflective or ironic trail-offs.
- If ssml_intensity is "heavy" or "moderate", embed AT LEAST TWO SSML markers (one <emphasis> + one <break> is a good floor). If "light", one is enough. If "none", zero.

OUTPUT: only the rewritten spoken text with any SSML markers. No labels, no quotation marks, no explanation, no preamble.

Tone label: {tone_label}
Emotion flavor: {emotion_flavor}
Emotional intensity: {intensity}
Resolution source: {resolution_source}
LLM instruction: {llm_instruction}
SSML intensity allowed: {ssml_intensity}
SSML hints to consider: {ssml_hints}

Star rating: {rating}
Original review: {original_text}"""


# ── System prompt for Hindustani translation ──────────────────────────

TRANSLATE_SYSTEM_PROMPT = """Translate the following text into natural, conversational spoken Hindustani, written in Devanagari (Hindi) script.
Use everyday, commonly-spoken vocabulary that overlaps between Hindi and Urdu (avoid heavily Sanskritized or literary Hindi words) so the result sounds natural to an Urdu speaker when read aloud.
Preserve the emotional tone of the input.
IMPORTANT: Preserve ALL SSML-style markers (<break>, <emphasis>, <prosody>, <say-as>) exactly as they appear — translate only the text around and inside them, not the markers or their attributes.
Output ONLY the translation, nothing else.

Text: {toned_english_text}"""


def rewrite_tone(
    text: str,
    rating: int,
    tone_profile: Dict[str, Any],
    emotion_route: Dict[str, Any],
) -> str:
    """
    Rewrite the review text in the appropriate emotional tone.

    Args:
        text: Original review text
        rating: Star rating 0-5
        tone_profile: Resolved ToneProfile
        emotion_route: Routing decision from tone_router

    Returns:
        Emotionally rewritten text with optional SSML markers
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")

    client = Groq(api_key=api_key)
    groq_cfg = get_groq_config()

    system_prompt = REWRITE_SYSTEM_PROMPT.format(
        tone_label=tone_profile.get("tone_label", "neutral"),
        emotion_flavor=tone_profile.get("emotion_flavor", "neutral"),
        intensity=tone_profile.get("intensity", 0.3),
        resolution_source=tone_profile.get("resolution_source", "harmonic"),
        llm_instruction=emotion_route.get("llm_instruction", "Moderate rewrite."),
        ssml_intensity=emotion_route.get("ssml_intensity", "moderate"),
        ssml_hints=", ".join(emotion_route.get("ssml_hints", [])),
        rating=rating,
        original_text=text,
    )

    response = client.chat.completions.create(
        model=groq_cfg.get("model", "llama-3.3-70b-versatile"),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        max_tokens=groq_cfg.get("max_tokens_rewrite", 200),
        temperature=groq_cfg.get("temperature_rewrite", 0.7),
    )

    return response.choices[0].message.content.strip()


def translate_to_hindustani(toned_english_text: str) -> str:
    """
    Translate toned English text to conversational Hindustani (Devanagari).

    Preserves all SSML markers — only translates the surrounding text.

    Args:
        toned_english_text: Emotionally rewritten English text (may contain SSML)

    Returns:
        Hindi/Devanagari text with SSML markers preserved
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")

    client = Groq(api_key=api_key)
    groq_cfg = get_groq_config()

    system_prompt = TRANSLATE_SYSTEM_PROMPT.format(
        toned_english_text=toned_english_text
    )

    response = client.chat.completions.create(
        model=groq_cfg.get("translation_model", groq_cfg.get("model")),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": toned_english_text},
        ],
        max_tokens=groq_cfg.get("max_tokens_translation", 300),
        temperature=groq_cfg.get("temperature_translation", 0.3),
    )

    return response.choices[0].message.content.strip()
