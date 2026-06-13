"""
ShaadiSahulat — Dummy Data Seeder
==================================
Creates one dummy seller and seeds 30 products (10 per category) from
training_data/ images into MongoDB seller_products collection.

Each product gets:
  • 1280-dim EfficientNet-B0 backbone embedding
  • TF-IDF vector from descriptions.json (or auto-generated)
  • Realistic random price / discount / stock values
  • Image copied to uploads/{category}/{product_id}/uuid.ext

Usage:
  python seed_dummy_data.py           # skips if products already exist
  python seed_dummy_data.py --force   # clears all seller products + re-seeds
"""

import os
import sys
import json
import uuid
import shutil
import random
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import torch
import torchvision.transforms as transforms
from PIL import Image

from config import (
    CATEGORY_IDS, CATEGORY_LABELS, TRAINING_DATA_DIR,
    UPLOADS_DIR, MODEL_DIR, BACKBONE, DESCRIPTIONS_FILE,
    PRODUCTS_COLLECTION, IMAGE_SIZE,
)
from model import load_model_for_inference
from tfidf_engine import fit_vectorizer, description_to_tfidf_dict, vectorizer_is_fitted
from description_generator import generate_description
from mongo_seller import (
    create_seller, get_seller_by_email,
    create_product, update_product_embeddings,
    ensure_seller_indexes, _get_db,
)

# ── Dummy seller ───────────────────────────────────────────────────────────────

DUMMY_SELLER = {
    "name":     "ShaadiSahulat Demo",
    "email":    "admin@shaadisahulat.com",
    "password": "Admin@1234",
    "phone":    "0300-0000000",
    "city":     "Lahore",
}

# ── Product metadata ──────────────────────────────────────────────────────────

PRICE_RANGES = {
    "bridal_lehenga": (35_000, 95_000),
    "bridal_sharara": (28_000, 75_000),
    "bridal_saree":   (22_000, 65_000),
}

FABRICS          = ["silk", "net", "organza", "chiffon", "georgette", "velvet"]
EMBROIDERY_TYPES = ["zardozi", "gota", "mirror work", "dabka", "tilla", "kora"]

_COLORS = {
    "bridal_lehenga": ["deep red", "maroon", "golden", "pink", "black",
                       "white", "blue", "deep blue", "yellow", "deep golden"],
    "bridal_sharara": ["deep green", "deep red", "deep blue", "gray", "deep pink",
                       "red", "pink", "red", "purple", "white"],
    "bridal_saree":   ["deep green", "deep pink", "deep purple", "white", "deep red",
                       "gray", "red", "black", "yellow", "red"],
}

# ── Image processing ──────────────────────────────────────────────────────────

_TRANSFORM = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def _backbone_embedding(image_path: str, model) -> list[float]:
    img    = Image.open(image_path).convert("RGB")
    tensor = _TRANSFORM(img).unsqueeze(0)
    model.eval()
    with torch.no_grad():
        emb = model.get_backbone_features(tensor)
    return emb.cpu().numpy().flatten().tolist()


