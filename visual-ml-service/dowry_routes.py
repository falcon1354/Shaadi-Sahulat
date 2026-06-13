"""
Dowry Estimation Helper Routes
================================
Provides DB-backed market price data to the Node.js dowry engine.

GET  /dowry/category-prices
GET  /dowry/price-suggestion?major_category=&subcategory=
POST /dowry/save-profile
"""

import os
import json
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from pymongo import MongoClient
from config import MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION

PROFILES_DIR = os.path.join(os.path.dirname(__file__), "training", "dowry_profiles")
os.makedirs(PROFILES_DIR, exist_ok=True)

dowry_bp = Blueprint("dowry", __name__, url_prefix="/dowry")

DOWRY_CATEGORIES_FALLBACK = [
    "wedding_dress",
    "furniture",
    "electronics",
    "kitchen_items",
    "decoration",
    "miscellaneous",
]


def _get_active_categories(db):
    """Fetch active category IDs from admin_categories. Falls back to static list."""
    try:
        cats = [c["category_id"] for c in db["admin_categories"].find(
            {"is_active": {"$ne": False}}, {"category_id": 1, "_id": 0})]
        return cats if cats else DOWRY_CATEGORIES_FALLBACK
    except Exception:
        return DOWRY_CATEGORIES_FALLBACK


@dowry_bp.route("/category-prices", methods=["GET"])
def get_category_prices():
    """
    Returns avg price of top-5 cheapest available products per category.
    Used by hybridEngine.js to ground estimates in real market data.
    """
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[MONGO_DB]

        active_cats = _get_active_categories(db)
        result = {}
        for cat in active_cats:
            products = list(
                db[PRODUCTS_COLLECTION]
                .find(
                    {"major_category": cat, "availability_status": "available"},
                    {"price": 1, "_id": 0},
                )
                .sort("price", 1)
                .limit(5)
            )

            if products:
                avg = sum(p["price"] for p in products) / len(products)
                result[cat] = {
                    "avg_top5_cheapest": round(avg),
                    "count": len(products),
                }
            else:
                result[cat] = {"avg_top5_cheapest": None, "count": 0}

        client.close()
        return jsonify({"success": True, "data": result})

    except Exception as exc:
        return jsonify({"success": False, "error": str(exc), "data": {}}), 500


@dowry_bp.route("/price-suggestion", methods=["GET"])
def price_suggestion():
    """
    GET /dowry/price-suggestion?major_category=&subcategory=&item_type=&color=&condition=
    §11.3: 3-priority cascade lookup:
      Level 1 — same subcategory + item_type + color + condition  (stops if ≥5 records)
      Level 2 — same subcategory + item_type                       (fill to 5)
      Level 3 — same major_category                               (fill to 5)
    """
    major_category = (request.args.get("major_category") or "").strip()
    subcategory    = (request.args.get("subcategory")    or "").strip()
    item_type      = (request.args.get("item_type")      or "").strip()
    color          = (request.args.get("color")          or "").strip()
    condition      = (request.args.get("condition")      or "").strip()

    if not major_category:
        return jsonify({"success": False, "error": "major_category is required"}), 400

    TARGET = 5

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db     = client[MONGO_DB]
        coll   = db[PRODUCTS_COLLECTION]
        base   = {"availability_status": "available", "major_category": major_category}

        def fetch_records(extra_filter):
            f = {**base, **extra_filter}
            return [
                {"id": str(p["_id"]), "price": p["price"]}
                for p in coll.find(f, {"price": 1})
                if isinstance(p.get("price"), (int, float))
            ]

        seen_ids  = set()
        collected = []
        lookup_level = 0

        def merge(records):
            for r in records:
                if r["id"] not in seen_ids and len(collected) < TARGET:
                    seen_ids.add(r["id"])
                    collected.append(r["price"])

        # Level 1: subcategory + item_type + color + condition
        if subcategory and item_type and color and condition:
            merge(fetch_records({"subcategory": subcategory, "item_type": item_type,
                                 "color": {"$regex": color, "$options": "i"},
                                 "condition": condition}))
            if len(collected) >= TARGET:
                lookup_level = 1

        # Level 2: subcategory + item_type
        if len(collected) < TARGET and subcategory and item_type:
            merge(fetch_records({"subcategory": subcategory, "item_type": item_type}))
            if len(collected) >= TARGET and lookup_level == 0:
                lookup_level = 2

        # Level 3: major_category only
        if len(collected) < TARGET:
            merge(fetch_records({}))
            if lookup_level == 0:
                lookup_level = 3

        client.close()
        prices = sorted(collected)

        if not prices:
            return jsonify({
                "success": True,
                "suggestion": None,
                "major_category": major_category,
                "subcategory": subcategory,
                "note": "No products found for this category yet.",
            })

        avg = sum(prices) / len(prices)
        p25 = prices[max(0, len(prices) // 4 - 1)]
        p75 = prices[min(len(prices) - 1, (3 * len(prices)) // 4)]

        # Deviation bands for the seller UI
        avg_val = round(avg)
        if avg_val < 30000:
            band = 0.35
        elif avg_val <= 100000:
            band = 0.30
        elif avg_val <= 200000:
            band = 0.25
        elif avg_val <= 500000:
            band = 0.15
        else:
            band = 0.08

        return jsonify({
            "success":  True,
            "suggestion": {
                "min":        min(prices),
                "max":        max(prices),
                "avg":        avg_val,
                "p25":        p25,
                "p75":        p75,
                "count":      len(prices),
                "range_low":  round(avg_val * (1 - band)),
                "range_high": round(avg_val * (1 + band)),
                "band_pct":   round(band * 100),
            },
            "lookup_level":  lookup_level,
            "major_category": major_category,
            "subcategory":    subcategory,
        })

    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dowry_bp.route("/save-profile", methods=["POST"])
def save_profile():
    """
    POST /dowry/save-profile
    Body: { profile_id, user_id, budget, priorities, breakdown, ... }
    Writes a JSON training file to training/dowry_profiles/profile_<id>.json
    """
    data = request.get_json(silent=True) or {}
    profile_id = data.get("profile_id") or f"profile_{uuid.uuid4().hex[:12]}"

    filename = f"profile_{profile_id}.json"
    filepath = os.path.join(PROFILES_DIR, filename)

    try:
        record = {
            **data,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(filepath, "w", encoding="utf-8") as fh:
            json.dump(record, fh, indent=2, ensure_ascii=False, default=str)

        return jsonify({"success": True, "filename": filename, "profile_id": profile_id})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
