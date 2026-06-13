"""
ShaadiSahulat - MongoDB Catalog Operations
==========================================
Stores and retrieves dress catalog entries from MongoDB.

MongoDB Schema  (collection: dress_catalog)
-------------------------------------------
{
  product_id:        "BRL-001",                        # unique key
  category:          "bridal_lehenga",
  image_path:        "training_data/bridal_lehenga/…", # local filesystem path
  description:       "deep red bridal lehenga …",      # auto-generated text
  keywords:          ["deep", "red", "bridal", …],     # extracted from description
  color_info: {
    name:        "deep red",
    hue:         8.3,
    saturation:  0.812,
    brightness:  0.641
  },
  embroidery_density: "heavy",
  image_embedding:   [0.12, -0.45, …],                 # 128 floats (EfficientNet-B0)
  tfidf_vector:      {"red": 0.45, "lehenga": 0.38, …},# sparse dict
  indexed_at:        ISODate(…)
}

Design notes
------------
- image_embedding is stored as a plain list of floats — small enough for MongoDB
  (~2 KB per entry; 10 000 dresses ≈ 20 MB — well within free Atlas limits).
- tfidf_vector is stored as a sparse dict {term: weight} — BSON-friendly.
- Both are loaded into RAM at startup for fast in-memory cosine search.
- MongoDB is the single source of truth; no separate PKL index needed.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from config import MONGO_URI, MONGO_DB, MONGO_CATALOG_COLLECTION

# ── Connection singleton ───────────────────────────────────────────────────

_client: Optional[MongoClient] = None
_db = None


def _get_db():
    global _client, _db
    if _db is not None:
        return _db

    try:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        _client.server_info()          # raises if unreachable
        _db = _client[MONGO_DB]
        print(f"[MongoDB] Connected → {MONGO_URI}  db={MONGO_DB}")
        return _db
    except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
        print(f"[MongoDB] Connection failed: {exc}")
        print("[MongoDB] Falling back — some features may be unavailable.")
        return None


def is_connected() -> bool:
    return _get_db() is not None


# ── Index setup ────────────────────────────────────────────────────────────

def ensure_indexes():
    """Create indexes once — idempotent."""
    db = _get_db()
    if db is None:
        return
    col = db[MONGO_CATALOG_COLLECTION]
    col.create_index([("product_id", ASCENDING)], unique=True, background=True)
    col.create_index([("category",   ASCENDING)], background=True)


# ── Write ──────────────────────────────────────────────────────────────────

def upsert_product(
    product_id: str,
    category: str,
    image_path: str,
    description_data: dict,
    image_embedding: list[float],
) -> bool:
    """
    Insert or update a catalog entry.

    Parameters
    ----------
    product_id       : unique string ID, e.g. "BRL-001"
    category         : category ID, e.g. "bridal_lehenga"
    image_path       : local path to the dress image
    description_data : dict returned by description_generator.generate_description()
    image_embedding  : 128-element float list from EfficientNet-B0
    """
    from tfidf_engine import description_to_tfidf_dict

    db = _get_db()
    if db is None:
        return False

    tfidf_vec = description_to_tfidf_dict(description_data["description"])

    doc = {
        "product_id":        product_id,
        "category":          category,
        "image_path":        image_path,
        "description":       description_data["description"],
        "keywords":          description_data.get("keywords", []),
        "color_info":        description_data.get("color_info", {}),
        "embroidery_density":description_data.get("embroidery_density", "medium"),
        "image_embedding":   image_embedding,
        "tfidf_vector":      tfidf_vec,
        "indexed_at":        datetime.utcnow(),
    }

    db[MONGO_CATALOG_COLLECTION].update_one(
        {"product_id": product_id},
        {"$set": doc},
        upsert=True,
    )
    return True


# ── Read ───────────────────────────────────────────────────────────────────

def get_all_products() -> list[dict]:
    """Return every catalog entry (without Mongo _id field)."""
    db = _get_db()
    if db is None:
        return []
    return list(db[MONGO_CATALOG_COLLECTION].find({}, {"_id": 0}))


def get_products_by_category(category: str) -> list[dict]:
    """Return all products that belong to `category`."""
    db = _get_db()
    if db is None:
        return []
    return list(
        db[MONGO_CATALOG_COLLECTION].find(
            {"category": category}, {"_id": 0}
        )
    )


def get_all_descriptions() -> list[str]:
    """Return all description strings — used to (re-)fit the TF-IDF vectorizer."""
    db = _get_db()
    if db is None:
        return []
    docs = db[MONGO_CATALOG_COLLECTION].find({}, {"description": 1, "_id": 0})
    return [d["description"] for d in docs if d.get("description")]


# ── Stats ──────────────────────────────────────────────────────────────────

def count_total() -> int:
    db = _get_db()
    if db is None:
        return 0
    return db[MONGO_CATALOG_COLLECTION].count_documents({})


def count_by_category() -> dict[str, int]:
    db = _get_db()
    if db is None:
        return {}
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    return {r["_id"]: r["count"] for r in db[MONGO_CATALOG_COLLECTION].aggregate(pipeline)}


# ── Maintenance ────────────────────────────────────────────────────────────

def clear_catalog():
    """Delete all entries — called before a full rebuild."""
    db = _get_db()
    if db is None:
        return
    db[MONGO_CATALOG_COLLECTION].delete_many({})
    print("[MongoDB] Catalog cleared.")
