"""
ShaadiSahulat AI-Powered Review & Rating Module
================================================

Blueprint mounted at /review-ai on the visual-ml-service Flask app.

Endpoints
---------
POST /review-ai/suggest-rating
    Body:  { "text": "...", "product_title": "...", "product_description": "..." }
    Resp:  { "success": true,
             "suggested_rating": 4.5,
             "sentiment": "positive",
             "sentiment_score": 0.78,
             "is_relevant": true,
             "reason": "..." }

POST /review-ai/generate-reviews
    Body:  { "product_title": "...", "product_description": "...",
             "rating": 5, "length": "medium" }
    Resp:  { "success": true,
             "reviews": [
                { "text": "...", "length": "medium" },
                { "text": "...", "length": "medium" },
                { "text": "...", "length": "medium" },
             ] }

Design notes
------------
* Sentiment analysis uses VADER (rule-based, no training required, robust
  on short informal reviews). It is initialised once at module import.
* Relevance check: if the review text shares no meaningful tokens with the
  product title/description, OR is too short / appears to be random
  gibberish, we force a 2.0-star rating per the spec:
      "if someone write the random things that is not relevant then
       Give him 2 Start"
* Review generation is template-based with slot filling driven by product
  title + description + chosen rating. Three variations are produced.
  The Long variant is capped at 50-60 words per the spec.
* Rating scale is 0.5 steps: 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.
"""
import os
import re
import math
import random
from flask import Blueprint, request, jsonify

review_ai_bp = Blueprint("review_ai", __name__, url_prefix="/review-ai")

# ── Lazy-loaded VADER analyser ─────────────────────────────────────────────
_vader = None

def _get_vader():
    """Lazily import and instantiate VADER. Returns None if unavailable."""
    global _vader
    if _vader is not None:
        return _vader
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        _vader = SentimentIntensityAnalyzer()
    except Exception as exc:
        print(f"[review_ai] VADER not available, falling back to lexicon: {exc}")
        _vader = _LexiconFallback()
    return _vader


class _LexiconFallback:
    """
    Minimal rule-based sentiment analyser used when vaderSentiment is not
    installed. Good enough for the FYP demo on Pakistani English reviews.
    """
    POSITIVE = {
        "excellent": 3, "amazing": 3, "outstanding": 3, "perfect": 3,
        "loved": 2, "love": 2, "best": 3, "awesome": 3, "great": 2,
        "good": 1, "nice": 1, "happy": 2, "satisfied": 2, "recommend": 2,
        "beautiful": 2, "elegant": 2, "premium": 2, "fast": 1, "quality": 1,
        "comfortable": 2, "soft": 1, "fine": 1, "value": 1, "worth": 2,
        "impressed": 2, "stunning": 3, "gorgeous": 3, "exceeded": 3,
        "okay": 1, "ok": 1, "decent": 1, "acceptable": 1, "alright": 1,
        "exceptional": 3, "superb": 3, "fabulous": 3, "marvelous": 3,
        "splendid": 3, "delightful": 2, "pleasant": 2,
    }
    NEGATIVE = {
        "terrible": -3, "awful": -3, "worst": -3, "horrible": -3, "hate": -3,
        "bad": -2, "poor": -2, "disappointed": -2, "slow": -1, "broken": -3,
        "damaged": -2, "wrong": -2, "fake": -2, "cheap": -1, "defective": -3,
        "ugly": -2, "rough": -1, "uncomfortable": -2, "waste": -2,
        "not": -1, "no": -1, "never": -1, "issue": -1, "problem": -1,
        "late": -1, "missing": -2, "ruined": -2,
    }
    NEGATORS = {"not", "no", "never", "n't", "without"}

    def polarity_scores(self, text):
        tokens = re.findall(r"[a-zA-Z']+", text.lower())
        if not tokens:
            return {"compound": 0.0, "pos": 0.0, "neg": 0.0, "neu": 1.0}
        score = 0
        pos_count = 0
        neg_count = 0
        for i, tok in enumerate(tokens):
            prev = tokens[i - 1] if i > 0 else ""
            multiplier = -1 if prev in self.NEGATORS else 1
            if tok in self.POSITIVE:
                s = self.POSITIVE[tok] * multiplier
                score += s
                if s > 0: pos_count += 1
                else:     neg_count += 1
            elif tok in self.NEGATIVE:
                s = self.NEGATIVE[tok] * multiplier
                score += s
                if s < 0: neg_count += 1
                else:     pos_count += 1
        # Normalise to [-1, 1]
        compound = max(-1.0, min(1.0, score / max(1, math.sqrt(len(tokens)))))
        return {
            "compound": compound,
            "pos": pos_count / len(tokens),
            "neg": neg_count / len(tokens),
            "neu": max(0.0, 1.0 - (pos_count + neg_count) / len(tokens)),
        }


