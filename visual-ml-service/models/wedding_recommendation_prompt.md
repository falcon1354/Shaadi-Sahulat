# Complete Implementation Prompt
# Wedding Dress Recommendation System — Hybrid Image + TF-IDF

---

## Project Goal

Build a complete, production-ready, modular web application for wedding dress
recommendation. The system has two roles: Seller (product management) and Buyer
(image-based recommendation). The core engine uses a Hybrid Similarity Score
combining EfficientNet-B0 image embeddings and TF-IDF text vectors.

---

## Critical Architecture Rules (Read Before Writing Any Code)

These rules must be respected everywhere in the implementation:

1. **Embeddings and TF-IDF vectors are pre-computed once** — at the moment the
   seller saves a product. They are stored permanently in MongoDB. They are never
   regenerated during a buyer recommendation query.

2. **Only the buyer's uploaded query image is processed at runtime.** All seller
   product data is already indexed.

3. **Image filenames and MongoDB records must stay in sync at all times.** The
   filename stored in MongoDB must exactly match the filename on disk. Use a
   single filename-generation function (UUID-based) called in one place only.
   Never generate filenames in two separate locations.

4. **TF-IDF vocabulary must be consistent.** The TF-IDF vectorizer is fitted
   once on a representative corpus and saved as a `.pkl` file. The same fitted
   vectorizer is loaded for every new product and every buyer query. Never
   re-fit the vectorizer on individual documents — doing so changes the
   vocabulary and makes vectors incomparable.

5. **Image storage paths must be deterministic.** Given a product ID and
   category, the storage path must always resolve to the same location. Use the
   pattern: `uploads/{category_slug}/{product_id}/{uuid_filename}.jpg`

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend API | Python + FastAPI |
| Database | MongoDB (via Motor — async driver) |
| ML Model | EfficientNet-B0 (PyTorch, torchvision) |
| TF-IDF | scikit-learn TfidfVectorizer |
| Image Storage | Local filesystem (structured folders) |
| Training Environment | Google Colab (free GPU) |
| Frontend (optional) | React.js or plain HTML for testing |

---

## Part 1 — Project Folder Structure

Provide this exact structure. Every file must be created, even if some start
as stubs.

```
wedding_recommendation/
│
├── app/
│   ├── main.py                        # FastAPI app entry point
│   ├── config.py                      # All settings (paths, weights, DB URI)
│   │
│   ├── api/
│   │   ├── seller_routes.py           # All seller endpoints
│   │   └── buyer_routes.py            # Recommendation endpoint
│   │
│   ├── models/
│   │   ├── seller_model.py            # Pydantic schemas for seller/product
│   │   └── buyer_model.py             # Pydantic schema for recommendation request
│   │
│   ├── services/
│   │   ├── image_service.py           # Save images to filesystem, generate paths
│   │   ├── embedding_service.py       # Load EfficientNet, generate embeddings
│   │   ├── tfidf_service.py           # Load vectorizer, generate TF-IDF vectors
│   │   └── recommendation_service.py  # Hybrid score computation, top-K retrieval
│   │
│   ├── db/
│   │   ├── connection.py              # MongoDB Motor async connection
│   │   └── collections.py            # Collection name constants
│   │
│   └── utils/
│       ├── filename_utils.py          # Single source of truth for filename generation
│       ├── validators.py              # Input validation helpers
│       └── logger.py                  # Structured logging setup
│
├── uploads/                           # Runtime-created image storage root
│   └── {category}/
│       └── {product_id}/
│           └── {uuid}.jpg
│
├── ml/
│   ├── vectorizer.pkl                 # Fitted TF-IDF vectorizer (saved once)
│   ├── efficientnet_wedding.pth       # Fine-tuned model weights
│   └── fit_vectorizer.py              # Script to fit and save vectorizer on corpus
│
├── colab/
│   └── train_efficientnet.ipynb       # Complete Google Colab training notebook
│
├── requirements.txt
├── .env
└── README.md
```

---

## Part 2 — MongoDB Schema Design

### Collection: `sellers`

