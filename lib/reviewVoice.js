/**
 * Generate review TTS via tone-voice and persist audio (Cloudinary when configured).
 */
const { saveReviewVoiceAsync } = require("./storage");
const {
  isReviewTtsEnabled,
  synthesizeReviewVoice,
  normalizeAgent,
} = require("./toneVoiceClient");

/**
 * Attach voice to one or more Review documents (same comment → one synthesis).
 * Failures are logged; reviews remain without voice_url.
 *
 * @param {import("mongoose").Document[]} reviews
 * @param {{ comment: string, rating: number, voice_agent?: string, order_id?: string }} opts
 */
async function attachReviewVoices(reviews, { comment, rating, voice_agent, order_id } = {}) {
  if (!isReviewTtsEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  if (!reviews?.length || !String(comment || "").trim()) {
    return { ok: false, reason: "no_text" };
  }

  const first = reviews[0];
  let synth;
  try {
    synth = await synthesizeReviewVoice({
      text: comment,
      rating,
      agent: normalizeAgent(voice_agent),
      buyerId: first.buyer_id,
      productId: first.product_id,
      orderId: order_id || first.order_id || "",
    });
  } catch (err) {
    console.warn("[reviewVoice] TTS failed:", err.message);
    return { ok: false, reason: err.message };
  }

  if (!synth?.buffer) return { ok: false, reason: "empty_audio" };

  const updated = [];
  for (const review of reviews) {
    try {
      const voiceUrl = await saveReviewVoiceAsync(
        review.buyer_id,
        review.product_id,
        synth.buffer,
        "wav",
        synth.meta.voice_agent
      );
      review.voice_url = voiceUrl;
      review.voice_agent = synth.meta.voice_agent;
      review.voice_gender = synth.meta.voice_gender;
      review.voice_language = synth.meta.voice_language;
      if (synth.meta.voice_duration_s != null) {
        review.voice_duration_s = synth.meta.voice_duration_s;
      }
      await review.save();
      updated.push(review.review_id);
    } catch (err) {
      console.warn(
        `[reviewVoice] Cloudinary/local save failed for ${review.review_id}:`,
        err.message
      );
    }
  }

  return {
    ok: updated.length > 0,
    review_ids: updated,
    voice_agent: synth.meta.voice_agent,
  };
}

module.exports = { attachReviewVoices };
