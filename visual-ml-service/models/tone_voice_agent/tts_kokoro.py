"""
tts_kokoro.py — Kokoro TTS wrapper + SSML Interpretation Bridge

This module handles:
1. Parsing SSML markers from the LLM output text
2. Stripping markers to produce clean text for Kokoro
3. Translating SSML markers into Kokoro-equivalent actions
4. Synthesizing audio (potentially in segments) with Kokoro
5. Stitching segments together with appropriate pauses
"""

import io
import os
import re
import struct
import wave
from typing import Dict, List, Any, Optional, Tuple

from tone_config import get_voice_id, get_ssml_bridge_config


_UNKNOWN_TAG_RE = re.compile(r'<[^>]+>')


def _strip_unknown_tags(text: str) -> str:
    """Remove any leftover <...> tags that survived SSML parsing.
    Kokoro reads unknown tags literally (e.g. saying "laugh" for <laugh>).
    """
    return _UNKNOWN_TAG_RE.sub('', text).strip()


# ── SSML Parsing ──────────────────────────────────────────────────────

class SSMLSegment:
    """Represents a parsed text segment with optional SSML controls."""

    def __init__(
        self,
        text: str,
        speed: Optional[float] = None,
        emphasis_words: Optional[List[str]] = None,
        trailing_silence: float = 0.0,
        is_interjection: bool = False,
    ):
        self.text = text
        self.speed = speed
        self.emphasis_words = emphasis_words or []
        self.trailing_silence = trailing_silence
        self.is_interjection = is_interjection