def _copy_to_uploads(src: str, category: str, product_id: str) -> dict:
    """Copy training image → uploads/{category}/{product_id}/uuid.ext"""
    img_id   = str(uuid.uuid4())
    ext      = os.path.splitext(src)[1].lower() or ".jpg"
    filename = f"{img_id}{ext}"
    dest_dir = os.path.join(UPLOADS_DIR, category, product_id)
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy2(src, os.path.join(dest_dir, filename))
    rel = f"{category}/{product_id}/{filename}".replace("\\", "/")
    return {
        "image_id":        img_id,
        "original_name":   os.path.basename(src),
        "stored_filename": filename,
        "relative_path":   rel,
        "abs_path":        os.path.join(dest_dir, filename),
        "image_url":       f"/images/{rel}",
        "is_primary":      True,
        "uploaded_at":     datetime.utcnow().isoformat(),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="Delete all existing seller products before seeding")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  ShaadiSahulat — Dummy Data Seeder")
    print("=" * 60)

    ensure_seller_indexes()

    # ── Step 1: TF-IDF vectorizer ────────────────────────────────────────────
    if not vectorizer_is_fitted():
        print("[Seed] Fitting TF-IDF vectorizer...")
        try:
            from fit_corpus_vectorizer import main as fit_corpus
            fit_corpus()
        except Exception as e:
            print(f"[Seed] fit_corpus_vectorizer error: {e}")
            if os.path.exists(DESCRIPTIONS_FILE):
                with open(DESCRIPTIONS_FILE, encoding="utf-8") as fh:
                    raw = json.load(fh)
                descs = [v for cat in raw.values() if isinstance(cat, dict)
                         for v in cat.values() if isinstance(v, str) and v.strip()]
                if descs:
                    fit_vectorizer(descs)
                    print(f"[Seed] Fitted TF-IDF on {len(descs)} descriptions")
    else:
        print("[Seed] TF-IDF vectorizer already fitted.")

    # ── Step 2: Load descriptions.json ──────────────────────────────────────
    descriptions: dict = {}
    if os.path.exists(DESCRIPTIONS_FILE):
        with open(DESCRIPTIONS_FILE, encoding="utf-8") as fh:
            raw = json.load(fh)
        for cat_id, cat_descs in raw.items():
            if isinstance(cat_descs, dict) and cat_id in CATEGORY_IDS:
                descriptions[cat_id] = cat_descs
        total_descs = sum(len(v) for v in descriptions.values())
        print(f"[Seed] Loaded {total_descs} descriptions from descriptions.json")

    # ── Step 3: MongoDB connection ───────────────────────────────────────────
    db = _get_db()
    if db is None:
        print("[Seed] ERROR: Cannot connect to MongoDB. Check MONGODB_URI.")
        sys.exit(1)

    # ── Step 4: Optional clear ───────────────────────────────────────────────
    if args.force:
        n = db[PRODUCTS_COLLECTION].delete_many({}).deleted_count
        print(f"[Seed] Cleared {n} existing seller products.")

    # ── Step 5: Check existing ───────────────────────────────────────────────
    existing = db[PRODUCTS_COLLECTION].count_documents({})
    if existing > 0 and not args.force:
        print(f"[Seed] {existing} products already exist. Use --force to re-seed.")
        sys.exit(0)

    # ── Step 6: Get or create dummy seller ───────────────────────────────────
    seller_doc = get_seller_by_email(DUMMY_SELLER["email"])
    if seller_doc and "error" not in seller_doc:
        print(f"[Seed] Using existing seller: {seller_doc['seller_id']}")
    else:
        seller_doc = create_seller(
            name=DUMMY_SELLER["name"],
            email=DUMMY_SELLER["email"],
            phone=DUMMY_SELLER["phone"],
            city=DUMMY_SELLER["city"],
            password=DUMMY_SELLER["password"],
        )
        if seller_doc is None:
            print("[Seed] ERROR: Could not create seller.")
            sys.exit(1)
        print(f"[Seed] Created seller: {seller_doc['seller_id']}")

    seller_id   = seller_doc["seller_id"]
    seller_name = seller_doc["name"]

    # ── Step 7: Load model ───────────────────────────────────────────────────
    print("[Seed] Loading EfficientNet-B0...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model  = load_model_for_inference(MODEL_DIR, BACKBONE, device)
    print(f"[Seed] Model ready on {device}.")

    # ── Step 8: Seed products ────────────────────────────────────────────────
    total = 0
    for cat_id in CATEGORY_IDS:
        cat_label = CATEGORY_LABELS[cat_id]
        cat_dir   = os.path.join(TRAINING_DATA_DIR, cat_id)
        cat_descs = descriptions.get(cat_id, {})
        colors    = _COLORS.get(cat_id, ["red"] * 10)
        p_min, p_max = PRICE_RANGES[cat_id]

        if not os.path.exists(cat_dir):
            print(f"[Seed] WARNING: {cat_dir} not found — skipping {cat_id}")
            continue

        valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        files = sorted(
            f for f in os.listdir(cat_dir)
            if os.path.splitext(f)[1].lower() in valid_exts
        )
        print(f"\n[Seed] {cat_id}: {len(files)} images...")

        for idx, fname in enumerate(files):
            total   += 1
            src      = os.path.join(cat_dir, fname)
            desc_txt = cat_descs.get(fname, "").strip()

            if not desc_txt:
                try:
                    auto     = generate_description(src, cat_id, cat_label)
                    desc_txt = auto.get("description", f"{cat_label.lower()} dress")
                except Exception:
                    desc_txt = f"{colors[idx % len(colors)]} {cat_label.lower()}"

            price    = random.randint(p_min, p_max)
            discount = int(price * random.uniform(0.80, 0.92))
            stock    = random.randint(2, 12)
            color    = colors[idx % len(colors)]
            title    = f"{color.title()} {cat_label}"

            # Insert MongoDB record (status: processing)
            product    = create_product(
                seller_id=seller_id,
                seller_name=seller_name,
                title=title,
                description=desc_txt,
                category=cat_id,
                color=color,
                fabric=random.choice(FABRICS),
                embroidery_type=random.choice(EMBROIDERY_TYPES),
                bridal_type="bridal",
                price=float(price),
                discount_price=float(discount),
                stock_quantity=stock,
            )
            pid = product["product_id"]

            try:
                img_rec   = _copy_to_uploads(src, cat_id, pid)
                embedding = _backbone_embedding(src, model)

                try:
                    desc_data = generate_description(src, cat_id, cat_label)
                    desc_data["description"] = desc_txt
                except Exception:
                    desc_data = {
                        "description": desc_txt,
                        "keywords":    [w for w in desc_txt.lower().split() if len(w) > 2],
                        "color_info":  {},
                        "embroidery_density": "medium",
                    }

                tfidf_vec = description_to_tfidf_dict(desc_txt)

                update_product_embeddings(
                    product_id=pid,
                    image_records=[img_rec],
                    image_embeddings=[{"image_id": img_rec["image_id"], "embedding": embedding}],
                    tfidf_vector=tfidf_vec,
                    desc_data=desc_data,
                )
                print(f"  [#{total:02d}] {title[:45]:<45} | PKR {price:>6,} | {len(embedding)}-dim")

            except Exception as exc:
                print(f"  [#{total:02d}] ERROR ({fname}): {exc}")

    print(f"\n[Seed] Done! Seeded {total} products into seller_products.")
    print(f"[Seed] Demo seller  : {DUMMY_SELLER['email']}")
    print(f"[Seed] Demo password: {DUMMY_SELLER['password']}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
