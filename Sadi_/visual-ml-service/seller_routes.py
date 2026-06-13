"""
ShaadiSahulat - Seller API Blueprint
=====================================
Flask Blueprint mounted at /seller.

Endpoints
---------
POST  /seller/register                  — Register a new seller
GET   /seller/profile/<seller_id>       — Get seller profile
GET   /seller/by-email?email=           — Look up seller by email
POST  /seller/product                   — Upload product with up to 5 images
GET   /seller/products?seller_id=&...   — List products (paginated)
GET   /seller/product/<product_id>      — Get single product
PUT   /seller/product/<product_id>      — Update product metadata
DELETE /seller/product/<product_id>     — Delete product + filesystem images
"""

import os
import torch
import torchvision.transforms as transforms
from PIL import Image
from flask import Blueprint, request, jsonify, current_app

from config import (
    CATEGORY_IDS, MAX_UPLOAD_SIZE_MB, IMAGE_SIZE,
    MODEL_DIR, BACKBONE,
)
from mongo_seller import (
    create_seller, get_seller, get_seller_by_email, login_seller,
    create_product, update_product_embeddings,
    get_product, list_products, update_product, delete_product,
    ensure_seller_indexes,
)
from filename_utils import generate_image_record, save_image_bytes, delete_image_file
from description_generator import generate_description
from tfidf_engine import description_to_tfidf_dict

seller_bp = Blueprint("seller", __name__, url_prefix="/seller")

# Image pre-processing transform (same as training/index)
_TRANSFORM = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


# ── Startup ────────────────────────────────────────────────────────────────

@seller_bp.before_app_request
def _setup_indexes():
    """Ensure MongoDB indexes exist on first request (idempotent)."""
    if not getattr(current_app, "_seller_indexes_done", False):
        ensure_seller_indexes()
        current_app._seller_indexes_done = True


# ── Seller Registration ────────────────────────────────────────────────────

@seller_bp.route("/register", methods=["POST"])
def register_seller():
    """
    Register a new seller account.

    JSON body:
      { "name": "string", "email": "string", "password": "string",
        "phone": "string", "city": "string" }
    """
    data = request.get_json(silent=True) or {}

    name     = (data.get("name")     or "").strip()
    email    = (data.get("email")    or "").strip()
    password = (data.get("password") or "").strip()

    if not name:
        return jsonify({"success": False, "error": "name is required"}), 400
    if not email or "@" not in email:
        return jsonify({"success": False, "error": "valid email is required"}), 400
    if not password or len(password) < 6:
        return jsonify({"success": False, "error": "password must be at least 6 characters"}), 400

    result = create_seller(
        name=name,
        email=email,
        phone=data.get("phone", ""),
        city=data.get("city", ""),
        password=password,
    )

    if result is None:
        return jsonify({"success": False, "error": "Database unavailable"}), 503
    if "error" in result:
        return jsonify({"success": False, "error": result["error"]}), 409

    return jsonify({"success": True, "seller": result}), 201


@seller_bp.route("/login", methods=["POST"])
def login_seller_route():
    """
    Seller login with email + password.

    JSON body:
      { "email": "string", "password": "string" }
    """
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"success": False, "error": "email and password are required"}), 400

    result = login_seller(email, password)
    if result is None:
        return jsonify({"success": False, "error": "Database unavailable"}), 503
    if "error" in result:
        return jsonify({"success": False, "error": result["error"]}), 401

    return jsonify({"success": True, "seller": result})


@seller_bp.route("/profile/<seller_id>", methods=["GET"])
def get_seller_profile(seller_id):
    doc = get_seller(seller_id)
    if not doc:
        return jsonify({"success": False, "error": "Seller not found"}), 404
    return jsonify({"success": True, "seller": doc})


@seller_bp.route("/by-email", methods=["GET"])
def seller_by_email():
    email = request.args.get("email", "").strip()
    if not email:
        return jsonify({"success": False, "error": "email query param required"}), 400
    doc = get_seller_by_email(email)
    if not doc:
        return jsonify({"success": False, "error": "Seller not found"}), 404
    return jsonify({"success": True, "seller": doc})


