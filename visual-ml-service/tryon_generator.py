"""
Size-Aware Virtual Try-On Generator
===================================
Produces a try-on preview of a person wearing a wedding garment.

Providers:
  1. local       — size-aware generative composite (always available, offline)
  2. kling_omni  — Kling Omni / multi-image (Image Generation package)
                   person + dress + fixed try-on prompt (Nano Banana-style)
  3. kling_vton  — Kling Kolors dedicated virtual try-on (separate billing)
  4. fal         — legacy fal.ai VTON

Alias: TRYON_PROVIDER=kling → same as kling_omni.

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
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from size_fit_engine import evaluate_fit

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRYON_OUT_DIR = os.path.join(BASE_DIR, "uploads", "tryon")
os.makedirs(TRYON_OUT_DIR, exist_ok=True)

PROVIDER = (os.environ.get("TRYON_PROVIDER") or "local").strip().lower()
if PROVIDER == "kling":
    # "kling" now means Omni multi-image (uses Image Generation package)
    PROVIDER = "kling_omni"

FAL_KEY = os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY") or ""

# Kling AI — Bearer API key OR Access Key + Secret Key (JWT)
KLING_API_KEY = (os.environ.get("KLING_API_KEY") or "").strip()
KLING_ACCESS_KEY = (os.environ.get("KLING_ACCESS_KEY") or "").strip()
KLING_SECRET_KEY = (os.environ.get("KLING_SECRET_KEY") or "").strip()
KLING_API_BASE = (os.environ.get("KLING_API_BASE") or "https://api.klingai.com").rstrip("/")
# Dedicated Kolors VTON (separate product)
KLING_VTON_MODEL = (
    os.environ.get("KLING_VTON_MODEL")
    or os.environ.get("KLING_TRYON_MODEL")
    or "kolors-virtual-try-on-v1-5"
).strip()
# Omni Image model for Image Generation package
KLING_OMNI_MODEL = (os.environ.get("KLING_OMNI_MODEL") or "kling-image-o1").strip()
# omni = /v1/images/omni-image ; multi = /v1/images/multi-image2image
KLING_IMAGE_MODE = (os.environ.get("KLING_IMAGE_MODE") or "omni").strip().lower()
KLING_POLL_INTERVAL_SEC = float(os.environ.get("KLING_POLL_INTERVAL_SEC") or "2")
KLING_POLL_TIMEOUT_SEC = float(os.environ.get("KLING_POLL_TIMEOUT_SEC") or "180")

DEFAULT_TRYON_PROMPT = (
    "Virtual try-on: keep the exact same person from <<<image_1>>> "
    "(same face, body, skin tone, hair, and pose). "
    "Dress them in the wedding garment from <<<image_2>>> "
    "(preserve fabric, color, embroidery, and silhouette). "
    "Realistic full-body bridal photo, natural lighting, photorealistic, "
    "no watermark, no text overlay."
)
KLING_TRYON_PROMPT = (os.environ.get("KLING_TRYON_PROMPT") or DEFAULT_TRYON_PROMPT).strip()
# Backward-compat alias used by older VTON path
KLING_MODEL = KLING_VTON_MODEL


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
    return rgb


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
    result = task_data.get("task_result") or {}
    if not isinstance(result, dict):
        result = {}

    for key in ("images", "series_images"):
        images = result.get(key)
        if isinstance(images, list) and images:
            first = images[0]
            if isinstance(first, dict) and first.get("url"):
                return first["url"]
            if isinstance(first, str):
                return first

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
                "Kling account balance is empty for this API product. "
                "Check Resource Packages at https://app.klingai.com (Open Platform)."
            )
        return msg
    text = str(payload)[:400]
    if "balance" in text.lower() or "1102" in text:
        return (
            "Kling account balance is empty for this API product. "
            "Check Resource Packages at https://app.klingai.com (Open Platform)."
        )
    return text


def _kling_build_tryon_prompt(fit: dict) -> str:
    """Fixed try-on prompt + light fit hint so size awareness still shows."""
    prompt = KLING_TRYON_PROMPT
    verdict = (fit or {}).get("verdict") or "FIT"
    if verdict == "TOO_SMALL":
        prompt += (
            " Fit cue: the dress should look slightly too small / short / tight "
            "for this person."
        )
    elif verdict == "TOO_LARGE":
        prompt += (
            " Fit cue: the dress should look slightly too large / long / oversized "
            "for this person."
        )
    else:
        prompt += " Fit cue: the dress should fit this person naturally."
    return prompt[:2500]


def _kling_create_and_poll(
    *,
    create_path: str,
    poll_path_template: str,
    payload: dict,
    headers: dict,
    label: str,
) -> tuple[Optional[bytes], Optional[str]]:
    """
    Shared Kling async flow: POST create → poll until succeed → download image bytes.
    Returns (image_bytes, error_message).
    """
    create_url = f"{KLING_API_BASE}{create_path}"
    print(f"[tryon] {label}: POST {create_url}")
    resp = requests.post(create_url, headers=headers, json=payload, timeout=90)
    if resp.status_code >= 400:
        try:
            msg = _kling_error_message(resp.json())
        except Exception:
            msg = _kling_error_message(resp.text)
        print(f"[tryon] {label} create error {resp.status_code}: {msg}")
        return None, msg

    body = resp.json() if resp.content else {}
    code = body.get("code")
    if isinstance(code, int) and code != 0:
        msg = _kling_error_message(body)
        print(f"[tryon] {label} create business error: {msg}")
        return None, msg

    data = body.get("data") if isinstance(body.get("data"), dict) else body
    task_id = data.get("task_id") or body.get("task_id")
    if not task_id:
        image_url = _kling_extract_image_url(data) or _kling_extract_image_url(body)
        if image_url:
            return requests.get(image_url, timeout=60).content, None
        msg = f"{label} create response missing task_id"
        print(f"[tryon] {msg}:", str(body)[:300])
        return None, msg

    print(f"[tryon] {label}: polling task_id={task_id}")
    poll_url = f"{KLING_API_BASE}{poll_path_template.format(task_id=task_id)}"
    deadline = time.time() + KLING_POLL_TIMEOUT_SEC
    while time.time() < deadline:
        time.sleep(KLING_POLL_INTERVAL_SEC)
        pr = requests.get(poll_url, headers=headers, timeout=30)
        if pr.status_code >= 400:
            msg = f"{label} poll error {pr.status_code}: {pr.text[:300]}"
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
                msg = f"{label} succeeded but returned no image URL"
                print(f"[tryon] {msg}:", str(pbody)[:400])
                return None, msg
            print(f"[tryon] {label}: success")
            return requests.get(image_url, timeout=60).content, None
        if status in ("failed", "fail", "error", "canceled", "cancelled"):
            msg = (pdata.get("task_status_msg") if isinstance(pdata, dict) else None) or str(pbody)[:300]
            print(f"[tryon] {label} task failed: {msg}")
            return None, f"{label} task failed: {msg}"

    msg = f"{label} timed out after {int(KLING_POLL_TIMEOUT_SEC)}s"
    print(f"[tryon] {msg} (task_id={task_id})")
    return None, msg


def _bytes_to_tryon_image(img_bytes: bytes, fit: dict) -> Image.Image:
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def _try_kling_omni_tryon(
    person_bytes: bytes, garment_bytes: bytes, fit: dict
) -> tuple[Optional[Image.Image], Optional[str]]:
    """
    Kling Omni / multi-image try-on using Image Generation credits.
    Sends person + dress as references with a fixed virtual-try-on prompt.
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
        print("[tryon] kling_omni: preparing person + dress images…")
        person_ref = _kling_image_payload(person_bytes)
        dress_ref = _kling_image_payload(garment_bytes)
        prompt = _kling_build_tryon_prompt(fit)

        mode = KLING_IMAGE_MODE
        last_err = None

        # Prefer Omni; fall back to multi-image2image if Omni rejects the model/path
        attempts = []
        if mode == "multi":
            attempts = ["multi", "omni"]
        else:
            attempts = ["omni", "multi"]

        for attempt in attempts:
            if attempt == "omni":
                payload = {
                    "model_name": KLING_OMNI_MODEL,
                    "prompt": prompt,
                    "image_list": [
                        {"image": person_ref},
                        {"image": dress_ref},
                    ],
                    "n": 1,
                    "result_type": "single",
                    "aspect_ratio": "2:3",
                }
                img_bytes, err = _kling_create_and_poll(
                    create_path="/v1/images/omni-image",
                    poll_path_template="/v1/images/omni-image/{task_id}",
                    payload=payload,
                    headers=headers,
                    label="kling_omni",
                )
            else:
                # multi-image2image: subject images + prompt
                payload = {
                    "model_name": os.environ.get("KLING_MULTI_MODEL") or "kling-v2-1",
                    "prompt": (
                        "Virtual try-on: keep the person from the first subject image and "
                        "dress them in the wedding garment from the second subject image. "
                        "Photorealistic bridal photo, preserve face and outfit details."
                    ),
                    "subject_image_list": [
                        {"subject_image": person_ref},
                        {"subject_image": dress_ref},
                    ],
                    "n": 1,
                    "aspect_ratio": "2:3",
                }
                img_bytes, err = _kling_create_and_poll(
                    create_path="/v1/images/multi-image2image",
                    poll_path_template="/v1/images/multi-image2image/{task_id}",
                    payload=payload,
                    headers=headers,
                    label="kling_multi",
                )

            if img_bytes:
                return _bytes_to_tryon_image(img_bytes, fit), None
            last_err = err
            # If balance empty, don't bother with second mode
            if err and ("balance" in err.lower() or "not enough" in err.lower()):
                break
            print(f"[tryon] {attempt} failed ({err}); trying next mode…")

        return None, last_err or "Kling Omni/multi-image try-on failed"
    except Exception as exc:
        msg = f"Kling Omni try-on failed: {exc}"
        print(f"[tryon] {msg}")
        return None, msg


