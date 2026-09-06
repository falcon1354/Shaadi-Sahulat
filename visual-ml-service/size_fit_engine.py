"""
Size-Aware Fit Engine for Wedding Attire Try-On
================================================
Compares a buyer's body size / measurements against a product's listed size
and returns a structured fit verdict used to drive generative try-on.

This module is the FYP "size-awareness" contribution — independent of the
image generator. It can be unit-tested and explained without the VTON API.
"""

from __future__ import annotations

from typing import Any

# Standard apparel size order used across Pakistani / international labels
SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]

# Approx body measurements (cm) used when the buyer only picks a letter size
SIZE_TO_MEASUREMENTS = {
    "XXS": {"height": 150, "chest": 78,  "waist": 60, "hip": 84},
    "XS":  {"height": 155, "chest": 82,  "waist": 64, "hip": 88},
    "S":   {"height": 160, "chest": 86,  "waist": 68, "hip": 92},
    "M":   {"height": 165, "chest": 92,  "waist": 74, "hip": 98},
    "L":   {"height": 170, "chest": 98,  "waist": 80, "hip": 104},
    "XL":  {"height": 175, "chest": 104, "waist": 86, "hip": 110},
    "XXL": {"height": 178, "chest": 110, "waist": 92, "hip": 116},
    "3XL": {"height": 180, "chest": 116, "waist": 98, "hip": 122},
    "4XL": {"height": 182, "chest": 122, "waist": 104, "hip": 128},
}

# Typical garment coverage scale relative to the person bbox (fit = 1.0)
FIT_SCALE = {
    "FIT": 1.00,
    "TOO_SMALL": 0.72,   # visibly short / tight
    "TOO_LARGE": 1.28,   # visibly long / baggy
}