def parse_ssml(text: str, base_speed: float = 1.0) -> Tuple[List[SSMLSegment], str]:
    """
    Parse SSML markers from text and return segments + clean display text.

    Supported markers:
    - <break time="Xs"/>
    - <emphasis level="strong">word</emphasis>
    - <prosody rate="fast">text</prosody>
    - <prosody rate="slow">text</prosody>
    - <say-as interpret-as="interjection">word</say-as>

    Returns:
        (list of SSMLSegment, clean_text_for_display)
    """
    bridge_cfg = get_ssml_bridge_config()
    fast_mult = bridge_cfg.get("prosody_fast_multiplier", 1.15)
    slow_mult = bridge_cfg.get("prosody_slow_multiplier", 0.85)
    emphasis_pause = bridge_cfg.get("emphasis_micro_pause_seconds", 0.15)
    interjection_pause = bridge_cfg.get("interjection_pause_seconds", 0.2)

    segments: List[SSMLSegment] = []
    clean_display_parts: List[str] = []

    # Process the text by splitting on break tags first
    # Pattern: <break time="0.5s"/>
    break_pattern = re.compile(r'<break\s+time="([0-9.]+)s"\s*/>')
    # Pattern: <emphasis level="strong">word</emphasis>
    emphasis_pattern = re.compile(r'<emphasis\s+level="strong">(.*?)</emphasis>')
    # Pattern: <prosody rate="fast">text</prosody>
    prosody_fast_pattern = re.compile(r'<prosody\s+rate="fast">(.*?)</prosody>')
    # Pattern: <prosody rate="slow">text</prosody>
    prosody_slow_pattern = re.compile(r'<prosody\s+rate="slow">(.*?)</prosody>')
    # Pattern: <say-as interpret-as="interjection">word</say-as>
    interjection_pattern = re.compile(r'<say-as\s+interpret-as="interjection">(.*?)</say-as>')

    def process_chunk(chunk: str, current_speed: float) -> List[SSMLSegment]:
        """Process a text chunk (between breaks) handling inline SSML."""
        result = []
        display_parts = []

        # Process interjections
        remaining = chunk
        while interjection_pattern.search(remaining):
            m = interjection_pattern.search(remaining)
            before = remaining[:m.start()]
            word = m.group(1)

            if before.strip():
                result.append(SSMLSegment(
                    text=before.strip(),
                    speed=current_speed,
                ))
                display_parts.append(before.strip())

            result.append(SSMLSegment(
                text=word.upper(),
                speed=current_speed,
                is_interjection=True,
                trailing_silence=interjection_pause,
            ))
            display_parts.append(f"[interjection: {word}]")

            remaining = remaining[m.end():]

        if not remaining.strip():
            return result

        # Process emphasis
        working = remaining
        emphasis_words = []
        while emphasis_pattern.search(working):
            m = emphasis_pattern.search(working)
            emphasis_words.append(m.group(1))
            # Replace with uppercase version for Kokoro emphasis
            working = working[:m.start()] + m.group(1).upper() + working[m.end():]
            display_parts_text = working

        # Process prosody fast
        while prosody_fast_pattern.search(working):
            m = prosody_fast_pattern.search(working)
            inner_text = m.group(1)
            fast_speed = current_speed * fast_mult
            working = working[:m.start()] + "\x00FAST_START\x00" + inner_text + "\x00FAST_END\x00" + working[m.end():]

        # Process prosody slow
        while prosody_slow_pattern.search(working):
            m = prosody_slow_pattern.search(working)
            inner_text = m.group(1)
            slow_speed = current_speed * slow_mult
            working = working[:m.start()] + "\x00SLOW_START\x00" + inner_text + "\x00SLOW_END\x00" + working[m.end():]

        # If there are prosody markers, split further
        if "\x00FAST_START\x00" in working or "\x00SLOW_START\x00" in working:
            # Split by the markers
            parts = re.split(r'\x00(FAST_START|FAST_END|SLOW_START|SLOW_END)\x00', working)
            current_seg_speed = current_speed
            current_text = ""
            for part in parts:
                if part == "FAST_START":
                    if current_text.strip():
                        result.append(SSMLSegment(text=current_text.strip(), speed=current_seg_speed, emphasis_words=emphasis_words))
                        emphasis_words = []
                    current_text = ""
                    current_seg_speed = current_speed * fast_mult
                elif part == "FAST_END":
                    if current_text.strip():
                        result.append(SSMLSegment(text=current_text.strip(), speed=current_seg_speed))
                    current_text = ""
                    current_seg_speed = current_speed
                elif part == "SLOW_START":
                    if current_text.strip():
                        result.append(SSMLSegment(text=current_text.strip(), speed=current_seg_speed, emphasis_words=emphasis_words))
                        emphasis_words = []
                    current_text = ""
                    current_seg_speed = current_speed * slow_mult
                elif part == "SLOW_END":
                    if current_text.strip():
                        result.append(SSMLSegment(text=current_text.strip(), speed=current_seg_speed))
                    current_text = ""
                    current_seg_speed = current_speed
                else:
                    current_text += part
            if current_text.strip():
                result.append(SSMLSegment(text=current_text.strip(), speed=current_seg_speed, emphasis_words=emphasis_words))
        else:
            if working.strip():
                result.append(SSMLSegment(
                    text=working.strip(),
                    speed=current_speed,
                    emphasis_words=emphasis_words,
                ))

        return result

    # Split by break tags
    parts = break_pattern.split(text)

    i = 0
    while i < len(parts):
        part = parts[i]
        if i + 1 < len(parts) and re.match(r'[0-9.]+', parts[i + 1]):
            # part is text, parts[i+1] is the break duration
            if part.strip():
                segs = process_chunk(part, base_speed)
                segments.extend(segs)
            # Add trailing silence to the last segment
            break_duration = float(parts[i + 1])
            if segments:
                segments[-1].trailing_silence += break_duration
            i += 2
        else:
            if part.strip():
                segs = process_chunk(part, base_speed)
                segments.extend(segs)
            i += 1

    # Clean any residual unknown tags from every segment.
    for seg in segments:
        seg.text = _strip_unknown_tags(seg.text)

    # Build clean display text
    display_text = text
    display_text = break_pattern.sub(lambda m: f' [pause {m.group(1)}s] ', display_text)
    display_text = emphasis_pattern.sub(r'\1 [emphasis]', display_text)
    display_text = prosody_fast_pattern.sub(r'\1 [fast]', display_text)
    display_text = prosody_slow_pattern.sub(r'\1 [slow]', display_text)
    display_text = interjection_pattern.sub(r'\1', display_text)

    return segments, display_text


# ── Audio Utilities ───────────────────────────────────────────────────

def generate_silence(duration_seconds: float, sample_rate: int = 24000) -> bytes:
    """Generate silence as a WAV-compatible byte string."""
    num_samples = int(sample_rate * duration_seconds)
    silence_data = b'\x00\x00' * num_samples  # 16-bit silence

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(silence_data)
    return buf.getvalue()


