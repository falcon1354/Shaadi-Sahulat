"""
ShaadiSahulat - TF-IDF Engine
==============================
Handles text vectorisation for the hybrid recommendation system.

Workflow
--------
1. At index-build time:
   - Collect all catalog descriptions
   - Fit TfidfVectorizer on them
   - Save the fitted vectorizer to data/tfidf_vectorizer.pkl

2. At query time:
   - Load the saved vectorizer (singleton)
   - Transform the query description → sparse dict {term: weight}
   - Compute cosine similarity against each catalog entry's stored dict

Why sparse dicts instead of dense arrays?
   MongoDB stores the TF-IDF vector as a plain dict, which is BSON-friendly.
   No numpy arrays hit the DB; similarity is computed in Python at query time.
"""

import os
import re
import pickle
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from config import DATA_DIR, TFIDF_PKL_PATH

_vectorizer: TfidfVectorizer | None = None   # module-level singleton

# ── NLP Preprocessing ──────────────────────────────────────────────────────
# Corrects common Urdu-transliteration and fashion-domain misspellings so
# user-typed descriptions match the TF-IDF vocabulary built from catalog data.

_CORRECTIONS: dict[str, str] = {
    # dress categories
    "lehnga": "lehenga", "lhnga": "lehenga", "lahnga": "lehenga",
    "lagha": "lehenga",  "ghaghra": "lehenga",
    "shararra": "sharara", "sharra": "sharara", "shrara": "sharara",
    "sari": "saree", "saari": "saree",
    # fabrics
    "georgett": "georgette", "gorgette": "georgette", "gorgtte": "georgette",
    "chifon": "chiffon", "chiffoon": "chiffon", "chifoon": "chiffon",
    "organsa": "organza", "organeza": "organza",
    "velvet": "velvet",  # already correct — keeps dict pattern
    # embroidery
    "zardozy": "zardozi", "zardoze": "zardozi", "zardosi": "zardozi",
    "embrodery": "embroidery", "embroedery": "embroidery",
    "embrodiery": "embroidery", "emb": "embroidery", "embo": "embroidery",
    # colours
    "redd": "red", "marroon": "maroon", "maron": "maroon",
    "grenn": "green",   "gren": "green",
    "bule": "blue",     "blu": "blue",
    "pnk": "pink",      "pnik": "pink",
    "purpl": "purple",  "pruple": "purple",
    "whte": "white",    "wite": "white",
    "blck": "black",    "blak": "black",
    "golded": "golden", "golen": "golden",
    # style descriptors
    "bridel": "bridal", "bridl": "bridal",
    "hvy": "heavy",     "lght": "light",   "med": "medium",
    "intricate": "intricate",              # already correct — guards against "intricte"
    "intricte": "intricate",
}


def preprocess_text(text: str) -> str:
    """
    Clean and normalise a user-typed dress description before TF-IDF.

    Steps:
    1. Lowercase
    2. Remove punctuation and digits
    3. Apply Urdu-fashion misspelling corrections word-by-word
    4. Collapse whitespace

    Returns a clean string ready for description_to_tfidf_dict().
    """
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", " ", text)   # remove punctuation
    text = re.sub(r"\d+", " ", text)        # remove digits
    words = text.split()
    words = [_CORRECTIONS.get(w, w) for w in words]
    return " ".join(words)


# ── Fit ───────────────────────────────────────────────────────────────────

def fit_vectorizer(descriptions: list[str]) -> TfidfVectorizer:
    """
    Fit a TF-IDF vectorizer on `descriptions` and save it to disk.

    Parameters
    ----------
    descriptions : list of plain-text dress descriptions

    Returns
    -------
    Fitted TfidfVectorizer instance.
    """
    global _vectorizer

    vectorizer = TfidfVectorizer(
        max_features=300,          # vocabulary cap — keeps vectors compact
        ngram_range=(1, 2),        # unigrams + bigrams ("heavy embroidery", "bridal lehenga")
        stop_words="english",
        min_df=1,                  # include terms appearing ≥ 1 time
        sublinear_tf=True,         # log(1+tf) — reduces dominance of common words
    )
    vectorizer.fit(descriptions)
    _vectorizer = vectorizer

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(TFIDF_PKL_PATH, "wb") as fh:
        pickle.dump(vectorizer, fh)

    print(f"[TF-IDF] Fitted on {len(descriptions)} descriptions, "
          f"vocabulary size: {len(vectorizer.vocabulary_)}")
    return vectorizer


