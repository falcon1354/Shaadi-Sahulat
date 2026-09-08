"""
Size-Aware Virtual Try-On Routes
================================
POST /tryon/preview   — person photo + garment → size-aware try-on image
POST /tryon/fit       — size/measurement only → fit verdict (no image)
GET  /tryon/health    — feature status
"""

from __future__ import annotations

import os
from io import BytesIO

import requests
from flask import Blueprint, jsonify, request

from size_fit_engine import evaluate_fit, SIZE_ORDER, SIZE_TO_MEASUREMENTS
from tryon_generator import run_tryon, PROVIDER, FAL_KEY, kling_configured
from config import UPLOADS_DIR, MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION

tryon_bp = Blueprint("tryon", __name__, url_prefix="/tryon")


def _f(name: str):
    v = request.form.get(name)
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _load_garment_bytes(product_id: str | None, uploaded) -> bytes | None:
    if uploaded:
        return uploaded.read()

    if not product_id:
        return None

    # Prefer uploaded file; else fetch primary product image from Mongo + disk/URL
    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
        doc = client[MONGO_DB][PRODUCTS_COLLECTION].find_one(
            {"product_id": product_id},
            {"primary_image_url": 1, "images": 1, "title": 1, "size": 1, "major_category": 1},
        )
        client.close()
        if not doc:
            return None
        image_url = doc.get("primary_image_url") or ""
        if not image_url and doc.get("images"):
            first = doc["images"][0]
            image_url = first.get("url") if isinstance(first, dict) else str(first)
        if not image_url:
            return None
        if image_url.startswith("http"):
            r = requests.get(image_url, timeout=20)
            r.raise_for_status()
            return r.content
        # Relative /images/... served from uploads/
        rel = image_url
        if rel.startswith("/images/"):
            rel = rel[len("/images/"):]
        rel = rel.lstrip("/").replace("/", os.sep)
        path = os.path.join(UPLOADS_DIR, rel)
        if os.path.isfile(path):
            with open(path, "rb") as f:
                return f.read()
    except Exception as exc:
        print(f"[tryon] garment load failed: {exc}")
    return None


def _product_meta(product_id: str | None) -> dict:
    if not product_id:
        return {}
    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
        doc = client[MONGO_DB][PRODUCTS_COLLECTION].find_one(
            {"product_id": product_id},
            {"title": 1, "size": 1, "major_category": 1, "item_type": 1, "primary_image_url": 1},
        )
        client.close()
        return doc or {}
    except Exception:
        return {}


@tryon_bp.route("/health", methods=["GET"])
def tryon_health():
    return jsonify({
        "status": "ok",
        "feature": "size-aware-virtual-tryon",
        "provider": PROVIDER,
        "kling_configured": kling_configured(),
        "fal_configured": bool(FAL_KEY),
        "sizes_supported": SIZE_ORDER,
    })


@tryon_bp.route("/fit", methods=["POST"])
def tryon_fit_only():
    """JSON body fit check — no images required."""
    data = request.get_json(silent=True) or {}
    fit = evaluate_fit(
        product_size=data.get("product_size"),
        buyer_size=data.get("buyer_size"),
        height_cm=data.get("height_cm"),
        chest_cm=data.get("chest_cm"),
        waist_cm=data.get("waist_cm"),
        hip_cm=data.get("hip_cm"),
        category=data.get("category"),
    )
    return jsonify({"success": True, "fit": fit, "size_chart": SIZE_TO_MEASUREMENTS})


@tryon_bp.route("/preview", methods=["POST"])
def tryon_preview():
    """
    multipart/form-data:
      person          — required buyer photo
      garment         — optional garment image file
      product_id      — optional; loads garment + size from catalog
      product_size    — optional override
      buyer_size      — S/M/L/...
      height_cm, chest_cm, waist_cm, hip_cm — optional
      category        — optional (wedding_dress etc.)
    """
    person = request.files.get("person") or request.files.get("image")
    if not person:
        return jsonify({
            "success": False,
            "error": "Upload a full/half-body photo in field 'person'.",
        }), 400

    product_id = (request.form.get("product_id") or "").strip() or None
    meta = _product_meta(product_id)

    garment_file = request.files.get("garment")
    garment_bytes = _load_garment_bytes(product_id, garment_file)
    if not garment_bytes:
        return jsonify({
            "success": False,
            "error": "Provide garment image (field 'garment') or a valid product_id with images.",
        }), 400

    product_size = request.form.get("product_size") or meta.get("size") or ""
    category = (
        request.form.get("category")
        or meta.get("item_type")
        or meta.get("major_category")
        or "wedding_dress"
    )

    major = (meta.get("major_category") or request.form.get("category") or "").strip().lower()
    if product_id and major and major != "wedding_dress":
        return jsonify({
            "success": False,
            "error": "Virtual try-on is only available for wedding dresses.",
        }), 400

    try:
        person_bytes = person.read()
        result = run_tryon(
            person_bytes,
            garment_bytes,
            product_size=product_size,
            buyer_size=request.form.get("buyer_size"),
            height_cm=_f("height_cm"),
            chest_cm=_f("chest_cm"),
            waist_cm=_f("waist_cm"),
            hip_cm=_f("hip_cm"),
            category=category,
            product_id=product_id,
            product_title=meta.get("title"),
        )
        # Frontend resolves via VISUAL_ML host
        return jsonify(result)
    except Exception as exc:
        print(f"[tryon] preview failed: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500
