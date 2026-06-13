"""
ShaadiSahulat - Seller API Blueprint (v2)
=========================================
Flask Blueprint mounted at /seller.

Endpoints
---------
POST  /seller/register                  — Register a new seller
POST  /seller/login                     — Seller login
GET   /seller/profile/<seller_id>       — Get seller profile
GET   /seller/by-email?email=           — Look up seller by email
GET   /seller/categories                — Return full category tree (for UI)
POST  /seller/product                   — Upload product (all 6 categories)
GET   /seller/products?seller_id=&...   — List products (paginated, seller view)
GET   /seller/products/public?...       — List available products (buyer marketplace)
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
    SELLER_CATEGORY_TREE, SELLER_MAJOR_CATEGORY_IDS, WEDDING_DRESS_SUBCATEGORY_IDS,
)
from mongo_seller import (
    create_seller, get_seller, get_seller_by_email, login_seller,
    create_product, update_product_embeddings,
    get_product, list_products, get_public_products, update_product, delete_product,
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


# ── Seller Registration / Auth ─────────────────────────────────────────────

@seller_bp.route("/register", methods=["POST"])
def register_seller():
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

    seller_type = data.get("seller_type", "individual")
    if seller_type not in ("individual", "company"):
        seller_type = "individual"

    max_listings = None if seller_type == "company" else 5
    category_restriction = (data.get("category_restriction") or None) if seller_type == "company" else None

    result = create_seller(
        name=name,
        email=email,
        phone=data.get("phone", ""),
        city=data.get("city", ""),
        password=password,
        seller_type=seller_type,
        max_listings=max_listings,
        category_restriction=category_restriction,
    )
    if result is None:
        return jsonify({"success": False, "error": "Database unavailable"}), 503
    if "error" in result:
        return jsonify({"success": False, "error": result["error"]}), 409
    return jsonify({"success": True, "seller": result}), 201


@seller_bp.route("/login", methods=["POST"])
def login_seller_route():
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


# ── Category Tree ──────────────────────────────────────────────────────────

@seller_bp.route("/categories", methods=["GET"])
def get_categories():
    """Return the full seller category tree for the upload form UI."""
    return jsonify({"success": True, "categories": SELLER_CATEGORY_TREE})


# ── Product Upload ─────────────────────────────────────────────────────────

@seller_bp.route("/product", methods=["POST"])
def upload_product():
    """
    Upload a new product with up to 5 images.

    multipart/form-data fields:
      seller_id           (required)
      title               (required)
      description         (required)
      major_category      (required, one of SELLER_MAJOR_CATEGORY_IDS)
      subcategory         (required)
      item_type           (optional — for categories with 3-level nesting)
      wedding_dress_type  (required when major_category == wedding_dress)
      color               (optional)
      fabric              (optional, wedding_dress)
      embroidery_type     (optional, wedding_dress)
      size                (optional, wedding_dress)
      material            (optional, furniture/kitchen)
      brand               (optional, electronics/kitchen)
      condition           (optional, default "new")
      city                (optional)
      price               (required)
      discount_price      (optional — direct price after discount)
      discount_pct        (optional — auto-calculates discount_price)
      stock_quantity      (optional, default 1)
      images              (1–5 image files)
    """
    # ── Validate required text fields ──────────────────────────────────────
    seller_id      = (request.form.get("seller_id")      or "").strip()
    title          = (request.form.get("title")          or "").strip()
    description    = (request.form.get("description")    or "").strip()
    major_category = (request.form.get("major_category") or "").strip()
    subcategory    = (request.form.get("subcategory")    or "").strip()
    item_type      = (request.form.get("item_type")      or "").strip()

    if not seller_id:
        return jsonify({"success": False, "error": "seller_id is required"}), 400
    if not title:
        return jsonify({"success": False, "error": "title is required"}), 400
    if not description:
        return jsonify({"success": False, "error": "description is required"}), 400
    if not major_category or major_category not in SELLER_MAJOR_CATEGORY_IDS:
        return jsonify({
            "success": False,
            "error": f"major_category must be one of: {SELLER_MAJOR_CATEGORY_IDS}",
        }), 400
    if not subcategory:
        return jsonify({"success": False, "error": "subcategory is required"}), 400

    # Validate seller exists
    seller_doc = get_seller(seller_id)
    if not seller_doc:
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

    discount_pct_raw = request.form.get("discount_pct")
    try:
        discount_pct = float(discount_pct_raw) if discount_pct_raw else None
    except ValueError:
        discount_pct = None

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
    product = create_product(
        seller_id=seller_id,
        seller_name=seller_doc.get("name", ""),
        title=title,
        description=description,
        major_category=major_category,
        subcategory=subcategory,
        item_type=item_type,
        wedding_dress_type=request.form.get("wedding_dress_type", ""),
        color=request.form.get("color", ""),
        fabric=request.form.get("fabric", ""),
        embroidery_type=request.form.get("embroidery_type", ""),
        size=request.form.get("size", ""),
        material=request.form.get("material", ""),
        brand=request.form.get("brand", ""),
        condition=request.form.get("condition", "new"),
        city=request.form.get("city", seller_doc.get("city", "")),
        price=price,
        discount_price=discount_price,
        discount_pct=discount_pct,
        stock_quantity=stock_quantity,
    )
    product_id = product["product_id"]

    # ── Save images + extract embeddings (wedding_dress only) ──────────────
    image_records    = []
    image_embeddings = []
    needs_embedding  = (major_category == "wedding_dress")

    # Use item_type as the storage folder for wedding_dress (backward compat),
    # otherwise use major_category/subcategory path
    storage_category = item_type if (needs_embedding and item_type) else f"{major_category}"

    try:
        model = _get_model() if needs_embedding else None

        for idx, img_file in enumerate(image_files):
            image_bytes = img_file.read()
            if len(image_bytes) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                continue

            rec = generate_image_record(
                original_name=img_file.filename or f"image_{idx}.jpg",
                category=storage_category,
                product_id=product_id,
                is_primary=(idx == 0),
            )
            save_image_bytes(rec, image_bytes)
            image_records.append(rec)

            if needs_embedding and model:
                emb = _extract_embedding(rec["abs_path"], model)
                if emb:
                    image_embeddings.append({
                        "image_id":  rec["image_id"],
                        "embedding": emb,
                    })

        # Generate description metadata + TF-IDF
        primary_path = image_records[0]["abs_path"] if image_records else None
        cat_label = f"{major_category} {subcategory}".replace("_", " ").title()
        if needs_embedding and primary_path:
            desc_data = generate_description(primary_path, storage_category, cat_label)
        else:
            desc_data = {
                "description":       description,
                "keywords":          [],
                "color_info":        {},
                "embroidery_density": "medium",
            }
        desc_data["description"] = description  # always use seller's own text

        tfidf_vec = description_to_tfidf_dict(description)

        # Non-dress products go to "available" immediately (no embedding needed)
        update_product_embeddings(
            product_id, image_records, image_embeddings, tfidf_vec, desc_data
        )

        # Invalidate in-memory recommendation cache
        from embedding_index import invalidate_cache
        invalidate_cache()

    except Exception as exc:
        for rec in image_records:
            delete_image_file(rec)
        return jsonify({"success": False, "error": str(exc)}), 500

    return jsonify({
        "success":              True,
        "product_id":           product_id,
        "major_category":       major_category,
        "images_saved":         len(image_records),
        "embeddings_extracted": len(image_embeddings),
        "status":               "available",
    }), 201


# ── Product CRUD ───────────────────────────────────────────────────────────

@seller_bp.route("/products", methods=["GET"])
def list_seller_products():
    """GET /seller/products?seller_id=&major_category=&status=&page=&limit="""
    seller_id      = request.args.get("seller_id") or None
    major_category = request.args.get("major_category") or None
    category       = request.args.get("category") or None  # legacy fallback
    status         = request.args.get("status") or None
    try:
        page  = int(request.args.get("page",  1))
        limit = int(request.args.get("limit", 20))
    except ValueError:
        page, limit = 1, 20

    # Support both `major_category` and legacy `category` param
    cat_filter = major_category or category
    result = list_products(seller_id, cat_filter, status, page, limit)
    return jsonify({"success": True, **result})


@seller_bp.route("/products/public", methods=["GET"])
def marketplace_products():
    """
    GET /seller/products/public — Buyer marketplace: all available products with filters.
    Query params: major_category, subcategory, min_price, max_price, color, condition, city,
                  sort_by (newest|price_asc|price_desc), page, limit
    """
    major_category = request.args.get("major_category") or None
    subcategory    = request.args.get("subcategory")    or None
    color          = request.args.get("color")          or None
    condition      = request.args.get("condition")      or None
    city           = request.args.get("city")           or None
    sort_by        = request.args.get("sort_by", "newest")
    try:
        min_price = float(request.args["min_price"]) if request.args.get("min_price") else None
        max_price = float(request.args["max_price"]) if request.args.get("max_price") else None
        page      = int(request.args.get("page",  1))
        limit     = int(request.args.get("limit", 20))
    except ValueError:
        min_price = max_price = None
        page, limit = 1, 20

    result = get_public_products(
        major_category=major_category,
        subcategory=subcategory,
        min_price=min_price,
        max_price=max_price,
        color=color,
        condition=condition,
        city=city,
        sort_by=sort_by,
        page=page,
        limit=limit,
    )
    return jsonify({"success": True, **result})


@seller_bp.route("/product/<product_id>", methods=["GET"])
def get_seller_product(product_id):
    doc = get_product(product_id)
    if not doc:
        return jsonify({"success": False, "error": "Product not found"}), 404
    doc.pop("image_embeddings", None)
    _iso_doc(doc)
    return jsonify({"success": True, "product": doc})


@seller_bp.route("/product/<product_id>", methods=["PUT"])
def update_seller_product(product_id):
    data    = request.get_json(silent=True) or {}
    updated = update_product(product_id, data)
    if not updated:
        return jsonify({"success": False, "error": "Product not found"}), 404
    updated.pop("image_embeddings", None)
    _iso_doc(updated)
    return jsonify({"success": True, "product": updated})


@seller_bp.route("/product/<product_id>", methods=["DELETE"])
def delete_seller_product(product_id):
    doc = delete_product(product_id)
    if not doc:
        return jsonify({"success": False, "error": "Product not found"}), 404

    deleted_files = 0
    for rec in doc.get("images", []):
        if delete_image_file(rec):
            deleted_files += 1

    from embedding_index import invalidate_cache
    invalidate_cache()

    return jsonify({
        "success":       True,
        "product_id":    product_id,
        "files_deleted": deleted_files,
    })


# ── TF-IDF Text Search ─────────────────────────────────────────────────────

@seller_bp.route("/search", methods=["GET"])
def search_products():
    """
    GET /seller/search?q=<text>&major_category=<cat>&limit=<n>
    TF-IDF cosine similarity search against product descriptions.
    Threshold: 0.2 | Min query length: 3 chars
    """
    q = (request.args.get("q") or "").strip()
    major_category = request.args.get("major_category") or None
    try:
        limit = min(int(request.args.get("limit", 10)), 20)
    except ValueError:
        limit = 10

    if len(q) < 3:
        return jsonify({
            "success": False,
            "error": "Query must be at least 3 characters",
            "products": [],
        }), 400

    from tfidf_engine import description_to_tfidf_dict, tfidf_cosine_similarity, load_vectorizer
    from pymongo import MongoClient
    from config import MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION

    # Vectorizer must be fitted
    if load_vectorizer() is None:
        return jsonify({"success": True, "products": [], "total": 0, "query": q,
                        "note": "TF-IDF not fitted yet — run seed script first."})

    query_vec = description_to_tfidf_dict(q)
    if not query_vec:
        return jsonify({"success": True, "products": [], "total": 0, "query": q})

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[MONGO_DB]
        mongo_filter = {"availability_status": "available", "tfidf_vector": {"$exists": True, "$ne": {}}}
        if major_category:
            mongo_filter["major_category"] = major_category

        projection = {
            "image_embeddings": 0,  # skip large embedding arrays
        }
        candidates = list(db[PRODUCTS_COLLECTION].find(mongo_filter, projection))
        client.close()
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc), "products": []}), 500

    results = []
    for prod in candidates:
        prod_vec = prod.pop("tfidf_vector", {}) or {}
        score = tfidf_cosine_similarity(query_vec, prod_vec) if prod_vec else 0.0
        if score >= 0.2:
            _iso_doc(prod)
            prod["_id"] = str(prod.get("_id", ""))
            results.append({**prod, "similarity_score": round(score, 4)})

    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    results = results[:limit]

    return jsonify({"success": True, "products": results, "total": len(results), "query": q})


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
