"""
ShaadiSahulat Visual Recommendation - Configuration
=====================================================
Central config for categories, image settings, model paths,
MongoDB connection, TF-IDF, and hybrid search weights.
"""

import os

# ── Category Definitions ───────────────────────────────────────────────────
CATEGORIES = [
    {"id": "bridal_lehenga",  "label": "Bridal Lehenga",  "type": "bridal"},
    {"id": "bridal_sharara",  "label": "Bridal Sharara",  "type": "bridal"},
    {"id": "bridal_saree",    "label": "Bridal Saree",    "type": "bridal"},
]

CATEGORY_IDS    = [c["id"]    for c in CATEGORIES]
CATEGORY_LABELS = {c["id"]: c["label"] for c in CATEGORIES}
NUM_CLASSES     = len(CATEGORIES)

# ── Backbone Selection ─────────────────────────────────────────────────────
# "efficientnet_b0"  → lighter, faster (recommended)
# "resnet50"         → original, heavier (kept for comparison)
BACKBONE = "efficientnet_b0"

# ── Image & Training Constants ─────────────────────────────────────────────
IMAGE_SIZE               = 224
MIN_IMAGES_PER_CATEGORY  = 10
RECOMMENDED_IMAGES       = 20
AUGMENTATION_MULTIPLIER  = 10
VALIDATION_SPLIT         = 0.2
EMBEDDING_DIM            = 128

# ── Augmentation Parameters ────────────────────────────────────────────────
AUGMENTATION_PARAMS = {
    "horizontal_flip_prob": 0.5,
    "rotation_limit":       15,
    "crop_scale":           (0.8, 1.0),
    "brightness":           0.2,
    "contrast":             0.2,
    "saturation":           0.2,
}

# ── Training Hyperparameters ───────────────────────────────────────────────
TRAINING_CONFIG = {
    "backbone":                  BACKBONE,
    "pretrained":                True,
    # EfficientNet-B0: unfreeze last 3 feature blocks (6, 7, 8)
    # ResNet50:        unfreeze layer3 + layer4
    "unfreeze_layers_efficientnet": ["features.6", "features.7", "features.8"],
    "unfreeze_layers_resnet":       ["layer3", "layer4"],
    "learning_rate":             1e-4,
    "weight_decay":              1e-4,
    "batch_size":                16,
    "max_epochs":                30,
    "early_stopping_patience":   5,
    "scheduler_factor":          0.5,
    "scheduler_patience":        3,
    "classifier_dropout":        0.5,
}

# ── Triplet Loss Phase (Optional) ──────────────────────────────────────────
TRIPLET_CONFIG = {
    "enabled":       True,
    "margin":        0.2,
    "learning_rate": 1e-5,
    "epochs":        10,
}

# ── Hybrid Search Weights ──────────────────────────────────────────────────
# When a category IS provided: visual features still dominate but text helps
# When NO category given:      rely almost entirely on visual similarity
HYBRID_WEIGHTS = {
    "with_category": {"image": 0.40, "text": 0.60},
    "no_category":   {"image": 0.40, "text": 0.60},
}

# ── Recommendation Count ───────────────────────────────────────────────────
MAX_RESULTS_DEFAULT = 3     # Return up to 3 recommendations via cascade
MAX_RESULTS_LIMIT   = 20

# ── Validation Thresholds ──────────────────────────────────────────────────
CATEGORY_CONFIDENCE_THRESHOLD = 0.30
SAFETY_SIMILARITY_THRESHOLD   = 0.70
MAX_UPLOAD_SIZE_MB            = 5

# ── Embedding dimension (backbone output, used for similarity search) ──────
# EfficientNet-B0 → 1280-dim  |  ResNet50 → 2048-dim
CATALOG_EMBEDDING_DIM = 1280 if BACKBONE == "efficientnet_b0" else 2048

# ── MongoDB ────────────────────────────────────────────────────────────────
MONGO_URI                = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://Ahmad:1GhCTKOfd2k9QVvQ@cluster0.p2qcckk.mongodb.net/shaadi-sahulat?appName=Cluster0"
)
MONGO_DB                 = "shaadi-sahulat"
MONGO_CATALOG_COLLECTION = "dress_catalog"
SELLERS_COLLECTION       = "sellers"
PRODUCTS_COLLECTION      = "seller_products"

# ── File Paths ─────────────────────────────────────────────────────────────
BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
TRAINING_DATA_DIR = os.path.join(BASE_DIR, "training_data")   # CNN training only
CATALOG_DIR       = os.path.join(BASE_DIR, "catalog")         # legacy seed data
UPLOADS_DIR       = os.path.join(BASE_DIR, "uploads")         # seller-uploaded product images
MODEL_DIR         = os.path.join(BASE_DIR, "models")
DATA_DIR          = os.path.join(BASE_DIR, "data")
DESCRIPTIONS_FILE = os.path.join(BASE_DIR, "descriptions.json")

# Model file names vary by backbone
_MODEL_FILENAME = (
    "fine_tuned_efficientnet_b0.pth"
    if BACKBONE == "efficientnet_b0"
    else "fine_tuned_resnet50.pth"
)

FINE_TUNED_MODEL_PATH      = os.path.join(MODEL_DIR, _MODEL_FILENAME)
EMBEDDING_EXTRACTOR_PATH   = os.path.join(MODEL_DIR, "embedding_extractor.pth")
CATEGORY_CLASSIFIER_PATH   = os.path.join(MODEL_DIR, "category_classifier.pth")
TRAINING_HISTORY_PATH      = os.path.join(MODEL_DIR, "training_history.json")
CLASS_NAMES_PATH           = os.path.join(MODEL_DIR, "class_names.json")

# TF-IDF vectorizer cache (pkl — small, no DB dependency)
TFIDF_PKL_PATH = os.path.join(DATA_DIR, "tfidf_vectorizer.pkl")

# ── Flask Service ──────────────────────────────────────────────────────────
FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5002
