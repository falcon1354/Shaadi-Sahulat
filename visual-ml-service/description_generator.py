"""
ShaadiSahulat - Automatic Dress Description Generator
======================================================
Generates natural-language descriptions from dress images using:

  1. Dominant-colour detection  — HSV analysis of pixel histogram
  2. Embroidery-density estimate — texture variance (grayscale std-dev)
  3. Template assembly          — "{colour} {category} with {density} embroidery …"

No heavy ML model required — pure PIL / NumPy.
Descriptions feed the TF-IDF engine for text-based similarity.

Example outputs
---------------
  "deep red bridal lehenga with heavy embroidery and intricate patterns"
  "golden bridal sharara with medium embroidery and elegant detailing"
  "ivory bridal saree with light embroidery and delicate border work"
  "navy groom sherwani with medium embroidery and classic styling"
"""

import colorsys
import numpy as np
from PIL import Image


# ── Colour mapping table ───────────────────────────────────────────────────
# Each row: (hue_min°, hue_max°, sat_min, val_min, colour_name)
# Hue is in [0, 360]. Saturation & Value in [0, 1].
_COLOUR_MAP = [
    # Reds (wrap-around handled separately)
    (  0,  12, 0.35, 0.25, "deep red"),
    (348, 360, 0.35, 0.25, "deep red"),
    ( 12,  20, 0.35, 0.25, "crimson"),
    # Oranges / peachy
    ( 20,  38, 0.45, 0.30, "peach"),
    ( 38,  48, 0.50, 0.30, "orange"),
    # Yellows / golds
    ( 48,  58, 0.45, 0.35, "golden"),
    ( 58,  70, 0.40, 0.35, "mustard"),
    # Greens
    ( 70,  90, 0.30, 0.25, "lime green"),
    ( 90, 160, 0.25, 0.20, "green"),
    # Teals / cyans
    (160, 195, 0.30, 0.20, "teal"),
    # Blues
    (195, 230, 0.30, 0.20, "royal blue"),
    (230, 255, 0.25, 0.20, "navy blue"),
    # Purples / lavenders
    (255, 280, 0.25, 0.20, "purple"),
    (280, 300, 0.25, 0.20, "mauve"),
    # Pinks / hot pinks
    (300, 325, 0.35, 0.30, "hot pink"),
    (325, 348, 0.35, 0.25, "rose pink"),
]


def _pixel_to_colour_name(h: float, s: float, v: float) -> str:
    """Map a single HSV triplet (h in [0,1]) to a human colour name."""
    # Achromatic: black, white, silver, grey
    if v < 0.12:
        return "black"
    if v > 0.88 and s < 0.18:
        return "ivory"
    if s < 0.18:
        return "silver grey" if v > 0.55 else "charcoal"

    h_deg = h * 360.0
    for h_min, h_max, s_min, v_min, name in _COLOUR_MAP:
        if h_min <= h_deg < h_max and s >= s_min and v >= v_min:
            return name

    return "multicolour"


def detect_dominant_colour(image_input) -> dict:
    """
    Detect the dominant colour of a dress image.

    Parameters
    ----------
    image_input : str or PIL.Image
        File path or already-opened PIL image.

    Returns
    -------
    dict
        {"name": str, "hue": float, "saturation": float, "brightness": float}
    """
    if isinstance(image_input, str):
        img = Image.open(image_input).convert("RGB")
    else:
        img = image_input.convert("RGB")

    # Downsample for speed
    img = img.resize((80, 80), Image.LANCZOS)
    pixels = np.array(img).reshape(-1, 3).astype(float) / 255.0

    # Convert each pixel to HSV
    hsv = np.array([colorsys.rgb_to_hsv(r, g, b) for r, g, b in pixels])
    # h, s, v columns

    # Remove near-white background (common studio backdrop)
    foreground_mask = ~((hsv[:, 2] > 0.88) & (hsv[:, 1] < 0.18))
    hsv_fg = hsv[foreground_mask] if foreground_mask.sum() > 30 else hsv

    # Weight pixels by saturation so grey/white outliers have little influence
    weights = hsv_fg[:, 1] + 0.05
    avg_h = float(np.average(hsv_fg[:, 0], weights=weights))
    avg_s = float(np.average(hsv_fg[:, 1], weights=weights))
    avg_v = float(np.average(hsv_fg[:, 2], weights=weights))

    colour_name = _pixel_to_colour_name(avg_h, avg_s, avg_v)

    return {
        "name":       colour_name,
        "hue":        round(avg_h * 360, 1),
        "saturation": round(avg_s, 3),
        "brightness": round(avg_v, 3),
    }


def detect_embroidery_density(image_input) -> str:
    """
    Estimate embroidery/decoration density via texture variance.

    Higher pixel standard-deviation in grayscale → more complex texture
    → heavier embroidery.

    Returns: "heavy" | "medium" | "light"
    """
    if isinstance(image_input, str):
        img = Image.open(image_input).convert("L")
    else:
        img = image_input.convert("L")

    img = img.resize((80, 80), Image.LANCZOS)
    arr = np.array(img, dtype=float)
    std = float(np.std(arr))

    if std > 52:
        return "heavy"
    if std > 33:
        return "medium"
    return "light"


def generate_description(image_input, category_id: str, category_label: str) -> dict:
    """
    Generate a natural-language description of a dress image.

    Parameters
    ----------
    image_input   : local file path (str) OR an already-opened PIL Image
    category_id   : e.g. "bridal_lehenga"
    category_label: e.g. "Bridal Lehenga"

    Returns
    -------
    dict with keys:
        description (str)        — full sentence
        keywords    (list[str])  — important terms for TF-IDF
        color_info  (dict)       — name, hue, saturation, brightness
        embroidery_density (str) — "heavy" | "medium" | "light"
    """
    try:
        colour_info = detect_dominant_colour(image_input)
        density     = detect_embroidery_density(image_input)
    except Exception:
        colour_info = {"name": "beautiful", "hue": 0, "saturation": 0, "brightness": 0}
        density     = "medium"

    colour = colour_info["name"]
    cat_lower = category_label.lower()

    # Different sentence endings for bridal vs groom
    if "groom" in category_id:
        ending = "elegant styling and classic craftsmanship"
    else:
        # Vary ending by embroidery density
        endings = {
            "heavy":  "intricate embroidery and ornate patterns",
            "medium": "delicate embroidery and refined detailing",
            "light":  "subtle embroidery and graceful border work",
        }
        ending = endings[density]

    description = f"{colour} {cat_lower} with {density} embroidery and {ending}"

    # Keywords for TF-IDF: all meaningful tokens, deduplicated
    keywords = list({
        colour,
        *colour.split(),              # split "deep red" → ["deep", "red"]
        cat_lower,
        *cat_lower.split(),           # split "bridal lehenga" → [...]
        category_id.replace("_", " "),
        density,
        "embroidery",
        "bridal" if "bridal" in category_id else "groom",
        "wedding",
        "dress",
        "Pakistani",
        "ethnic",
    })

    return {
        "description":        description,
        "keywords":           [k for k in keywords if len(k) > 2],
        "color_info":         colour_info,
        "embroidery_density": density,
    }
