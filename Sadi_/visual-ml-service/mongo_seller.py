"""
ShaadiSahulat - Seller MongoDB Operations
==========================================
Manages two collections:
  sellers          — seller profiles
  seller_products  — seller-uploaded dress products with full schema

seller_products schema
----------------------
{
  product_id:          "sp_<uuid>",
  seller_id:           "sel_<uuid>",
  seller_name:         "string",        # denormalised for fast reads
  title:               "string",
  description:         "string",
  category:            "bridal_lehenga | bridal_sharara | bridal_saree",
  color:               "string",
  fabric:              "string",
  embroidery_type:     "string",
  bridal_type:         "formal | semi-formal | casual",
  price:               number,
  discount_price:      number | null,
  stock_quantity:      int,
  availability_status: "processing | available | out_of_stock | hidden",
  images: [
    { image_id, original_name, stored_filename, relative_path, image_url,
      is_primary, uploaded_at }
  ],
  image_embeddings: [
    { image_id, embedding: [1280 floats] }
  ],
  tfidf_vector:        { term: weight, … },
  keywords:            ["string"],
  color_info:          { name, hue, saturation, brightness },
  embroidery_density:  "heavy | medium | light",
  primary_image_url:   "/images/bridal_lehenga/sp_xxx/uuid.jpg",
  created_at:          ISODate,
  updated_at:          ISODate,
}
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from werkzeug.security import generate_password_hash, check_password_hash

from config import MONGO_URI, MONGO_DB, SELLERS_COLLECTION, PRODUCTS_COLLECTION

# ── Connection singleton ───────────────────────────────────────────────────

_client: Optional[MongoClient] = None
_db = None


def _get_db():
    global _client, _db
    if _db is not None:
        return _db
    try:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        _client.server_info()
        _db = _client[MONGO_DB]
        return _db
    except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
        print(f"[MongoDB/Seller] Connection failed: {exc}")
        return None


def ensure_seller_indexes():
    """Create indexes — idempotent."""
    db = _get_db()
    if db is None:
        return
    db[SELLERS_COLLECTION].create_index(
        [("seller_id", ASCENDING)], unique=True, background=True
    )
    db[SELLERS_COLLECTION].create_index(
        [("email", ASCENDING)], unique=True, background=True
    )
    db[PRODUCTS_COLLECTION].create_index(
        [("product_id", ASCENDING)], unique=True, background=True
    )
    db[PRODUCTS_COLLECTION].create_index(
        [("seller_id", ASCENDING)], background=True
    )
    db[PRODUCTS_COLLECTION].create_index(
        [("category", ASCENDING)], background=True
    )
    db[PRODUCTS_COLLECTION].create_index(
        [("availability_status", ASCENDING)], background=True
    )


# ── Seller CRUD ────────────────────────────────────────────────────────────

def create_seller(
    name: str,
    email: str,
    phone: str = "",
    city: str = "",
    password: str = "",
) -> dict | None:
    db = _get_db()
    if db is None:
        return None

    # Check duplicate email
    if db[SELLERS_COLLECTION].find_one({"email": email.strip().lower()}):
        return {"error": f"Email {email!r} already registered."}

    doc = {
        "seller_id":     f"sel_{uuid.uuid4().hex[:12]}",
        "name":          name.strip(),
        "email":         email.strip().lower(),
        "phone":         phone.strip(),
        "city":          city.strip(),
        "password_hash": generate_password_hash(password) if password else None,
        "created_at":    datetime.utcnow(),
        "updated_at":    datetime.utcnow(),
    }
    db[SELLERS_COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)   # never return hash to callers
    return doc


def get_seller(seller_id: str) -> dict | None:
    db = _get_db()
    if db is None:
        return None
    doc = db[SELLERS_COLLECTION].find_one({"seller_id": seller_id}, {"_id": 0})
    return doc


def get_seller_by_email(email: str) -> dict | None:
    db = _get_db()
    if db is None:
        return None
    doc = db[SELLERS_COLLECTION].find_one(
        {"email": email.strip().lower()}, {"_id": 0, "password_hash": 0}
    )
    return doc


def login_seller(email: str, password: str) -> dict | None:
    """Verify email+password. Returns seller doc (without hash) or error dict."""
    db = _get_db()
    if db is None:
        return None
    doc = db[SELLERS_COLLECTION].find_one(
        {"email": email.strip().lower()}, {"_id": 0}
    )
    if not doc:
        return {"error": "No account found for this email."}
    pw_hash = doc.get("password_hash")
    if not pw_hash:
        # Account has no password — allow email-only login (backward compat)
        result = dict(doc)
        result.pop("password_hash", None)
        return result
    if check_password_hash(pw_hash, password):
        result = dict(doc)
        result.pop("password_hash", None)
        return result
    return {"error": "Incorrect password."}


def get_seller_product_count(status: str | None = "available") -> int:
    """Count seller products, optionally filtered by availability_status."""
    db = _get_db()
    if db is None:
        return 0
    query = {"availability_status": status} if status else {}
    return db[PRODUCTS_COLLECTION].count_documents(query)


# ── Seller Product CRUD ────────────────────────────────────────────────────

def create_product(
    seller_id: str,
    seller_name: str,
    title: str,
    description: str,
    category: str,
    color: str = "",
    fabric: str = "",
    embroidery_type: str = "",
    bridal_type: str = "formal",
    price: float = 0.0,
    discount_price: float | None = None,
    stock_quantity: int = 1,
) -> dict:
    """Create product shell with status 'processing'. Caller adds embeddings next."""
    product_id = f"sp_{uuid.uuid4().hex[:16]}"
    doc = {
        "product_id":          product_id,
        "seller_id":           seller_id,
        "seller_name":         seller_name,
        "title":               title.strip(),
        "description":         description.strip(),
        "category":            category,
        "color":               color.strip(),
        "fabric":              fabric.strip(),
        "embroidery_type":     embroidery_type.strip(),
        "bridal_type":         bridal_type,
        "price":               float(price),
        "discount_price":      float(discount_price) if discount_price else None,
        "stock_quantity":      int(stock_quantity),
        "availability_status": "processing",
        "images":              [],
        "image_embeddings":    [],
        "tfidf_vector":        {},
        "keywords":            [],
        "color_info":          {},
        "embroidery_density":  "medium",
        "primary_image_url":   "",
        "created_at":          datetime.utcnow(),
        "updated_at":          datetime.utcnow(),
    }
    db = _get_db()
    if db is not None:
        db[PRODUCTS_COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


def update_product_embeddings(
    product_id: str,
    image_records: list[dict],
    image_embeddings: list[dict],
    tfidf_vector: dict,
    desc_data: dict,
) -> bool:
    """
    After processing, attach image records + embeddings + TF-IDF to the product
    and set availability_status to 'available'.

    Parameters
    ----------
    image_records     : list of dicts from filename_utils.generate_image_record()
    image_embeddings  : [{"image_id": str, "embedding": [1280 floats]}, ...]
    tfidf_vector      : sparse dict from description_to_tfidf_dict()
    desc_data         : dict from description_generator.generate_description()
    """
    db = _get_db()
    if db is None:
        return False

    primary_url = ""
    for rec in image_records:
        if rec.get("is_primary"):
            primary_url = rec.get("image_url", "")
            break
    if not primary_url and image_records:
        primary_url = image_records[0].get("image_url", "")

    db[PRODUCTS_COLLECTION].update_one(
        {"product_id": product_id},
        {"$set": {
            "images":              image_records,
            "image_embeddings":    image_embeddings,
            "tfidf_vector":        tfidf_vector,
            "keywords":            desc_data.get("keywords", []),
            "color_info":          desc_data.get("color_info", {}),
            "embroidery_density":  desc_data.get("embroidery_density", "medium"),
            "primary_image_url":   primary_url,
            "availability_status": "available",
            "updated_at":          datetime.utcnow(),
        }},
    )
    return True


def get_product(product_id: str) -> dict | None:
    db = _get_db()
    if db is None:
        return None
    return db[PRODUCTS_COLLECTION].find_one({"product_id": product_id}, {"_id": 0})


def list_products(
    seller_id: str | None = None,
    category: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    db = _get_db()
    if db is None:
        return {"products": [], "total": 0, "page": page, "limit": limit}

    query: dict = {}
    if seller_id:
        query["seller_id"] = seller_id
    if category:
        query["category"] = category
    if status:
        query["availability_status"] = status

    skip  = (page - 1) * limit
    total = db[PRODUCTS_COLLECTION].count_documents(query)
    docs  = list(
        db[PRODUCTS_COLLECTION]
        .find(query, {"_id": 0, "image_embeddings": 0, "tfidf_vector": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    # Convert datetimes to ISO strings for JSON serialisation
    for d in docs:
        _iso(d, "created_at")
        _iso(d, "updated_at")

    return {"products": docs, "total": total, "page": page, "limit": limit}


def update_product(product_id: str, updates: dict) -> dict | None:
    """Update metadata fields. Embeddings must be regenerated separately."""
    db = _get_db()
    if db is None:
        return None

    allowed_fields = {
        "title", "description", "color", "fabric", "embroidery_type",
        "bridal_type", "price", "discount_price", "stock_quantity",
        "availability_status",
    }
    safe = {k: v for k, v in updates.items() if k in allowed_fields}
    safe["updated_at"] = datetime.utcnow()

    db[PRODUCTS_COLLECTION].update_one(
        {"product_id": product_id},
        {"$set": safe},
    )
    return get_product(product_id)


def delete_product(product_id: str) -> dict | None:
    """Delete product from DB and return it (so caller can remove image files)."""
    db = _get_db()
    if db is None:
        return None
    doc = db[PRODUCTS_COLLECTION].find_one_and_delete({"product_id": product_id})
    if doc:
        doc.pop("_id", None)
    return doc


# ── Search helper (for embedding_index.py cache) ──────────────────────────

def get_seller_products_for_search() -> list[dict]:
    """
    Return available seller products in hybrid_search-compatible format.
    Uses primary image embedding (first image's 1280-dim backbone features).
    """
    db = _get_db()
    if db is None:
        return []

    docs = db[PRODUCTS_COLLECTION].find(
        {"availability_status": "available"},
        {"_id": 0},
    )

    results = []
    for doc in docs:
        # Use primary image embedding for visual similarity
        primary_emb = None
        for emb_rec in doc.get("image_embeddings", []):
            if emb_rec.get("image_id") == _primary_image_id(doc):
                primary_emb = emb_rec.get("embedding")
                break
        if primary_emb is None and doc.get("image_embeddings"):
            primary_emb = doc["image_embeddings"][0].get("embedding")

        if primary_emb is None:
            continue  # skip if no embeddings yet

        results.append({
            "product_id":        doc["product_id"],
            "category":          doc.get("category", ""),
            "image_path":        doc.get("primary_image_url", ""),
            "image_url":         doc.get("primary_image_url", ""),
            "description":       doc.get("description", ""),
            "keywords":          doc.get("keywords", []),
            "color_info":        doc.get("color_info", {}),
            "embroidery_density": doc.get("embroidery_density", "medium"),
            "image_embedding":   primary_emb,
            "tfidf_vector":      doc.get("tfidf_vector", {}),
            # seller-specific fields (included in recommendation results)
            "title":             doc.get("title", ""),
            "price":             doc.get("price"),
            "discount_price":    doc.get("discount_price"),
            "seller_id":         doc.get("seller_id", ""),
            "seller_name":       doc.get("seller_name", ""),
            "is_seller_product": True,
        })

    return results


# ── Helpers ────────────────────────────────────────────────────────────────

def _primary_image_id(doc: dict) -> str | None:
    for img in doc.get("images", []):
        if img.get("is_primary"):
            return img["image_id"]
    return None


def _iso(doc: dict, key: str):
    val = doc.get(key)
    if val and hasattr(val, "isoformat"):
        doc[key] = val.isoformat()
