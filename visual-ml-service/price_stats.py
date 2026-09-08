"""
Category / subcategory market-price statistics
==============================================
Rebuilds live averages from available seller_products and writes:
  1. MongoDB collection `category_price_stats`
  2. JSON file `data/market_prices.json`  (used by dowry estimation)

Priority bands (around the stored average), matching the dowry wizard:
  High   → 1.10×avg … 1.45×avg
  Medium → 0.82×avg … 1.18×avg   (e.g. avg 110k → 90k–130k)
  Low    → 0.65×avg … 0.90×avg

Call `rebuild_price_stats()` after scraping or after a seller lists a product.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median

_root_env = Path(__file__).resolve().parents[1] / ".env"
if _root_env.is_file():
    for _line in _root_env.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

from pymongo import MongoClient

from config import DATA_DIR, MONGO_DB, MONGO_URI, PRODUCTS_COLLECTION, is_retired_category

STATS_COLLECTION = "category_price_stats"
MARKET_PRICES_FILE = os.path.join(DATA_DIR, "market_prices.json")

PRIORITY_BANDS = {
    "High":   (1.10, 1.45),
    "Medium": (0.82, 1.18),
    "Low":    (0.65, 0.90),
}


def _priority_ranges(avg: float | None) -> dict | None:
    if not avg or avg <= 0:
        return None
    return {
        name: {"min": int(round(avg * lo)), "max": int(round(avg * hi))}
        for name, (lo, hi) in PRIORITY_BANDS.items()
    }


def _summarize(prices: list[float]) -> dict:
    prices = sorted(p for p in prices if isinstance(p, (int, float)) and p > 0)
    if not prices:
        return {
            "avg": None,
            "median": None,
            "min": None,
            "max": None,
            "count": 0,
            "avg_top5_cheapest": None,
            "priority_ranges": None,
        }
    top5 = prices[:5]
    avg_val = round(mean(prices))
    return {
        "avg": avg_val,
        "median": round(median(prices)),
        "min": int(prices[0]),
        "max": int(prices[-1]),
        "count": len(prices),
        "avg_top5_cheapest": round(mean(top5)),
        "priority_ranges": _priority_ranges(avg_val),
    }


def _get_db():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    return client, client[MONGO_DB]


def rebuild_price_stats(db=None) -> dict:
    """
    Aggregate available products by major_category → subcategory and persist.
    Returns the payload written to market_prices.json.
    """
    own_client = None
    if db is None:
        own_client, db = _get_db()

    try:
        cursor = db[PRODUCTS_COLLECTION].find(
            {
                "availability_status": "available",
                "marketplace_type": {"$ne": "thrift"},
                "condition": {"$nin": ["Thrift", "Used", "thrift", "used"]},
            },
            {"major_category": 1, "subcategory": 1, "item_type": 1, "price": 1, "_id": 0},
        )
        by_cat: dict[str, list[float]] = {}
        by_sub: dict[str, dict[str, list[float]]] = {}
        by_item: dict[str, dict[str, dict[str, list[float]]]] = {}

        for doc in cursor:
            cat = (doc.get("major_category") or "").strip()
            sub = (doc.get("subcategory") or "").strip()
            item = (doc.get("item_type") or "").strip()
            price = doc.get("price")
            if not cat or is_retired_category(cat, sub, item):
                continue
            if not isinstance(price, (int, float)) or price <= 0:
                continue
            by_cat.setdefault(cat, []).append(float(price))
            if sub:
                by_sub.setdefault(cat, {}).setdefault(sub, []).append(float(price))
            if sub and item:
                by_item.setdefault(cat, {}).setdefault(sub, {}).setdefault(item, []).append(float(price))

        categories = {}
        for cat, prices in by_cat.items():
            entry = _summarize(prices)
            entry["subcategories"] = {}
            for sub, sub_prices in (by_sub.get(cat) or {}).items():
                sub_entry = _summarize(sub_prices)
                sub_entry["item_types"] = {
                    item: _summarize(item_prices)
                    for item, item_prices in (by_item.get(cat, {}).get(sub) or {}).items()
                }
                entry["subcategories"][sub] = sub_entry
            categories[cat] = entry

        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "categories": categories,
        }

        os.makedirs(DATA_DIR, exist_ok=True)
        with open(MARKET_PRICES_FILE, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)

        db[STATS_COLLECTION].delete_many({})
        docs = []
        for cat, info in categories.items():
            docs.append({
                "major_category": cat,
                "subcategory": None,
                "item_type": None,
                **{k: v for k, v in info.items() if k != "subcategories"},
                "updated_at": datetime.now(timezone.utc),
            })
            for sub, sub_info in (info.get("subcategories") or {}).items():
                docs.append({
                    "major_category": cat,
                    "subcategory": sub,
                    "item_type": None,
                    **{k: v for k, v in sub_info.items() if k != "item_types"},
                    "updated_at": datetime.now(timezone.utc),
                })
                for item, item_info in (sub_info.get("item_types") or {}).items():
                    docs.append({
                        "major_category": cat,
                        "subcategory": sub,
                        "item_type": item,
                        **item_info,
                        "updated_at": datetime.now(timezone.utc),
                    })
        if docs:
            db[STATS_COLLECTION].insert_many(docs)

        return payload
    finally:
        if own_client is not None:
            own_client.close()


def load_market_prices() -> dict:
    """Read the JSON snapshot; rebuild from Mongo if the file is missing."""
    if os.path.isfile(MARKET_PRICES_FILE):
        try:
            with open(MARKET_PRICES_FILE, encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            pass
    return rebuild_price_stats()


def category_price_map(payload: dict | None = None) -> dict:
    """
    Flatten to the shape hybridEngine.js expects:
      { cat: { avg, avg_top5_cheapest, count, priority_ranges, subcategories } }
    """
    data = payload or load_market_prices()
    return data.get("categories") or {}


if __name__ == "__main__":
    result = rebuild_price_stats()
    cats = result.get("categories") or {}
    print(f"Wrote {MARKET_PRICES_FILE}")
    print(f"{len(cats)} major categories")
    for cat, info in cats.items():
        print(f"  {cat}: avg={info.get('avg')} n={info.get('count')} "
              f"medium={info.get('priority_ranges', {}).get('Medium')}")