# ── Product Upload ─────────────────────────────────────────────────────────

@seller_bp.route("/product", methods=["POST"])
def upload_product():
    """
    Upload a new product with up to 5 images.

    multipart/form-data fields:
      seller_id        (required)
      title            (required)
      description      (required)
      category         (required, one of CATEGORY_IDS)
      color            (optional)
      fabric           (optional)
      embroidery_type  (optional)
      bridal_type      (optional, default "formal")
      price            (required)
      discount_price   (optional)
      stock_quantity   (optional, default 1)
      images           (1–5 image files, field name "images")
    """
    # ── Validate text fields ───────────────────────────────────────────────
    seller_id   = (request.form.get("seller_id")   or "").strip()
    title       = (request.form.get("title")       or "").strip()
    description = (request.form.get("description") or "").strip()
    category    = (request.form.get("category")    or "").strip()

    if not seller_id:
        return jsonify({"success": False, "error": "seller_id is required"}), 400
    if not title:
        return jsonify({"success": False, "error": "title is required"}), 400
    if not description:
        return jsonify({"success": False, "error": "description is required"}), 400
    if not category or category not in CATEGORY_IDS:
        return jsonify({
            "success": False,
            "error": f"category must be one of: {CATEGORY_IDS}",
        }), 400

    # Validate seller exists
    if not get_seller(seller_id):
        return jsonify({"success": False, "error": "Seller not found"}), 404

    try:
        price = float(request.form.get("price", 0))
    except ValueError:
        return jsonify({"success": False, "error": "price must be a number"}), 400

    discount_price_raw = request.form.get("discount_price")
    try:
        discount_price = float(discount_price_raw) if discount_price_raw else None
    except ValueError:
        discount_price = None

    try:
        stock_quantity = int(request.form.get("stock_quantity", 1))
    except ValueError:
        stock_quantity = 1

    # ── Validate image files ───────────────────────────────────────────────
    image_files = request.files.getlist("images")
    if not image_files or image_files[0].filename == "":
        return jsonify({"success": False, "error": "At least one image is required"}), 400
    if len(image_files) > 5:
        return jsonify({"success": False, "error": "Maximum 5 images allowed"}), 400

    for f in image_files:
        if f.content_type not in _ALLOWED_TYPES:
            return jsonify({
                "success": False,
                "error": f"Unsupported type {f.content_type!r}. Use JPG/PNG/WebP.",
            }), 400

    # ── Create product shell ───────────────────────────────────────────────
    seller_doc = get_seller(seller_id)
    product = create_product(
        seller_id=seller_id,
        seller_name=seller_doc.get("name", "") if seller_doc else "",
        title=title,
        description=description,
        category=category,
        color=request.form.get("color", ""),
        fabric=request.form.get("fabric", ""),
        embroidery_type=request.form.get("embroidery_type", ""),
        bridal_type=request.form.get("bridal_type", "formal"),
        price=price,
        discount_price=discount_price,
        stock_quantity=stock_quantity,
    )
    product_id = product["product_id"]

    # ── Save images to disk + extract embeddings ───────────────────────────
    image_records    = []
    image_embeddings = []

    try:
        model = _get_model()

        for idx, img_file in enumerate(image_files):
            image_bytes = img_file.read()
            if len(image_bytes) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                continue  # silently skip oversized files

            rec = generate_image_record(
                original_name=img_file.filename or f"image_{idx}.jpg",
                category=category,
                product_id=product_id,
                is_primary=(idx == 0),
            )
            save_image_bytes(rec, image_bytes)
            image_records.append(rec)

            # Extract 1280-dim backbone embedding
            emb = _extract_embedding(rec["abs_path"], model)
            if emb:
                image_embeddings.append({
                    "image_id":  rec["image_id"],
                    "embedding": emb,
                })

        # Generate description metadata + TF-IDF
        primary_path = image_records[0]["abs_path"] if image_records else None
        cat_label    = category.replace("_", " ").title()
        desc_data    = (
            generate_description(primary_path, category, cat_label)
            if primary_path else {"description": description, "keywords": [], "color_info": {}, "embroidery_density": "medium"}
        )
        desc_data["description"] = description  # always use seller's own text

        tfidf_vec = description_to_tfidf_dict(description)

        # Persist embeddings → set status "available"
        update_product_embeddings(
            product_id, image_records, image_embeddings, tfidf_vec, desc_data
        )

        # Invalidate the in-memory recommendation cache
        from embedding_index import invalidate_cache
        invalidate_cache()

    except Exception as exc:
        # Roll back image files on failure
        for rec in image_records:
            delete_image_file(rec)
        return jsonify({"success": False, "error": str(exc)}), 500

    return jsonify({
        "success":    True,
        "product_id": product_id,
        "images_saved": len(image_records),
        "embeddings_extracted": len(image_embeddings),
        "status":     "available",
    }), 201