def stitch_wav_files(wav_data_list: List[bytes]) -> bytes:
    """
    Stitch multiple WAV files together into one continuous WAV.
    All inputs must have the same sample rate, channels, and sample width.
    """
    if not wav_data_list:
        return b''

    if len(wav_data_list) == 1:
        return wav_data_list[0]

    # Read all WAV headers to get params and data
    all_frames = []
    params = None
    for wav_bytes in wav_data_list:
        buf = io.BytesIO(wav_bytes)
        with wave.open(buf, 'rb') as wf:
            if params is None:
                params = (wf.getnchannels(), wf.getsampwidth(), wf.getframerate(), 'NONE', 'not compressed')
            all_frames.append(wf.readframes(wf.getnframes()))

    # Write combined WAV
    out_buf = io.BytesIO()
    with wave.open(out_buf, 'wb') as wf:
        wf.setnchannels(params[0])
        wf.setsampwidth(params[1])
        wf.setframerate(params[2])
        for frames in all_frames:
            wf.writeframes(frames)

    return out_buf.getvalue()


# ── Kokoro TTS Synthesis ──────────────────────────────────────────────

def synthesize(
    text: str,
    agent: str,
    speed: float = 1.0,
) -> Tuple[str, str]:
    """
    Synthesize speech from text using Kokoro TTS with SSML support.

    Args:
        text: Text to speak (may contain SSML markers)
        agent: Agent key ("en_male", "en_female", "hi_male", "hi_female")
        speed: Base speed multiplier (0.75 - 1.25)

    Returns:
        (audio_file_path, display_text) — path to generated WAV file,
        and the clean display text with SSML annotations shown inline
    """
    voice_id = get_voice_id(agent)
    segments, display_text = parse_ssml(text, base_speed=speed)

    # Import Kokoro here to allow graceful fallback if not installed
    try:
        from kokoro import KPipeline
    except ImportError:
        raise ImportError(
            "Kokoro TTS is not installed. Install it with: pip install kokoro\n"
            "You may also need: sudo apt-get install espeak-ng"
        )

    # Initialize Kokoro pipeline
    pipeline = KPipeline(lang_code='a' if agent.startswith('en') else 'h')

    output_dir = os.path.join(os.path.dirname(__file__), 'outputs')
    os.makedirs(output_dir, exist_ok=True)

    # Synthesize each segment
    wav_data_list = []
    for seg in segments:
        if not seg.text.strip():
            if seg.trailing_silence > 0:
                silence_wav = generate_silence(seg.trailing_silence)
                wav_data_list.append(silence_wav)
            continue

        # Kokoro synthesis
        seg_speed = seg.speed if seg.speed is not None else speed

        # Strip any leftover SSML-style tags the parser did not handle,
        # so Kokoro never reads "<laugh>" or similar literally.
        clean_seg_text = _strip_unknown_tags(seg.text)
        if not clean_seg_text.strip():
            if seg.trailing_silence > 0:
                wav_data_list.append(generate_silence(seg.trailing_silence))
            continue

        # Generate audio for this segment.
        # Current Kokoro API: pipeline is callable and yields (graphemes, phonemes, audio)
        # per chunk. `audio` is a torch tensor on recent versions, numpy array on older ones.
        import numpy as np
        for result in pipeline(clean_seg_text, voice=voice_id, speed=seg_speed):
            if isinstance(result, tuple):
                audio = result[-1]
            else:
                audio = getattr(result, 'audio', result)

            if audio is None:
                continue

            if hasattr(audio, 'detach'):
                audio = audio.detach().cpu().numpy()

            if isinstance(audio, np.ndarray):
                arr = audio.astype(np.float32).squeeze()
                audio_int = np.clip(arr * 32767.0, -32768, 32767).astype(np.int16)
                buf = io.BytesIO()
                with wave.open(buf, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(24000)
                    wf.writeframes(audio_int.tobytes())
                wav_data_list.append(buf.getvalue())
            elif isinstance(audio, bytes):
                wav_data_list.append(audio)

        # Add trailing silence for this segment
        if seg.trailing_silence > 0:
            silence_wav = generate_silence(seg.trailing_silence)
            wav_data_list.append(silence_wav)

    # Stitch all segments
    if not wav_data_list:
        return "", display_text

    final_wav = stitch_wav_files(wav_data_list)

    # Save to file
    import hashlib
    file_hash = hashlib.md5(f"{agent}{text}{speed}".encode()).hexdigest()[:12]
    filename = f"{agent}_{file_hash}.wav"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, 'wb') as f:
        f.write(final_wav)

    return filepath, display_text
