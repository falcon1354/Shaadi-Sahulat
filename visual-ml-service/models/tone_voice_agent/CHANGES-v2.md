# What Changed: v1 → v2 (Tone-Focused Overhaul)

This document summarizes every change made to the original build spec when upgrading to v2.

---

## New Sections Added

### Section 3: Tone Analysis Layer (entirely new)
- **What:** Added a full emotion detection pipeline that analyzes the review TEXT for emotional content before any rewriting or TTS.
- **Why:** The original spec mapped the star rating directly to a flat tone label. This meant a sarcastic 1-star review ("Oh great, love it") would be treated the same as a genuinely sad 1-star review ("I'm really disappointed"). The Tone Analysis Layer detects the actual emotion from the text and reconciles it with the star rating.
- **Key additions:**
  - Groq classification call that returns: primary_emotion, secondary_emotion, emotional_intensity (0.0-1.0), mismatch flag, mismatch note
  - Emotion-to-Tone Resolution table: handles star-text agreement, mismatches, and neutral text
  - ToneProfile object: the single source of truth for all downstream decisions

### Section 4: Tone Router (entirely new)
- **What:** Added a deterministic routing system that decides WHERE emotional expression lives — in the LLM's rewritten words, or in the Voice Model's prosody/SSML, or both.
- **Why:** The original spec had the LLM do all emotional work (rewriting words) and the Voice Model only adjusted speed. But some emotions (excitement, anger) are better expressed through voice prosody (faster pace, emphasis, pauses), while others (sadness, sarcasm) are better expressed through word choice. The router makes this decision automatically based on the detected emotion and intensity.
- **Key additions:**
  - Complete routing decision table with 5 rules
  - EmotionRoute object: carrier, llm_instruction, ssml_intensity, ssml_hints, speed_multiplier, pause_locations
  - SSML hint types reference: break, emphasis, prosody rate fast/slow, say-as interjection
  - Priority ordering: mismatch rule (R5) is checked FIRST

### Section 8: SSML Interpretation Bridge (entirely new)
- **What:** Added a bridge layer that parses SSML markers from the LLM output and translates them into Kokoro-equivalent controls.
- **Why:** Kokoro TTS does not natively support SSML. Without this bridge, SSML markers from the LLM would be read aloud as literal text, or silently ignored. The bridge ensures that `<break time="0.5s"/>` actually produces a pause, `<emphasis>` actually emphasizes a word, and `<prosody rate="fast">` actually speeds up.
- **Key additions:**
  - SSML-to-Kokoro translation table
  - Audio segment stitching strategy (split text at markers, synthesize each segment separately, stitch WAVs together)
  - Added `pydub` to requirements for WAV concatenation

### Section 10: tone_config.json (entirely new)
- **What:** Externalized ALL tunable parameters into a JSON config file.
- **Why:** The original spec had speed values and voice IDs hardcoded in `tone_config.py`. V2 has many more parameters (routing thresholds, SSML bridge settings, mismatch rules, Groq temperatures, cache TTL) — hardcoding them would make tuning painful.
- **Key additions:**
  - star_speed_map, star_tone_labels
  - emotion_routing thresholds and emotion category lists
  - routing_rules array with 5 rules, each with condition → carrier/strength/ssml mapping
  - routing_priority order
  - mismatch_rules with speed override factors
  - ssml_bridge timing defaults
  - groq model settings and temperatures per call type
  - cache and limits settings

---

## Revised Sections

### Section 1: Goal
- Added the 5-step pipeline description (Analyze → Resolve → Route → Rewrite → Synthesize)
- Added explanation that emotion is routed between LLM and Voice Model

### Section 5 → Section 5: Tone Mapping
- Added "Notes" column explaining that the Tone Router may further adjust speed
- Added the formula: final_speed = base_speed × route_speed_adjustment
- Added the sarcasm example: 5★ with sarcastic text should NOT get 1.15x speed

### Section 4 → Section 6: LLM Rewriting Step
- System prompt now receives ToneProfile + EmotionRoute, not just star rating
- Added SSML marker instructions to the system prompt
- Added ssml_intensity constraint ("only embed markers if allowed by the route")
- Translation prompt now includes instruction to preserve SSML markers
- Caching section expanded: now caches EmotionProfile, ToneProfile, EmotionRoute, toned text, and Hindi translation

### Section 5 → Section 7: Architecture
- Added 4 new files: tone_analyzer.py, tone_resolver.py, tone_router.py, cache.py
- Added SSML bridge functions to tts_kokoro.py description
- Added tone_config.json as a separate file (not just tone_config.py)
- Added full pipeline flow diagram (ASCII)
- API endpoints revised: /analyze is new, /rewrite now returns emotion/routing data, /synthesize now returns full metadata
- Added pydub to requirements

### Section 6 → Section 9: UI
- Added "Tone Analysis Display" section: shows detected emotion, intensity bar, star-text match status, routing decision
- Added SSML marker visibility in the spoken text display (show [pause], [emphasis] inline)
- These additions make the Tone system transparent to the user

### Section 8 → Section 12: Freedom & Constraints
- Added Tone Analysis → Resolution → Routing → Rewrite → TTS pipeline as a "must preserve"
- Added Tone Router logic as a "must preserve"
- Added SSML Interpretation Bridge as a "must preserve"
- Added Tone Analysis Panel in UI as a "must preserve"
- Added tone_config.json requirement as a "must preserve"

---

## New Appendix

### Appendix A: Full Pipeline Example
- Walks through a complete example: sarcastic 1-star review
- Shows each step's output: EmotionProfile → ToneProfile → EmotionRoute → LLM rewrite with SSML → SSML bridge segmentation → final audio description
- Demonstrates the router in action: sarcasm routes to LLM-dominant even at high intensity

---

## Summary of Philosophy Change

| Aspect | v1 | v2 |
|---|---|---|
| Emotional signal source | Star rating only | Star rating + text emotion analysis |
| Emotion carrier | LLM only (word choice) | Routed: LLM for some emotions, Voice Model for others, both for mid-range |
| Voice Model controls | Speed only | Speed + SSML (pauses, emphasis, rate variation, interjections) |
| Mismatch handling | None — star dominates | Detected and resolved; text emotion takes priority in mismatches |
| Config | Hardcoded in Python | Externalized to tone_config.json |
| Transparency | User sees only output | User sees detected emotion, intensity, mismatch status, routing decision |
