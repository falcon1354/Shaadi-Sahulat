"""
ShaadiSahulat - UUID-based Filename Utilities
=============================================
Single source of truth for seller image filenames.
When Cloudinary is configured, files are uploaded under
shaadisahulat/products/{category}/{product_id}/ and image_url
becomes the Cloudinary HTTPS URL. A local copy is still written
under uploads/ so embedding extraction can read the file.
"""

import os
import uuid
from datetime import datetime

from config import UPLOADS_DIR

try:
    from cloudinary_storage import is_configured as cloudinary_ready, upload_bytes as cloudinary_upload
except Exception:
    def cloudinary_ready():
        return False

    def cloudinary_upload(*_a, **_k):
        raise RuntimeError("cloudinary_storage unavailable")


def generate_image_record(
    original_name: str,
    category: str,
    product_id: str,
    is_primary: bool = False,
) -> dict:
    """
    Create a complete image record dict and prepare the destination path.

    Returns dict with keys:
        image_id, original_name, stored_filename, relative_path, abs_path,
        image_url, is_primary, uploaded_at
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
    """Write image bytes locally, then mirror to Cloudinary when configured."""
    with open(record["abs_path"], "wb") as fh:
        fh.write(image_bytes)

    if not cloudinary_ready():
        return

    folder = f"products/{record['relative_path'].rsplit('/', 1)[0]}"
    public_id = os.path.splitext(record["stored_filename"])[0]
    result = cloudinary_upload(
        image_bytes,
        folder=folder,
        public_id=public_id,
        filename=record.get("original_name") or record["stored_filename"],
        resource_type="image",
    )
    record["image_url"] = result.get("secure_url") or record["image_url"]
    record["cloudinary_public_id"] = result.get("public_id", "")


def delete_image_file(record: dict) -> bool:
    """Delete the local image file. Returns True if deleted, False if not found."""
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
