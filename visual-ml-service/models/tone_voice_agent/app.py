"""
app.py — FastAPI application for the Tone-Aware Review Voice Agent v2.

Routes:
  GET  /          — serves the UI
  POST /analyze   — emotion classification + tone resolution + routing
  POST /rewrite   — full analysis + LLM tone rewrite
  POST /synthesize — full pipeline + TTS audio generation
"""

import os
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load .env
load_dotenv()

# Import project modules
from tone_config import get_max_review_words, reload_config
from tone_analyzer import classify_emotion
from tone_resolver import resolve_tone
from tone_router import route_emotion
from llm_groq import rewrite_tone, translate_to_hindustani
from tts_kokoro import synthesize
from cache import (
    get_emotion_cache,
    get_tone_cache,
    get_route_cache,
    get_text_en_cache,
    get_text_hi_cache,
    TTLCache,
)

# ── FastAPI app ───────────────────────────────────────────────────────

app = FastAPI(title="Tone-Aware Review Voice Agent v2")

# Serve static files
static_dir = Path(__file__).parent / "static"
outputs_dir = Path(__file__).parent / "outputs"
outputs_dir.mkdir(exist_ok=True)

app.mount("/outputs", StaticFiles(directory=str(outputs_dir)), name="outputs")


@app.get("/")
async def serve_ui():
    return FileResponse(static_dir / "index.html")


# ── Request / Response models ─────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    text: str = Field(..., max_length=1000, description="Review text (max ~100 words)")
    rating: int = Field(..., ge=0, le=5, description="Star rating 0-5")


class SynthesizeRequest(BaseModel):
    text: str = Field(..., max_length=1000)
    rating: int = Field(..., ge=0, le=5)
    agent: str = Field(..., pattern=r"^(en_male|en_female|hi_male|hi_female)$")


# ── Helper: word count validation ─────────────────────────────────────

def _validate_word_count(text: str) -> None:
    max_words = get_max_review_words()
    word_count = len(text.split())
    if word_count > max_words:
        raise HTTPException(
            status_code=400,
            detail=f"Review text has {word_count} words, max is {max_words}."
        )


# ── Helper: get or compute analysis results ───────────────────────────

def _get_analysis(text: str, rating: int) -> Dict[str, Any]:
    """Get cached or compute: EmotionProfile, ToneProfile, EmotionRoute."""

    emotion_cache = get_emotion_cache()
    tone_cache = get_tone_cache()
    route_cache = get_route_cache()

    cache_key = TTLCache.make_key(text, str(rating))

    # Emotion Profile
    emotion_profile = emotion_cache.get(cache_key)
    if emotion_profile is None:
        emotion_profile = classify_emotion(text, rating)
        emotion_cache.set(cache_key, emotion_profile)

    # Tone Profile
    tone_profile = tone_cache.get(cache_key)
    if tone_profile is None:
        tone_profile = resolve_tone(emotion_profile, rating)
        tone_cache.set(cache_key, tone_profile)

    # Emotion Route
    emotion_route = route_cache.get(cache_key)
    if emotion_route is None:
        emotion_route = route_emotion(tone_profile, emotion_profile, rating)
        route_cache.set(cache_key, emotion_route)

    return {
        "emotion_profile": emotion_profile,
        "tone_profile": tone_profile,
        "emotion_route": emotion_route,
    }


# ── API Routes ────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Run emotion classification + tone resolution + routing.
    Returns the analysis results without generating audio.
    """
    _validate_word_count(req.text)
    try:
        result = _get_analysis(req.text, req.rating)
        return JSONResponse(content=result)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/rewrite")
async def rewrite(req: AnalyzeRequest):
    """
    Full analysis + LLM tone rewrite.
    Returns analysis results + toned English text.
    """
    _validate_word_count(req.text)
    try:
        analysis = _get_analysis(req.text, req.rating)

        # Get or compute toned English text
        text_en_cache = get_text_en_cache()
        text_key = TTLCache.make_key(req.text, str(req.rating), analysis["emotion_route"].get("carrier", ""))

        toned_text_en = text_en_cache.get(text_key)
        if toned_text_en is None:
            toned_text_en = rewrite_tone(
                text=req.text,
                rating=req.rating,
                tone_profile=analysis["tone_profile"],
                emotion_route=analysis["emotion_route"],
            )
            text_en_cache.set(text_key, toned_text_en)

        return JSONResponse(content={
            **analysis,
            "toned_text_en": toned_text_en,
        })
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rewrite failed: {str(e)}")


@app.post("/synthesize")
async def synthesize_audio(req: SynthesizeRequest):
    """
    Full pipeline: analysis + rewrite + (optional translation) + TTS.
    Returns analysis + text + audio URL.
    """
    _validate_word_count(req.text)
    try:
        # Step 1: Analysis
        analysis = _get_analysis(req.text, req.rating)

        # Step 2: Tone rewrite
        text_en_cache = get_text_en_cache()
        text_key = TTLCache.make_key(req.text, str(req.rating), analysis["emotion_route"].get("carrier", ""))

        toned_text_en = text_en_cache.get(text_key)
        if toned_text_en is None:
            toned_text_en = rewrite_tone(
                text=req.text,
                rating=req.rating,
                tone_profile=analysis["tone_profile"],
                emotion_route=analysis["emotion_route"],
            )
            text_en_cache.set(text_key, toned_text_en)

        # Step 3: Translation (for Urdu/Hindi agents)
        spoken_text = toned_text_en
        if req.agent.startswith("hi_"):
            text_hi_cache = get_text_hi_cache()
            hi_key = TTLCache.make_key(toned_text_en)

            toned_text_hi = text_hi_cache.get(hi_key)
            if toned_text_hi is None:
                toned_text_hi = translate_to_hindustani(toned_text_en)
                text_hi_cache.set(hi_key, toned_text_hi)

            spoken_text = toned_text_hi

        # Step 4: TTS
        speed = analysis["emotion_route"].get("speed_multiplier", 1.0)
        audio_path, display_text = synthesize(
            text=spoken_text,
            agent=req.agent,
            speed=speed,
        )

        # Build audio URL
        audio_filename = os.path.basename(audio_path) if audio_path else ""
        audio_url = f"/outputs/{audio_filename}" if audio_filename else ""

        return JSONResponse(content={
            **analysis,
            "toned_text_en": toned_text_en,
            "spoken_text": spoken_text,
            "display_text": display_text,
            "audio_url": audio_url,
        })
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"TTS dependency missing: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


# ── Health check ──────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0"}


# ── Config reload endpoint (for development) ─────────────────────────

@app.post("/reload-config")
async def reload_config_endpoint():
    reload_config()
    return {"status": "reloaded"}