# ── Product CRUD ───────────────────────────────────────────────────────────

@seller_bp.route("/products", methods=["GET"])
def list_seller_products():
    """
    GET /seller/products?seller_id=&category=&status=&page=&limit=
    """
    seller_id = request.args.get("seller_id") or None
    category  = request.args.get("category") or None
    status    = request.args.get("status") or None
    try:
        page  = int(request.args.get("page",  1))
        limit = int(request.args.get("limit", 20))
    except ValueError:
        page, limit = 1, 20

    result = list_products(seller_id, category, status, page, limit)
    return jsonify({"success": True, **result})


@seller_bp.route("/product/<product_id>", methods=["GET"])
def get_seller_product(product_id):
    doc = get_product(product_id)
    if not doc:
        return jsonify({"success": False, "error": "Product not found"}), 404
    # Remove heavy embedding arrays for API response
    doc.pop("image_embeddings", None)
    _iso_doc(doc)
    return jsonify({"success": True, "product": doc})


@seller_bp.route("/product/<product_id>", methods=["PUT"])
def update_seller_product(product_id):
    """
    Update product metadata (title, description, price, etc.).
    Does NOT re-generate embeddings — upload new images to do that.
    """
    data    = request.get_json(silent=True) or {}
    updated = update_product(product_id, data)
    if not updated:
        return jsonify({"success": False, "error": "Product not found"}), 404
    updated.pop("image_embeddings", None)
    _iso_doc(updated)
    return jsonify({"success": True, "product": updated})


@seller_bp.route("/product/<product_id>", methods=["DELETE"])
def delete_seller_product(product_id):
    """Delete product from DB and remove all associated image files."""
    doc = delete_product(product_id)
    if not doc:
        return jsonify({"success": False, "error": "Product not found"}), 404

    # Remove image files from filesystem
    deleted_files = 0
    for rec in doc.get("images", []):
        if delete_image_file(rec):
            deleted_files += 1

    # Invalidate cache
    from embedding_index import invalidate_cache
    invalidate_cache()

    return jsonify({
        "success":       True,
        "product_id":    product_id,
        "files_deleted": deleted_files,
    })


# ── Helpers ────────────────────────────────────────────────────────────────

_model_cache = {"model": None}


def _get_model():
    if _model_cache["model"] is None:
        from model import load_model_for_inference
        _model_cache["model"] = load_model_for_inference(MODEL_DIR, BACKBONE)
    return _model_cache["model"]


def _extract_embedding(image_path: str, model) -> list[float] | None:
    try:
        image  = Image.open(image_path).convert("RGB")
        tensor = _TRANSFORM(image).unsqueeze(0)
        model.eval()
        with torch.no_grad():
            emb = model.get_backbone_features(tensor)
        return emb.cpu().numpy().flatten().tolist()
    except Exception as exc:
        print(f"[SellerRoutes] Embedding failed for {image_path}: {exc}")
        return None


def _iso_doc(doc: dict):
    for key in ("created_at", "updated_at"):
        val = doc.get(key)
        if val and hasattr(val, "isoformat"):
            doc[key] = val.isoformat()
    for img in doc.get("images", []):
        val = img.get("uploaded_at")
        if val and hasattr(val, "isoformat"):
            img["uploaded_at"] = val.isoformat()