# ── Relevance check ─────────────────────────────────────────────────────────

# English + Urdu-Roman stopwords that don't carry product meaning
_STOPWORDS = {
    "the", "a", "an", "is", "was", "were", "are", "and", "or", "but", "of",
    "in", "on", "at", "to", "for", "with", "this", "that", "it", "i", "my",
    "we", "they", "you", "very", "really", "so", "too", "just", "have", "had",
    "has", "been", "be", "do", "did", "done", "ye", "hai", "ho", "tha", "thi",
    "bohat", "acha", "achi", "kharab", "mazaa", "kyaa", "ka", "ki", "ke",
    "ne", "se", "ko", "par", "aur", "ya", "lehnga", "kurta", "shirt",
}


def _tokenise(text):
    if not text:
        return []
    return [t for t in re.findall(r"[a-zA-Z']+", text.lower()) if t not in _STOPWORDS and len(t) > 2]


def _is_relevant(review_text, product_title, product_description):
    """
    Decide whether the review text is on-topic for the product.
    Returns (is_relevant: bool, reason: str).
    """
    text = (review_text or "").strip()
    if len(text) < 3:
        return False, "Review text is too short to analyse."

    tokens = _tokenise(text)
    if len(tokens) < 1:
        return False, "Review text contains no meaningful words."

    # Build a product keyword set from title + description
    prod_tokens = set(_tokenise(product_title) + _tokenise(product_description))
    if not prod_tokens:
        # We have no product context — accept any review with at least 2 words
        return len(tokens) >= 2, "No product context provided; accepting minimal review."

    overlap = prod_tokens.intersection(tokens)

    # Heuristic 1: direct token overlap
    if len(overlap) >= 1:
        return True, f"Review matches product keywords: {', '.join(sorted(overlap))}."

    # Heuristic 2: review contains general e-commerce sentiment words — accept
    # This is broader than the fallback lexicon so we accept phrases like
    # "okay", "average", "fine" that the lexicon misses.
    sentiment_words = set(_LexiconFallback.POSITIVE.keys()) \
        | set(_LexiconFallback.NEGATIVE.keys()) \
        | {"okay", "ok", "fine", "average", "decent", "acceptable",
           "satisfied", "unsatisfied", "mid", "meh", "alright"}
    if any(tok in sentiment_words for tok in tokens):
        return True, "Review contains sentiment words relevant to product experience."

    # Heuristic 3: looks like random text — flag as irrelevant
    # (random chars, no vowels, repetitive)
    has_vowels = any(v in text.lower() for v in "aeiou")
    if not has_vowels:
        return False, "Review text appears to be random characters (no vowels)."

    # Repeated single character / repeated word
    if len(set(tokens)) == 1 and len(tokens) > 2:
        return False, "Review text is a single repeated word — likely spam."

    return False, "Review text does not appear relevant to this product."


# ── Rating suggestion ───────────────────────────────────────────────────────

