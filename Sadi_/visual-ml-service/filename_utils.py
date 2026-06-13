"""
ShaadiSahulat - UUID-based Filename Utilities
=============================================
Single source of truth for seller image filenames.
All image records are generated here so MongoDB and filesystem stay in sync.
"""

import os
import uuid
from datetime import datetime

from config import UPLOADS_DIR


def generate_image_record(
    original_name: str,
    category: str,
    product_id: str,
    is_primary: bool = False,
) -> dict:
    """
    Create a complete image record dict and prepare the destination path.

    Parameters
    ----------
    original_name : original filename from the upload (e.g. "my_dress.jpg")
    category      : category ID (e.g. "bridal_lehenga")
    product_id    : product ID (e.g. "sp_a1b2c3d4")
    is_primary    : True for the first / main image

    Returns
    -------
    dict with keys:
        image_id        — UUID string for this specific image
        original_name   — original filename
        stored_filename — "uuid.ext" saved on disk
        relative_path   — "bridal_lehenga/sp_xxx/uuid.ext" (relative to UPLOADS_DIR)
        abs_path        — absolute filesystem path
        image_url       — Flask-served URL e.g. "/images/bridal_lehenga/sp_xxx/uuid.ext"
        is_primary      — bool
        uploaded_at     — ISO datetime string
    """
    image_id  = str(uuid.uuid4())
    ext       = _safe_ext(original_name)
    stored_fn = f"{image_id}{ext}"

    # Directory: uploads/{category}/{product_id}/
    rel_dir   = os.path.join(category, product_id)
    rel_path  = os.path.join(rel_dir, stored_fn).replace("\\", "/")
    abs_dir   = os.path.join(UPLOADS_DIR, rel_dir)
    abs_path  = os.path.join(abs_dir, stored_fn)

    os.makedirs(abs_dir, exist_ok=True)

    return {
        "image_id":        image_id,
        "original_name":   original_name,
        "stored_filename": stored_fn,
        "relative_path":   rel_path,
        "abs_path":        abs_path,
        "image_url":       f"/images/{rel_path}",
        "is_primary":      is_primary,
        "uploaded_at":     datetime.utcnow().isoformat(),
    }


def save_image_bytes(record: dict, image_bytes: bytes) -> None:
    """Write raw image bytes to the path specified in the record."""
    with open(record["abs_path"], "wb") as fh:
        fh.write(image_bytes)


def delete_image_file(record: dict) -> bool:
    """Delete the image file. Returns True if deleted, False if not found."""
    path = record.get("abs_path") or os.path.join(
        UPLOADS_DIR, record.get("relative_path", "")
    )
    if path and os.path.exists(path):
        os.remove(path)
        return True
    return False


def product_image_dir(category: str, product_id: str) -> str:
    """Return absolute path to the product's image directory."""
    return os.path.join(UPLOADS_DIR, category, product_id)


def _safe_ext(filename: str) -> str:
    """Return lowercase extension including dot, defaulting to .jpg."""
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp"}
    return ext if ext in allowed else ".jpg"