```json
{
  "_id": "ObjectId (auto)",
  "seller_id": "string (UUID, generated at registration)",
  "name": "string",
  "email": "string (unique)",
  "phone": "string",
  "city": "string",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Collection: `products`

This is the central collection. It holds product metadata, image metadata,
the image embeddings, and the TF-IDF vector — all in one document so a
single query retrieves everything needed for recommendation.

```json
{
  "_id": "ObjectId (auto)",
  "product_id": "string (UUID, generated at creation)",
  "seller_id": "string (FK reference to sellers.seller_id)",
  "seller_name": "string (denormalised for query speed)",

  "title": "string",
  "description": "string (seller-written, used for TF-IDF)",

  "category": "string (enum: lehenga | sharara | saree)",
  "color": "string",
  "fabric": "string",
  "embroidery_type": "string",
  "bridal_type": "string (e.g. formal, semi-formal, casual)",

  "price": "number (PKR)",
  "discount_price": "number (PKR, nullable)",
  "stock_quantity": "number (integer)",
  "availability_status": "string (enum: available | out_of_stock | hidden)",

  "images": [
    {
      "image_id": "string (UUID — this is the source of truth for the filename)",
      "original_name": "string (what the seller uploaded, for display only)",
      "stored_filename": "string (UUID + extension — MUST match filesystem)",
      "relative_path": "string (e.g. uploads/lehenga/prod_abc/uuid.jpg)",
      "absolute_path": "string (full OS path, for internal use only)",
      "is_primary": "boolean (first image = true)",
      "uploaded_at": "datetime"
    }
  ],

  "image_embeddings": [
    {
      "image_id": "string (matches images[].image_id above — THIS IS THE SYNC KEY)",
      "embedding": "array of 1280 floats (EfficientNet-B0 penultimate layer output)"
    }
  ],

  "tfidf_vector": {
    "vector": "array of floats (sparse represented as dense for simplicity)",
    "vocabulary_version": "string (hash of vectorizer.pkl — to detect staleness)"
  },

  "upload_date": "datetime",
  "last_updated": "datetime"
}
```

**The sync key explained:** `image_id` is generated once in
`filename_utils.py`. It is used as the stored filename AND as the lookup key
linking `images[]` to `image_embeddings[]`. This ensures they can never
desync — if the image record exists, its embedding is always findable by
the same `image_id`.

---

## Part 3 — The Filename Synchronisation Solution

This is the vulnerability you identified. Implement it this way:

`app/utils/filename_utils.py` contains one function:
`generate_image_record(original_filename, product_id, category)` which returns
a dictionary:

```python
{
  "image_id": "a3f9...",           # UUID4 hex — used as BOTH the filename stem AND the DB key
  "stored_filename": "a3f9....jpg",
  "relative_path": "uploads/lehenga/prod_abc/a3f9....jpg",
  "absolute_path": "/home/app/uploads/lehenga/prod_abc/a3f9....jpg",
  "original_name": "front_photo.jpg",
  "is_primary": False,
  "uploaded_at": "2025-..."
}
```

This dictionary is inserted directly into `images[]` in MongoDB AND the
`stored_filename` is what gets written to disk. Since the same function
produces both, they are always identical. This function is called in exactly
one place: `image_service.py → save_product_images()`.

---

## Part 4 — EfficientNet-B0 Training (Google Colab Notebook)

Provide a complete, runnable Colab notebook at `colab/train_efficientnet.ipynb`
that does the following. Each step must be a separate cell with markdown
explanation above it.

**Step 1 — Setup**
Install: `torch`, `torchvision`, `matplotlib`, `scikit-learn`. Mount Google
Drive. Define all configurable constants at the top: NUM_CLASSES=3,
BATCH_SIZE=16, EPOCHS=20, LEARNING_RATE=0.001, IMAGE_SIZE=224.

**Step 2 — Upload and extract dataset**
Accept a ZIP file upload with this internal structure:
```
dataset/
  lehenga/   (minimum 20 images, JPG or PNG)
  sharara/   (minimum 20 images)
  saree/     (minimum 20 images)