def _compound_to_rating(compound, is_relevant):
    """
    Map VADER compound score (range -1..1) to a 0.5-step rating 0.5..5.
    If irrelevant, force 2.0 per spec.

    Calibration (against typical e-commerce review text):
      +0.75 → 5.0   (very positive — "excellent", "amazing")
      +0.55 → 4.5
      +0.35 → 4.0   (positive — "good", "nice")
      +0.20 → 3.5
      +0.05 → 3.0   (neutral-positive — "okay", "fine")
      -0.05 → 2.5   (truly neutral — "average", "nothing special")
      -0.20 → 2.0   (mildly negative — "not great")
      -0.40 → 1.5
      -0.60 → 1.0   (negative — "disappointing")
      below → 0.5   (very negative — "worst", "hate")
    """
    if not is_relevant:
        return 2.0

    if compound >= 0.75:  return 5.0
    if compound >= 0.55:  return 4.5
    if compound >= 0.35:  return 4.0
    if compound >= 0.20:  return 3.5
    if compound >= 0.05:  return 3.0
    if compound >= -0.10: return 2.5
    if compound >= -0.30: return 2.0
    if compound >= -0.50: return 1.5
    if compound >= -0.70: return 1.0
    return 0.5


def _sentiment_label(compound):
    if compound >= 0.35: return "positive"
    if compound >= 0.05: return " mildly_positive"
    if compound > -0.05: return "neutral"
    if compound > -0.35: return "mildly_negative"
    return "negative"


# ── Review generation ───────────────────────────────────────────────────────

_LENGTHS = {
    "short":  (15, 30),    # ~1 sentence
    "medium": (35, 50),    # ~2 sentences
    "long":   (50, 60),    # ~3 sentences, capped at 60 words per spec
}


def _word_count(s):
    return len(re.findall(r"\S+", s))


def _trim_to_words(s, max_words):
    words = s.split()
    if len(words) <= max_words:
        return s.strip()
    return " ".join(words[:max_words]).rstrip(",.") + "."


def _pick_rating_tone(rating):
    """Return (tone, key_phrases) for the rating bucket."""
    r = float(rating)
    if r >= 4.5:
        return "excellent", [
            "exceeded my expectations", "outstanding quality", "highly recommend",
            "absolutely loved it", "premium feel", "beautiful craftsmanship",
            "worth every penny", "stunning design", "fast delivery",
            "excellent stitching", "perfect fit", "great value for money",
        ]
    if r >= 3.5:
        return "positive", [
            "very satisfied with my purchase", "good quality for the price",
            "matches the description", "would buy again", "nice product overall",
            "delivery was on time", "good stitching and finish",
            "feels worth the price", "would recommend to friends",
        ]
    if r >= 2.5:
        return "mixed", [
            "decent but could be better", "average experience",
            "matches expectations partially", "okay for the price",
            "quality is acceptable", "expected slightly better",
            "nothing exceptional but works",
        ]
    if r >= 1.5:
        return "negative", [
            "not what I expected", "quality could be improved",
            "disappointed with the purchase", "expected better for the price",
            "finish needs work", "would not buy again at this price",
            "did not match the description",
        ]
    return "very_negative", [
        "very disappointing", "poor quality", "would not recommend",
        "did not meet basic expectations", "waste of money",
        "damaged on arrival", "seller did not respond properly",
        "completely unsatisfied",
    ]


def _extract_product_keywords(product_title, product_description, limit=4):
    """Pull out up to `limit` salient keywords from the product info.
    Returns tokens that appear in the description but NOT in the title,
    so we don't end up with awkward 'lehenga with lehenga' phrasing.
    Falls back to description tokens (then title tokens) if no exclusives.
    """
    title_tokens = _tokenise(product_title)
    desc_tokens  = _tokenise(product_description)
    title_set    = set(title_tokens)

    # Description tokens not already in the title — these are the descriptive
    # extras we want to surface (fabric, embroidery, colour, occasion, etc.)
    desc_only = [t for t in desc_tokens if t not in title_set]

    # Fallbacks: tokens in both (still meaningful), then title tokens
    both       = [t for t in title_tokens if t in desc_tokens]
    title_only = [t for t in title_tokens if t not in desc_tokens]

    ordered = desc_only + both + title_only

    seen = set()
    out = []
    for t in ordered:
        if t in seen: continue
        seen.add(t)
        out.append(t)
        if len(out) >= limit: break
    return out


