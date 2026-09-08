/**
 * Client for the Tone-Aware Review Voice Agent (tone-voice on port 8000).
 * POST /tone-voice/synthesize → download WAV from /outputs/…
 */
const axios = require("axios");

const DEFAULT_BASE = "http://127.0.0.1:8000";
const AGENTS = new Set(["en_male", "en_female", "hi_male", "hi_female"]);

function toneVoiceBaseUrl() {
  return (process.env.TONE_VOICE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function isReviewTtsEnabled() {
  const flag = String(process.env.REVIEW_TTS_ENABLED || "true").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return false;
  return true;
}

function normalizeAgent(agent) {
  const a = String(agent || "en_female").trim().toLowerCase();
  return AGENTS.has(a) ? a : "en_female";
}

function agentMeta(agent) {
  const a = normalizeAgent(agent);
  return {
    voice_agent: a,
    voice_gender: a.includes("female") ? "female" : "male",
    voice_language: a.startsWith("hi_") ? "ur" : "en",
  };
}

/** Half-star ratings → integer 0–5 for the tone-voice API. */
function ratingForTts(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(5, Math.round(n)));
}

/**
 * Synthesize review speech and return WAV bytes + metadata.
 * @returns {Promise<{ buffer: Buffer, meta: object, spoken_text: string }|null>}
 */
async function synthesizeReviewVoice({
  text,
  rating,
  agent = "en_female",
  buyerId = "",
  productId = "",
  orderId = "",
}) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const base = toneVoiceBaseUrl();
  const voiceAgent = normalizeAgent(agent);
  const timeout = Number(process.env.TONE_VOICE_TIMEOUT_MS || 120000);

  const { data } = await axios.post(
    `${base}/tone-voice/synthesize`,
    {
      text: trimmed.slice(0, 1000),
      rating: ratingForTts(rating),
      agent: voiceAgent,
      buyer_id: buyerId || "",
      product_id: productId || "",
      order_id: orderId || "",
    },
    { timeout, validateStatus: (s) => s < 500 }
  );

  if (!data || data.detail) {
    const detail = data?.detail || "Tone-voice synthesize failed";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  const audioPath = data.audio_url || "";
  if (!audioPath) {
    throw new Error("Tone-voice returned no audio_url");
  }

  const audioUrl = audioPath.startsWith("http")
    ? audioPath
    : `${base}${audioPath.startsWith("/") ? "" : "/"}${audioPath}`;

  const audioRes = await axios.get(audioUrl, {
    responseType: "arraybuffer",
    timeout: 60000,
  });
  const buffer = Buffer.from(audioRes.data);
  if (!buffer.length) throw new Error("Downloaded voice file was empty");

  return {
    buffer,
    spoken_text: data.spoken_text || data.display_text || trimmed,
    meta: {
      ...agentMeta(voiceAgent),
      voice_duration_s: null,
      toned_text_en: data.toned_text_en || "",
    },
  };
}

module.exports = {
  toneVoiceBaseUrl,
  isReviewTtsEnabled,
  normalizeAgent,
  agentMeta,
  ratingForTts,
  synthesizeReviewVoice,
  AGENTS: [...AGENTS],
};
