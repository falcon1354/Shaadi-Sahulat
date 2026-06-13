"""
seed_all_categories.py — ShaadiSahulat Complete Seeder
=======================================================
ONE seller (Ahmed Traders, company, Level 3).
Wedding dress products use REAL images from training_data/ + EfficientNet embeddings.
Other category products use placeholder images (image search not needed for them).

Run once from visual-ml-service folder:
    python seed_all_categories.py
"""

import os, uuid, json, sys, shutil, random
from datetime import datetime, timezone
from io import BytesIO

from pymongo import MongoClient
from werkzeug.security import generate_password_hash
from PIL import Image
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    MONGO_URI, MONGO_DB, SELLERS_COLLECTION, PRODUCTS_COLLECTION,
    MODEL_DIR, BACKBONE, TRAINING_DATA_DIR, UPLOADS_DIR,
)

NOW = datetime.now(timezone.utc)

# ── Ahmed Traders seller (Company, Level 3 = 52 completed orders) ───────────
SELLER = {
    "seller_id":            "SELLER_001",
    "name":                 "Ahmed Traders",
    "email":                "ahmed@shaadisahulat.com",
    "phone":                "03001234567",
    "city":                 "Lahore",
    "password_hash":        generate_password_hash("Test@1234"),
    "seller_type":          "company",
    "max_listings":         None,
    "category_restriction": None,
    "completed_orders":     52,      # Level 3 (>50)
    "created_at":           NOW,
    "updated_at":           NOW,
}

# ── Wedding dress sub-categories to seed from training_data/ ─────────────────
DRESS_CATS = {
    "bridal_lehenga": {
        "subcategory":        "bridal",
        "item_type":          "bridal_lehenga",
        "wedding_dress_type": "bridal",
        "label":              "Bridal Lehenga",
        "price_range":        (35000, 95000),
        "fabrics":            ["Silk", "Net", "Organza", "Chiffon", "Velvet"],
        "embroideries":       ["Zardozi", "Gota", "Mirror Work", "Dabka", "Tilla"],
    },
    "bridal_sharara": {
        "subcategory":        "bridal",
        "item_type":          "bridal_sharara",
        "wedding_dress_type": "bridal",
        "label":              "Bridal Sharara",
        "price_range":        (28000, 75000),
        "fabrics":            ["Silk", "Chiffon", "Georgette", "Net"],
        "embroideries":       ["Zardozi", "Gota", "Mirror Work", "Kora"],
    },
    "bridal_saree": {
        "subcategory":        "bridal",
        "item_type":          "bridal_saree",
        "wedding_dress_type": "bridal",
        "label":              "Bridal Saree",
        "price_range":        (22000, 65000),
        "fabrics":            ["Silk", "Georgette", "Net", "Organza"],
        "embroideries":       ["Zardozi", "Gota", "Mirror Work", "Dabka"],
    },
}

