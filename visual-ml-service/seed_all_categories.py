"""
seed_all_categories.py — ShaadiSahulat Dummy Data Seeder
=========================================================
Seeds ONE seller (Ahmed Traders) and ALL products from
Section 10 of ShaadiSahulat_Module_Reference.md.

Run once:
    cd visual-ml-service
    python seed_all_categories.py

What it does:
  1. Creates / updates Ahmed Traders seller account
  2. Clears old Ahmed Traders products
  3. Inserts all products with descriptions (for TF-IDF)
  4. For wedding_dress products: generates EfficientNet embeddings
     from a small placeholder image (solid-colour 64×64 JPEG)
  5. Runs TF-IDF on all descriptions and stores vectors
  6. Sets availability_status = "available" on all products
"""

import os, uuid, json, sys
from datetime import datetime, timezone
from io import BytesIO

from pymongo import MongoClient
from werkzeug.security import generate_password_hash
from PIL import Image
import numpy as np

# ── Config ─────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
from config import (
    MONGO_URI, MONGO_DB, SELLERS_COLLECTION, PRODUCTS_COLLECTION,
    MODEL_DIR, BACKBONE,
)

NOW = datetime.now(timezone.utc)

SELLER = {
    "seller_id":     "SELLER_001",
    "name":          "Ahmed Traders",
    "email":         "ahmed@shaadisahulat.com",
    "phone":         "03001234567",
    "city":          "Lahore",
    "password_hash": generate_password_hash("Test@1234"),
    "created_at":    NOW,
    "updated_at":    NOW,
}

