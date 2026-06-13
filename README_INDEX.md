# ShaadiSahulat — Project Index

> FYP 2026 | NUCES Chiniot-Faisalabad  
> Wedding Planning Platform — Full-Stack ML Application

---

## Architecture (3 Services)

```
Browser (React :5173)
        │
        ▼
Node.js/Express (:5000)   ──── MongoDB Atlas (shaadi-sahulat)
        │
        ▼
Flask ML Service (:5002)  ──── uploads/  (product images on disk)
```

| Service | Folder | Port | Tech |
|---|---|---|---|
| React Frontend | `frontend/` | 5173 | React + Vite + Tailwind |
| Node.js Backend | `backend/` | 5000 | Express + Mongoose |
| Flask ML Service | `visual-ml-service/` | 5002 | Flask + PyTorch + EfficientNet-B0 |

---

## How to Run

### 1 — Flask ML Service
```bash
cd visual-ml-service
python app.py
# Runs on http://localhost:5002
```

### 2 — Node.js Backend
```bash
cd backend
npm install
node server.js
# Runs on http://localhost:5000
```

### 3 — React Frontend
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
```

> All three must be running at the same time.  
> Demo seller login: `admin@shaadisahulat.com` / `Admin@1234`

---

## Project Structure

```
shaadi-sahulat/
│
├── frontend/                        React SPA
│   └── src/
│       ├── App.jsx                  4-tab nav (Marketplace / Find by Photo / Budget / Seller)
│       ├── api/
│       │   ├── sellerApi.js         Seller + marketplace API calls
│       │   └── visualApi.js         Image recommendation API calls
│       └── components/
│           ├── Marketplace/
│           │   └── MarketplacePage.jsx   Buyer browse (category tabs, filter, sort)
│           ├── VisualRec/
│           │   ├── VisualRecPage.jsx     Upload photo → find similar dresses
│           │   ├── ResultsGrid.jsx       5-level cascade result cards
│           │   └── ServiceStatus.jsx     ML service health panel
│           ├── Seller/
│           │   ├── SellerPage.jsx        Register / Login / Tabs
│           │   ├── ProductUpload.jsx     6-category upload form
│           │   └── ProductList.jsx       Seller product management
│           └── Dowry/
│               ├── DowryPage.jsx         Budget estimator landing
│               └── Wizard.jsx            Multi-step wizard
│
├── backend/                         Node.js Express API
│   ├── server.js                    Entry point
│   ├── routes/
│   │   ├── seller.js                /api/seller/* routes
│   │   ├── visual.js                /api/visual/* routes
│   │   └── dowry.js                 /api/dowry/* routes
│   ├── controllers/
│   │   ├── sellerController.js
│   │   ├── visualController.js
│   │   └── dowryController.js
│   └── services/
│       ├── sellerClient.js          Proxies to Flask /seller/*
│       └── visualClient.js          Proxies to Flask /visual/*
│
└── visual-ml-service/               Flask ML Service (Python)
    ├── app.py                       Flask entry point
    ├── config.py                    Categories, DB, model paths
    ├── seller_routes.py             /seller/* endpoints
    ├── mongo_seller.py              MongoDB CRUD for sellers + products
    ├── predictor.py                 3-stage recommendation pipeline
    ├── embedding_index.py           5-level cascade similarity search
    ├── tfidf_engine.py              TF-IDF + NLP preprocessing
    ├── description_generator.py     Auto-description from image
    ├── model.py                     EfficientNet-B0 definition
    ├── filename_utils.py            Image save/load helpers
    └── uploads/                     Seller product images (on disk)
        └── {category}/{product_id}/{uuid}.jpg
```

---

## Seller Upload — 6 Major Categories

```
Category        Embedding?   Images   Fields
─────────────────────────────────────────────────────────────────
Wedding Dress   YES (1280d)  up to 5  dress_type, subcategory, color, fabric,
                                      embroidery, size, condition
Furniture       No           1        subcategory, material, color, condition
Electronics     No           1        subcategory, brand, condition
Kitchen Items   No           1        subcategory, brand, material, condition
Decoration      No           1        subcategory, color, condition
Miscellaneous   No           1        subcategory, condition
```

Wedding Dress subcategories:
- Bridal → Lehenga / Sharara / Gharara / Bridal Gown
- Groom  → Sherwani / Shalwar Kameez / Suit

---

## Image Recommendation Pipeline (Wedding Dress only)

```
Upload photo + description
        │
Stage 1 — Safety Check (min size, not solid colour)
        │
Stage 2 — Category validation (EfficientNet-B0, 3-class CNN)
        │
Stage 3 — 5-Level Cascade Search
          L1 Visual Match   image_sim ≥ 0.55
          L2 Color Match    image_sim ≥ 0.28 AND color_sim ≥ 0.70
          L3 Color Family   same hue family (red/blue/gold/etc.)
          L4 Category Match tfidf_sim ≥ 0.15
          L5 Closest Match  fallback, best available
        │
Post-gate: if max(all dims) < 0.40 → reject ("not a dress")
        │
Returns 3 results with match %, price, seller, city
```

NLP preprocessing: lowercase → remove punctuation → fix ~40 Urdu/fashion typos
(e.g. "lehnga" → "lehenga", "zardozy" → "zardozi", "redd" → "red")

---

## API Endpoints

### Flask ML Service (:5002)
```
GET  /health                        ML service health + model status
GET  /seller/categories             Full 6-category tree (for upload UI)
POST /seller/register               Register seller
POST /seller/login                  Seller login
POST /seller/product                Upload product + images
GET  /seller/products               Seller's own products (paginated)
GET  /seller/products/public        All available products (marketplace, with filters)
GET  /seller/product/<id>           Single product detail
PUT  /seller/product/<id>           Update product
DEL  /seller/product/<id>           Delete product + images
POST /visual/recommend              Upload query image → recommendations
GET  /visual/categories             Supported dress categories
GET  /visual/ml-health              Extended health (model source, embeddings count)
```

### Node.js Backend (:5000) — mirrors Flask
```
All /api/seller/* → proxied to Flask /seller/*
All /api/visual/* → proxied to Flask /visual/*
```

---

## MongoDB Collections (Atlas)

**`sellers`**
```
seller_id, name, email, phone, city, password_hash, created_at
```

**`seller_products`**
```
product_id, seller_id, seller_name
major_category, subcategory, item_type, category (ML compat)
wedding_dress_type, color, fabric, embroidery_type, size
material, brand, condition, city
price, discount_price, discount_pct, stock_quantity
availability_status (processing | available | out_of_stock | hidden)
images[], image_embeddings[] (1280-dim, wedding_dress only)
tfidf_vector{}, keywords[], color_info{}, embroidery_density
primary_image_url, created_at, updated_at
```

Connection: `mongodb+srv://Ahmad:***@cluster0.p2qcckk.mongodb.net/shaadi-sahulat`

---

## Key Thresholds

| Setting | Value | File |
|---|---|---|
| Similarity gate (reject if below) | 0.40 | `predictor.py` |
| L1 Visual Match threshold | 0.55 | `embedding_index.py` |
| L2 Color Match (image) | 0.28 | `embedding_index.py` |
| L2 Color Match (color) | 0.70 | `embedding_index.py` |
| L4 TF-IDF threshold | 0.15 | `embedding_index.py` |
| Max results returned | 3 | `config.py` |
| Embedding dimension | 1280 (EfficientNet-B0) | `config.py` |
| ML model classes | 3 (bridal_lehenga/sharara/saree) | `config.py` |

---

## Frontend Views

| Tab | Component | What it does |
|---|---|---|
| Marketplace | `MarketplacePage.jsx` | Browse all 6 categories, filter by price/condition/city |
| Find by Photo | `VisualRecPage.jsx` | Upload dress image → visual AI recommendations |
| Budget Estimator | `DowryPage.jsx` | Dowry estimation wizard |
| Seller Panel | `SellerPage.jsx` | Register/login, upload products, manage listings |