# ── Non-dress products (placeholder images, no image-search needed) ──────────
NON_DRESS_PRODUCTS = [
    # Furniture
    {
        "major_category": "furniture", "subcategory": "sofa_set", "item_type": "sofa_set",
        "title": "Beige Fabric Sofa Set 3+2+1 Seater",
        "description": "Classic 6-seater sofa set in premium beige fabric with solid wooden frame. Includes 3-seater, 2-seater, and 1-seater pieces. Comfortable cushioning, scratch-resistant feet.",
        "color": "Beige", "material": "Fabric + Wood", "condition": "New", "price": 85000,
    },
    {
        "major_category": "furniture", "subcategory": "bed_set", "item_type": "bed_set",
        "title": "King Size Dark Walnut Panel Bed",
        "description": "King-size panel bed in dark walnut finish with 2-sided headboard. Includes matching side tables and dressing table. Solid wood construction with anti-scratch coating.",
        "color": "Dark Walnut", "material": "Solid Wood", "condition": "New", "price": 120000,
    },
    {
        "major_category": "furniture", "subcategory": "dining_table", "item_type": "dining_table",
        "title": "White Gold Dining Table 8-Seater",
        "description": "Elegant 8-seater dining table set in white with gold trim detailing. Includes 8 matching chairs with cushioned seats. Tempered glass top with wooden base.",
        "color": "White", "material": "Glass + Wood", "condition": "New", "price": 95000,
    },
    {
        "major_category": "furniture", "subcategory": "dressing_table", "item_type": "dressing_table",
        "title": "White Dressing Table with Full Mirror",
        "description": "Modern white dressing table with full-length mirror and 3 spacious drawers. Sturdy MDF construction with white lacquer finish. Ideal for bridal bedroom setup.",
        "color": "White", "material": "MDF", "condition": "New", "price": 22000,
    },
    # Electronics
    {
        "major_category": "electronics", "subcategory": "led_tv", "item_type": "led_tv",
        "title": "Samsung 43-inch Smart LED TV",
        "description": "Samsung 43-inch Full HD Smart TV with built-in WiFi and multiple HDMI ports. Pre-installed streaming apps, energy-saving mode. 2-year Samsung warranty included.",
        "brand": "Samsung", "color": "Black", "condition": "New", "price": 75000,
    },
    {
        "major_category": "electronics", "subcategory": "refrigerator", "item_type": "refrigerator",
        "title": "Haier 14 Cu.Ft Double Door Refrigerator",
        "description": "Haier 14 cubic feet double door refrigerator with frost-free technology. Silver colour with large vegetable crisper, 3 door shelves, and energy-efficient compressor.",
        "brand": "Haier", "color": "Silver", "condition": "New", "price": 85000,
    },
    {
        "major_category": "electronics", "subcategory": "washing_machine", "item_type": "washing_machine",
        "title": "Dawlance 8kg Fully Automatic Washing Machine",
        "description": "Dawlance 8kg fully automatic front-load washing machine with multiple wash programs. Quick wash, fuzzy logic control, and child safety lock. 1-year company warranty.",
        "brand": "Dawlance", "color": "White", "condition": "New", "price": 55000,
    },
    # Kitchen Items
    {
        "major_category": "kitchen_items", "subcategory": "general_kitchen", "item_type": "crockery_set",
        "title": "Bone China Crockery Set 72-Piece",
        "description": "Elegant 72-piece bone china dinner set in white with classic blue border design. Includes dinner plates, side plates, bowls, mugs, and serving dishes. Dishwasher-safe.",
        "brand": "Royal", "material": "Bone China", "color": "White with Blue", "condition": "New", "price": 18000,
    },
    {
        "major_category": "kitchen_items", "subcategory": "large_appliances", "item_type": "microwave",
        "title": "Dawlance 25L Microwave with Grill",
        "description": "Dawlance 25-litre solo microwave with grill function. Digital display with 10 power levels, child lock, and defrost mode. Stainless steel interior for easy cleaning.",
        "brand": "Dawlance", "material": "Steel", "condition": "New", "price": 22000,
    },
    {
        "major_category": "kitchen_items", "subcategory": "large_appliances", "item_type": "juicer_blender",
        "title": "National 3-in-1 Juicer Blender Set 800W",
        "description": "National 3-in-1 multi-function juicer, blender, and food processor set. 800W motor with stainless steel blades. Comes with 3 speed settings and safety locking system.",
        "brand": "National", "material": "Plastic + Steel", "condition": "New", "price": 8500,
    },
    {
        "major_category": "kitchen_items", "subcategory": "general_kitchen", "item_type": "cooking_set",
        "title": "Stainless Steel Non-Stick Cooking Set 12-Piece",
        "description": "12-piece stainless steel cooking set with non-stick coating. Includes various pots, pans, and lids. Even heat distribution, scratch-resistant base, compatible with all stove types.",
        "brand": "Chef", "material": "Stainless Steel", "condition": "New", "price": 6500,
    },
    # Decoration
    {
        "major_category": "decoration", "subcategory": "lights", "item_type": "fairy_lights",
        "title": "Warm White Fairy Lights 20 Meters Indoor",
        "description": "20-metre warm white LED fairy lights for indoor decoration. Energy-efficient LEDs with 8 lighting modes and timer function. Perfect for wedding stage and dining area.",
        "color": "Warm White", "condition": "New", "price": 2500,
    },
    {
        "major_category": "decoration", "subcategory": "flowers", "item_type": "artificial_flowers",
        "title": "Rose Bundle Red and White 50 Pieces",
        "description": "Bundle of 50 premium quality artificial roses in red and white. Lifelike silk petals with realistic green stems. Ideal for table centerpieces and stage decoration.",
        "color": "Red and White", "condition": "New", "price": 3500,
    },
    {
        "major_category": "decoration", "subcategory": "stage_setup", "item_type": "stage_setup_kit",
        "title": "Stage Backdrop Frame + Curtain Gold Ivory",
        "description": "Complete stage setup kit with adjustable metal backdrop frame and gold-ivory curtain set. Includes draping fabric, LED strip lights, and floral attachments. Easy assembly.",
        "color": "Gold and Ivory", "condition": "New", "price": 25000,
    },
    # Miscellaneous
    {
        "major_category": "miscellaneous", "subcategory": "small_appliances", "item_type": "iron",
        "title": "Westpoint Steam Iron 2200W",
        "description": "Westpoint 2200W steam iron with self-cleaning function and anti-drip system. Stainless steel soleplate with 3 steam settings. Lightweight design with long 2m cord.",
        "brand": "Westpoint", "condition": "New", "price": 3500,
    },
    {
        "major_category": "miscellaneous", "subcategory": "small_appliances", "item_type": "pedestal_fan",
        "title": "GFC 18-inch Pedestal Fan 3 Speed White",
        "description": "GFC 18-inch pedestal fan with 3-speed settings and 360-degree oscillation. Height-adjustable stand, timer function, and quiet motor. Energy-saving with thermal fuse protection.",
        "brand": "GFC", "color": "White", "condition": "New", "price": 4200,
    },
    {
        "major_category": "miscellaneous", "subcategory": "small_appliances", "item_type": "vacuum_cleaner",
        "title": "Philips Handheld Vacuum Cleaner 1000W",
        "description": "Philips 1000W handheld vacuum cleaner with powerful suction and HEPA filter. Compact cordless design with 2-in-1 nozzle and crevice tool. 30-minute battery life.",
        "brand": "Philips", "condition": "New", "price": 8500,
    },
]