def _generate_one(product_title, product_description, rating, length, variant):
    """
    Compose a single review using templates and slot filling.
    `variant` is 0, 1, or 2 — controls which template is used.

    Strategy:
      - For "long" length, always use the narrative template (variant 2 base)
        so we start near the 50-word target.
      - For "short" length, use the punchy template (variant 0 base).
      - For "medium" length, use the aspect-focused template (variant 1 base).
      - The `variant` parameter then controls which 3 distinct outputs are
        produced by varying the appended phrases.
    """
    tone, phrases = _pick_rating_tone(rating)
    keywords = _extract_product_keywords(product_title, product_description, limit=2)
    # product_short: strip leading "the / a / an"
    product_short = (product_title or "this product").strip()
    product_short = re.sub(r"^(the|a|an)\s+", "", product_short, flags=re.IGNORECASE)
    product_lower = product_short.lower()

    # Pick at most 2 keywords for the "with X and Y" phrase
    keyword_phrase = ""
    if keywords:
        if len(keywords) == 1:
            keyword_phrase = f" with {keywords[0]}"
        else:
            keyword_phrase = f" with {keywords[0]} and {keywords[1]}"

    min_w, max_w = _LENGTHS.get(length, _LENGTHS["medium"])

    # Three distinct opening templates per tone
    openers = {
        "excellent": [
            f"Excellent {product_lower}{keyword_phrase}. {phrases[0].capitalize()} — highly recommended.",
            f"The {product_lower} is {phrases[1]}. {phrases[2].capitalize()}, definitely worth buying.",
            f"I am very satisfied with this {product_lower}{keyword_phrase}. The quality, stitching, and overall appearance were all excellent.",
        ],
        "positive": [
            f"Good {product_lower}{keyword_phrase}. {phrases[0].capitalize()} — would buy again.",
            f"Nice {product_lower}. {phrases[1].capitalize()} and delivery was on time. Overall a positive experience.",
            f"Satisfied with the {product_lower}{keyword_phrase}. It {phrases[2]} and feels worth the price.",
        ],
        "mixed": [
            f"Decent {product_lower}{keyword_phrase}. {phrases[0].capitalize()} — overall an okay purchase.",
            f"The {product_lower} is acceptable. {phrases[1].capitalize()} — fine for the price range.",
            f"Average experience with this {product_lower}. It {phrases[2]} but the quality is what you would expect at this price point.",
        ],
        "negative": [
            f"Disappointing {product_lower}. {phrases[0].capitalize()} — quality needs improvement.",
            f"The {product_lower} did not fully match expectations. {phrases[1].capitalize()}, expected better at this price.",
            f"Not satisfied with this {product_lower}. {phrases[2].capitalize()} and the overall finish could be much better for the price I paid.",
        ],
        "very_negative": [
            f"Very poor {product_lower}. {phrases[0].capitalize()} — would not buy again.",
            f"The {product_lower} is below expectations. {phrases[1].capitalize()} and not worth the price.",
            f"Highly disappointed with this {product_lower}. {phrases[2].capitalize()} and the quality does not match what was advertised.",
        ],
    }

    # For long length, use the narrative template (index 2) as the base for
    # all 3 variants so they start close to the 50-word target.
    # For medium, use index 1. For short, use index 0.
    # Then `variant` controls which phrases get appended (different per variant).
    length_to_base = {"short": 0, "medium": 1, "long": 2}
    base_idx = length_to_base.get(length, 1)
    text = openers[tone][base_idx].strip()

    # ── Length adjustment ────────────────────────────────────────────────
    wc = _word_count(text)

    # If too long → trim to max_words (cut at last full word)
    if wc > max_w:
        words = text.split()
        text = " ".join(words[:max_w]).rstrip(",.;—-") + "."

    # If too short → pad by appending distinct phrases (no repetition)
    elif wc < min_w:
        text_lower = text.lower()
        # Rotate phrase list based on variant so each variant gets different phrases
        rotated = phrases[variant % len(phrases):] + phrases[:variant % len(phrases)]
        usable = [p for p in rotated if p.lower() not in text_lower]
        if not usable:
            usable = rotated[:]

        for phrase in usable:
            if _word_count(text) >= min_w:
                break
            if phrase.lower() in text.lower():
                continue
            sep = " " if text.endswith(('.', '!', '?')) else ". "
            text = text + sep + phrase.capitalize() + "."

        # Final trim in case we overshot
        if _word_count(text) > max_w:
            words = text.split()
            text = " ".join(words[:max_w]).rstrip(",.;—-") + "."

    return text


