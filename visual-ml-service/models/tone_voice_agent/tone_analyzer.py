"""
tone_analyzer.py — Groq emotion classification call → EmotionProfile

Sends the review text + star rating to Groq for emotion detection.
Returns a structured EmotionProfile with primary/secondary emotion,
intensity, and mismatch detection.
"""

import json
import os
from typing import Dict, Any

from groq import Groq
from tone_config import get_groq_config

SYSTEM_PROMPT = """You are an emotion classifier for customer reviews. You will receive a review text and a star rating (0-5).

Analyze the TEXT specifically for its emotional content, independent of the star rating. Identify:
1. primary_emotion: the single strongest emotion conveyed by the TEXT (one of: joy, excitement, satisfaction, gratitude, neutral, concern, disappointment, frustration, anger, sadness, sarcasm, surprise)
2. secondary_emotion: the second emotion if present, or "none"
3. emotional_intensity: how strongly the text expresses emotion (scale 0.0 to 1.0, where 0.0 = completely flat/neutral, 1.0 = maximum emotional intensity)
4. mismatch: true if the star rating and text emotion contradict (e.g. 5 stars but sarcastic/angry text, or 1 star but text sounds joking), false otherwise
5. mismatch_note: if mismatch is true, a one-sentence explanation of the contradiction

Respond ONLY with valid JSON in this exact format, no other text:
{{
  "primary_emotion": "...",
  "secondary_emotion": "...",
  "emotional_intensity": 0.0,
  "mismatch": false,
  "mismatch_note": ""
}}

Star rating: {rating}
Review text: {original_text}"""


def classify_emotion(text: str, rating: int) -> Dict[str, Any]:
    """
    Classify the emotional content of a review text.

    Args:
        text: The review text (max 100 words)
        rating: Star rating 0-5

    Returns:
        EmotionProfile dict with keys:
            primary_emotion, secondary_emotion, emotional_intensity,
            mismatch, mismatch_note
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")

    client = Groq(api_key=api_key)
    groq_cfg = get_groq_config()

    system_prompt = SYSTEM_PROMPT.format(rating=rating, original_text=text)

    response = client.chat.completions.create(
        model=groq_cfg.get("classification_model", groq_cfg.get("model")),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        max_tokens=groq_cfg.get("max_tokens_classification", 200),
        temperature=groq_cfg.get("temperature_classification", 0.1),
    )

    raw_output = response.choices[0].message.content.strip()

    # Parse the JSON response — handle potential markdown code fences
    if raw_output.startswith("```"):
        raw_output = raw_output.split("```")[1]
        if raw_output.startswith("json"):
            raw_output = raw_output[4:]
        raw_output = raw_output.strip()

    try:
        profile = json.loads(raw_output)
    except json.JSONDecodeError:
        # Fallback: return a neutral profile if parsing fails
        profile = {
            "primary_emotion": "neutral",
            "secondary_emotion": "none",
            "emotional_intensity": 0.3,
            "mismatch": False,
            "mismatch_note": "",
        }

    # Validate required keys
    required_keys = ["primary_emotion", "secondary_emotion", "emotional_intensity", "mismatch", "mismatch_note"]
    for key in required_keys:
        if key not in profile:
            profile[key] = "none" if key == "secondary_emotion" else (0.3 if key == "emotional_intensity" else (False if key == "mismatch" else ""))

    # Clamp intensity
    profile["emotional_intensity"] = max(0.0, min(1.0, float(profile["emotional_intensity"])))

    return profile
