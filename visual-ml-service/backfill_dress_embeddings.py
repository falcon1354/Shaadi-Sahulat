"""
Backfill EfficientNet embeddings for ALL wedding_dress products in MongoDB
(seller uploads + scraped, new + thrift).

Vectors are stored on each seller_products document (image_embeddings) — not
as a separate local index file. Visual Dress Recommendation then picks them up.

Usage (from visual-ml-service/):
  python backfill_dress_embeddings.py
  python backfill_dress_embeddings.py --force          # re-embed even if present
  python backfill_dress_embeddings.py --limit 20
  python backfill_dress_embeddings.py --type thrift
  python backfill_dress_embeddings.py --type new
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Repo-root .env
_root_env = Path(__file__).resolve().parents[1] / ".env"
if _root_env.is_file():
    for _line in _root_env.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(description="Backfill dress EfficientNet embeddings into MongoDB")
    parser.add_argument("--force", action="store_true", help="Re-embed products that already have vectors")
    parser.add_argument("--limit", type=int, default=0, help="Max products to process (0 = all)")
    parser.add_argument("--type", choices=["new", "thrift"], default=None, help="Only this marketplace_type")
    args = parser.parse_args()

    from dress_embedding import backfill_dress_embeddings, has_torch

    print("=" * 60)
    print("  ShaadiSahulat — Dress Embedding Backfill → MongoDB")
    print("=" * 60)
    print(f"  Torch available : {has_torch()}")
    print(f"  Force           : {args.force}")
    print(f"  Limit           : {args.limit or 'all'}")
    print(f"  Marketplace     : {args.type or 'new + thrift'}")
    print()

    result = backfill_dress_embeddings(
        force=args.force,
        limit=args.limit,
        marketplace_type=args.type,
    )
    if not result.get("ok"):
        print("ERROR:", result.get("error"))
        sys.exit(1)

    print()
    print(f"Done. processed={result['processed']}  embedded={result['embedded']}  failed={result['failed']}")
    if result.get("errors"):
        print("Sample failures:")
        for e in result["errors"][:10]:
            print(f"  - {e.get('product_id')}: {e.get('reason')}")


if __name__ == "__main__":
    main()