# ── Load (singleton) ──────────────────────────────────────────────────────

def load_vectorizer() -> TfidfVectorizer | None:
    """Return the fitted vectorizer, loading from disk on first call."""
    global _vectorizer
    if _vectorizer is not None:
        return _vectorizer

    if os.path.exists(TFIDF_PKL_PATH):
        with open(TFIDF_PKL_PATH, "rb") as fh:
            _vectorizer = pickle.load(fh)
        return _vectorizer

    return None   # not fitted yet — caller must fit first


def vectorizer_is_fitted() -> bool:
    return load_vectorizer() is not None


# ── Vectorise ─────────────────────────────────────────────────────────────

def description_to_tfidf_dict(description: str) -> dict:
    """
    Convert a description string to a sparse TF-IDF dict.

    Returns
    -------
    dict  {term: weight, ...}   — MongoDB-friendly, stored per catalog entry.
          Empty dict if vectorizer not fitted yet.
    """
    vec = load_vectorizer()
    if vec is None:
        return {}

    sparse = vec.transform([description])
    arr    = sparse.toarray().flatten()
    terms  = vec.get_feature_names_out()

    # Return only non-zero entries (keep it sparse)
    return {
        terms[i]: round(float(arr[i]), 6)
        for i in arr.nonzero()[0]
    }


# ── Similarity ────────────────────────────────────────────────────────────

def tfidf_cosine_similarity(vec_a: dict, vec_b: dict) -> float:
    """
    Cosine similarity between two sparse TF-IDF dicts.

    Parameters
    ----------
    vec_a, vec_b : dict  {term: weight}

    Returns
    -------
    float in [0.0, 1.0]
    """
    if not vec_a or not vec_b:
        return 0.0

    # Union of all terms
    all_terms = set(vec_a) | set(vec_b)

    v1 = np.array([vec_a.get(t, 0.0) for t in all_terms])
    v2 = np.array([vec_b.get(t, 0.0) for t in all_terms])

    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)

    if n1 == 0.0 or n2 == 0.0:
        return 0.0

    return float(np.clip(np.dot(v1, v2) / (n1 * n2), 0.0, 1.0))


# ── Hybrid Search (works for both retail + thrift) ────────────────────────

def search_hybrid(query_text: str, marketplace_type: str | None = None,
                  top_k: int = 10) -> list[dict]:
    """
    TF-IDF cosine similarity search over ALL products in MongoDB
    (seller_products collection). Works for both retail and thrift items
    because it reads the stored `tfidf_vector` field from each product.

    Parameters
    ----------
    query_text      : plain-text query from the user
    marketplace_type: "new" | "thrift" | None (None = both)
    top_k           : max number of results to return

    Returns
    -------
    list of dicts, sorted by descending similarity_score:
      [
        {"product_id": str, "title": str, "score": float,
         "major_category": str, "marketplace_type": str, "image_url": str},
        ...
      ]

    Products with missing or empty tfidf_vector are skipped silently.
    """
    if not query_text or len(query_text.strip()) < 3:
        return []

    if load_vectorizer() is None:
        return []

    query_vec = description_to_tfidf_dict(query_text)
    if not query_vec:
        return []

    # Lazy imports — keep tfidf_engine importable without pymongo installed
    from pymongo import MongoClient
    from config import MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION, RETIRED_CAT_RE

    mongo_filter: dict = {
        "availability_status": "available",
        "tfidf_vector": {"$exists": True, "$ne": {}},
        "$nor": [
            {"major_category": RETIRED_CAT_RE},
            {"category": RETIRED_CAT_RE},
        ],
    }
    if marketplace_type:
        if marketplace_type == "new":
            mongo_filter["$or"] = [
                {"marketplace_type": "new"},
                {"marketplace_type": {"$exists": False}},
            ]
        else:
            mongo_filter["marketplace_type"] = marketplace_type

    projection = {
        "_id": 0,
        "image_embeddings": 0,
    }

    results: list[dict] = []
    client = None
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[MONGO_DB]
        for prod in db[PRODUCTS_COLLECTION].find(mongo_filter, projection):
            prod_vec = prod.get("tfidf_vector") or {}
            if not prod_vec:
                # Skip products without a usable TF-IDF vector (don't error).
                continue
            score = tfidf_cosine_similarity(query_vec, prod_vec)
            if score <= 0.0:
                continue
            results.append({
                "product_id":       prod.get("product_id", ""),
                "title":            prod.get("title", ""),
                "score":            round(float(score), 4),
                "major_category":   prod.get("major_category", ""),
                "marketplace_type": prod.get("marketplace_type", "new"),
                "image_url":        prod.get("primary_image_url", ""),
            })
    except Exception as exc:
        print(f"[TF-IDF] search_hybrid error: {exc}")
        return []
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:
                pass

    # Sort by score descending, take top_k
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]


