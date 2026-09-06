"""
ShaadiSahulat - TF-IDF Backfill Script (one-time)
===================================================
Run this ONCE after deploying the TF-IDF changes (expanded vocabulary,
new search_hybrid, etc.) to refresh the `tfidf_vector` field on all
existing seller_products in MongoDB.

Why this is needed
------------------
When the TF-IDF vectorizer vocabulary changes (e.g. when the corpus is
extended from wedding-dress-only to cover furniture / electronics /
kitchen / decoration / miscellaneous), old product documents in MongoDB
still carry TF-IDF vectors computed against the OLD vocabulary. Those
stale vectors will mostly fail to match new query terms.  This script
recomputes every product's `tfidf_vector` from its `description` field
using the freshly-fit vectorizer.

It also backfills thrift products that were inserted directly into
MongoDB (outside the /seller/product route) and may have an empty or
missing tfidf_vector field.

Usage
-----
  cd visual-ml-service
  python backfill_tfidf.py

Pre-requisites
--------------
1. Run `python fit_corpus_vectorizer.py` first so the new vectorizer
   pkl is in place at data/tfidf_vectorizer.pkl.
2. MongoDB must be reachable (uses the same MONGO_URI as the rest of
   the service).

Output
------
Prints a summary line like:
  Backfilled 47 products. 12 already had vectors. 0 errors.
"""

import os
import sys

# Bootstrap path so local imports work when run directly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

    from config import MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION
    from tfidf_engine import load_vectorizer, backfill_missing_tfidf

    print("=" * 60)
    print("  ShaadiSahulat — TF-IDF Backfill (one-time)")
    print("=" * 60)
    print(f"  MongoDB       : {MONGO_DB}.{PRODUCTS_COLLECTION}")
    print(f"  Vectorizer pkl: data/tfidf_vectorizer.pkl")
    print()

    # 1. Verify the vectorizer is fitted before touching the DB.
    if load_vectorizer() is None:
        print("[ERROR] TF-IDF vectorizer not fitted.")
        print("        Run `python fit_corpus_vectorizer.py` first, then re-run this script.")
        sys.exit(1)

    # 2. Connect to MongoDB.
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.server_info()
    except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
        print(f"[ERROR] Cannot connect to MongoDB: {exc}")
        sys.exit(2)

    db = client[MONGO_DB]

    # 3. Count current state for visibility.
    total_products = db[PRODUCTS_COLLECTION].count_documents({})
    missing_count = db[PRODUCTS_COLLECTION].count_documents({
        "$or": [
            {"tfidf_vector": {"$exists": False}},
            {"tfidf_vector": {}},
            {"tfidf_vector": None},
        ],
    })
    print(f"  Found {total_products} total products in {PRODUCTS_COLLECTION}.")
    print(f"  {missing_count} products are missing/empty tfidf_vector — will attempt backfill.")
    print()

    # 4. Run the backfill.
    backfilled, already_had, errors = backfill_missing_tfidf(db)

    client.close()

    # 5. Print the summary line requested by the spec.
    print()
    print(f"Backfilled {backfilled} products. {already_had} already had vectors. {errors} errors.")
    print()
    print("[done] TF-IDF backfill complete.")
    print()
    print("REMINDER: You only need to run this script ONCE after deploying these changes.")
    print("          New product uploads via POST /seller/product will automatically compute")
    print("          their own tfidf_vector at upload time — no future backfill needed.")


if __name__ == "__main__":
    main()