# Products from Section 10 — each has all required fields + description
PRODUCTS = [
    # ── Wedding Dress / Bridal ─────────────────────────────────────
    {
        "major_category": "wedding_dress",
        "subcategory": "bridal",
        "item_type": "bridal_lehenga",
        "wedding_dress_type": "bridal",
        "title": "Red Embroidered Bridal Lehenga (Thrift)",
        "description": "Beautiful red bridal lehenga with delicate light embroidery on pure cotton base. Ideal for mehndi or smaller ceremonies. Good condition, used once, comes with dupatta.",
        "color": "Red",
        "fabric": "Cotton",
        "embroidery_type": "Light",
        "size": "M",
        "condition": "Thrift",
        "price": 35000,
        "stock_quantity": 5,
    },
    {
        "major_category": "wedding_dress",
        "subcategory": "bridal",
        "item_type": "bridal_lehenga",
        "wedding_dress_type": "bridal",
        "title": "Heavy Bridal Lehenga Maroon Gold (New)",
        "description": "Exquisite heavy bridal lehenga in maroon and gold with dense zari work throughout. Premium silk fabric with fully embroidered blouse. Perfect for Barat ceremony.",
        "color": "Maroon",
        "fabric": "Silk",
        "embroidery_type": "Heavy",
        "size": "M",
        "condition": "New",
        "price": 120000,
        "stock_quantity": 5,
    },
    {
        "major_category": "wedding_dress",
        "subcategory": "bridal",
        "item_type": "bridal_sharara",
        "wedding_dress_type": "bridal",
        "title": "White Gold Sharara Set 3-Piece Silk (New)",
        "description": "Elegant 3-piece white and gold sharara set crafted from pure silk. Features embroidered kameez, wide-leg sharara trousers, and matching dupatta. Sophisticated look for Walima.",
        "color": "White",
        "fabric": "Silk",
        "embroidery_type": "Medium",
        "size": "M",
        "condition": "New",
        "price": 85000,
        "stock_quantity": 5,
    },
    # ── Wedding Dress / Groom ──────────────────────────────────────
    {
        "major_category": "wedding_dress",
        "subcategory": "groom",
        "item_type": "groom_sherwani",
        "wedding_dress_type": "groom",
        "title": "Navy Blue Embroidered Sherwani (New)",
        "description": "Regal navy blue embroidered sherwani with intricate thread work on collar and cuffs. Comes with off-white matching churidar shalwar. Perfect for Barat ceremony.",
        "color": "Navy Blue",
        "fabric": "Silk",
        "embroidery_type": "Medium",
        "size": "L",
        "condition": "New",
        "price": 45000,
        "stock_quantity": 5,
    },
    {
        "major_category": "wedding_dress",
        "subcategory": "groom",
        "item_type": "groom_sherwani",
        "wedding_dress_type": "groom",
        "title": "Cream Sherwani Used Once Good Condition (Thrift)",
        "description": "Cream coloured classic sherwani with subtle embroidery on chest. Worn once at Barat, cleaned and stored properly. Great value for budget-conscious grooms.",
        "color": "Cream",
        "fabric": "Cotton",
        "embroidery_type": "Light",
        "size": "L",
        "condition": "Thrift",
        "price": 18000,
        "stock_quantity": 5,
    },
    # ── Furniture ──────────────────────────────────────────────────
    {
        "major_category": "furniture",
        "subcategory": "sofa_set",
        "item_type": "sofa_set",
        "title": "Beige Fabric Sofa Set 3+2+1 Seater",
        "description": "Classic 6-seater sofa set in premium beige fabric with solid wooden frame. Includes 3-seater, 2-seater, and 1-seater pieces. Comfortable cushioning, scratch-resistant feet.",
        "color": "Beige",
        "material": "Fabric + Wood",
        "condition": "New",
        "price": 85000,
        "stock_quantity": 5,
    },
    {
        "major_category": "furniture",
        "subcategory": "bed_set",
        "item_type": "bed_set",
        "title": "King Size Dark Walnut Panel Bed",
        "description": "King-size panel bed in dark walnut finish with 2-sided headboard. Includes matching side tables and dressing table. Solid wood construction with anti-scratch coating.",
        "color": "Dark Walnut",
        "material": "Solid Wood",
        "condition": "New",
        "price": 120000,
        "stock_quantity": 5,
    },
    {
        "major_category": "furniture",
        "subcategory": "dining_table",
        "item_type": "dining_table",
        "title": "White Gold Dining Table 8-Seater",
        "description": "Elegant 8-seater dining table set in white with gold trim detailing. Includes 8 matching chairs with cushioned seats. Tempered glass top with wooden base.",
        "color": "White",
        "material": "Glass + Wood",
        "condition": "New",
        "price": 95000,
        "stock_quantity": 5,
    },
    {
        "major_category": "furniture",
        "subcategory": "dressing_table",
        "item_type": "dressing_table",
        "title": "White Dressing Table with Full Mirror",
        "description": "Modern white dressing table with full-length mirror and 3 spacious drawers. Sturdy MDF construction with white lacquer finish. Ideal for bridal bedroom setup.",
        "color": "White",
        "material": "MDF",
        "condition": "New",
        "price": 22000,
        "stock_quantity": 5,
    },
    # ── Electronics ────────────────────────────────────────────────
    {
        "major_category": "electronics",
        "subcategory": "led_tv",
        "item_type": "led_tv",
        "title": "Samsung 43-inch Smart LED TV",
        "description": "Samsung 43-inch Full HD Smart TV with built-in WiFi and multiple HDMI ports. Pre-installed streaming apps, energy-saving mode. 2-year Samsung warranty included.",
        "brand": "Samsung",
        "color": "Black",
        "condition": "New",
        "price": 75000,
        "stock_quantity": 5,
    },
    {
        "major_category": "electronics",
        "subcategory": "refrigerator",
        "item_type": "refrigerator",
        "title": "Haier 14 Cu.Ft Double Door Refrigerator",
        "description": "Haier 14 cubic feet double door refrigerator with frost-free technology. Silver colour with large vegetable crisper, 3 door shelves, and energy-efficient compressor.",
        "brand": "Haier",
        "color": "Silver",
        "condition": "New",
        "price": 85000,
        "stock_quantity": 5,
    },
    {
        "major_category": "electronics",
        "subcategory": "washing_machine",
        "item_type": "washing_machine",
        "title": "Dawlance 8kg Fully Automatic Washing Machine",
        "description": "Dawlance 8kg fully automatic front-load washing machine with multiple wash programs. Quick wash, fuzzy logic control, and child safety lock. 1-year company warranty.",
        "brand": "Dawlance",
        "color": "White",
        "condition": "New",
        "price": 55000,
        "stock_quantity": 5,
    },
    # ── Kitchen Items ──────────────────────────────────────────────
    {
        "major_category": "kitchen_items",
        "subcategory": "general_kitchen",
        "item_type": "crockery_set",
        "title": "Bone China Crockery Set 72-Piece",
        "description": "Elegant 72-piece bone china dinner set in white with classic blue border design. Includes dinner plates, side plates, bowls, mugs, and serving dishes. Dishwasher-safe.",
        "brand": "Royal",
        "material": "Bone China",
        "color": "White with Blue",
        "condition": "New",
        "price": 18000,
        "stock_quantity": 5,
    },
    {
        "major_category": "kitchen_items",
        "subcategory": "large_appliances",
        "item_type": "microwave",
        "title": "Dawlance 25L Microwave with Grill",
        "description": "Dawlance 25-litre solo microwave with grill function. Digital display with 10 power levels, child lock, and defrost mode. Stainless steel interior for easy cleaning.",
        "brand": "Dawlance",
        "material": "Steel",
        "condition": "New",
        "price": 22000,
        "stock_quantity": 5,
    },
    {
        "major_category": "kitchen_items",
        "subcategory": "large_appliances",
        "item_type": "juicer_blender",
        "title": "National 3-in-1 Juicer Blender Set 800W",
        "description": "National 3-in-1 multi-function juicer, blender, and food processor set. 800W motor with stainless steel blades. Comes with 3 speed settings and safety locking system.",
        "brand": "National",
        "material": "Plastic + Steel",
        "condition": "New",
        "price": 8500,
        "stock_quantity": 5,
    },
    {
        "major_category": "kitchen_items",
        "subcategory": "general_kitchen",
        "item_type": "cooking_set",
        "title": "Stainless Steel Non-Stick Cooking Set 12-Piece",
        "description": "12-piece stainless steel cooking set with non-stick coating. Includes various pots, pans, and lids. Even heat distribution, scratch-resistant base, compatible with all stove types.",
        "brand": "Chef",
        "material": "Stainless Steel",
        "condition": "New",
        "price": 6500,
        "stock_quantity": 5,
    },
    # ── Decoration ─────────────────────────────────────────────────
    {
        "major_category": "decoration",
        "subcategory": "lights",
        "item_type": "fairy_lights",
        "title": "Warm White Fairy Lights 20 Meters Indoor",
        "description": "20-metre warm white LED fairy lights for indoor decoration. Energy-efficient LEDs with 8 lighting modes and timer function. Perfect for wedding stage and dining area.",
        "color": "Warm White",
        "condition": "New",
        "price": 2500,
        "stock_quantity": 5,
    },
    {
        "major_category": "decoration",
        "subcategory": "flowers",
        "item_type": "artificial_flowers",
        "title": "Rose Bundle Red and White 50 Pieces",
        "description": "Bundle of 50 premium quality artificial roses in red and white. Lifelike silk petals with realistic green stems. Ideal for table centerpieces and stage decoration.",
        "color": "Red and White",
        "condition": "New",
        "price": 3500,
        "stock_quantity": 5,
    },
    {
        "major_category": "decoration",
        "subcategory": "stage_setup",
        "item_type": "stage_setup_kit",
        "title": "Stage Backdrop Frame + Curtain Gold Ivory",
        "description": "Complete stage setup kit with adjustable metal backdrop frame and gold-ivory curtain set. Includes draping fabric, LED strip lights, and floral attachments. Easy assembly.",
        "color": "Gold and Ivory",
        "condition": "New",
        "price": 25000,
        "stock_quantity": 5,
    },
    # ── Miscellaneous ──────────────────────────────────────────────
    {
        "major_category": "miscellaneous",
        "subcategory": "small_appliances",
        "item_type": "iron",
        "title": "Westpoint Steam Iron 2200W",
        "description": "Westpoint 2200W steam iron with self-cleaning function and anti-drip system. Stainless steel soleplate with 3 steam settings. Lightweight design with long 2m cord.",
        "brand": "Westpoint",
        "condition": "New",
        "price": 3500,
        "stock_quantity": 5,
    },
    {
        "major_category": "miscellaneous",
        "subcategory": "small_appliances",
        "item_type": "pedestal_fan",
        "title": "GFC 18-inch Pedestal Fan 3 Speed White",
        "description": "GFC 18-inch pedestal fan with 3-speed settings and 360-degree oscillation. Height-adjustable stand, timer function, and quiet motor. Energy-saving with thermal fuse protection.",
        "brand": "GFC",
        "color": "White",
        "condition": "New",
        "price": 4200,
        "stock_quantity": 5,
    },
    {
        "major_category": "miscellaneous",
        "subcategory": "small_appliances",
        "item_type": "vacuum_cleaner",
        "title": "Philips Handheld Vacuum Cleaner 1000W",
        "description": "Philips 1000W handheld vacuum cleaner with powerful suction and HEPA filter. Compact cordless design with 2-in-1 nozzle and crevice tool. 30-minute battery life.",
        "brand": "Philips",
        "condition": "New",
        "price": 8500,
        "stock_quantity": 5,
    },
]