# ── Image helpers ─────────────────────────────────────────────────────────────

def copy_image_to_uploads(src_path, major_category, subcategory, product_id):
    """Copy a real training image to uploads/ and return image record."""
    img_id   = str(uuid.uuid4())
    ext      = os.path.splitext(src_path)[1].lower() or ".jpg"
    filename = f"{img_id}{ext}"
    dest_dir = os.path.join(UPLOADS_DIR, major_category, subcategory, product_id)
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy2(src_path, os.path.join(dest_dir, filename))
    rel      = f"{major_category}/{subcategory}/{product_id}/{filename}".replace("\\", "/")
    return {
        "image_id":        img_id,
        "original_name":   os.path.basename(src_path),
        "stored_filename": filename,
        "relative_path":   rel,
        "abs_path":        os.path.join(dest_dir, filename),
        "image_url":       f"/images/{rel}",
        "is_primary":      True,
        "uploaded_at":     datetime.utcnow().isoformat(),
    }


def make_placeholder_image(major_category, subcategory, product_id):
    """Create a solid-colour placeholder image for non-dress products."""
    color_map = {
        "furniture":     (150, 100,  60),
        "electronics":   ( 60, 100, 180),
        "kitchen_items": ( 80, 160, 100),
        "decoration":    (220, 150,  50),
        "miscellaneous": (120, 120, 120),
    }
    color = color_map.get(major_category, (150, 150, 150))
    img   = Image.new("RGB", (64, 64), color)
    buf   = BytesIO()
    img.save(buf, format="JPEG", quality=85)

    img_id   = str(uuid.uuid4())
    filename = "placeholder.jpg"
    dest_dir = os.path.join(UPLOADS_DIR, major_category, subcategory, product_id)
    os.makedirs(dest_dir, exist_ok=True)
    with open(os.path.join(dest_dir, filename), "wb") as f:
        f.write(buf.getvalue())
    rel = f"{major_category}/{subcategory}/{product_id}/{filename}".replace("\\", "/")
    return {
        "image_id":        img_id,
        "original_name":   filename,
        "stored_filename": filename,
        "relative_path":   rel,
        "abs_path":        os.path.join(dest_dir, filename),
        "image_url":       f"/images/{rel}",
        "is_primary":      True,
        "uploaded_at":     datetime.utcnow().isoformat(),
    }