def normalize_size(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().upper().replace(" ", "")
    aliases = {
        "EXTRA SMALL": "XS", "EXTRASMALL": "XS",
        "SMALL": "S", "MEDIUM": "M", "LARGE": "L",
        "EXTRA LARGE": "XL", "EXTRALARGE": "XL", "X-LARGE": "XL",
        "2XL": "XXL", "XX-LARGE": "XXL", "XXXL": "3XL",
        "FREE": "M", "FREESIZE": "M", "ONE SIZE": "M", "ONESIZE": "M",
        "CUSTOM": None,
    }
    if s in aliases:
        return aliases[s]
    if s in SIZE_ORDER:
        return s
    # e.g. "Size M" / "M-Medium"
    for token in SIZE_ORDER:
        if token in s:
            return token
    return None


def size_index(size: str | None) -> int | None:
    size = normalize_size(size)
    if size is None:
        return None
    try:
        return SIZE_ORDER.index(size)
    except ValueError:
        return None


def _coerce_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def estimate_buyer_measurements(
    buyer_size: str | None = None,
    height_cm: float | None = None,
    chest_cm: float | None = None,
    waist_cm: float | None = None,
    hip_cm: float | None = None,
) -> dict:
    """Merge explicit measurements with defaults from letter size."""
    base = {}
    ns = normalize_size(buyer_size)
    if ns and ns in SIZE_TO_MEASUREMENTS:
        base = dict(SIZE_TO_MEASUREMENTS[ns])

    for key, val in (
        ("height", height_cm),
        ("chest", chest_cm),
        ("waist", waist_cm),
        ("hip", hip_cm),
    ):
        if val is not None:
            base[key] = float(val)

    return base


def evaluate_fit(
    *,
    product_size: str | None = None,
    buyer_size: str | None = None,
    height_cm: float | None = None,
    chest_cm: float | None = None,
    waist_cm: float | None = None,
    hip_cm: float | None = None,
    category: str | None = None,
) -> dict:
    """
    Return a fit verdict.

    Priority:
      1. Letter-size delta (product vs buyer) when both available
      2. Measurement heuristics vs product size chart defaults
      3. Unknown → FIT with low confidence (neutral try-on)
    """
    p_idx = size_index(product_size)
    b_idx = size_index(buyer_size)
    buyer_m = estimate_buyer_measurements(
        buyer_size, height_cm, chest_cm, waist_cm, hip_cm
    )

    reasons: list[str] = []
    verdict = "FIT"
    confidence = 0.55
    size_delta = 0

    if p_idx is not None and b_idx is not None:
        size_delta = b_idx - p_idx  # positive => buyer larger than garment
        if size_delta <= -2:
            verdict = "TOO_LARGE"
            confidence = min(0.95, 0.7 + 0.08 * abs(size_delta))
            reasons.append(
                f"Product size {normalize_size(product_size)} is larger than your size "
                f"{normalize_size(buyer_size)}."
            )
        elif size_delta == -1:
            verdict = "TOO_LARGE"
            confidence = 0.72
            reasons.append(
                f"Product size {normalize_size(product_size)} runs larger than your size "
                f"{normalize_size(buyer_size)}."
            )
        elif size_delta == 0:
            verdict = "FIT"
            confidence = 0.88
            reasons.append(
                f"Product size {normalize_size(product_size)} matches your size "
                f"{normalize_size(buyer_size)}."
            )
        elif size_delta == 1:
            verdict = "TOO_SMALL"
            confidence = 0.74
            reasons.append(
                f"Product size {normalize_size(product_size)} is smaller than your size "
                f"{normalize_size(buyer_size)}."
            )
        else:
            verdict = "TOO_SMALL"
            confidence = min(0.97, 0.75 + 0.07 * size_delta)
            reasons.append(
                f"Product size {normalize_size(product_size)} is much smaller than your size "
                f"{normalize_size(buyer_size)} - it will look short/tight."
            )
    elif p_idx is not None and buyer_m:
        # Compare buyer chest/waist against product size chart defaults
        chart = SIZE_TO_MEASUREMENTS.get(normalize_size(product_size) or "", {})
        if chart:
            chest = buyer_m.get("chest")
            waist = buyer_m.get("waist")
            hip = buyer_m.get("hip")
            mismatches = []
            if chest is not None and chest > chart["chest"] + 4:
                mismatches.append("chest")
            if waist is not None and waist > chart["waist"] + 4:
                mismatches.append("waist")
            if hip is not None and hip > chart["hip"] + 4:
                mismatches.append("hip")
            if chest is not None and chest < chart["chest"] - 6:
                mismatches.append("chest_loose")
            if mismatches and any(m != "chest_loose" for m in mismatches):
                verdict = "TOO_SMALL"
                confidence = 0.7
                reasons.append(
                    "Your measurements exceed this product's typical "
                    f"{normalize_size(product_size)} size chart "
                    f"({', '.join(m for m in mismatches if m != 'chest_loose')})."
                )
            elif "chest_loose" in mismatches:
                verdict = "TOO_LARGE"
                confidence = 0.65
                reasons.append(
                    f"Your measurements are smaller than a typical "
                    f"{normalize_size(product_size)} garment."
                )
            else:
                verdict = "FIT"
                confidence = 0.7
                reasons.append(
                    f"Your measurements align with product size "
                    f"{normalize_size(product_size)}."
                )
        else:
            reasons.append("Could not map product size to a chart; showing neutral fit.")
    else:
        reasons.append(
            "Size info incomplete — showing a standard fit preview. "
            "Add your size for a size-aware result."
        )
        confidence = 0.4

    # Wedding-dress length cue from height vs product size defaults
    if category in ("wedding_dress", "bridal_lehenga", "bridal_saree", "bridal_sharara"):
        height = buyer_m.get("height")
        p_size = normalize_size(product_size)
        if height and p_size and p_size in SIZE_TO_MEASUREMENTS:
            expected_h = SIZE_TO_MEASUREMENTS[p_size]["height"]
            if height - expected_h >= 8 and verdict == "FIT":
                verdict = "TOO_SMALL"
                confidence = max(confidence, 0.68)
                reasons.append(
                    f"At ~{int(height)} cm you are taller than this {p_size} design "
                    "is typically cut for — hem/length may look short."
                )
            elif expected_h - height >= 8 and verdict == "FIT":
                verdict = "TOO_LARGE"
                confidence = max(confidence, 0.65)
                reasons.append(
                    f"At ~{int(height)} cm this {p_size} design may look long/oversized."
                )

    scale = FIT_SCALE[verdict]
    # Amplify scale for larger letter-size gaps
    if size_delta >= 2:
        scale = max(0.55, 0.72 - 0.05 * (size_delta - 1))
    elif size_delta <= -2:
        scale = min(1.45, 1.28 + 0.05 * (abs(size_delta) - 1))

    labels = {
        "FIT": "Looks like a good fit",
        "TOO_SMALL": "Looks too small for you",
        "TOO_LARGE": "Looks too large for you",
    }

    return {
        "verdict": verdict,
        "label": labels[verdict],
        "confidence": round(confidence, 3),
        "size_delta": size_delta,
        "product_size": normalize_size(product_size),
        "buyer_size": normalize_size(buyer_size),
        "buyer_measurements": buyer_m,
        "garment_scale": round(scale, 3),
        "reasons": reasons,
        "category": category or "",
    }