def make_placeholder_image_bytes(color=(200, 100, 100), size=(64, 64)):
    """Generate a small solid-colour JPEG as a stand-in product image."""
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def save_placeholder_image(product_id, major_category, subcategory=""):
    """Save a placeholder image to uploads/ and return its relative URL."""
    from config import UPLOADS_DIR
    cat_dir = os.path.join(UPLOADS_DIR, major_category, subcategory or "general")
    prod_dir = os.path.join(cat_dir, product_id)
    os.makedirs(prod_dir, exist_ok=True)

    filename = "placeholder.jpg"
    filepath = os.path.join(prod_dir, filename)

    # Vary colour slightly per category
    color_map = {
        "wedding_dress": (200, 50, 120),
        "furniture":     (150, 100, 60),
        "electronics":   (60, 100, 180),
        "kitchen_items": (80, 160, 100),
        "decoration":    (220, 150, 50),
        "miscellaneous": (120, 120, 120),
    }
    color = color_map.get(major_category, (150, 150, 150))
    img_bytes = make_placeholder_image_bytes(color)
    with open(filepath, "wb") as f:
        f.write(img_bytes)

    rel_path = f"{major_category}/{subcategory or 'general'}/{product_id}/{filename}"
    return rel_path, img_bytes


def extract_embedding(img_bytes, model):
    """Extract 1280-dim EfficientNet embedding from image bytes."""
    import torch
    from torchvision import transforms

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    tensor = transform(img).unsqueeze(0)

    model.eval()
    with torch.no_grad():
        embedding = model(tensor).squeeze().cpu().numpy()
    return embedding.tolist()


