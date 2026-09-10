"""
Dress embedding helpers — EfficientNet vectors stored on seller_products in MongoDB.

Used by:
  - seller upload (already embeds wedding_dress)
  - scrape_catalog / scrape_thrift (call after insert)
  - backfill_dress_embeddings.py (one-shot for existing scraped/missing)
  - POST /visual/backfill-dress-embeddings
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import requests

_HAS_TORCH = False
try:
    import torch
    import torchvision.transforms as transforms
    from PIL import Image

    _HAS_TORCH = True
except ImportError:
    torch = None
    transforms = None
    Image = None

from config import MODEL_DIR, BACKBONE, UPLOADS_DIR, PRODUCTS_COLLECTION
from filename_utils import generate_image_record, save_image_bytes
from tfidf_engine import description_to_tfidf_dict

_MODEL = {"m": None}
_TRANSFORM = None

if _HAS_TORCH:
    _TRANSFORM = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


def has_torch() -> bool:
    return _HAS_TORCH


def get_model():
    if not _HAS_TORCH:
        return None
    if _MODEL["m"] is None:
        from model import load_model_for_inference

        _MODEL["m"] = load_model_for_inference(MODEL_DIR, BACKBONE)
    return _MODEL["m"]


def extract_embedding_from_path(image_path: str, model=None) -> Optional[list[float]]:
    if not _HAS_TORCH or not image_path or not os.path.isfile(image_path):
        return None
    model = model or get_model()
    if model is None:
        return None
    try:
        image = Image.open(image_path).convert("RGB")
        tensor = _TRANSFORM(image).unsqueeze(0)
        model.eval()
        with torch.no_grad():
            emb = model.get_backbone_features(tensor)
        return emb.cpu().numpy().flatten().tolist()
    except Exception as exc:
        print(f"[dress_embed] path failed {image_path}: {exc}")
        return None


def download_image_to_temp(url: str, timeout: int = 25) -> Optional[str]:
    if not url or not str(url).startswith(("http://", "https://")):
        return None
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": "ShaadiSahulat-EmbedBot/1.0"},
            stream=True,
        )
        if resp.status_code >= 400:
            return None
        ctype = (resp.headers.get("Content-Type") or "").lower()
        ext = ".jpg"
        if "png" in ctype:
            ext = ".png"
        elif "webp" in ctype:
            ext = ".webp"
        else:
            path = urlparse(url).path.lower()
            if path.endswith(".png"):
                ext = ".png"
            elif path.endswith(".webp"):
                ext = ".webp"
        fd, tmp = tempfile.mkstemp(suffix=ext, prefix="dress_emb_")
        os.close(fd)
        with open(tmp, "wb") as f:
            for chunk in resp.iter_content(65536):
                if chunk:
                    f.write(chunk)
        return tmp
    except Exception as exc:
        print(f"[dress_embed] download failed {url[:80]}: {exc}")
        return None


def _resolve_local_path(rec: dict) -> Optional[str]:
    abs_path = rec.get("abs_path") or ""
    if abs_path and os.path.isfile(abs_path):
        return abs_path
    rel = rec.get("relative_path") or ""
    if rel:
        candidate = os.path.join(UPLOADS_DIR, rel.replace("/", os.sep))
        if os.path.isfile(candidate):
            return candidate
    return None


def _materialize_product_image(doc: dict, model=None) -> tuple[Optional[str], list[dict], Optional[str]]:
    """
    Ensure a local image file exists for embedding.
    Returns (local_path, updated_images_list_or_empty, image_id).
    May download remote URL and write under uploads/ + update images[].
    """
    product_id = doc.get("product_id") or "unknown"
    item_type = doc.get("item_type") or doc.get("category") or "wedding_dress"
    storage_cat = item_type if item_type else "wedding_dress"
    images = list(doc.get("images") or [])

    # Prefer existing local records
    for rec in images:
        local = _resolve_local_path(rec)
        if local:
            return local, [], rec.get("image_id")

    # Remote URL on images[] or primary_image_url
    url = ""
    for rec in images:
        u = rec.get("image_url") or ""
        if u.startswith("http"):
            url = u
            break
    if not url:
        url = doc.get("primary_image_url") or doc.get("image_url") or ""

    if not url.startswith("http"):
        return None, [], None

    tmp = download_image_to_temp(url)
    if not tmp:
        return None, [], None

    try:
        with open(tmp, "rb") as f:
            raw = f.read()
        original = os.path.basename(urlparse(url).path) or "image.jpg"
        rec = generate_image_record(
            original_name=original,
            category=storage_cat,
            product_id=product_id,
            is_primary=True,
        )
        save_image_bytes(rec, raw)
        # Keep Cloudinary/remote URL as public image_url if it was HTTPS
        if url.startswith("https://"):
            rec["image_url"] = url
            rec["source_url"] = url
        image_id = rec["image_id"]
        # Merge into images list for caller to persist
        new_images = [rec]
        for old in images:
            if not old.get("is_primary"):
                new_images.append(old)
        return rec.get("abs_path"), new_images, image_id
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def product_needs_embedding(doc: dict) -> bool:
    if (doc.get("major_category") or "").lower() != "wedding_dress":
        return False
    embs = doc.get("image_embeddings") or []
    if not embs:
        return True
    first = embs[0].get("embedding") if isinstance(embs[0], dict) else None
    return not (isinstance(first, list) and len(first) > 10)


def embed_dress_product(doc: dict, model=None, db=None) -> dict:
    """
    Compute EfficientNet embedding for a wedding_dress product and store on MongoDB.
    Returns {ok, product_id, reason?, embeddings}.
    """
    from mongo_seller import _get_db

    product_id = doc.get("product_id")
    if not product_id:
        return {"ok": False, "reason": "missing product_id"}
    if (doc.get("major_category") or "").lower() != "wedding_dress":
        return {"ok": False, "product_id": product_id, "reason": "not_wedding_dress"}
    if not _HAS_TORCH:
        return {"ok": False, "product_id": product_id, "reason": "torch_unavailable"}

    model = model or get_model()
    if model is None:
        return {"ok": False, "product_id": product_id, "reason": "model_load_failed"}

    local_path, updated_images, image_id = _materialize_product_image(doc, model)
    if not local_path:
        return {"ok": False, "product_id": product_id, "reason": "no_image"}

    emb = extract_embedding_from_path(local_path, model)
    if not emb:
        return {"ok": False, "product_id": product_id, "reason": "embed_failed"}

    if not image_id:
        image_id = str(uuid.uuid4())

    image_embeddings = [{"image_id": image_id, "embedding": emb}]
    description = doc.get("description") or doc.get("title") or ""
    tfidf_vec = description_to_tfidf_dict(description)

    patch = {
        "image_embeddings": image_embeddings,
        "tfidf_vector": tfidf_vec,
        "updated_at": datetime.now(timezone.utc),
    }
    if updated_images:
        patch["images"] = updated_images
        primary = updated_images[0].get("image_url") or doc.get("primary_image_url") or ""
        if primary:
            patch["primary_image_url"] = primary
            patch["image_url"] = primary

    database = db
    if database is None:
        database = _get_db()
    if database is None:
        return {"ok": False, "product_id": product_id, "reason": "db_unavailable"}

    database[PRODUCTS_COLLECTION].update_one(
        {"product_id": product_id},
        {"$set": patch},
    )
    return {
        "ok": True,
        "product_id": product_id,
        "embeddings": 1,
        "dims": len(emb),
    }


def backfill_dress_embeddings(
    *,
    force: bool = False,
    limit: int = 0,
    marketplace_type: Optional[str] = None,
) -> dict:
    """
    Embed all wedding_dress products (new + thrift) missing vectors (or all if force).
    Embeddings are written to MongoDB seller_products only.
    """
    from mongo_seller import _get_db, ensure_seller_indexes
    from embedding_index import invalidate_cache

    ensure_seller_indexes()
    db = _get_db()
    if db is None:
        return {"ok": False, "error": "MongoDB unavailable"}

    if not _HAS_TORCH:
        return {"ok": False, "error": "PyTorch not available in this environment"}

    query: dict = {"major_category": "wedding_dress"}
    if marketplace_type in ("new", "thrift"):
        query["marketplace_type"] = marketplace_type

    cursor = db[PRODUCTS_COLLECTION].find(query, {"_id": 0})
    docs = list(cursor)
    if not force:
        docs = [d for d in docs if product_needs_embedding(d)]
    if limit and limit > 0:
        docs = docs[:limit]

    model = get_model()
    ok = 0
    fail = 0
    errors: list[dict] = []

    print(f"[dress_embed] backfill {len(docs)} wedding_dress product(s)…")
    for i, doc in enumerate(docs, 1):
        result = embed_dress_product(doc, model=model, db=db)
        pid = doc.get("product_id")
        if result.get("ok"):
            ok += 1
            print(f"  [{i}/{len(docs)}] OK  {pid}")
        else:
            fail += 1
            reason = result.get("reason", "unknown")
            errors.append({"product_id": pid, "reason": reason})
            print(f"  [{i}/{len(docs)}] FAIL {pid}: {reason}")

    invalidate_cache()
    return {
        "ok": True,
        "processed": len(docs),
        "embedded": ok,
        "failed": fail,
        "errors": errors[:50],
    }