```
Extract to `/content/dataset/`. Verify counts. Print a warning if any category
has fewer than 10 images.

**Step 3 — Data augmentation and loading**
Training transforms: RandomHorizontalFlip, RandomRotation(15 degrees),
ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2), RandomResizedCrop
(224, scale 0.85–1.0), ToTensor, Normalize (ImageNet mean/std).
Validation transforms: Resize(256), CenterCrop(224), ToTensor, Normalize.
Split: 80% train, 20% validation. Use `ImageFolder` from torchvision.
Use `DataLoader` with num_workers=2, pin_memory=True.

**Step 4 — Model definition**
Load `efficientnet_b0(pretrained=True)` from torchvision.
Freeze all layers except the final classifier.
Replace the classifier head with:
`nn.Linear(1280, 512) → nn.ReLU() → nn.Dropout(0.3) → nn.Linear(512, 3)`
Print the total trainable vs frozen parameter count.

**Step 5 — Training loop**
Use AdamW optimizer with weight_decay=1e-4. Use CosineAnnealingLR scheduler.
Use CrossEntropyLoss. Track train loss, val loss, val accuracy per epoch.
After each epoch print: epoch number, train loss, val loss, val accuracy.
Save checkpoint to Drive only if validation accuracy improves (best model
checkpointing — never save a worse model over a better one).

**Step 6 — Evaluation**
After training ends, load the best checkpoint. Run on full validation set.
Print: confusion matrix (labelled with category names), per-class precision,
recall, F1-score, overall accuracy. Plot train vs val loss curve.

**Step 7 — Export for production use**
Save two files to Google Drive:
1. `efficientnet_wedding.pth` — the full model state dict (weights only, not
   the full model object, for portability).
2. `class_names.json` — `{"0": "lehenga", "1": "sharara", "2": "saree"}` for
   label mapping.
Provide download links inside the notebook.

**Important note in the notebook:** The production embedding service does NOT
use the classifier head. It extracts the output of the penultimate layer
(before the final classifier) which is 1280-dimensional. This 1280-number
vector is the image embedding used for similarity search. Document this
clearly in the notebook so it is not confused with the 3-class output.

---

## Part 5 — TF-IDF Vectorizer Setup

**The vocabulary problem (critical):** If you create a new TfidfVectorizer
for each product description, every product gets a different vocabulary. Two
vectors from different vocabularies cannot be compared — cosine similarity
between them is meaningless.

**The solution:** Fit the vectorizer once on a representative corpus of wedding
dress descriptions. Save it as `ml/vectorizer.pkl`. Load this same pkl file
for every product upload and every buyer query. The vocabulary is then fixed.

**`ml/fit_vectorizer.py`** is a standalone script (run once, offline) that:
1. Loads a list of representative descriptions from a JSON file or hardcoded
   list (provide at least 50 varied dress description sentences covering all
   category vocabulary — embroidery terms, fabric terms, colour terms, bridal
   terminology in English and romanised Urdu).
2. Fits `TfidfVectorizer(max_features=500, ngram_range=(1,2),
   stop_words='english')`.
3. Saves the fitted vectorizer to `ml/vectorizer.pkl` using joblib.
4. Prints vocabulary size and 20 example terms.

**`app/services/tfidf_service.py`** loads this pkl file once at startup (module
level, not inside a function) and exposes one function:
`get_tfidf_vector(description: str) → list[float]` which transforms the input
using the loaded vectorizer and returns a dense array.

---

## Part 6 — Embedding Service

**`app/services/embedding_service.py`** must:

1. Load the EfficientNet-B0 model at module startup using the saved `.pth`
   weights. The model runs in eval mode always (`model.eval()`).
2. Modify the model for feature extraction: remove or bypass the classifier
   head so the forward pass returns the 1280-dimensional pooled features, not
   class scores. The standard approach is to register a forward hook on the
   `avgpool` layer or to replace the classifier with `nn.Identity()`.
3. Expose one function: `get_image_embedding(image_path: str) → list[float]`
   that opens the image, applies the same normalization transforms used at
   training time (Resize 256, CenterCrop 224, Normalize ImageNet stats),
   runs forward pass, returns a Python list of 1280 floats.
4. Handle errors: file not found, corrupt image, wrong format. Log the error
   and raise a custom `EmbeddingError` exception.

---

## Part 7 — Seller API Endpoints

All endpoints are under the `/seller` prefix. All require a `seller_id` header
or query parameter for ownership validation. Return consistent JSON responses
with `status`, `message`, and `data` keys.

### POST /seller/product
Upload a new product with images.

**Request:** `multipart/form-data` with fields:
- All product fields listed in the MongoDB schema
- `images`: list of image files (1–5 files, each max 5MB, jpg/png/webp only)

**Processing sequence (order matters):**
1. Validate all fields. Return 422 with field-level error detail on failure.
2. Generate `product_id` (UUID).
3. For each uploaded file: call `filename_utils.generate_image_record()` to
   get the image metadata dict. Save the file bytes to `absolute_path`. If
   any file save fails, roll back all previously saved files for this product
   and return 500.
4. Save product document to MongoDB with `images[]` populated, but
   `image_embeddings` and `tfidf_vector` as empty/null initially, and
   `availability_status = "processing"`.
5. Trigger background processing (FastAPI `BackgroundTasks`): for each image,
   call `embedding_service.get_image_embedding()` and append the result to
   `image_embeddings[]`. Then call `tfidf_service.get_tfidf_vector()` on the
   description and set `tfidf_vector`. Update the product document in MongoDB.
   Set `availability_status = "available"`.
6. Return 201 with the product_id immediately — do not wait for background
   processing.

### GET /seller/products?seller_id=&category=&status=&page=&limit=
List seller's products with pagination and optional filters.

### GET /seller/product/{product_id}
Get full product details including all fields except `image_embeddings` and
`tfidf_vector` (exclude these from API responses — internal use only).

### PUT /seller/product/{product_id}
Update product fields. If `description` is updated, re-generate and overwrite
`tfidf_vector` in the background. If new images are added, generate and append
their embeddings. If images are removed, delete the file from filesystem AND
remove the corresponding entry from both `images[]` and `image_embeddings[]`
in MongoDB atomically.

### DELETE /seller/product/{product_id}
1. Retrieve all image `absolute_path` values from the document.
2. Delete the product document from MongoDB.
3. Delete all image files from filesystem.
4. Delete the product's folder if empty.
Return 200 only after all three succeed.

### GET /seller/product/{product_id}/images
Return just the image metadata (not embeddings). Include signed Cloudinary URLs
or local serving URLs.

---

## Part 8 — Image Serving

Local images cannot be accessed directly by the browser. FastAPI must serve
them via a static files mount or a dedicated endpoint:

`GET /images/{category}/{product_id}/{filename}`

This endpoint reads the file from the filesystem and returns it as a streaming
response with the correct Content-Type header. Never expose the `absolute_path`
to the client — derive the path server-side from the URL parameters.

---

## Part 9 — Buyer Recommendation Endpoint

### POST /buyer/recommend
**Request:** `multipart/form-data`
- `query_image`: image file (required)
- `category`: string (optional — lehenga | sharara | saree)
- `top_k`: integer (optional, default 2, max 10)
- `image_weight`: float (optional, default 0.7)
- `text_weight`: float (optional, default 0.3)

**Processing sequence:**
1. Validate that `image_weight + text_weight == 1.0`. Return 422 otherwise.
2. Save the query image temporarily to a temp path.
3. Generate embedding for the query image using `embedding_service`.
4. Generate TF-IDF vector for an empty or default description string (since
   buyer has no description). This means the text similarity component will
   be near-zero unless the buyer also provides a text query — document this
   behaviour clearly in the API.

   **Improved design:** Also accept an optional `query_text` field. If
   provided, generate TF-IDF from it and use it in the hybrid score. If not
   provided, set `text_weight = 0` and `image_weight = 1.0` automatically.

5. Query MongoDB. If `category` is provided, filter:
   `{category: category, availability_status: "available",
   image_embeddings: {$exists: true, $ne: []}}`.
   If no category, remove the category filter.

6. For each product in the result set:
   - For each of the product's `image_embeddings`, compute cosine similarity
     with the query embedding. Take the maximum across all images
     (best-matching image represents the product).
   - Compute cosine similarity between buyer's TF-IDF vector and product's
     TF-IDF vector.
   - Compute `hybrid_score = image_weight × image_sim + text_weight × tfidf_sim`

7. Sort all products by `hybrid_score` descending. Return top `top_k`.

8. Delete the temporary query image file.

**Response format:**
```json
{
  "status": "success",
  "query_category": "lehenga or null",
  "results": [
    {
      "product_id": "...",
      "title": "...",
      "category": "...",
      "price": 0,
      "discount_price": null,
      "color": "...",
      "fabric": "...",
      "seller_name": "...",
      "primary_image_url": "http://localhost:8000/images/lehenga/prod_abc/uuid.jpg",
      "image_similarity": 0.87,
      "text_similarity": 0.43,
      "hybrid_score": 0.74,
      "availability_status": "available"
    }
  ],
  "total_searched": 120,
  "processing_time_ms": 340
}
```

---

## Part 10 — Configuration

`app/config.py` must use `pydantic-settings` to load from `.env`:

```python
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "wedding_recommendation"
UPLOAD_ROOT = "./uploads"
MODEL_PATH = "./ml/efficientnet_wedding.pth"
VECTORIZER_PATH = "./ml/vectorizer.pkl"
CLASS_NAMES_PATH = "./ml/class_names.json"
DEFAULT_IMAGE_WEIGHT = 0.7
DEFAULT_TEXT_WEIGHT = 0.3
MAX_IMAGES_PER_PRODUCT = 5
MAX_IMAGE_SIZE_MB = 5
ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]
LOG_LEVEL = "INFO"
```

---

## Part 11 — Error Handling Requirements

Every endpoint must return structured error responses:
```json
{"status": "error", "code": "PRODUCT_NOT_FOUND", "message": "..."}
```

Handle these cases explicitly:
- Image file missing on disk but record exists in MongoDB → log as
  `FILESYSTEM_SYNC_ERROR`, skip image in recommendations, do not crash.
- Embedding not yet generated (product still processing) → exclude from
  recommendations silently.
- Vectorizer pkl file missing → raise startup error, prevent app from starting.
- Model weights file missing → raise startup error, prevent app from starting.
- MongoDB connection failure → raise startup error with clear message.
- Query image cannot be processed (corrupt, wrong format) → return 422 with
  `INVALID_IMAGE` error code.
- Cosine similarity of all-zero vector (empty TF-IDF) → catch division by
  zero, return similarity of 0.0.

---

## Part 12 — Startup Validation

In `app/main.py` lifespan handler, before accepting requests, verify:
1. `ml/vectorizer.pkl` exists and loads without error.
2. `ml/efficientnet_wedding.pth` exists and loads without error.
3. `ml/class_names.json` exists and parses correctly.
4. MongoDB connection is reachable.
5. `uploads/` directory exists and is writable.

If any check fails, print a clear error message identifying exactly which
resource is missing and exit with code 1.

---

## Part 13 — README Requirements

The README must contain:
1. Architecture diagram (ASCII is fine).
2. Step-by-step local setup instructions.
3. How to prepare and upload the training dataset ZIP.
4. How to run the Colab notebook and download the model.
5. How to run `fit_vectorizer.py`.
6. How to start the FastAPI server.
7. Full list of all API endpoints with example curl commands.
8. Explanation of the hybrid score formula with example numbers.
9. How to add a new category (checklist: update enum, add training images,
   re-train, update class_names.json, re-fit vectorizer corpus if needed).

---

## Summary of What Must Be Delivered

| # | Deliverable |
|---|---|
| 1 | Complete folder structure with all files created |
| 2 | MongoDB schemas for `sellers` and `products` |
| 3 | `filename_utils.py` — single source of truth for image naming |
| 4 | `image_service.py` — save/delete files, return metadata |
| 5 | `embedding_service.py` — load EfficientNet, extract 1280-dim vectors |
| 6 | `tfidf_service.py` — load fitted vectorizer, transform descriptions |
| 7 | `fit_vectorizer.py` — offline script to fit and save vectorizer |
| 8 | `recommendation_service.py` — hybrid cosine score, top-K selection |
| 9 | `seller_routes.py` — full CRUD with background embedding generation |
| 10 | `buyer_routes.py` — recommendation endpoint |
| 11 | `train_efficientnet.ipynb` — complete Colab notebook |
| 12 | `config.py`, `connection.py`, logger, validators |
| 13 | `requirements.txt` with pinned versions |
| 14 | `.env.example` |
| 15 | `README.md` with full setup guide |