# ── Backfill missing TF-IDF vectors ───────────────────────────────────────

def backfill_missing_tfidf(db) -> tuple[int, int, int]:
    """
    Iterate all products where `tfidf_vector` is missing or empty `{}`,
    rebuild the vector from each product's `description` field, and write it
    back to MongoDB. Idempotent — already-populated products are left alone.

    Parameters
    ----------
    db : pymongo Database handle (caller-managed connection)

    Returns
    -------
    (backfilled_count, already_had_vector_count, error_count)

    Notes
    -----
    - Requires the TF-IDF vectorizer to be fitted (data/tfidf_vectorizer.pkl).
      If not fitted, returns (0, N, 0) where N = count of products missing
      vectors, without attempting to backfill.
    - Skips (counts as error) products whose `description` is empty.
    """
    from config import PRODUCTS_COLLECTION

    backfilled = 0
    already_had = 0
    errors = 0

    if load_vectorizer() is None:
        # Vectorizer not fitted — can't backfill. Count missing products so
        # the caller knows the scope, but don't attempt any writes.
        missing = db[PRODUCTS_COLLECTION].count_documents({
            "$or": [
                {"tfidf_vector": {"$exists": False}},
                {"tfidf_vector": {}},
                {"tfidf_vector": None},
            ],
        })
        return (0, missing, 0)

    # Count products that ALREADY have a non-empty vector (computed BEFORE the
    # backfill loop so the number reflects the pre-backfill state, not the
    # post-backfill state). Use $and so we can apply multiple operators on the
    # same field safely.
    already_had = db[PRODUCTS_COLLECTION].count_documents({
        "$and": [
            {"tfidf_vector": {"$exists": True}},
            {"tfidf_vector": {"$ne": {}}},
            {"tfidf_vector": {"$ne": None}},
        ],
    })

    # Find all products missing or with empty tfidf_vector
    missing_filter = {
        "$or": [
            {"tfidf_vector": {"$exists": False}},
            {"tfidf_vector": {}},
            {"tfidf_vector": None},
        ],
    }
    cursor = db[PRODUCTS_COLLECTION].find(
        missing_filter,
        {"product_id": 1, "description": 1, "_id": 0},
    )

    for prod in cursor:
        product_id = prod.get("product_id")
        description = prod.get("description") or ""
        if not description.strip():
            errors += 1
            continue
        try:
            vec = description_to_tfidf_dict(description)
            db[PRODUCTS_COLLECTION].update_one(
                {"product_id": product_id},
                {"$set": {"tfidf_vector": vec}},
            )
            if vec:
                backfilled += 1
            else:
                # Vectorizer returned empty (e.g. description had no vocabulary
                # terms) — still counts as a write so we don't loop forever.
                backfilled += 1
        except Exception as exc:
            print(f"[TF-IDF] backfill error for {product_id}: {exc}")
            errors += 1

    return (backfilled, already_had, errors)
