"""
ShaadiSahulat - Seed Catalog Script
=====================================
One-shot script that:
  1. Reads your manual descriptions from descriptions.json
  2. Copies all training images → catalog/{category}/
  3. Extracts 128-dim embeddings with the pretrained (or fine-tuned) EfficientNet-B0
  4. Fits TF-IDF vectorizer on all descriptions
  5. Writes everything to MongoDB Atlas

Run ONCE before starting the Flask service.
After this, the /visual/recommend endpoint will return real results.

Usage
-----
  python seed_catalog.py

  # To clear MongoDB and rebuild from scratch:
  python seed_catalog.py --clear

  # To skip copying images (if catalog/ already has them):
  python seed_catalog.py --no-copy
"""

import argparse
import json
import os
import shutil
import sys

import torch

# Make sure the service directory is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import (
    TRAINING_DATA_DIR, CATALOG_DIR, DESCRIPTIONS_FILE,
    MODEL_DIR, BACKBONE, CATEGORY_IDS, CATEGORY_LABELS,
)
from model import load_model_for_inference, is_model_fine_tuned
from embedding_index import build_index
from mongo_catalog import clear_catalog, ensure_indexes


# ── Helpers ────────────────────────────────────────────────────────────────

def _load_descriptions() -> dict:
    if not os.path.exists(DESCRIPTIONS_FILE):
        print(f"[Seed] descriptions.json not found at {DESCRIPTIONS_FILE}")
        print("[Seed] All descriptions will be auto-generated from images.")
        return {}

    with open(DESCRIPTIONS_FILE, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    # Remove the instructions key
    data.pop("_instructions", None)

    filled = sum(
        1 for cat in data.values() if isinstance(cat, dict)
        for v in cat.values() if v and v.strip()
    )
    total = sum(
        len(cat) for cat in data.values() if isinstance(cat, dict)
    )
    print(f"[Seed] descriptions.json: {filled}/{total} descriptions filled in")
    if filled == 0:
        print("[Seed] Tip: Open descriptions.json and write a description for each image")
        print("       for better text-matching. Empty entries will be auto-generated.")

    return data


def _copy_training_to_catalog(descriptions_dict: dict) -> int:
    """Copy training images to catalog/. Returns total files copied."""
    copied = 0
    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    for cat_id in CATEGORY_IDS:
        src_dir = os.path.join(TRAINING_DATA_DIR, cat_id)
        dst_dir = os.path.join(CATALOG_DIR, cat_id)
        os.makedirs(dst_dir, exist_ok=True)

        if not os.path.exists(src_dir):
            print(f"  [Seed] No training folder for {cat_id} — skipping")
            continue

        files = [
            f for f in os.listdir(src_dir)
            if os.path.splitext(f)[1].lower() in valid_exts
        ]

        for fname in files:
            src = os.path.join(src_dir, fname)
            dst = os.path.join(dst_dir, fname)
            shutil.copy2(src, dst)
            copied += 1

        print(f"  [Seed] {cat_id}: copied {len(files)} images → catalog/{cat_id}/")

    return copied


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed ShaadiSahulat catalog")
    parser.add_argument("--clear",   action="store_true",
                        help="Clear MongoDB catalog before seeding")
    parser.add_argument("--no-copy", action="store_true",
                        help="Skip copying images (use existing catalog/ contents)")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  ShaadiSahulat — Catalog Seeder")
    print("=" * 60)

    # ── Step 1: Load descriptions ──────────────────────────────────────────
    descriptions_dict = _load_descriptions()

    # ── Step 2: Copy images ────────────────────────────────────────────────
    if not args.no_copy:
        print("\n[Seed] Copying training images → catalog/ …")
        copied = _copy_training_to_catalog(descriptions_dict)
        if copied == 0:
            print("[Seed] No images found in training_data/. Add images first.")
            sys.exit(1)
        print(f"[Seed] {copied} images copied.")
    else:
        print("[Seed] Skipping image copy (--no-copy flag set).")

    # ── Step 3: Load model ─────────────────────────────────────────────────
    device = "cuda" if torch.cuda.is_available() else "cpu"
    fine_tuned = is_model_fine_tuned()

    print(f"\n[Seed] Loading model (backbone={BACKBONE}, device={device}) …")
    if fine_tuned:
        print("[Seed] Fine-tuned model found — using fine-tuned weights.")
    else:
        print("[Seed] No fine-tuned model found — using pretrained ImageNet weights.")
        print("[Seed] Results will still be meaningful (visual similarity works).")
        print("[Seed] For category-accurate results, train on Colab first.")

    model = load_model_for_inference(MODEL_DIR, BACKBONE, device)

    # ── Step 4: Clear MongoDB (optional) ──────────────────────────────────
    if args.clear:
        print("\n[Seed] Clearing existing MongoDB catalog …")
        clear_catalog()

    # ── Step 5: Build index ────────────────────────────────────────────────
    ensure_indexes()
    print("\n[Seed] Building index from catalog/ …")
    total, by_cat = build_index(model, CATALOG_DIR, device, descriptions_dict)

    # ── Report ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  DONE!")
    print(f"  Total products indexed: {total}")
    for cat, count in by_cat.items():
        label = CATEGORY_LABELS.get(cat, cat)
        print(f"    {label}: {count}")
    print("\n  You can now start the Flask service:")
    print("  > python app.py")
    print("  Then POST an image to /visual/recommend to test.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
