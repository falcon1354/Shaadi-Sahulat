# Build Spec v2: Tone-Aware Review Voice Agent (Kokoro TTS + Groq)

> **How to use this file:** Paste this whole document into your coding LLM (Claude Code, Cursor, etc.) as the task prompt. It contains the full requirements, architecture, tone logic, emotion routing, file list, and ready-made system prompts. The building LLM has freedom to restructure internals as long as the behavior described here is preserved — see "Freedom & Constraints" at the end.
>
> **What changed from v1:** This version adds a deep **Tone Analysis Layer** that detects emotion from the review text itself (not just the star rating), a **Tone Router** that decides whether emotional expression is handled by the LLM (rewritten wording) or the Voice Model (prosody/speed/pitch SSML hints), and an **Emotion Annotation Pipeline** that produces machine-readable emotion metadata alongside the spoken text. Sections 3, 4, 8, 9, and 10 are new or heavily revised.

---

## 1. Goal

Build a small local web app that takes:
1. A **review paragraph/sentence** (max 100 words), and
2. A **star rating (0–5)**,

...and produces a **spoken voice-over** that doesn't just read the text verbatim. Instead, the system:

1. **Analyzes** the emotional content of the review text itself (not just the star rating) to detect specific emotions — anger, joy, disappointment, surprise, sarcasm, frustration, gratitude, etc.
2. **Resolves** any mismatch between the star rating and the detected text emotion (e.g. 5★ but sarcastic wording → flag the mismatch, bias toward the text's emotional signal).
3. **Routes** the emotional expression: decides whether the emotion should be carried by the **LLM** (via rewritten wording, exclamation, sigh-phrases, pacing words) or by the **Voice Model** (via speed, pause markers, SSML emphasis hints, pitch-shift annotations) — or a combination of both.
4. **Rewrites** the text through Groq in a tone matching the resolved emotional profile, embedding SSML-style hints where the Voice Model should carry the emotion.
5. **Synthesizes** the rewritten text with Kokoro TTS, interpreting the SSML hints to adjust speed, pauses, and emphasis per the Tone Router's decision.

The result is a voice-over that sounds emotionally authentic — the right words spoken in the right way — not just happy words at normal speed or sad words that still sound flat.

### 4 Voice Agents

| Agent | Language | Gender | TTS Engine |
|---|---|---|---|
| Agent 1 | English | Male | Kokoro TTS |
| Agent 2 | English | Female | Kokoro TTS |
| Agent 3 | Urdu (spoken via Hindi voice) | Male | Kokoro TTS (Hindi voice, e.g. `hm_*`) |
| Agent 4 | Urdu (spoken via Hindi voice) | Female | Kokoro TTS (Hindi voice, e.g. `hf_*`) |

Clicking a different agent button **re-renders and plays a new audio file** using the currently entered text/rating — it should not require re-typing anything.

---

## 2. Why Hindi voices for the "Urdu" agents (research note — keep this decision, or swap deliberately)

Kokoro TTS (hexgrad/Kokoro-82M) natively supports only: American English, British English, French, Japanese, Mandarin, Spanish, Hindi, Italian, Brazilian Portuguese. **It has no Urdu voice.**

Rather than pull in a second TTS engine, this spec uses a well-known linguistic shortcut: **spoken Hindi and spoken Urdu are the same language (Hindustani)** — they diverge mainly in script (Devanagari vs. Nastaliq) and some formal/literary vocabulary, but everyday conversational sentences are mutually intelligible when spoken aloud. So:

- The two "Urdu" agents actually run on **Kokoro's Hindi voices**.
- Instead of translating the toned English text into Urdu script, the Groq step translates it into **conversational Hindi (Devanagari script)**, using everyday Hindustani vocabulary that a native Urdu speaker would recognize and understand when they hear it spoken (avoid heavily Sanskritized/literary Hindi words — bias the prompt toward common, spoken, Urdu-overlapping vocabulary).
- Result: the listener hears natural-sounding Urdu-equivalent speech, even though internally it's a Hindi voice model reading Hindi script.

This removes the need for Edge-TTS, gTTS, or any second TTS engine — **all 4 agents run on Kokoro alone**, simplifying setup. Keep the translation step behind a small interface (`translate_to_hindustani(text) -> hindi_text`) so it's a one-file change if you ever want to swap in real Urdu-script TTS later.

---

## 3. Tone Analysis Layer (NEW — emotion detection from review text)

This is the core addition in v2. Instead of mapping the star rating directly to a flat tone label, the system first **analyzes the review text** for its emotional content, then **reconciles** that with the star rating to produce a **resolved emotional profile**.

### 3.1 Emotion Detection

When the user submits a review, before any rewriting or TTS, run a **Groq classification call** with this system prompt:

```
You are an emotion classifier for customer reviews. You will receive a review text and a star rating (0-5).

Analyze the TEXT specifically for its emotional content, independent of the star rating. Identify:
1. primary_emotion: the single strongest emotion conveyed by the TEXT (one of: joy, excitement, satisfaction, gratitude, neutral, concern, disappointment, frustration, anger, sadness, sarcasm, surprise)
2. secondary_emotion: the second emotion if present, or "none"
3. emotional_intensity: how strongly the text expresses emotion (scale 0.0 to 1.0, where 0.0 = completely flat/neutral, 1.0 = maximum emotional intensity)
4. mismatch: true if the star rating and text emotion contradict (e.g. 5 stars but sarcastic/angry text, or 1 star but text sounds joking), false otherwise
5. mismatch_note: if mismatch is true, a one-sentence explanation of the contradiction

Respond ONLY with valid JSON in this exact format, no other text:
{
  "primary_emotion": "...",
  "secondary_emotion": "...",
  "emotional_intensity": 0.0,
  "mismatch": false,
  "mismatch_note": ""
}

Star rating: {rating}
Review text: {original_text}
```

The result is the **Emotion Profile** — a structured object that drives all downstream decisions.

### 3.2 Emotion-to-Tone Resolution

Using the Emotion Profile + star rating, resolve a **Tone Profile** — the final emotional direction that the voice-over should carry:

| Scenario | Resolution Rule | Tone Bias |
|---|---|---|
| Star and text agree (no mismatch) | Trust both equally — star sets the base energy level, text emotion sets the flavor | Harmonic |
| Mismatch: high star + negative text | Bias toward the TEXT emotion — the text is the authentic signal; the high star may be accidental or sarcastic | Text-dominant |
| Mismatch: low star + positive text | Bias toward the TEXT emotion but add an undertone of the low-star feeling — the user may be being polite but is ultimately dissatisfied | Blended, text-leading |
| Neutral/flat text + any star | Let the star rating carry the full emotional load — the text provides no emotional signal of its own | Star-dominant |

The resolution produces:

```
ToneProfile = {
    "tone_label": str,           # e.g. "enthusiastic", "frustrated", "cautiously_positive"
    "base_energy": float,        # 0.0-1.0, derived from star rating
    "emotion_flavor": str,       # the primary_emotion from text analysis
    "intensity": float,          # emotional_intensity, possibly adjusted by mismatch logic
    "resolution_source": str,    # "harmonic" | "text_dominant" | "blended" | "star_dominant"
}
```

This ToneProfile is the single source of truth for both the LLM rewriting step and the Voice Model parameter selection.

### 3.3 Why This Matters

Without emotion detection, a 1-star review written sarcastically ("Oh wow, another life-changing product, just what I needed") would be rewritten as genuinely disappointed — losing the sarcasm that is the review's actual emotional signal. Similarly, a 5-star review that says "It's fine I guess" would be rewritten as enthusiastic when the text is clearly lukewarm. The Tone Analysis Layer catches these mismatches and routes the emotional expression correctly.

---

## 4. Tone Router (NEW — who carries the emotion: LLM or Voice Model?)

Once the ToneProfile is resolved, the system must decide **where the emotional expression lives** — in the words the LLM writes, or in the way the Voice Model speaks them, or both.

### 4.1 Routing Logic

The router is a deterministic function of the ToneProfile. Here is the complete decision table:

| Condition | Emotion Carrier | LLM Role | Voice Model Role | Rationale |
|---|---|---|---|---|
| `intensity >= 0.7` AND `primary_emotion` ∈ {joy, excitement, frustration, anger} | **Voice Model dominant** | Mild rewrite — preserve facts, add minimal tone words | Heavy SSML: speed shifts, emphasis markers, pause insertions, pitch-boost annotations | High-intensity raw emotions are better expressed through prosody (pace, emphasis, pauses) than through word choice alone — an excited person speaks faster and louder, not necessarily with more elaborate words |
| `intensity >= 0.7` AND `primary_emotion` ∈ {sadness, disappointment, gratitude} | **LLM dominant** | Strong rewrite — add emotional phrasing, sigh-words, warm openers | Light SSML: slight speed reduction, maybe a leading pause | These emotions are better conveyed through word choice (e.g. "Honestly, I really wanted to love this..." vs flat "This product is bad") — prosody alone can't carry disappointment effectively |
| `intensity < 0.7` AND `intensity >= 0.3` | **Balanced** | Moderate rewrite — add some tone words, keep it natural | Moderate SSML: speed tuned per rating, occasional emphasis | Mid-intensity emotions benefit from both channels working together |
| `intensity < 0.3` | **Star-driven only** | Minimal rewrite — clean up for speech, no emotional injection | Speed only — set per star rating, no SSML hints | Low-intensity/neutral text means there's no strong emotion to express — let the star rating set the base vibe via speed, and don't over-perform |
| `mismatch == true` | **LLM dominant** | Strong rewrite — the mismatch must be resolved in the wording (e.g. make sarcasm audible through phrasing) | Light SSML — let the words do the work | Mismatches (like sarcasm) are primarily linguistic phenomena — the Voice Model can't easily convey "this sounds positive but means negative" without the right words |

### 4.2 Router Output

The router produces an **Emotion Route** object:

```
EmotionRoute = {
    "carrier": str,                 # "voice_dominant" | "llm_dominant" | "balanced" | "star_only"
    "llm_instruction": str,         # instruction appended to the LLM system prompt
    "ssml_intensity": str,          # "heavy" | "moderate" | "light" | "none"
    "ssml_hints": list[str],        # specific SSML hint types to embed, e.g. ["pause_before_negative", "speed_up_exclamation", "emphasize_key_adjective"]
    "speed_multiplier": float,      # final speed for Kokoro (0.75 - 1.25)
    "pause_locations": list[str],   # where to insert pauses: "start", "before_key_point", "after_emotional_word", "end"
}
```

### 4.3 SSML Hint Types Reference

The LLM rewriting step can embed the following SSML-style markers in its output text. The TTS layer interprets these before sending to Kokoro:

| Marker | Meaning | TTS Action | Example in LLM output |
|---|---|---|---|
| `<break time="0.5s"/>` | Insert a pause | Kokoro speed/pause | `"Wow.<break time="0.5s"/> Just... wow."` |
| `<emphasis level="strong">word</emphasis>` | Emphasize this word | Kokoro emphasis parameter | `"<emphasis level="strong">terrible</emphasis> experience"` |
| `<prosody rate="fast">text</prosody>` | Speed up this segment | Override speed for segment | `"<prosody rate="fast">I love it!</prosody>"` |
| `<prosody rate="slow">text</prosody>` | Slow down this segment | Reduce speed for segment | `"<prosody rate="slow">Not great.</prosody>"` |
| `<say-as interpret-as="interjection">oh</say-as>` | Treat as interjection | Expressive rendering | `"<say-as interpret-as="interjection">oh</say-as> this is bad"` |

> **Note on Kokoro SSML support:** Kokoro may not support full SSML natively. The TTS layer (`tts_kokoro.py`) must parse these markers from the LLM output and translate them into Kokoro's actual parameters: split text at `<break>` markers into separate synthesis calls with inter-silence, adjust the `speed` parameter for `<prosody rate>` segments, and apply Kokoro's emphasis tricks (e.g. capitalizing emphatic words, adding surrounding pauses) for `<emphasis>` tags. The implementation should strip all markers before sending text to Kokoro and instead use Kokoro's API controls to achieve the same effect. This is the **SSML Interpretation Bridge** — see Section 9.

---

## 5. Tone Mapping (star rating → base voice parameters)

The star rating still controls the **base** speed and energy, but it is now just one input to the Tone Profile — not the sole determinant.

| Rating | Base Tone | Speed Multiplier | Notes |
|---|---|---|---|
| 0 | Very Disappointed / Upset | 0.80 | Slowest, heaviest — but the Tone Router may further adjust this |
| 1 | Disappointed | 0.85 | Slightly slow, low energy |
| 2 | Mildly Dissatisfied / Concerned | 0.92 | Cautious, measured |
| 3 | Neutral / Balanced | 1.00 | Baseline — emotion comes entirely from the text analysis |
| 4 | Positive / Pleased | 1.08 | Warmer, slightly upbeat |
| 5 | Very Happy / Excited | 1.15 | Fastest, brightest — but sarcastic 5★ text should NOT get this speed (mismatch logic overrides) |

The **final** speed multiplier is: `base_speed × route_speed_adjustment`, where `route_speed_adjustment` comes from the EmotionRoute. For example, a 5★ review detected as sarcastic (mismatch=true, carrier=llm_dominant) might have `route_speed_adjustment = 0.90`, resulting in `1.15 × 0.90 = 1.035` — slightly faster than neutral but not the enthusiastic 1.15 the star alone would suggest.

Keep all numbers in `tone_config.json` (see Section 10) so they are tunable without touching pipeline code.

---

## 6. LLM Rewriting Step (Groq) — Enhanced with Tone Router Instructions

Before TTS, send the original text + ToneProfile + EmotionRoute to Groq's chat completion API with this **system prompt**:

```
You are a voice-over scriptwriter. You will receive a customer review (max 100 words), a tone profile describing the emotional direction, and routing instructions telling you how much emotional work your rewrite should carry.

Rewrite the review as something a warm, natural-sounding voice agent would SAY OUT LOUD. Keep the same facts and opinions as the original, but:

- Match the emotional tone described in the tone profile. The tone_label tells you the overall feeling; the emotion_flavor tells you the specific shade.
- Follow the LLM instruction from the route — it tells you whether to do a strong emotional rewrite, a mild one, or minimal.
- If instructed to carry heavy emotion, add natural spoken-language touches: a short exclamation, a sigh-like phrase, a warm opener, a reflective pause marker. Do NOT invent new facts, products, or claims not present in the original text.
- You may embed SSML-style markers to guide the voice model:
  - <break time="0.5s"/> — insert a pause (use 0.3s-1.0s)
  - <emphasis level="strong">word</emphasis> — emphasize a key word
  - <prosody rate="fast">text</prosody> — speak this segment faster
  - <prosody rate="slow">text</prosody> — speak this segment slower
  - <say-as interpret-as="interjection">oh</say-as> — expressive interjection
- Only embed SSML markers if the route's ssml_intensity allows it. If ssml_intensity is "none", do not embed any markers.
- Keep it concise: roughly the same length as the input, max 120 words.
- Output ONLY the rewritten spoken text (with any SSML markers). No labels, no quotation marks, no explanation.

Tone label: {tone_label}
Emotion flavor: {emotion_flavor}
Emotional intensity: {intensity}
Resolution source: {resolution_source}
LLM instruction: {llm_instruction}
SSML intensity allowed: {ssml_intensity}
SSML hints to consider: {ssml_hints}

Star rating: {rating}
Original review: {original_text}
```

### For the "Urdu" agents (Hindustani translation)

Run a **second** Groq call after the tone-rewrite, translating the rewritten English text (with SSML markers preserved) into natural spoken **Hindustani, written in Devanagari (Hindi) script**. The translation must preserve all SSML markers — they are not language-dependent.

System prompt:

```
Translate the following text into natural, conversational spoken Hindustani, written in Devanagari (Hindi) script.
Use everyday, commonly-spoken vocabulary that overlaps between Hindi and Urdu (avoid heavily Sanskritized or literary Hindi words) so the result sounds natural to an Urdu speaker when read aloud.
Preserve the emotional tone of the input.
IMPORTANT: Preserve ALL SSML-style markers (<break>, <emphasis>, <prosody>, <say-as>) exactly as they appear — translate only the text around and inside them, not the markers or their attributes.
Output ONLY the translation, nothing else.

Text: {toned_english_text}
```

### Caching

Cache the following, keyed by content hash:
- **Emotion Profile** — keyed by `hash(original_text + rating)` — reused when switching agents.
- **Tone Profile** — derived from Emotion Profile, cached alongside it.
- **Emotion Route** — derived from Tone Profile, cached alongside it.
- **Toned English text** — keyed by `hash(original_text + rating + route_version)` — reused between EN male/female agents.
- **Hindi translation** — keyed by `hash(toned_english_text)` — reused between HI male/female agents.

When the user switches between English Male and English Female, only the TTS step reruns (different voice ID, same text, same speed). When switching between Urdu Male and Urdu Female, same thing. Switching between English and Urdu agents triggers the translation call (if not cached) plus TTS. Only changing the text or rating triggers the full pipeline (emotion detect → resolve → route → rewrite → translate → synthesize).

---

## 7. Architecture

**Stack:** Python backend (FastAPI) + a minimal single-page HTML/JS frontend served by the same app. Keep it dependency-light so it runs locally in one command.

```
project/
├── app.py                    # FastAPI app, routes: /analyze, /rewrite, /synthesize, /
├── tone_analyzer.py          # Groq emotion classification call → EmotionProfile
├── tone_resolver.py          # EmotionProfile + star rating → ToneProfile
├── tone_router.py            # ToneProfile → EmotionRoute (LLM vs Voice Model decision)
├── llm_groq.py               # Groq API calls: rewrite_tone(), translate_to_hindustani()
├── tts_kokoro.py             # Kokoro TTS wrapper + SSML Interpretation Bridge
│                                 # synthesize(text, voice_id, speed) -> wav path
│                                 # parse_ssml_hints(text) -> (clean_text, ssml_instructions)
│                                 # apply_ssml_to_kokoro(text, ssml_instructions, voice_id, speed) -> audio
├── tone_config.py            # loads tone_config.json → rating→speed, emotion→carrier rules, voice-id map
├── tone_config.json          # tunable numbers: speed table, emotion routing thresholds, SSML rules
├── cache.py                  # simple in-memory cache for EmotionProfile, ToneProfile, EmotionRoute, texts
├── requirements.txt
├── .env.example              # GROQ_API_KEY=
├── static/
│   └── index.html            # UI (see section 8)
├── outputs/                   # generated audio files land here (gitignored)
└── README.md                  # setup + run instructions
```

### Pipeline Flow (end-to-end)

```
User enters text + rating
        │
        ▼
[1] Tone Analyzer (Groq classify)
    → EmotionProfile { primary_emotion, secondary_emotion, intensity, mismatch }
        │
        ▼
[2] Tone Resolver (deterministic)
    → ToneProfile { tone_label, base_energy, emotion_flavor, intensity, resolution_source }
        │
        ▼
[3] Tone Router (deterministic, rule-based)
    → EmotionRoute { carrier, llm_instruction, ssml_intensity, ssml_hints, speed_multiplier, pause_locations }
        │
        ▼
[4] LLM Rewrite (Groq)
    → toned_text_en (with optional SSML markers)
        │
        ├── If English agent ──► [5a] SSML Bridge + Kokoro TTS → audio
        │
        └── If Urdu agent ──► [4b] Translation (Groq) → toned_text_hi (SSML preserved)
                                          │
                                          └──► [5b] SSML Bridge + Kokoro TTS → audio
```

### API endpoints (revised)

- `POST /analyze` — body `{ text, rating }` → returns `{ emotion_profile, tone_profile, emotion_route }` (calls Groq once for classification, then resolves + routes locally). The frontend calls this when the user hits "Generate" — it shows the detected emotion and routing decision in the UI.
- `POST /rewrite` — body `{ text, rating }` → returns `{ toned_text_en, emotion_profile, tone_profile, emotion_route }` (calls /analyze internally if not cached, then calls Groq for rewrite). The frontend can call this to preview the rewritten text before selecting a voice.
- `POST /synthesize` — body `{ text, rating, agent }` where `agent` ∈ `["en_male","en_female","hi_male","hi_female"]`:
  1. Get/compute EmotionProfile, ToneProfile, EmotionRoute (reuse cache).
  2. Get/compute toned_text_en (reuse cache).
  3. If agent starts with `hi_`, translate toned_text_en → Hindustani/Devanagari (cache this too).
  4. Parse SSML hints from the text, strip markers, convert to Kokoro parameters.
  5. Call `tts_kokoro.synthesize(...)` with the SSML-adjusted parameters.
  6. Return `{ audio_url, spoken_text, emotion_profile, tone_profile, emotion_route }`.
- `GET /` — serves the UI.

---

## 8. SSML Interpretation Bridge (NEW — translating SSML markers to Kokoro controls)

Kokoro TTS does not natively parse SSML. The `tts_kokoro.py` module must include an **SSML Interpretation Bridge** that:

1. **Parses** SSML markers from the LLM output text.
2. **Strips** all markers to produce clean text for Kokoro.
3. **Translates** each marker into Kokoro-equivalent actions:

| SSML Marker | Bridge Translation to Kokoro |
|---|---|
| `<break time="Xs"/>` | Split text at break point; call Kokoro separately for each segment; insert X seconds of silence between them (generate silence audio or use Kokoro's silence parameter if available) |
| `<emphasis level="strong">word</emphasis>` | Capitalize the word in the clean text (Kokoro tends to emphasize ALL-CAPS); add a 0.15s micro-pause before the word |
| `<prosody rate="fast">text</prosody>` | Call Kokoro with `speed = current_speed × 1.15` for just this segment |
| `<prosody rate="slow">text</prosody>` | Call Kokoro with `speed = current_speed × 0.85` for just this segment |
| `<say-as interpret-as="interjection">word</say-as>` | Add a 0.2s pause before the word, capitalize it, and let Kokoro's natural expressiveness handle it |

### Segment Stitching

When the bridge splits text into multiple segments (due to `<break>` or `<prosody>` rate changes), it synthesizes each segment separately and then **stitches** the resulting WAV audio segments together with the appropriate inter-segment silence. Use Python's `wave` module or `pydub` for WAV concatenation.

The stitching approach:
```
full_audio = []
for segment in parsed_segments:
    wav = kokoro.synthesize(segment.text, voice_id, segment.speed)
    full_audio.append(wav)
    if segment.trailing_silence > 0:
        full_audio.append(generate_silence(segment.trailing_silence, sample_rate))
concatenate(full_audio) → final.wav
```

---

## 9. UI (enhanced for Tone visibility)

Single page, plain HTML + JS, containing:

### Input Section
- A `<textarea>` for the review text, with a live word counter and a hard stop/warning at 100 words.
- A star-rating selector, 0 to 5 (clickable stars or a slider).
- A "Generate" button.

### Tone Analysis Display (NEW)
After clicking Generate, show a **Tone Analysis Panel** with:
- **Detected Emotion:** `<primary_emotion>` (with a colored badge — green for positive, red for negative, yellow for neutral/mixed)
- **Intensity:** a small bar or number showing `emotional_intensity`
- **Star-Text Match:** ✓ "Star and text agree" or ⚠ "Mismatch detected — text sounds <emotion> but rating is <X>★" with the mismatch note
- **Routing Decision:** "Emotion carried by: **Words** (LLM rewrite)" or "Emotion carried by: **Voice** (prosody/SSML)" or "Balanced" — with a brief one-line explanation of why

This panel makes the Tone system transparent — the user can see *why* the voice-over sounds the way it does.

### Voice Agent Section
- 4 buttons/tabs: **English Male**, **English Female**, **Urdu Male**, **Urdu Female** — visually indicate which is currently selected/active.
- Clicking a different agent button while text/rating are already set immediately triggers a new `/synthesize` call — no need to re-click "Generate".

### Output Section
- An `<audio>` player that auto-updates and auto-plays when a new agent is selected or regenerated.
- A text area showing the actual "spoken text" that was generated (English toned text, or the Urdu/Hindi translation, depending on active agent), including any SSML markers rendered as visible annotations (e.g. show `[pause 0.5s]` or `[emphasis]` inline so the user can see where the voice model is doing extra work).
- A small loading indicator during Groq/TTS calls.

---

## 10. tone_config.json — Tunable Parameters (NEW — externalized config)

All magic numbers live here. The pipeline code reads this file at startup and never hardcodes these values.

```json
{
  "version": 2,
  "star_speed_map": {
    "0": 0.80,
    "1": 0.85,
    "2": 0.92,
    "3": 1.00,
    "4": 1.08,
    "5": 1.15
  },
  "emotion_routing": {
    "high_intensity_threshold": 0.7,
    "low_intensity_threshold": 0.3,
    "voice_dominant_emotions": ["joy", "excitement", "frustration", "anger"],
    "llm_dominant_emotions": ["sadness", "disappointment", "gratitude"],
    "balanced_emotions": ["concern", "surprise", "sarcasm", "satisfaction"]
  },
  "routing_rules": [
    {
      "condition": "intensity >= 0.7 AND primary_emotion IN voice_dominant_emotions",
      "carrier": "voice_dominant",
      "llm_rewrite_strength": "mild",
      "ssml_intensity": "heavy",
      "speed_adjustment": 1.0
    },
    {
      "condition": "intensity >= 0.7 AND primary_emotion IN llm_dominant_emotions",
      "carrier": "llm_dominant",
      "llm_rewrite_strength": "strong",
      "ssml_intensity": "light",
      "speed_adjustment": 0.95
    },
    {
      "condition": "intensity >= 0.3 AND intensity < 0.7",
      "carrier": "balanced",
      "llm_rewrite_strength": "moderate",
      "ssml_intensity": "moderate",
      "speed_adjustment": 1.0
    },
    {
      "condition": "intensity < 0.3",
      "carrier": "star_only",
      "llm_rewrite_strength": "minimal",
      "ssml_intensity": "none",
      "speed_adjustment": 1.0
    },
    {
      "condition": "mismatch == true",
      "carrier": "llm_dominant",
      "llm_rewrite_strength": "strong",
      "ssml_intensity": "light",
      "speed_adjustment": 0.90,
      "note": "Mismatch always routes to LLM — linguistic contradictions need the right words, not the right prosody"
    }
  ],
  "ssml_bridge": {
    "break_pause_seconds": {
      "default": 0.5,
      "min": 0.2,
      "max": 1.5
    },
    "emphasis_micro_pause": 0.15,
    "prosody_fast_multiplier": 1.15,
    "prosody_slow_multiplier": 0.85,
    "interjection_pause": 0.2
  },
  "mismatch_rules": {
    "high_star_negative_text": {
      "bias": "text_dominant",
      "speed_override": 0.90,
      "description": "5★ with angry/sarcastic text → trust the text, dampen the speed"
    },
    "low_star_positive_text": {
      "bias": "blended_text_leading",
      "speed_override": 0.95,
      "description": "1★ with warm text → blend, add slight disappointment undertone"
    }
  },
  "voice_ids": {
    "en_male": "af_nicole",
    "en_female": "af_bella",
    "hi_male": "hm_alpha",
    "hi_female": "hf_beta"
  },
  "groq_model": "llama-3.3-70b-versatile",
  "max_review_words": 100,
  "max_rewrite_words": 120
}
```

> **Note:** The `voice_ids` are placeholders — the builder must verify actual Kokoro voice IDs at setup time and update this file. The Groq model name should also be verified against current Groq docs.

---

## 11. Setup notes for the build LLM

- `pip install kokoro` (or the appropriate Kokoro Python package — check current install instructions, e.g. `hexgrad/kokoro`) plus its runtime deps (`espeak-ng` system package for phonemization — install via apt if on Linux). Kokoro's Hindi phonemizer may need an extra language pack (`misaki[hi]` or similar) — check the current Kokoro repo.
- Confirm the current Kokoro Hindi voice IDs at setup time (naming convention is typically `hf_*` for Hindi female, `hm_*` for Hindi male — verify exact IDs in the installed voice pack and record them in `tone_config.json`).
- `pip install groq` for the Groq Python SDK.
- `pip install fastapi uvicorn python-dotenv pydub` (`pydub` for WAV stitching in the SSML bridge).
- Load `GROQ_API_KEY` from `.env`; never hardcode it.
- Write generated audio to `outputs/` with a filename like `{agent}_{hash}.wav`, and serve that directory statically.
- Handle the 100-word limit server-side too (truncate or reject with a clear error).
- Wrap all external calls (Groq, Kokoro) in try/except with a clear error surfaced to the UI.

---

## 12. Freedom & Constraints for the build LLM

**Must preserve:**
- The 4-agent behavior and instant re-render on agent switch.
- The **Tone Analysis → Resolution → Routing → Rewrite → TTS** pipeline — never speak the raw input text unmodified.
- The Tone Router logic: high-intensity raw emotions → Voice Model dominant; nuanced/text-dependent emotions → LLM dominant; mismatches → LLM dominant.
- All 4 agents run on **Kokoro TTS only** — English voices for EN agents, Hindi voices for "Urdu" agents.
- Groq used for emotion classification, tone rewriting, and Hindustani translation.
- The SSML Interpretation Bridge (parse SSML markers from LLM output, translate to Kokoro controls, stitch audio segments).
- The Tone Analysis Panel in the UI showing detected emotion, mismatch status, and routing decision.
- All tunable numbers in `tone_config.json`, not hardcoded.
- A runnable local UI in one command (e.g. `uvicorn app:app --reload`).

**Free to change:**
- Exact file names/structure, as long as it's documented in the README.
- Frontend framework choice (plain HTML/JS, Streamlit, Gradio) if it gets a working demo up faster.
- Exact Groq model name — use whatever current Groq-hosted model is best for fast text generation + classification.
- The specific SSML-to-Kokoro translation strategy in the bridge — as long as the intent (pauses, emphasis, speed variation) is preserved.
- Add caching, config files, logging, or error handling as it sees fit.
- If Kokoro's Hindi voice/phonemizer proves hard to install, it may fall back to Edge-TTS's `ur-PK-*` voices for just the "Urdu" agents — but should attempt the all-Kokoro approach first and document the fallback.
- If Kokoro itself proves hard to install for English, it may substitute a comparable open English TTS (e.g. Piper) as a documented fallback.

**Deliverables expected from the build LLM:**
1. All files listed in Section 7, working end-to-end.
2. A `README.md` with exact setup + run steps, including system-level deps and where to put the Groq API key.
3. A `tone_config.json` matching the schema in Section 10, with verified voice IDs.
4. A short note at the end listing any deviations from this spec and why.

---

## Appendix A: Full Pipeline Example

**Input:** "Oh great, another product that breaks after two days. Love it." with rating 1★

**Step 1 — Tone Analyzer (Groq classify):**
```json
{
  "primary_emotion": "sarcasm",
  "secondary_emotion": "frustration",
  "emotional_intensity": 0.8,
  "mismatch": false,
  "mismatch_note": ""
}
```

**Step 2 — Tone Resolver:**
- Star=1 → base_energy=0.15
- Text emotion=sarcasm + frustration → no mismatch with 1★
- Resolution: `harmonic`
- ToneProfile: `{ tone_label: "sarcastically_frustrated", base_energy: 0.15, emotion_flavor: "sarcasm", intensity: 0.8, resolution_source: "harmonic" }`

**Step 3 — Tone Router:**
- Intensity=0.8 ≥ 0.7 AND sarcasm ∈ balanced_emotions → but wait, mismatch rule doesn't apply... Check: intensity ≥ 0.7 and emotion is sarcasm. Sarcasm is in `balanced_emotions` list. However, the balanced rule applies for intensity 0.3-0.7. At 0.8, we need to check more carefully. Since sarcasm is a text-dependent emotion that needs the right words, it should route to **llm_dominant** even at high intensity.
- **Revised routing for sarcasm:** Always LLM-dominant, regardless of intensity — sarcasm cannot be conveyed through prosody alone.
- EmotionRoute: `{ carrier: "llm_dominant", llm_instruction: "Strong rewrite — make the sarcasm audible through contrasting word choice and ironic phrasing. Add SSML pause markers to let the irony land.", ssml_intensity: "light", speed_multiplier: 0.90 }`

**Step 4 — LLM Rewrite (Groq):**
> "Oh,<break time="0.3s"/> great. Another product that <emphasis level="strong">definitely</emphasis> lasts longer than two days.<break time="0.5s"/> Love it."

**Step 5a — SSML Bridge + Kokoro (English Male):**
- Parse: break at 0.3s, emphasis on "definitely", break at 0.5s
- Segment 1: "Oh," → synthesize at speed 0.85 (base 0.85 × 1.0)
- Silence: 0.3s
- Segment 2: "great. Another product that" → synthesize at speed 0.85, with "DEFINITELY" capitalized + 0.15s micro-pause before
- Silence: 0.5s
- Segment 3: "Love it." → synthesize at speed 0.85
- Stitch segments → final.wav

**Result:** A voice that pauses deliberately, emphasizes the ironic "definitely," and lands the dry "Love it" — the sarcasm is audible because the **words** carry it (LLM-dominant), supported by strategic pauses (light SSML).
