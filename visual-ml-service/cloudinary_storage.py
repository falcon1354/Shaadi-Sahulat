"""
Cloudinary storage helpers for ShaadiSahulat visual-ml-service.
Mirrors local uploads/ layout under cloud folder shaadisahulat/.
"""

from __future__ import annotations

import os
import tempfile
from typing import Optional

import cloudinary
import cloudinary.uploader

ROOT = "shaadisahulat"


def _configure() -> bool:
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
    if not (cloud_name and api_key and api_secret):
        return False
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )
    return True


def is_configured() -> bool:
    return bool(
        os.environ.get("CLOUDINARY_CLOUD_NAME")
        and os.environ.get("CLOUDINARY_API_KEY")
        and os.environ.get("CLOUDINARY_API_SECRET")
    )


def upload_bytes(
    data: bytes,
    *,
    folder: str,
    public_id: Optional[str] = None,
    filename: Optional[str] = None,
    resource_type: str = "image",
) -> dict:
    """Upload raw bytes; returns Cloudinary result with secure_url."""
    if not _configure():
        raise RuntimeError("Cloudinary is not configured (missing CLOUDINARY_* env vars)")

    asset_folder = folder if folder.startswith(ROOT) else f"{ROOT}/{folder}".replace("//", "/")
    opts = {
        "asset_folder": asset_folder,
        "use_asset_folder_as_public_id_prefix": True,
        "resource_type": resource_type,
        "overwrite": bool(public_id),
        "unique_filename": not bool(public_id),
    }
    if public_id:
        opts["public_id"] = public_id
    if filename:
        opts["use_filename"] = True
        opts["filename_override"] = filename

    # cloudinary SDK accepts file-like objects
    with tempfile.NamedTemporaryFile(suffix=_ext(filename), delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        return cloudinary.uploader.upload(tmp_path, **opts)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def upload_file(
    file_path: str,
    *,
    folder: str,
    public_id: Optional[str] = None,
    resource_type: str = "image",
) -> dict:
    if not _configure():
        raise RuntimeError("Cloudinary is not configured (missing CLOUDINARY_* env vars)")
    asset_folder = folder if folder.startswith(ROOT) else f"{ROOT}/{folder}".replace("//", "/")
    opts = {
        "asset_folder": asset_folder,
        "use_asset_folder_as_public_id_prefix": True,
        "resource_type": resource_type,
        "overwrite": bool(public_id),
    }
    if public_id:
        opts["public_id"] = public_id
    return cloudinary.uploader.upload(file_path, **opts)


def _ext(filename: Optional[str]) -> str:
    if not filename:
        return ".jpg"
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext else ".jpg"