def main():
    print("\n" + "=" * 60)
    print("  ShaadiSahulat — Seed All Categories")
    print("=" * 60)

    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]

    # ── 1. Upsert Ahmed Traders seller ─────────────────────────────
    print("\n[1] Upserting Ahmed Traders seller account…")
    db[SELLERS_COLLECTION].update_one(
        {"email": SELLER["email"]},
        {"$set": SELLER},
        upsert=True,
    )
    print(f"    Seller ID : {SELLER['seller_id']}")
    print(f"    Email     : {SELLER['email']}")

    # ── 2. Remove old Ahmed Traders products ────────────────────────
    print("\n[2] Removing old Ahmed Traders products…")
    deleted = db[PRODUCTS_COLLECTION].delete_many({"seller_id": SELLER["seller_id"]})
    print(f"    Removed {deleted.deleted_count} old products.")

    # ── 3. Load EfficientNet model for dress embeddings ─────────────
    model = None
    try:
        from model import load_model_for_inference
        model = load_model_for_inference(MODEL_DIR, BACKBONE)
        print("\n[3] EfficientNet model loaded — dress embeddings will be generated.")
    except Exception as e:
        print(f"\n[3] WARNING: Could not load model ({e}). Dress embeddings will be empty arrays.")

    # ── 4. Build TF-IDF vectorizer ──────────────────────────────────
    try:
        from tfidf_engine import get_tfidf_engine
        tfidf_engine = get_tfidf_engine()
        print("[4] TF-IDF engine loaded.")
    except Exception as e:
        tfidf_engine = None
        print(f"[4] WARNING: TF-IDF engine unavailable ({e}). Vectors will be empty.")

    # ── 5. Insert all products ──────────────────────────────────────
    print(f"\n[5] Inserting {len(PRODUCTS)} products…")
    inserted = 0

    for prod_data in PRODUCTS:
        product_id = f"sp_{uuid.uuid4().hex[:16]}"
        major_cat  = prod_data["major_category"]
        subcat     = prod_data.get("subcategory", "")
        is_dress   = major_cat == "wedding_dress"

        # Save placeholder image
        image_rel_url, img_bytes = save_placeholder_image(product_id, major_cat, subcat)

        # Embedding (dress only)
        image_embeddings = []
        if is_dress and model is not None:
            try:
                emb = extract_embedding(img_bytes, model)
                image_embeddings = [emb]
            except Exception as ex:
                print(f"    WARNING: embedding failed for {product_id}: {ex}")

        # TF-IDF vector
        tfidf_vector = {}
        keywords     = []
        if tfidf_engine is not None:
            try:
                desc = prod_data.get("description", "")
                vec  = tfidf_engine.transform([desc])
                feature_names = tfidf_engine.get_feature_names_out()
                nz_indices = vec.nonzero()[1]
                tfidf_vector = {feature_names[i]: float(vec[0, i]) for i in nz_indices}
                keywords     = sorted(tfidf_vector, key=tfidf_vector.get, reverse=True)[:10]
            except Exception:
                pass

        doc = {
            "product_id":          product_id,
            "seller_id":           SELLER["seller_id"],
            "seller_name":         SELLER["name"],
            "major_category":      major_cat,
            "subcategory":         subcat,
            "item_type":           prod_data.get("item_type", ""),
            "category":            prod_data.get("item_type", subcat),
            "wedding_dress_type":  prod_data.get("wedding_dress_type", ""),
            "title":               prod_data["title"],
            "description":         prod_data["description"],
            "color":               prod_data.get("color", ""),
            "fabric":              prod_data.get("fabric", ""),
            "embroidery_type":     prod_data.get("embroidery_type", ""),
            "size":                prod_data.get("size", ""),
            "material":            prod_data.get("material", ""),
            "brand":               prod_data.get("brand", ""),
            "condition":           prod_data.get("condition", "New"),
            "city":                SELLER["city"],
            "price":               float(prod_data["price"]),
            "discount_price":      None,
            "discount_pct":        None,
            "stock_quantity":      prod_data.get("stock_quantity", 5),
            "availability_status": "available",
            "images":              [{"url": image_rel_url, "is_primary": True}],
            "primary_image_url":   image_rel_url,
            "image_embeddings":    image_embeddings,
            "tfidf_vector":        tfidf_vector,
            "keywords":            keywords,
            "color_info":          {},
            "embroidery_density":  0.0,
            "created_at":          NOW,
            "updated_at":          NOW,
        }

        db[PRODUCTS_COLLECTION].insert_one(doc)
        inserted += 1
        print(f"    ✓ [{major_cat}] {prod_data['title'][:55]}")

    # ── 6. Rebuild TF-IDF index on all products ─────────────────────
    print("\n[6] Rebuilding TF-IDF corpus from all seller products…")
    try:
        from tfidf_engine import rebuild_tfidf_corpus
        rebuild_tfidf_corpus()
        print("    TF-IDF corpus rebuilt.")
    except Exception as e:
        print(f"    WARNING: TF-IDF rebuild failed ({e}). Search may be degraded.")

    # ── 7. Rebuild embedding index ──────────────────────────────────
    if model is not None:
        print("\n[7] Rebuilding embedding index…")
        try:
            from embedding_index import rebuild_seller_index
            rebuild_seller_index(model)
            print("    Embedding index rebuilt.")
        except Exception as e:
            print(f"    WARNING: Index rebuild failed ({e}). Visual search may be degraded.")

    client.close()

    print(f"\n{'=' * 60}")
    print(f"  Seeding complete — {inserted}/{len(PRODUCTS)} products inserted.")
    print(f"  Seller: {SELLER['email']} / Test@1234")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
