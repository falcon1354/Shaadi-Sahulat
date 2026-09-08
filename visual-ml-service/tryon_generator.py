"""
Size-Aware Virtual Try-On Generator
===================================
Produces a try-on preview of a person wearing a wedding garment.

Providers:
  1. local  — size-aware generative composite (always available, offline)
  2. kling  — Kling AI Kolors virtual try-on (TRYON_PROVIDER=kling)
  3. fal    — legacy fal.ai VTON (TRYON_PROVIDER=fal)

The local provider is intentionally size-aware: garment scale / placement
changes with the fit verdict so "too small" and "too large" are visible.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import time
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

# Kling AI — Bearer API key OR Access Key + Secret Key (JWT)
KLING_API_KEY = (os.environ.get("KLING_API_KEY") or "").strip()
KLING_ACCESS_KEY = (os.environ.get("KLING_ACCESS_KEY") or "").strip()
KLING_SECRET_KEY = (os.environ.get("KLING_SECRET_KEY") or "").strip()
KLING_API_BASE = (os.environ.get("KLING_API_BASE") or "https://api.klingai.com").rstrip("/")
KLING_MODEL = (os.environ.get("KLING_TRYON_MODEL") or "kolors-virtual-try-on-v1-5").strip()
KLING_POLL_INTERVAL_SEC = float(os.environ.get("KLING_POLL_INTERVAL_SEC") or "2")
KLING_POLL_TIMEOUT_SEC = float(os.environ.get("KLING_POLL_TIMEOUT_SEC") or "180")


def kling_configured() -> bool:
    return bool(KLING_API_KEY or (KLING_ACCESS_KEY and KLING_SECRET_KEY))


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


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _kling_jwt(access_key: str, secret_key: str) -> str:
    """HS256 JWT for official Kling Open Platform (Access Key + Secret Key)."""
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    now = int(time.time())
    payload = _b64url(
        json.dumps(
            {"iss": access_key, "exp": now + 1800, "nbf": now - 5},
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    sig = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


def _kling_auth_header() -> Optional[str]:
    if KLING_API_KEY:
        return f"Bearer {KLING_API_KEY}"
    if KLING_ACCESS_KEY and KLING_SECRET_KEY:
        return f"Bearer {_kling_jwt(KLING_ACCESS_KEY, KLING_SECRET_KEY)}"
    return None


def _to_jpg_bytes(data: bytes, *, max_side: int = 1536, quality: int = 90) -> bytes:
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im).convert("RGB")
    w, h = im.size
    # Kling requires min edge >= 300px
    if min(w, h) < 300:
        scale = 300 / float(min(w, h))
        im = im.resize((max(300, int(w * scale)), max(300, int(h * scale))), Image.Resampling.LANCZOS)
        w, h = im.size
    if max(w, h) > max_side:
        scale = max_side / float(max(w, h))
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    out = buf.getvalue()
    # Keep under ~9MB for Kling base64 / upload limits
    while len(out) > 9 * 1024 * 1024 and quality > 60:
        quality -= 8
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        out = buf.getvalue()
    return out


def _kling_image_payload(data: bytes) -> str:
    """
    Prefer a public HTTPS URL (Cloudinary) so Kling can fetch the image;
    otherwise send raw base64 (no data: prefix).
    """
    jpg = _to_jpg_bytes(data)
    try:
        from cloudinary_storage import is_configured, upload_bytes

        if is_configured():
            result = upload_bytes(
                jpg,
                folder="tryon/inputs",
                filename=f"kling_{uuid.uuid4().hex[:10]}.jpg",
            )
            url = result.get("secure_url") or result.get("url")
            if url:
                return url
    except Exception as exc:
        print(f"[tryon] kling input upload skipped: {exc}")
    return base64.b64encode(jpg).decode("ascii")


def _kling_extract_image_url(task_data: dict) -> Optional[str]:
    if not isinstance(task_data, dict):
        return None
    # Official: data.task_result.images[].url
    result = task_data.get("task_result") or {}
    images = result.get("images") if isinstance(result, dict) else None
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
        if isinstance(first, str):
            return first
    # Some gateways: data.url
    if task_data.get("url"):
        return task_data["url"]
    outputs = task_data.get("outputs")
    if isinstance(outputs, list) and outputs:
        o0 = outputs[0]
        if isinstance(o0, dict) and o0.get("url"):
            return o0["url"]
    return None


def _kling_error_message(payload) -> str:
    """Normalize Kling error bodies (esp. code 1102 insufficient balance)."""
    if isinstance(payload, dict):
        code = payload.get("code")
        msg = str(payload.get("message") or payload)[:400]
        if code == 1102 or "balance" in msg.lower() or "not enough" in msg.lower():
            return (
                "Kling account balance is empty. "
                "Top up credits at https://app.klingai.com (Open Platform), then retry."
            )
        return msg
    text = str(payload)[:400]
    if "balance" in text.lower() or "1102" in text:
        return (
            "Kling account balance is empty. "
            "Top up credits at https://app.klingai.com (Open Platform), then retry."
        )
    return text


def _try_kling_tryon(
    person_bytes: bytes, garment_bytes: bytes, fit: dict
) -> tuple[Optional[Image.Image], Optional[str]]:
    """
    Kling AI Kolors virtual try-on (async create + poll).
    Returns (image_or_None, error_message_or_None).
    """
    auth = _kling_auth_header()
    if not auth:
        msg = "Kling not configured (set KLING_API_KEY or ACCESS+SECRET)."
        print(f"[tryon] {msg}")
        return None, msg

    try:
        headers = {
            "Authorization": auth,
            "Content-Type": "application/json",
        }
        print("[tryon] kling: preparing images…")
        payload = {
            "model_name": KLING_MODEL,
            "human_image": _kling_image_payload(person_bytes),
            "cloth_image": _kling_image_payload(garment_bytes),
        }
        create_url = f"{KLING_API_BASE}/v1/images/kolors-virtual-try-on"
        print(f"[tryon] kling: POST {create_url}")
        resp = requests.post(create_url, headers=headers, json=payload, timeout=60)
        if resp.status_code >= 400:
            try:
                msg = _kling_error_message(resp.json())
            except Exception:
                msg = _kling_error_message(resp.text)
            print(f"[tryon] kling create error {resp.status_code}: {msg}")
            return None, msg

        body = resp.json() if resp.content else {}
        code = body.get("code")
        if isinstance(code, int) and code != 0:
            msg = _kling_error_message(body)
            print(f"[tryon] kling create business error: {msg}")
            return None, msg

        data = body.get("data") if isinstance(body.get("data"), dict) else body
        task_id = data.get("task_id") or body.get("task_id")
        if not task_id:
            image_url = _kling_extract_image_url(data) or _kling_extract_image_url(body)
            if image_url:
                img_bytes = requests.get(image_url, timeout=60).content
                img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
                return _draw_overlay(img, fit).convert("RGB"), None
            msg = "Kling create response missing task_id"
            print(f"[tryon] {msg}:", str(body)[:300])
            return None, msg

        print(f"[tryon] kling: polling task_id={task_id}")
        poll_url = f"{KLING_API_BASE}/v1/images/kolors-virtual-try-on/{task_id}"
        deadline = time.time() + KLING_POLL_TIMEOUT_SEC
        while time.time() < deadline:
            time.sleep(KLING_POLL_INTERVAL_SEC)
            pr = requests.get(poll_url, headers=headers, timeout=30)
            if pr.status_code >= 400:
                msg = f"Kling poll error {pr.status_code}: {pr.text[:300]}"
                print(f"[tryon] {msg}")
                return None, msg
            pbody = pr.json() if pr.content else {}
            pdata = pbody.get("data") if isinstance(pbody.get("data"), dict) else pbody
            status = (
                (pdata.get("task_status") if isinstance(pdata, dict) else None)
                or pdata.get("status")
                or pbody.get("task_status")
                or ""
            )
            status = str(status).lower()
            if status in ("succeed", "succeeded", "success", "completed"):
                image_url = _kling_extract_image_url(pdata) or _kling_extract_image_url(pbody)
                if not image_url:
                    msg = "Kling succeeded but returned no image URL"
                    print(f"[tryon] {msg}:", str(pbody)[:400])
                    return None, msg
                img_bytes = requests.get(image_url, timeout=60).content
                img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
                print("[tryon] kling: success")
                return _draw_overlay(img, fit).convert("RGB"), None
            if status in ("failed", "fail", "error", "canceled", "cancelled"):
                msg = (pdata.get("task_status_msg") if isinstance(pdata, dict) else None) or str(pbody)[:300]
                print(f"[tryon] kling task failed: {msg}")
                return None, f"Kling task failed: {msg}"

        msg = f"Kling timed out after {int(KLING_POLL_TIMEOUT_SEC)}s"
        print(f"[tryon] {msg} (task_id={task_id})")
        return None, msg
    except Exception as exc:
        msg = f"Kling provider failed: {exc}"
        print(f"[tryon] {msg}")
        return None, msg


def _try_fal_tryon(person_bytes: bytes, garment_bytes: bytes, fit: dict) -> Optional[Image.Image]:
    """Legacy fal.ai generative try-on (optional)."""
    if not FAL_KEY:
        return None
    try:
        def b64_uri(data: bytes, mime="image/jpeg") -> str:
            return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"

        person_uri = b64_uri(_to_jpg_bytes(person_bytes))
        garment_uri = b64_uri(_to_jpg_bytes(garment_bytes))

        prompt_hint = {
            "FIT": "natural fitting wedding attire, correct length",
            "TOO_SMALL": "garment clearly too small, short hem, tight fit",
            "TOO_LARGE": "garment clearly too large, oversized, long hem",
        }.get(fit["verdict"], "")

        headers = {
            "Authorization": f"Key {FAL_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model_image": person_uri,
            "garment_image": garment_uri,
            "description": prompt_hint,
        }
        url = "https://fal.run/fal-ai/image-apps-v2/virtual-try-on"
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        if resp.status_code >= 400:
            print(f"[tryon] fal error {resp.status_code}: {resp.text[:300]}")
            return None
        data = resp.json()
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
    """Save to uploads/tryon (and Cloudinary when configured); return (filename, url)."""
    name = f"tryon_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.jpg"
    path = os.path.join(TRYON_OUT_DIR, name)
    img.convert("RGB").save(path, format="JPEG", quality=92)
    url = f"/images/tryon/{name}"
    try:
        from cloudinary_storage import is_configured, upload_file
        if is_configured():
            result = upload_file(path, folder="tryon", public_id=os.path.splitext(name)[0])
            url = result.get("secure_url") or url
    except Exception as exc:
        print(f"[tryon] Cloudinary upload skipped: {exc}")
    return name, url


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
    fallback_reason = None
    img = None
    if PROVIDER == "kling":
        img, fallback_reason = _try_kling_tryon(person_bytes, garment_bytes, fit)
        if img is not None:
            provider_used = "kling"
            fallback_reason = None
    elif PROVIDER == "fal":
        img = _try_fal_tryon(person_bytes, garment_bytes, fit)
        if img is not None:
            provider_used = "fal"
        else:
            fallback_reason = "fal.ai try-on failed"

    if img is None:
        img = generate_local_tryon(person_bytes, garment_bytes, fit)
        provider_used = "local"

    filename, url = save_tryon_image(img)
    return {
        "success": True,
        "provider": provider_used,
        "requested_provider": PROVIDER,
        "provider_fallback_reason": fallback_reason,
        "result_image_url": url,
        "filename": filename,
        "fit": fit,
        "product_id": product_id,
        "product_title": product_title,
        "message": fit["label"],
    }