def _try_kling_vton_tryon(
    person_bytes: bytes, garment_bytes: bytes, fit: dict
) -> tuple[Optional[Image.Image], Optional[str]]:
    """
    Kling Kolors dedicated virtual try-on API (separate billing from Image Gen).
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
        print("[tryon] kling_vton: preparing images…")
        payload = {
            "model_name": KLING_VTON_MODEL,
            "human_image": _kling_image_payload(person_bytes),
            "cloth_image": _kling_image_payload(garment_bytes),
        }
        img_bytes, err = _kling_create_and_poll(
            create_path="/v1/images/kolors-virtual-try-on",
            poll_path_template="/v1/images/kolors-virtual-try-on/{task_id}",
            payload=payload,
            headers=headers,
            label="kling_vton",
        )
        if img_bytes:
            return _bytes_to_tryon_image(img_bytes, fit), None
        return None, err
    except Exception as exc:
        msg = f"Kling VTON provider failed: {exc}"
        print(f"[tryon] {msg}")
        return None, msg


# Back-compat name used by older imports / mental model
def _try_kling_tryon(person_bytes: bytes, garment_bytes: bytes, fit: dict):
    return _try_kling_omni_tryon(person_bytes, garment_bytes, fit)


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
        return Image.open(io.BytesIO(img_bytes)).convert("RGB")
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
    if PROVIDER in ("kling_omni", "kling"):
        img, fallback_reason = _try_kling_omni_tryon(person_bytes, garment_bytes, fit)
        if img is not None:
            provider_used = "kling_omni"
            fallback_reason = None
    elif PROVIDER in ("kling_vton", "kling_kolors"):
        img, fallback_reason = _try_kling_vton_tryon(person_bytes, garment_bytes, fit)
        if img is not None:
            provider_used = "kling_vton"
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
