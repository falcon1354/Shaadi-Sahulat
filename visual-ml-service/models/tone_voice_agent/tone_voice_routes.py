"""
tone_voice_routes.py — FastAPI sub-routes for tone-voice-agent integration.

These routes are designed to be mounted onto the existing visual-ml-service
Flask/FastAPI app. They integrate with the Shaadi-Sahulat review/comment system
by providing:

  POST /tone-voice/analyze      — Emotion classification + tone routing
  POST /tone-voice/rewrite      — Analysis + LLM tone rewrite (text)
  POST /tone-voice/synthesize   — Full pipeline + TTS audio generation
  GET  /tone-voice/health       — Service health check
  POST /tone-voice/reload-config — Hot reload config

The tone-voice agent runs alongside the existing visual ML service.
Audio files are stored in outputs/ directory and served via the app's static mount.

Integration with the e-commerce review system:
  - The frontend ReviewForm/AIReviewGenerator calls /tone-voice/synthesize
  - Generated voice audio is saved with metadata: buyer_id + product_id + agent
  - Voice metadata (not the actual audio blob) is stored in the Review DB model
  - The audio file lives in /uploads/Reviews/voices/ directory
"""

import os
import sys
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional

# Ensure the tone_voice_agent modules are importable
_MODELS_DIR = Path(__file__).parent
sys.path.insert(0, str(_MODELS_DIR))

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

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

# ── Create sub-app ───────────────────────────────────────────────────
tone_voice_app = FastAPI(title="Tone-Aware Review Voice Agent v2", prefix="/tone-voice")

# Output directory for generated audio
outputs_dir = _MODELS_DIR / "outputs"
outputs_dir.mkdir(exist_ok=True)

# Voice review storage directory (for e-commerce integration)
voice_review_dir = Path(__file__).parent.parent.parent.parent / "uploads" / "Reviews" / "voices"
voice_review_dir.mkdir(parents=True, exist_ok=True)


# ── Request / Response models ─────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    text: str = Field(..., max_length=1000, description="Review text (max ~100 words)")
    rating: int = Field(..., ge=0, le=5, description="Star rating 0-5")


class SynthesizeRequest(BaseModel):
    text: str = Field(..., max_length=1000)
    rating: int = Field(..., ge=0, le=5)
    agent: str = Field(..., pattern=r"^(en_male|en_female|hi_male|hi_female)$")
    buyer_id: str = Field(default="", description="Buyer ID for voice metadata")
    product_id: str = Field(default="", description="Product ID for voice metadata")
    order_id: str = Field(default="", description="Order ID for voice metadata")


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

@tone_voice_app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """Run emotion classification + tone resolution + routing."""
    _validate_word_count(req.text)
    try:
        result = _get_analysis(req.text, req.rating)
        return JSONResponse(content=result)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@tone_voice_app.post("/rewrite")
async def rewrite(req: AnalyzeRequest):
    """Full analysis + LLM tone rewrite. Returns toned English text."""
    _validate_word_count(req.text)
    try:
        analysis = _get_analysis(req.text, req.rating)

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


@tone_voice_app.post("/synthesize")
async def synthesize_audio(req: SynthesizeRequest):
    """
    Full pipeline: analysis + rewrite + (optional translation) + TTS.
    Returns analysis + text + audio URL + voice metadata.
    
    When buyer_id, product_id, and order_id are provided, the audio file
    is also saved to the Reviews/voices/ directory with a structured filename
    for integration with the e-commerce review system.
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

        # If buyer/product/order IDs provided, copy audio to review voice storage
        voice_metadata = {}
        if req.buyer_id and req.product_id:
            # Structured filename: buyer_id_product_id_agent_hash.wav
            voice_hash = hashlib.md5(f"{req.buyer_id}_{req.product_id}_{req.agent}_{req.rating}".encode()).hexdigest()[:8]
            voice_filename = f"{req.buyer_id}_{req.product_id}_{req.agent}_{voice_hash}.wav"
            voice_dest = voice_review_dir / voice_filename
            
            if audio_path and os.path.exists(audio_path):
                import shutil
                shutil.copy2(audio_path, voice_dest)
            
            voice_metadata = {
                "voice_file": voice_filename,
                "voice_dir": "uploads/Reviews/voices",
                "voice_url": f"/uploads/Reviews/voices/{voice_filename}",
                "agent": req.agent,
                "language": "English" if req.agent.startswith("en_") else "Urdu/Hindi",
                "buyer_id": req.buyer_id,
                "product_id": req.product_id,
                "order_id": req.order_id,
                "duration_estimate": "unknown",  # Would need pydub to compute exactly
            }

        return JSONResponse(content={
            **analysis,
            "toned_text_en": toned_text_en,
            "spoken_text": spoken_text,
            "display_text": display_text,
            "audio_url": audio_url,
            "voice_metadata": voice_metadata,
        })
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"TTS dependency missing: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@tone_voice_app.get("/health")
async def health():
    """Health check for tone-voice-agent service."""
    return {
        "status": "ok",
        "version": "2.0",
        "service": "tone-voice-agent",
        "integration": "shaadi-sahulat",
        "agents": ["en_male", "en_female", "hi_male", "hi_female"],
    }


@tone_voice_app.post("/reload-config")
async def reload_config_endpoint():
    """Hot-reload tone_config.json without restart."""
    reload_config()
    return {"status": "reloaded", "message": "tone_config.json reloaded successfully"}
