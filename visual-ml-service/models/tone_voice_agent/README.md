# Tone-Aware Review Voice Agent v2

A local web app that takes a customer review + star rating, analyzes the emotional content of the text, routes the emotional expression between the LLM (word choice) and the Voice Model (prosody/SSML), and produces a spoken voice-over that sounds emotionally authentic.

## Features

- **Emotion Detection** — Analyzes the review TEXT for its emotional content (not just the star rating)
- **Tone Routing** — Decides whether emotion is carried by the LLM (rewritten words) or the Voice Model (prosody/speed/SSML)
- **Mismatch Handling** — Catches star-text contradictions (e.g. sarcastic 5★ reviews) and trusts the text
- **4 Voice Agents** — English Male, English Female, Urdu Male, Urdu Female (all on Kokoro TTS)
- **SSML Interpretation Bridge** — LLM-embedded pause/emphasis/rate markers translated to Kokoro controls
- **Tunable Config** — All parameters in `tone_config.json`, no hardcoded magic numbers

## Setup

### 1. System dependencies

```bash
# espeak-ng (required by Kokoro for phonemization)
sudo apt-get install espeak-ng

# ffmpeg (required by pydub for audio stitching)
sudo apt-get install ffmpeg
```

### 2. Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure API key

```bash
cp .env.example .env
# Edit .env and add your Groq API key
```

### 4. Verify Kokoro voice IDs

Run this quick check and update `tone_config.json` with the actual voice IDs:

```python
from kokoro import KPipeline
# English voices
p_en = KPipeline(lang_code='a')
# Hindi voices
p_hi = KPipeline(lang_code='h')
# List available voices or check the Kokoro repo for current voice IDs
```

Update the `voice_ids` section in `tone_config.json` with the verified IDs.

### 5. Run

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 in your browser.

## How It Works

```
User enters text + rating
        │
        ▼
[1] Tone Analyzer (Groq classify)
    → EmotionProfile { primary_emotion, intensity, mismatch }
        │
        ▼
[2] Tone Resolver (deterministic)
    → ToneProfile { tone_label, emotion_flavor, resolution_source }
        │
        ▼
[3] Tone Router (deterministic, rule-based)
    → EmotionRoute { carrier, llm_instruction, ssml_intensity, speed_multiplier }
        │
        ▼
[4] LLM Rewrite (Groq) — with SSML markers
    → toned_text_en
        │
        ├── If English agent → [5a] SSML Bridge + Kokoro TTS → audio
        │
        └── If Urdu agent → [4b] Translation (Groq) → Hindi text
                                          │
                                          └──→ [5b] SSML Bridge + Kokoro TTS → audio
```

### Tone Routing Logic

| Condition | Emotion Carrier | Rationale |
|---|---|---|
| High intensity + raw emotion (joy, excitement, anger) | Voice Model | Prosody (pace, emphasis) expresses these better than words |
| High intensity + text emotion (sadness, sarcasm, gratitude) | LLM (Words) | Word choice carries these emotions better than prosody |
| Mid intensity | Balanced | Both channels share the load |
| Low intensity / neutral text | Star only | Speed adjustment, no emotion injection |
| Star-text mismatch | LLM (Words) | Linguistic contradictions need the right words |

## Configuration

All tunable parameters live in `tone_config.json`:

- **star_speed_map** — Speed multiplier per star rating
- **emotion_routing** — Thresholds and emotion category lists
- **routing_rules** — Priority-ordered routing decision table
- **mismatch_rules** — Speed overrides for star-text contradictions
- **ssml_bridge** — Timing defaults for pauses, emphasis, rate changes
- **voice_ids** — Kokoro voice IDs per agent
- **groq** — Model names, temperatures, max tokens per call type

Edit the JSON file and hit `POST /reload-config` (or restart the server) to apply changes.

## Project Structure

```
tone-voice-agent-v2/
├── app.py                  # FastAPI app — routes: /analyze, /rewrite, /synthesize, /
├── tone_analyzer.py        # Groq emotion classification → EmotionProfile
├── tone_resolver.py        # EmotionProfile + star → ToneProfile
├── tone_router.py          # ToneProfile → EmotionRoute (LLM vs Voice Model)
├── llm_groq.py             # Groq calls: rewrite_tone(), translate_to_hindustani()
├── tts_kokoro.py           # Kokoro TTS wrapper + SSML Interpretation Bridge
├── tone_config.py          # Loads tone_config.json → accessor helpers
├── tone_config.json        # All tunable parameters
├── cache.py                # In-memory cache with TTL
├── requirements.txt
├── .env.example
├── static/
│   └── index.html          # UI with Tone Analysis panel
├── outputs/                # Generated audio files (gitignored)
├── tone-voice-agent-build-spec-v2.md  # Full architecture spec
└── CHANGES-v2.md           # What changed from v1 → v2
```

## Deviations from Spec

(None yet — document any deviations made during setup here.)

## License

MIT