def extract_embedding(image_path, model):
    """Extract 1280-dim EfficientNet backbone embedding from an image file."""
    import torch
    from torchvision import transforms

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    img    = Image.open(image_path).convert("RGB")
    tensor = transform(img).unsqueeze(0)
    model.eval()
    with torch.no_grad():
        # Use backbone features (1280-dim) for EfficientNet-B0
        features = model.get_backbone_features(tensor)
    return features.cpu().numpy().flatten().tolist()


def extract_color_from_description(desc):
    """Extract dominant colour from description text (e.g. 'deep red bridal lehenga' → 'deep red')."""
    words = desc.lower().split()
    # Take up to first 2 words before the dress type as the colour
    dress_types = {"bridal", "lehenga", "sharara", "saree", "groom", "sherwani"}
    color_words = []
    for w in words:
        if w in dress_types:
            break
        color_words.append(w)
    return " ".join(color_words[:2]).title() if color_words else "Multi"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "=" * 65)
    print("  ShaadiSahulat — Complete Category Seeder (v2)")
    print("=" * 65)

    client = MongoClient(MONGO_URI)
    db     = client[MONGO_DB]

    # ── 1. Upsert Ahmed Traders seller ───────────────────────────────
    print("\n[1] Upserting Ahmed Traders seller…")
    db[SELLERS_COLLECTION].update_one(
        {"email": SELLER["email"]},
        {"$set": SELLER},
        upsert=True,
    )
    print(f"    seller_id : {SELLER['seller_id']}")
    print(f"    email     : {SELLER['email']}  password: Test@1234")
    print(f"    level     : 3  (completed_orders: {SELLER['completed_orders']})")

    # ── 2. Remove all old seeded products ────────────────────────────
    print("\n[2] Cleaning old seeded data…")
    d1 = db[PRODUCTS_COLLECTION].delete_many({"seller_id": SELLER["seller_id"]})
    old = db[SELLERS_COLLECTION].find_one({"email": "admin@shaadisahulat.com"})
    d2  = 0
    if old:
        res = db[PRODUCTS_COLLECTION].delete_many({"seller_id": old.get("seller_id", "__none__")})
        d2  = res.deleted_count
    if "dress_catalog" in db.list_collection_names():
        db.drop_collection("dress_catalog")
        print("    Dropped legacy dress_catalog collection.")
    print(f"    Removed {d1.deleted_count + d2} old products.")

    # ── 3. Load descriptions.json ─────────────────────────────────────
    desc_file = os.path.join(os.path.dirname(__file__), "descriptions.json")
    descriptions = {}
    if os.path.exists(desc_file):
        with open(desc_file, encoding="utf-8") as fh:
            raw = json.load(fh)
        for cat_id, cat_descs in raw.items():
            if isinstance(cat_descs, dict):
                descriptions[cat_id] = cat_descs
        print(f"\n[3] Loaded descriptions.json ({sum(len(v) for v in descriptions.values())} entries).")
    else:
        print("\n[3] descriptions.json not found — titles will be used as descriptions.")

    # ── 4. Load EfficientNet model ────────────────────────────────────
    model = None
    try:
        from model import load_model_for_inference
        model = load_model_for_inference(MODEL_DIR, BACKBONE)
        print("[4] EfficientNet model loaded — real embeddings will be generated.")
    except Exception as e:
        print(f"[4] WARNING: Model load failed ({e}). Dress embeddings will be empty → image search won't work.")

    # ── 5. Load TF-IDF engine ─────────────────────────────────────────
    tfidf_fn = None
    try:
        from tfidf_engine import description_to_tfidf_dict, vectorizer_is_fitted, fit_vectorizer
        if not vectorizer_is_fitted():
            print("[5] Fitting TF-IDF vectorizer from all descriptions…")
            all_descs = [d for cat in descriptions.values() for d in cat.values() if d]
            if all_descs:
                fit_vectorizer(all_descs)
        tfidf_fn = description_to_tfidf_dict
        print("[5] TF-IDF engine ready.")
    except Exception as e:
        print(f"[5] WARNING: TF-IDF unavailable ({e}). Text search will be degraded.")

    # ── 6. Seed DRESS products from training_data/ ────────────────────
    print(f"\n[6] Seeding wedding dress products from training_data/…")
    dress_count = 0
    valid_exts  = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    for cat_id, cat_info in DRESS_CATS.items():
        cat_dir  = os.path.join(TRAINING_DATA_DIR, cat_id)
        cat_descs = descriptions.get(cat_id, {})

        if not os.path.isdir(cat_dir):
            print(f"    WARNING: {cat_dir} not found — skipping {cat_id}")
            continue

        files = sorted(
            f for f in os.listdir(cat_dir)
            if os.path.splitext(f)[1].lower() in valid_exts
        )
        print(f"\n    [{cat_id}] — {len(files)} images")

        for idx, fname in enumerate(files):
            src_path = os.path.join(cat_dir, fname)
            desc     = cat_descs.get(fname, "").strip() or cat_descs.get(fname.lower(), "").strip()
            if not desc:
                desc = f"{cat_info['label']} — elegant bridal outfit with embroidery"

            color      = extract_color_from_description(desc)
            fabric     = random.choice(cat_info["fabrics"])
            embroidery = random.choice(cat_info["embroideries"])
            p_min, p_max = cat_info["price_range"]
            price      = random.randint(p_min, p_max)
            discount   = int(price * random.uniform(0.80, 0.93))
            stock      = random.randint(2, 8)
            condition  = "Thrift" if idx % 4 == 3 else "New"
            title      = f"{color} {cat_info['label']} ({condition})"
            product_id = f"sp_{uuid.uuid4().hex[:16]}"

            # Copy image to uploads/wedding_dress/{subcategory}/{product_id}/
            img_rec = copy_image_to_uploads(
                src_path, "wedding_dress", cat_info["subcategory"], product_id
            )

            # Generate real embedding
            embedding = []
            if model is not None:
                try:
                    embedding = extract_embedding(src_path, model)
                except Exception as ex:
                    print(f"      WARNING: embedding failed ({ex})")

            # TF-IDF vector
            tfidf_vec = {}
            keywords  = []
            if tfidf_fn:
                try:
                    tfidf_vec = tfidf_fn(desc)
                    keywords  = sorted(tfidf_vec, key=tfidf_vec.get, reverse=True)[:10]
                except Exception:
                    pass

            doc = {
                "product_id":          product_id,
                "seller_id":           SELLER["seller_id"],
                "seller_name":         SELLER["name"],
                "major_category":      "wedding_dress",
                "subcategory":         cat_info["subcategory"],
                "item_type":           cat_info["item_type"],
                "category":            cat_info["item_type"],   # compat for search
                "wedding_dress_type":  cat_info["wedding_dress_type"],
                "title":               title,
                "description":         desc,
                "color":               color,
                "fabric":              fabric,
                "embroidery_type":     embroidery,
                "size":                "M",
                "material":            "",
                "brand":               "",
                "condition":           condition,
                "city":                SELLER["city"],
                "price":               float(price),
                "discount_price":      float(discount),
                "discount_pct":        round((price - discount) / price * 100, 1),
                "stock_quantity":      stock,
                "availability_status": "available",
                "images":              [img_rec],
                "primary_image_url":   img_rec["image_url"],
                "image_embeddings":    [{"image_id": img_rec["image_id"], "embedding": embedding}] if embedding else [],
                "tfidf_vector":        tfidf_vec,
                "keywords":            keywords,
                "color_info":          {},
                "embroidery_density":  "heavy",
                "created_at":          NOW,
                "updated_at":          NOW,
            }

            db[PRODUCTS_COLLECTION].insert_one(doc)
            dress_count += 1
            emb_dim = len(embedding) if embedding else 0
            print(f"      ✓ {title[:55]}  | PKR {price:,} | {emb_dim}-dim")

    # ── 7. Seed NON-DRESS products with placeholder images ────────────
    print(f"\n[7] Seeding non-dress category products…")
    other_count = 0

    for prod_data in NON_DRESS_PRODUCTS:
        product_id = f"sp_{uuid.uuid4().hex[:16]}"
        major_cat  = prod_data["major_category"]
        subcat     = prod_data.get("subcategory", "general")
        desc       = prod_data["description"]

        img_rec   = make_placeholder_image(major_cat, subcat, product_id)
        tfidf_vec = {}
        keywords  = []
        if tfidf_fn:
            try:
                tfidf_vec = tfidf_fn(desc)
                keywords  = sorted(tfidf_vec, key=tfidf_vec.get, reverse=True)[:10]
            except Exception:
                pass

        doc = {
            "product_id":          product_id,
            "seller_id":           SELLER["seller_id"],
            "seller_name":         SELLER["name"],
            "major_category":      major_cat,
            "subcategory":         subcat,
            "item_type":           prod_data.get("item_type", subcat),
            "category":            prod_data.get("item_type", subcat),
            "wedding_dress_type":  "",
            "title":               prod_data["title"],
            "description":         desc,
            "color":               prod_data.get("color", ""),
            "fabric":              "",
            "embroidery_type":     "",
            "size":                "",
            "material":            prod_data.get("material", ""),
            "brand":               prod_data.get("brand", ""),
            "condition":           prod_data.get("condition", "New"),
            "city":                SELLER["city"],
            "price":               float(prod_data["price"]),
            "discount_price":      None,
            "discount_pct":        None,
            "stock_quantity":      5,
            "availability_status": "available",
            "images":              [img_rec],
            "primary_image_url":   img_rec["image_url"],
            "image_embeddings":    [],     # placeholder — no visual search for non-dress
            "tfidf_vector":        tfidf_vec,
            "keywords":            keywords,
            "color_info":          {},
            "embroidery_density":  "",
            "created_at":          NOW,
            "updated_at":          NOW,
        }

        db[PRODUCTS_COLLECTION].insert_one(doc)
        other_count += 1
        print(f"    ✓ [{major_cat}] {prod_data['title'][:55]}")

    # ── 8. Rebuild TF-IDF corpus ──────────────────────────────────────
    print("\n[8] Rebuilding TF-IDF corpus…")
    try:
        from tfidf_engine import rebuild_tfidf_corpus
        rebuild_tfidf_corpus()
        print("    TF-IDF corpus rebuilt.")
    except Exception as e:
        print(f"    WARNING: TF-IDF rebuild failed ({e}).")

    # ── 9. Rebuild embedding index ────────────────────────────────────
    if model is not None:
        print("\n[9] Rebuilding embedding index from all dress products…")
        try:
            from embedding_index import rebuild_seller_index
            rebuild_seller_index(model)
            print("    Embedding index rebuilt.")
        except Exception as e:
            print(f"    WARNING: Index rebuild failed ({e}).")

    client.close()

    total = dress_count + other_count
    print(f"\n{'=' * 65}")
    print(f"  Seeding complete!")
    print(f"  Dress products (with real embeddings) : {dress_count}")
    print(f"  Other category products               : {other_count}")
    print(f"  Total                                 : {total}")
    print(f"  Seller : {SELLER['email']}  /  Test@1234")
    print(f"  Level  : 3  (completed_orders: {SELLER['completed_orders']})")
    print(f"{'=' * 65}\n")


if __name__ == "__main__":
    main()
