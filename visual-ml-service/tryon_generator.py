"""
Size-Aware Virtual Try-On Generator
===================================
Produces a try-on preview of a person wearing a wedding garment.

Providers:
  1. local  — size-aware generative composite (always available, offline)
  2. fal    — fal.ai generative VTON when FAL_KEY is set (TRYON_PROVIDER=fal)

The local provider is intentionally size-aware: garment scale / placement
changes with the fit verdict so "too small" and "too large" are visible.
"""

from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import requests
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

from size_fit_engine import evaluate_fit

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRYON_OUT_DIR = os.path.join(BASE_DIR, "uploads", "tryon")
os.makedirs(TRYON_OUT_DIR, exist_ok=True)

PROVIDER = (os.environ.get("TRYON_PROVIDER") or "local").strip().lower()
FAL_KEY = os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY") or ""


def _open_rgb(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    return img.convert("RGBA")


def _estimate_person_box(person: Image.Image) -> tuple[int, int, int, int]:
    """
    Rough foreground bbox using luminance + saturation heuristic.
    Good enough for size-aware placement without an extra pose model.
    """
    w, h = person.size
    arr = np.asarray(person.convert("RGB")).astype(np.float32)
    # Prefer mid-frame subject (exclude heavy backgrounds)
    y0, y1 = int(h * 0.05), int(h * 0.98)
    x0, x1 = int(w * 0.12), int(w * 0.88)
    crop = arr[y0:y1, x0:x1]
    lum = crop.mean(axis=2)
    sat = crop.max(axis=2) - crop.min(axis=2)
    mask = (sat > 18) & (lum > 25) & (lum < 245)
    ys, xs = np.where(mask)
    if len(xs) < 200:
        # Fallback: central body column
        return int(w * 0.22), int(h * 0.08), int(w * 0.78), int(h * 0.98)
    bx0 = int(xs.min()) + x0
    bx1 = int(xs.max()) + x0
    by0 = int(ys.min()) + y0
    by1 = int(ys.max()) + y0
    # Expand slightly
    pad_x = int((bx1 - bx0) * 0.04)
    pad_y = int((by1 - by0) * 0.02)
    return (
        max(0, bx0 - pad_x),
        max(0, by0 - pad_y),
        min(w, bx1 + pad_x),
        min(h, by1 + pad_y),
    )


def _prepare_garment(garment: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Resize garment into an RGBA cutout-ish plate (soft alpha edges)."""
    g = garment.convert("RGBA")
    g.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)

    # Soften edges: boost alpha near non-white pixels
    arr = np.asarray(g).astype(np.float32)
    rgb = arr[:, :, :3]
    # Treat near-white / near-gray studio backgrounds as transparent-ish
    near_white = (rgb > 235).all(axis=2)
    low_sat = (rgb.max(axis=2) - rgb.min(axis=2)) < 12
    alpha = arr[:, :, 3]
    alpha[near_white & low_sat] = alpha[near_white & low_sat] * 0.15
    # Keep garment body opaque
    alpha = np.clip(alpha, 0, 255)
    arr[:, :, 3] = alpha
    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    # Feather
    a = out.split()[-1].filter(ImageFilter.GaussianBlur(1.2))
    out.putalpha(a)
    return out


def _badge_color(verdict: str) -> tuple[int, int, int, int]:
    return {
        "FIT": (16, 185, 129, 220),       # green
        "TOO_SMALL": (239, 68, 68, 220),  # red
        "TOO_LARGE": (245, 158, 11, 220), # amber
    }.get(verdict, (99, 102, 241, 220))


def _draw_overlay(canvas: Image.Image, fit: dict) -> Image.Image:
    draw = ImageDraw.Draw(canvas, "RGBA")
    w, h = canvas.size
    label = fit["label"]
    verdict = fit["verdict"]
    conf = int(round(fit["confidence"] * 100))

    # Top banner
    banner_h = max(42, h // 16)
    draw.rectangle([0, 0, w, banner_h], fill=(15, 10, 20, 200))
    color = _badge_color(verdict)
    draw.rounded_rectangle(
        [12, 8, min(w - 12, 12 + 280), banner_h - 8],
        radius=12,
        fill=color,
    )
    try:
        font = ImageFont.truetype("arial.ttf", size=max(14, banner_h // 3))
        small = ImageFont.truetype("arial.ttf", size=max(11, banner_h // 4))
    except Exception:
        font = ImageFont.load_default()
        small = font

    draw.text((24, banner_h // 2 - 8), f"{label}  ·  {conf}%", fill=(255, 255, 255, 255), font=font)

    # Corner size chips
    ps = fit.get("product_size") or "?"
    bs = fit.get("buyer_size") or "?"
    chip = f"You: {bs}   Dress: {ps}"
    tw = int(w * 0.42)
    draw.rounded_rectangle(
        [w - tw - 12, 8, w - 12, banner_h - 8],
        radius=12,
        fill=(255, 255, 255, 230),
    )
    draw.text((w - tw + 8, banner_h // 2 - 6), chip, fill=(40, 40, 40, 255), font=small)

    # Fit cue lines for mismatch
    if verdict == "TOO_SMALL":
        # Short-hem cue near lower garment
        y = int(h * 0.62)
        draw.line([(int(w * 0.28), y), (int(w * 0.72), y)], fill=(239, 68, 68, 180), width=3)
        draw.text((int(w * 0.30), y + 6), "Hem sits high — length short for you", fill=(239, 68, 68, 230), font=small)
    elif verdict == "TOO_LARGE":
        y = int(h * 0.88)
        draw.line([(int(w * 0.22), y), (int(w * 0.78), y)], fill=(245, 158, 11, 180), width=3)
        draw.text((int(w * 0.24), y + 6), "Extra length / oversized drape", fill=(180, 100, 0, 230), font=small)

    return canvas


def generate_local_tryon(
    person_bytes: bytes,
    garment_bytes: bytes,
    fit: dict,
) -> Image.Image:
    """
    Size-aware local try-on:
      - Estimates person torso box
      - Scales garment by fit.garment_scale (small/large/fit)
      - Soft-composites onto the person photo
      - Draws size-awareness overlays
    """
    person = _open_rgb(person_bytes)
    garment = _open_rgb(garment_bytes)

    # Normalize person canvas size for consistent output
    max_side = 900
    pw, ph = person.size
    scale = min(1.0, max_side / max(pw, ph))
    if scale < 1.0:
        person = person.resize((int(pw * scale), int(ph * scale)), Image.Resampling.LANCZOS)

    bx0, by0, bx1, by1 = _estimate_person_box(person)
    body_w = max(40, bx1 - bx0)
    body_h = max(80, by1 - by0)

    # Target garment covers upper+mid body; scale by fit verdict
    fit_scale = float(fit.get("garment_scale") or 1.0)
    target_w = int(body_w * 0.92 * fit_scale)
    target_h = int(body_h * 0.72 * fit_scale)

    plate = _prepare_garment(garment, target_w, target_h)
    gw, gh = plate.size

    # Placement: center on torso. Too-small sits higher; too-large sits lower.
    cx = (bx0 + bx1) // 2
    if fit["verdict"] == "TOO_SMALL":
        top = by0 + int(body_h * 0.10)
    elif fit["verdict"] == "TOO_LARGE":
        top = by0 + int(body_h * 0.02)
    else:
        top = by0 + int(body_h * 0.08)
    left = cx - gw // 2

    canvas = person.copy()
    # Slight darken under garment for blend realism
    shade = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade)
    shade_draw.ellipse(
        [left, top, left + gw, top + int(gh * 0.95)],
        fill=(20, 10, 20, 35),
    )
    canvas = Image.alpha_composite(canvas, shade)
    canvas.alpha_composite(plate, dest=(left, top))

    # Mild color grade so it feels "generated"
    rgb = canvas.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.06)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    out = rgb.convert("RGBA")
    out = _draw_overlay(out, fit)
    return out.convert("RGB")


def _try_fal_tryon(person_bytes: bytes, garment_bytes: bytes, fit: dict) -> Optional[Image.Image]:
    """
    Optional fal.ai generative try-on.
    Uses fal-ai/image-apps-v2/virtual-try-on when FAL_KEY is configured.
    Falls back to None on any failure so caller can use local generator.
    """
    if not FAL_KEY:
        return None
    try:
        # Upload-less path: many fal models accept data URIs; use temporary HTTP via fal storage if SDK present.
        # Minimal REST approach with base64 data URI.
        import base64

        def b64_uri(data: bytes, mime="image/jpeg") -> str:
            return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"

        # Convert inputs to JPEG bytes
        def to_jpg(data: bytes) -> bytes:
            im = Image.open(io.BytesIO(data)).convert("RGB")
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=92)
            return buf.getvalue()

        person_uri = b64_uri(to_jpg(person_bytes))
        garment_uri = b64_uri(to_jpg(garment_bytes))

        prompt_hint = {
            "FIT": "natural fitting wedding attire, correct length",
            "TOO_SMALL": "garment clearly too small, short hem, tight fit",
            "TOO_LARGE": "garment clearly too large, oversized, long hem",
        }.get(fit["verdict"], "")

        headers = {
            "Authorization": f"Key {FAL_KEY}",
            "Content-Type": "application/json",
        }
        # Queue API
        payload = {
            "model_image": person_uri,
            "garment_image": garment_uri,
            "description": prompt_hint,
        }
        # Try a commonly available fal virtual try-on endpoint
        url = "https://fal.run/fal-ai/image-apps-v2/virtual-try-on"
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        if resp.status_code >= 400:
            print(f"[tryon] fal error {resp.status_code}: {resp.text[:300]}")
            return None
        data = resp.json()
        # Expected: { images: [ { url } ] } or { image: { url } }
        image_url = None
        if isinstance(data.get("images"), list) and data["images"]:
            image_url = data["images"][0].get("url")
        elif isinstance(data.get("image"), dict):
            image_url = data["image"].get("url")
        elif isinstance(data.get("image"), str):
            image_url = data["image"]
        if not image_url:
            print("[tryon] fal response missing image url:", str(data)[:200])
            return None
        img_bytes = requests.get(image_url, timeout=60).content
        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        return _draw_overlay(img, fit).convert("RGB")
    except Exception as exc:
        print(f"[tryon] fal provider failed: {exc}")
        return None


def save_tryon_image(img: Image.Image) -> tuple[str, str]:
    """Save to uploads/tryon and return (filename, relative url)."""
    name = f"tryon_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.jpg"
    path = os.path.join(TRYON_OUT_DIR, name)
    img.convert("RGB").save(path, format="JPEG", quality=92)
    return name, f"/images/tryon/{name}"


def run_tryon(
    person_bytes: bytes,
    garment_bytes: bytes,
    *,
    product_size: str | None = None,
    buyer_size: str | None = None,
    height_cm: float | None = None,
    chest_cm: float | None = None,
    waist_cm: float | None = None,
    hip_cm: float | None = None,
    category: str | None = None,
    product_id: str | None = None,
    product_title: str | None = None,
) -> dict:
    fit = evaluate_fit(
        product_size=product_size,
        buyer_size=buyer_size,
        height_cm=height_cm,
        chest_cm=chest_cm,
        waist_cm=waist_cm,
        hip_cm=hip_cm,
        category=category,
    )

    provider_used = "local"
    img = None
    if PROVIDER == "fal":
        img = _try_fal_tryon(person_bytes, garment_bytes, fit)
        if img is not None:
            provider_used = "fal"

    if img is None:
        img = generate_local_tryon(person_bytes, garment_bytes, fit)
        provider_used = "local"

    filename, url = save_tryon_image(img)
    return {
        "success": True,
        "provider": provider_used,
        "result_image_url": url,
        "filename": filename,
        "fit": fit,
        "product_id": product_id,
        "product_title": product_title,
        "message": fit["label"],
    }