# ── Routes ──────────────────────────────────────────────────────────────────

@review_ai_bp.route("/health", methods=["GET"])
def health():
    vader = _get_vader()
    is_vader = not isinstance(vader, _LexiconFallback)
    return jsonify({
        "success": True,
        "service": "review-ai",
        "sentiment_engine": "vader" if is_vader else "lexicon_fallback",
        "rating_scale": [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
        "lengths_supported": list(_LENGTHS.keys()),
    })


@review_ai_bp.route("/suggest-rating", methods=["POST"])
def suggest_rating():
    """
    Body:
      text                 — the review text written by the buyer so far
      product_title        — optional, used for relevance check
      product_description  — optional, used for relevance check

    Returns:
      suggested_rating   : float (0.5-5 in 0.5 steps)
      sentiment          : "positive" | "neutral" | "negative"
      sentiment_score    : float (-1..1)
      is_relevant        : bool
      reason             : human-readable explanation
    """
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    product_title = (data.get("product_title") or "").strip()
    product_description = (data.get("product_description") or "").strip()

    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400

    # Relevance check first
    is_relevant, reason = _is_relevant(text, product_title, product_description)

    # Sentiment
    vader = _get_vader()
    scores = vader.polarity_scores(text)
    compound = float(scores.get("compound", 0.0))

    # Rating
    rating = _compound_to_rating(compound, is_relevant)
    sentiment = _sentiment_label(compound).strip()

    return jsonify({
        "success": True,
        "suggested_rating": rating,
        "sentiment": sentiment,
        "sentiment_score": compound,
        "is_relevant": is_relevant,
        "reason": reason,
    })


@review_ai_bp.route("/generate-reviews", methods=["POST"])
def generate_reviews():
    """
    Body:
      product_title        — required
      product_description  — optional
      rating               — 0.5–5 (0.5 steps)
      length               — "short" | "medium" | "long"

    Returns:
      reviews : list of {text, length} — 3 variations
    """
    data = request.get_json(silent=True) or {}
    product_title = (data.get("product_title") or "").strip()
    product_description = (data.get("product_description") or "").strip()
    rating = data.get("rating")
    length = (data.get("length") or "medium").lower()

    if not product_title:
        return jsonify({"success": False, "error": "product_title is required"}), 400

    try:
        r = float(rating)
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "rating must be a number"}), 400

    if r < 0.5 or r > 5 or abs(r * 2 - round(r * 2)) > 1e-9:
        return jsonify({
            "success": False,
            "error": "rating must be 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, or 5",
        }), 400

    if length not in _LENGTHS:
        return jsonify({
            "success": False,
            "error": f"length must be one of {list(_LENGTHS.keys())}",
        }), 400

    # Generate three variations
    reviews = []
    for variant in range(3):
        text = _generate_one(product_title, product_description, r, length, variant)
        reviews.append({"text": text, "length": length, "variant": variant})

    return jsonify({
        "success": True,
        "rating": r,
        "length": length,
        "tone": _pick_rating_tone(r)[0],
        "reviews": reviews,
    })
