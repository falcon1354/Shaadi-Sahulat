"""
ShaadiSahulat — Seed Two New Bridal Products
============================================
Inserts "Deep Pink Bridal Sharara" and "Deep Maroon Bridal Lehenga"
directly into MongoDB seller_products without requiring images.

Usage:
    python seed_new_bridal.py
"""

import sys, os, uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION, SELLERS_COLLECTION
from pymongo import MongoClient

client = MongoClient(MONGO_URI)
db = client[MONGO_DB]

# Find first available seller to assign products to
seller = db[SELLERS_COLLECTION].find_one({})
if not seller:
    print("No sellers found. Register a seller first.")
    sys.exit(1)

seller_id   = seller["seller_id"]
seller_name = seller.get("name", "Demo Seller")
now         = datetime.utcnow()

NEW_PRODUCTS = [
    {
        "product_id":          f"sp_{uuid.uuid4().hex[:16]}",
        "seller_id":           seller_id,
        "seller_name":         seller_name,
        "title":               "Deep Pink Bridal Sharara (New)",
        "description":         "Stunning deep pink bridal sharara with intricate gota work and fine silk fabric. "
                               "Perfect for brides who love bold, vibrant colors on their special day.",
        "major_category":      "wedding_dress",
        "category":            "bridal_sharara",
        "subcategory":         "bridal",
        "item_type":           "bridal_sharara",
        "wedding_dress_type":  "bridal",
        "color":               "deep pink",
        "fabric":              "silk",
        "embroidery_type":     "gota",
        "size":                "M",
        "condition":           "new",
        "city":                seller.get("city", "Lahore"),
        "price":               45000,
        "discount_price":      None,
        "discount_pct":        None,
        "stock_quantity":      3,
        "availability_status": "available",
        "images":              [],
        "primary_image_url":   "",
        "image_embeddings":    [],
        "tfidf_vector":        {},
        "keywords":            ["pink", "sharara", "bridal", "silk", "gota"],
        "color_info":          {"dominant": "deep pink"},
        "embroidery_density":  "heavy",
        "is_new":              True,
        "created_at":          now,
        "updated_at":          now,
    },
    {
        "product_id":          f"sp_{uuid.uuid4().hex[:16]}",
        "seller_id":           seller_id,
        "seller_name":         seller_name,
        "title":               "Deep Maroon Bridal Lehenga (New)",
        "description":         "Exquisite deep maroon bridal lehenga adorned with heavy zardozi and mirror work. "
                               "A timeless classic that combines tradition with modern elegance.",
        "major_category":      "wedding_dress",
        "category":            "bridal_lehenga",
        "subcategory":         "bridal",
        "item_type":           "bridal_lehenga",
        "wedding_dress_type":  "bridal",
        "color":               "deep maroon",
        "fabric":              "velvet",
        "embroidery_type":     "zardozi",
        "size":                "M",
        "condition":           "new",
        "city":                seller.get("city", "Lahore"),
        "price":               52000,
        "discount_price":      None,
        "discount_pct":        None,
        "stock_quantity":      2,
        "availability_status": "available",
        "images":              [],
        "primary_image_url":   "",
        "image_embeddings":    [],
        "tfidf_vector":        {},
        "keywords":            ["maroon", "lehenga", "bridal", "velvet", "zardozi"],
        "color_info":          {"dominant": "deep maroon"},
        "embroidery_density":  "heavy",
        "is_new":              True,
        "created_at":          now,
        "updated_at":          now,
    },
]

inserted = 0
for prod in NEW_PRODUCTS:
    existing = db[PRODUCTS_COLLECTION].find_one({"title": prod["title"]})
    if existing:
        print(f"  SKIP  {prod['title']} — already exists")
        continue
    db[PRODUCTS_COLLECTION].insert_one(prod)
    inserted += 1
    print(f"  ADDED {prod['title']} (PKR {prod['price']:,})")

print(f"\nDone. {inserted} new product(s) inserted.")
