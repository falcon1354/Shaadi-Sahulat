# How to Run — Shaadi-Sahulat E-Commerce Platform

This guide covers everything you need to set up, seed, and run the entire Shaadi-Sahulat project from scratch after applying the V1 update. It also explains how to run the Tone-Voice Agent on Google Colab and where to save the PKL files.

---

## Prerequisites

Before you begin, make sure you have the following installed on your machine:

- **Node.js** v18+ and npm
- **Python** 3.9+ (with pip)
- **MongoDB** — either a local instance running on `localhost:27017` or a MongoDB Atlas cluster (the project uses Atlas by default)
- **Git** (optional, for version control)
- **espeak-ng** and **ffmpeg** — only required if running the Tone-Voice Agent locally (not needed for the main e-commerce app)
- A **Groq API Key** — required only for the Tone-Voice Agent (get one at https://console.groq.com/keys)

---

## Project Architecture — 3 Services Running Simultaneously

The Shaadi-Sahulat project uses a microservices-like architecture with **three servers** that must run concurrently:

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| **Node.js Backend** | Express.js + Mongoose | 5000 | Core business logic, auth, orders, BNPL, Socket.io |
| **Python Visual ML Service** | Flask + EfficientNet | 5002 | Image recommendations, TF-IDF search, dowry estimation ML |
| **Python ML Service** | Flask + KMeans | 5001 | Dowry budget prediction (adjustment factors) |
| **React Frontend** | Vite + React + Tailwind | 3000 | User-facing SPA |

The frontend proxies all `/api` calls to port 5000 via Vite's dev server configuration.

---

## Step-by-Step Setup

### Step 1: Extract and Prepare the Project

1. Extract the original `Zaa.zip` to your working directory.
2. Apply the `Zaa_V1.zip` update — copy all files from V1 into the same `Zaa/` folder, overwriting existing files where needed. The V1 zip contains ONLY changed/added files, so untouched files stay as they were.
3. Your final folder structure should look like:

```
Zaa/
├── backend/                 # Node.js Express server
├── frontend/                # React Vite frontend
├── ml-service/              # Flask KMeans dowry predictor (port 5001)
├── visual-ml-service/       # Flask EfficientNet visual rec (port 5002)
│   └── models/
│       └── tone_voice_agent/  # Voice agent (runs on Colab, not locally)
├── uploads/                 # User-uploaded files (BNPL docs, dispute images, etc.)
├── tone-voice-agent-v2-colab/  # Colab-ready voice agent files
├── colab-notebook/
│   └── run_on_colab.ipynb   # Colab notebook for voice agent
├── PROJECT_STRUCTURE_FOR_LLM.md
├── big-task-requirements-spec.md
└── Changes_Done.md
```

### Step 2: Configure Environment Variables

#### Backend `.env` (create in `Zaa/backend/`)

```env
PORT=5000
MONGODB_URI=mongodb+srv://<your-user>:<your-password>@<your-cluster>.mongodb.net/shaadi-sahulat
ML_SERVICE_URL=http://localhost:5001
VISUAL_ML_URL=http://localhost:5002
GROQ_API_KEY=<your-groq-key>   # Optional — needed only if you want AI Review locally
```

If you are using a **local MongoDB** instance instead of Atlas, change `MONGODB_URI` to:

```env
MONGODB_URI=mongodb://localhost:27017/shaadi_sahulat
```

The `config/db.js` file defaults to `mongodb://localhost:27017/shaadi_sahulat` when `MONGODB_URI` is not set, so local MongoDB works without any `.env` for the database connection.

#### Visual ML Service `config.py`

The visual-ml-service already has the MongoDB URI hardcoded in `config.py` pointing to the Atlas cluster. If you switch to a local MongoDB, update the `MONGO_URI` variable in `Zaa/visual-ml-service/config.py`:

```python
MONGO_URI = "mongodb://localhost:27017/shaadi-sahulat"
```

#### Frontend

No `.env` is needed for the frontend. The Vite dev server at port 3000 proxies all `/api/*` requests to `http://localhost:5000` (configured in `vite.config.js`). If your backend runs on a different host/port, edit the proxy target in `Zaa/frontend/vite.config.js`.

---

### Step 3: Install Dependencies

#### Backend (Node.js)

```bash
cd Zaa/backend
npm install
```

This installs Express, Mongoose, Socket.io, Multer, bcryptjs, and all other backend dependencies listed in `package.json`.

#### Frontend (React)

```bash
cd Zaa/frontend
npm install
```

This installs React, Vite, TailwindCSS, react-router-dom, recharts, socket.io-client, axios, and lucide-react.

#### Visual ML Service (Python)

```bash
cd Zaa/visual-ml-service

# Create a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

Key dependencies: Flask, torch, torchvision, Pillow, pymongo, scikit-learn, vaderSentiment, edge-tts.

#### ML Service (Python — Dowry Predictor)

```bash
cd Zaa/ml-service

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

Key dependencies: Flask, numpy, pandas, scikit-learn, joblib.

---

### Step 4: Seed the Database (Run These Seed Files in Order)

Seeding populates MongoDB with initial data so the app works with real content from the start. **You must run these in the correct order** because some seeds depend on others.

#### Seed 1: Admin Account + Categories

This creates the default admin user and all 6 category definitions (Wedding Dress, Furniture, Electronics, Kitchen Items, Decoration, Miscellaneous).

```bash
cd Zaa/backend
node seeds/seedAdmin.js
```

**Result:** Creates admin user `admin@shaadisahulat.com` / `Admin@1234` and seeds 6 categories into the `admin_categories` collection.

#### Seed 2: Fix Category Subcategories

Fixes decoration and miscellaneous subcategories (renames `flowers` to `artificial_flowers`, adds `wedding_services`).

```bash
cd Zaa/backend
node seeds/fixCategories.js
```

**Note:** Must run AFTER `seedAdmin.js` since it updates categories that were created by that seed.

#### Seed 3: BNPL Partner Banks

Creates the two BNPL partner banks (HBL and MCB) with their IBAN prefixes.

```bash
cd Zaa/backend
node seeds/seedBnplBanks.js
```

**Result:** HBL (PK36HBL prefix) and MCB (PK36MCB prefix) banks seeded. Bank officer login: `officer@bank.com` / `bank123`.

#### Seed 4: Admin Wallet (Starting Balance)

Seeds the admin wallet with PKR 10,000,000 dummy balance (for FYP demonstration).

```bash
cd Zaa/backend
node seeds/seedAdminWallet.js
```

#### Seed 5: Dowry Training Data (150 Synthetic Records)

Generates 150 synthetic training records for the dowry estimation engine using the rule-based system. These records are used by the ML predictor to compute adjustment factors.

```bash
cd Zaa/backend
node seeds/seedTraining.js
```

**Note:** This seed calls the `ruleEngine` service which is part of the backend, so the backend must have its dependencies installed (but does NOT need the server running).

#### Seed 6: Product Catalog (All Categories)

This is the **main product seeding script** — it creates one seller (Ahmed Traders, Level 3) and seeds products across ALL 6 categories, including real EfficientNet embeddings for wedding dress products and placeholder images for non-dress products.

```bash
cd Zaa/visual-ml-service
python seed_all_categories.py
```

Or use the simpler wrapper:

```bash
cd Zaa/visual-ml-service
python run_seed.py
```

**What this does:**
1. Upserts the Ahmed Traders seller (SELLER_001, `ahmed@shaadisahulat.com` / `Test@1234`, Level 3)
2. Wipes all old products (full clean)
3. Loads descriptions from `descriptions.json`
4. Loads the EfficientNet-B0 model for real embeddings
5. Fits TF-IDF vectorizer on all descriptions
6. Seeds wedding dress products from `training_data/` images with real 1280-dim embeddings
7. Seeds non-dress products (furniture, electronics, kitchen, decoration, miscellaneous) with placeholder images
8. Rebuilds TF-IDF corpus and embedding index

**Important:** This seed requires:
- The `training_data/` folder with actual bridal images (bridal_lehenga, bridal_sharara, bridal_saree subfolders)
- The EfficientNet model files in `models/` directory (the pretrained category_classifier.pth is included)
- MongoDB connection (Atlas or local)

#### Seed 7: Legacy Catalog (Optional)

If you also want the legacy dress catalog (older seeding approach), run:

```bash
cd Zaa/visual-ml-service
python seed_catalog.py
```

Use `--clear` to wipe MongoDB first, or `--no-copy` if catalog images already exist locally.

#### Seed 8: Migrate Dowry Buyers (Optional)

If you have existing buyer records that need their dowry estimation fields updated:

```bash
cd Zaa/backend
node seeds/migrateDowryBuyers.js
```

---

### Step 5: Create Required Directories

The backend stores uploaded files in an `Uploads/` directory at the project root. Make sure these directories exist:

```bash
cd Zaa
mkdir -p Uploads/BNPL
mkdir -p Uploads/Order
mkdir -p Uploads/Dispute
mkdir -p Uploads/Categories
mkdir -p Uploads/Reviews/voices
```

The visual-ml-service also needs:

```bash
cd Zaa/visual-ml-service
mkdir -p uploads
mkdir -p catalog
```

These are typically created automatically by the seed scripts and the application, but creating them beforehand avoids first-run errors.

---

### Step 6: Start All Services

You need **4 terminal windows/tabs** (or use a process manager like `concurrently` or PM2).

#### Terminal 1: Node.js Backend

```bash
cd Zaa/backend
npm run dev
```

This starts the Express server with nodemon on port 5000. You should see:

```
[Server] ShaadiSahulat Backend running on port 5000
[Server] Socket.io           : ws://localhost:5000/socket.io/
[Server] Visual ML Service   : http://localhost:5002
[Server] Uploads served from : /uploads → .../Uploads
```

#### Terminal 2: ML Service (Dowry Predictor — Port 5001)

```bash
cd Zaa/ml-service
source .venv/bin/activate
python app.py
```

Starts Flask on port 5001. Provides `/ml/predict` for dowry budget adjustments and `/ml/generate-dataset` for training data.

#### Terminal 3: Visual ML Service (Port 5002)

```bash
cd Zaa/visual-ml-service
source .venv/bin/activate
python app.py
```

Starts Flask on port 5002. Provides visual recommendation, seller routes, dowry routes, and AI review routes.

#### Terminal 4: React Frontend

```bash
cd Zaa/frontend
npm run dev
```

Starts Vite dev server on port 3000. Open **http://localhost:3000** in your browser.

---

### Step 7: Verify Everything Works

After all 4 services are running, verify the setup:

1. **Backend health:** Open http://localhost:5000/api/health — should return `{ status: "ok", version: "3.2.0" }`
2. **ML service health:** Open http://localhost:5001/health — should return `{ status: "ok", service: "shaadi-sahulat-ml" }`
3. **Visual ML health:** Open http://localhost:5002/health — should return model and index status
4. **Frontend:** Open http://localhost:3000 — should show the Shaadi-Sahulat landing page
5. **Socket.io:** Open http://localhost:5000/api/socket/status — should show connected clients info

---

## Default Login Credentials

After seeding, these test accounts are available:

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| **Admin** | `admin@shaadisahulat.com` | `Admin@1234` | Super Admin, manages categories, sellers, orders |
| **Seller** | `ahmed@shaadisahulat.com` | `Test@1234` | Ahmed Traders, Level 3, 52 completed orders |
| **Bank Officer** | `officer@bank.com` | `bank123` | BNPL verification workbench access |
| **Buyer 1** | `aisha@example.com` | `Buyer@1234` | Aisha Khan — Lahore, Bronze level, dowry estimation PKR 350K, 4 orders |
| **Buyer 2** | `usman@example.com` | `Buyer@1234` | Usman Ali — Karachi, Silver level, dowry estimation PKR 500K, 5 orders |
| **Buyer 3** | `fatima@example.com` | `Buyer@1234` | Fatima Noor — Islamabad, New level, dowry estimation PKR 180K, 1 order |

---

## Complete Product Lifecycle Flow (V.V.V Important)

The V2 seed (`seedFullLifecycleV2.js`) creates dummy data that demonstrates the **entire product lifecycle** so that every dashboard, module, and page has real, connected data on first load. This is the flow that the seed covers:

```
Seller (Ahmed Traders) -> Uploads Products -> Categories (6) -> Admin Approves -> Marketplace
    -> Buyer (Aisha/Usman/Fatima) -> Adds to Cart -> Checkout (COD or BNPL)
    -> My Orders (various statuses) -> BNPL Application (optional)
    -> Seller Ships -> Buyer Confirms/Disputes -> Review & Rating
    -> Buyer Budget Updated (category spent/remaining) -> Dashboard Updated
    -> Admin Confirms -> Platform 5% Fee Deducted -> Seller Payout Released
    -> Seller Dashboard Updated -> Admin Wallet Ledger Updated
```

### What the V2 Seed Creates

| Entity | Count | Details |
|--------|-------|--------|
| **Buyers** | 3 | Aisha, Usman, Fatima — each with dowry estimation, saved addresses, budget tracking |
| **Dowry Estimations** | 3 | Full budget breakdowns with category spent/remaining tracking |
| **Orders** | 10 | Covering ALL 9 lifecycle statuses (COMPLETED, DELIVERED, SHIPPED, PREPARING, CONFIRMED, PENDING_BNPL_APPROVAL, DISPUTED, CANCELLED) |
| **Packages** | 10 | Seller fulfillment units with tracking numbers, courier info |
| **BNPL Applications** | 2 | One OFFER_ACCEPTED (buyer accepted), one PENDING_BANK_VERIFICATION (awaiting officer) |
| **BNPL Offer Letters** | 1 | 3-month installment schedule with processing fee |
| **Reviews** | Multiple | Ratings + comments on completed orders (4.5★, 5★) |
| **Seller Payouts** | 2 | Net-to-seller amounts with 5% platform fee deducted |
| **Admin Wallet Ledger** | Multiple | CREDIT (order payments) + DEBIT (seller payouts) transactions |
| **Disputes** | 1 | OPEN dispute — "Item not received" (for demo) |
| **Notifications** | 30+ | For buyer, seller, admin on every status change |
| **Product Updates** | Multiple | Stock deductions, total_sold increments, is_best_seller flags |

### After Seeding — Everything Remains Dynamic

The seed data provides **starting records** that make every dashboard functional. After seeding:

- **New buyers** can still register, create dowry estimations, and place orders
- **The same seller** (Ahmed Traders) continues selling — new orders work on top of existing data
- **Budget tracking** continues dynamically — new purchases deduct from remaining budget
- **Seller payouts** work for new completed orders — 5% platform fee is automatically calculated
- **Admin wallet** continues tracking all financial movements
- **Reviews** can be added on any future completed order
- **BNPL** applications can be submitted for any new order

The seed data is NOT "constant" — it is the starting point. All subsequent operations are fully dynamic.

---

## Seed V2: Full Lifecycle Dummy Data

**IMPORTANT:** This is the V.V.V Important seed that creates the complete product lifecycle. It must run AFTER all other seeds (1-6) because it depends on admin accounts, categories, BNPL banks, products, and the seller already existing in the database.

```bash
cd Zaa/backend
node seeds/seedFullLifecycleV2.js
```

**What this seed does (in order):**

1. **Verifies prerequisites** — checks that admin, products, and BNPL banks exist (fails if not)
2. **Creates 3 buyer accounts** — Aisha Khan, Usman Ali, Fatima Noor (all with password `Buyer@1234`)
3. **Creates 3 dowry estimations** — full budget breakdowns with category spent/remaining tracking
4. **Looks up products from DB** — picks real products seeded by `seed_all_categories.py`
5. **Creates 10 orders** — covering ALL lifecycle statuses:
   - ORD-2026-10001: **COMPLETED** (COD, Aisha, review + payout)
   - ORD-2026-10002: **COMPLETED** (COD, Usman, review + payout)
   - ORD-2026-10003: **DELIVERED** (COD, Aisha, awaiting confirmation)
   - ORD-2026-10004: **SHIPPED** (COD, Usman, tracking number available)
   - ORD-2026-10005: **PREPARING** (COD, Fatima, seller packing)
   - ORD-2026-10006: **CONFIRMED** (COD, Aisha, awaiting seller)
   - ORD-2026-10007: **CONFIRMED** (BNPL, Usman, offer accepted)
   - ORD-2026-10008: **PENDING_BNPL_APPROVAL** (BNPL, Aisha, awaiting bank)
   - ORD-2026-10009: **DISPUTED** (COD, Usman, "not received")
   - ORD-2026-10010: **CANCELLED** (COD, Fatima, admin cancelled)
6. **Creates 10 packages** — seller fulfillment units for each order
7. **Creates BNPL applications + offer letters** — 2 applications, 1 accepted offer
8. **Creates product reviews** — ratings and comments on completed orders
9. **Creates seller payouts** — 5% platform fee deducted, net amount to seller
10. **Updates admin wallet** — CREDIT entries (order payments) + DEBIT entries (seller payouts)
11. **Creates dispute** — 1 OPEN dispute for demo
12. **Creates 30+ notifications** — for buyer, seller, admin on each order status
13. **Updates product stock** — deducts stock_quantity, increments total_sold, sets is_best_seller

**No model/schema changes needed** — the V2 seed uses existing models only.

---

## How to Run the Tone-Voice Agent on Google Colab

The Tone-Voice Agent is NOT part of the 3 local services. It runs on **Google Colab** using a free T4 GPU because Kokoro TTS model weights (~350 MB) need GPU acceleration for real-time audio synthesis.

### What You Need

1. The `tone-voice-agent-v2-colab.zip` file (provided in the V1 delivery)
2. A **Groq API Key** from https://console.groq.com/keys
3. A Google account with Colab access

### Step-by-Step Colab Setup

1. **Open Google Colab:** Go to https://colab.research.google.com/
2. **Change runtime type:** Click `Runtime → Change runtime type` → select **T4 GPU**
3. **Upload the notebook:** Click `File → Upload notebook` and upload `run_on_colab.ipynb` from the `colab-notebook/` folder
4. **Run each cell sequentially:**

   - **Cell 1:** Verify GPU (`!nvidia-smi`) — confirm T4 is active
   - **Cell 2:** Install system deps (`espeak-ng`, `ffmpeg`)
   - **Cell 3:** Upload `tone-voice-agent-v2-colab.zip` — click Choose Files and pick the zip from your local machine
   - **Cell 4:** Install Python deps (`pip install -r requirements.txt` + `nest-asyncio`)
   - **Cell 5:** Set your Groq API key — paste it in the hidden prompt
   - **Cell 6:** Verify Kokoro voice IDs — downloads ~350 MB model weights on first run
   - **Cell 7:** Launch the FastAPI app — uvicorn on port 8000, opens UI in a new tab
   - **Cell 8:** Integration test — tests all 4 agents (en_male, en_female, hi_male, hi_female) with buyer/product/order metadata

5. **Access the UI:** After Cell 7 runs, Colab opens a new browser tab with the voice agent UI at port 8000.

### Where to Save the PKL File

The Tone-Voice Agent uses a **`tone_config.json`** file for all tunable parameters (not a PKL file for the voice agent itself). However, the pipeline caches its configuration as a **PKL file** when it first initializes. Here is how PKL files work in this project:

#### PKL File: `tone_config.pkl`

When `tone_config.py` first loads the configuration, it saves a cached PKL version alongside the JSON for faster subsequent loads. In the **local project integration** (inside `visual-ml-service/models/tone_voice_agent/`), this PKL file is saved at:

```
Zaa/visual-ml-service/models/tone_voice_agent/tone_config.pkl
```

When running on **Colab**, the PKL is saved inside the Colab working directory:

```
/content/tone-voice-agent-v2/tone_config.pkl
```

**To use the PKL in your local project after training on Colab:**

1. After the Colab session completes its first synthesis, the `tone_config.pkl` file is generated in `/content/tone-voice-agent-v2/`
2. Download it from Colab: click the folder icon in the left sidebar, find `tone_config.pkl`, right-click → Download
3. Place it in your local project at: `Zaa/visual-ml-service/models/tone_voice_agent/tone_config.pkl`
4. The `tone_config.py` loader will automatically find and use this PKL file on subsequent runs, falling back to `tone_config.json` if the PKL is missing

#### PKL Files: ML Service Models (`kmeans_model.pkl`, `scaler.pkl`, `cluster_stats.pkl`)

The dowry predictor ML service uses 3 PKL files that are already provided in the project:

```
Zaa/ml-service/models/
├── kmeans_model.pkl      # Trained KMeans clustering model
├── scaler.pkl            # Feature scaler for normalization
└── cluster_stats.pkl     # Cluster statistics for adjustment factors
```

These are **pre-trained and already included** in the project. No need to regenerate them unless you want to retrain the model with new data. If you do retrain:

1. Run `python kmeans_trainer.py` from the `ml-service/` directory
2. The trainer automatically saves the new PKL files to `ml-service/models/`
3. The predictor will use the updated models on the next API call

#### PKL File: TF-IDF Vectorizer (`tfidf_vectorizer.pkl`)

The visual-ml-service uses a TF-IDF vectorizer cached as a PKL file:

```
Zaa/visual-ml-service/data/tfidf_vectorizer.pkl
```

This is generated during seeding (`seed_all_categories.py` or `seed_catalog.py`) and is already included. If you need to regenerate it:

```bash
cd Zaa/visual-ml-service
python fit_corpus_vectorizer.py
```

#### PKL File: Category Classifier (`category_classifier.pth`)

Note: This is actually a PyTorch `.pth` file, not a PKL, but it serves the same purpose — it's a trained model file:

```
Zaa/visual-ml-service/models/category_classifier.pth
```

This is the pre-trained EfficientNet-B0 classifier. To get a better version, train on Colab using the T4 GPU and download the resulting `.pth` file back to the local `models/` directory.

---

## Connecting the Voice Agent to the Local Project

The Tone-Voice Agent running on Colab can be called by your local backend through the integration route `tone_voice_routes.py`. Here is how the connection works:

### How the Integration Route Works

`tone_voice_routes.py` (located at `Zaa/visual-ml-service/models/tone_voice_agent/tone_voice_routes.py`) provides FastAPI sub-routes that:

1. Accept review text + rating + agent selection from the e-commerce frontend
2. Call the Tone-Voice Agent API (either local or on Colab) to generate a voice review
3. Save the generated audio file locally with structured naming: `buyer_id_product_id_agent_hash.wav`
4. Return voice metadata (not the actual audio blob) to be stored in the Review database

### Configuration for Colab vs Local

In the `tone_voice_routes.py`, the agent URL is configurable. When running on Colab:

- The Colab notebook exposes the agent at port 8000 via Colab's built-in port proxy
- You need to update the `AGENT_URL` variable in `tone_voice_routes.py` to point to your Colab instance URL
- The URL format is: `https://<random-hash>.colab.research.google.com/` (provided by Colab when you run Cell 7)

When running locally (if you install Kokoro dependencies on your machine):

- Set `AGENT_URL = "http://localhost:8000"` in `tone_voice_routes.py`
- Install espeak-ng and ffmpeg locally
- Run `uvicorn app:app --reload --host 0.0.0.0 --port 8000` from the `tone_voice_agent/` directory

### Voice File Storage

Generated voice files are saved locally at:

```
Zaa/uploads/Reviews/voices/
```

With filenames following the pattern: `{buyer_id}_{product_id}_{agent}_{hash}.wav`

For example: `BUY-001_PRD-001_en_male_a3f2.wav`

These audio files are served via the backend's `/uploads/` static route, so they are accessible at:

```
http://localhost:5000/uploads/Reviews/voices/BUY-001_PRD-001_en_male_a3f2.wav
```

---

## Production Build (Optional)

For a production-ready build of the frontend:

```bash
cd Zaa/frontend
npm run build
```

This generates optimized static files in `Zaa/frontend/dist/`. You can then serve these files using any static file server (nginx, Apache, or even the Express backend).

To serve the built frontend from the Express backend, add this to `server.js`:

```javascript
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
```

---

## Troubleshooting

### MongoDB Connection Errors

- **Atlas:** Ensure your IP is whitelisted in the Atlas cluster's Network Access settings
- **Local:** Make sure MongoDB is running: `mongod --dbpath /path/to/data`
- **Timeout:** Check that `MONGODB_URI` in `.env` and `config.py` match the same database

### Frontend Not Loading API Data

- Verify the backend is running on port 5000
- Check the Vite proxy in `vite.config.js` — it proxies `/api` to `http://localhost:5000`
- If using a different backend port, update the proxy target

### Socket.io Not Working

- Ensure the backend started successfully and logged `Socket.io: ws://localhost:5000/socket.io/`
- Check http://localhost:5000/api/socket/status for diagnostic info
- The frontend must include `socket.io-client` and connect to the same host/port

### Visual ML Service Errors

- If image recommendations return no results, run the seed script again: `python seed_all_categories.py`
- If TF-IDF search fails, regenerate the vectorizer: `python fit_corpus_vectorizer.py`
- If model loading fails, check that `models/category_classifier.pth` exists

### BNPL Timer Not Running

- The BNPL countdown timer is started automatically by `server.js` via `startBnplTimer()`
- It runs every 1 hour and checks for expired APPROVED applications (>3 days old)
- To manually trigger: call the timer function or restart the backend

### Colab Voice Agent Disconnects

- Free Colab sessions disconnect after ~90 minutes of idle or ~12 hours total
- Keep the session active by periodically running requests
- Save any generated audio files before the session expires

### Missing Uploads Directory

- If you get "ENOENT" errors when uploading BNPL documents or dispute images, create the Uploads directory structure:
  ```bash
  mkdir -p Zaa/Uploads/BNPL Zaa/Uploads/Order Zaa/Uploads/Dispute Zaa/Uploads/Categories Zaa/Uploads/Reviews/voices
  ```

---

## Quick Start Checklist

Run these commands in order to get the project running from scratch:

```bash
# 1. Extract original Zaa.zip, then apply Zaa_V1.zip over it

# 2. Backend setup
cd Zaa/backend
npm install
# Create .env file with MONGODB_URI, ML_SERVICE_URL, VISUAL_ML_URL
node seeds/seedAdmin.js
node seeds/fixCategories.js
node seeds/seedBnplBanks.js
node seeds/seedAdminWallet.js
node seeds/seedTraining.js
node seeds/seedFullLifecycleV2.js   # V.V.V Important — creates complete lifecycle data

# 3. Visual ML setup
cd ../visual-ml-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed_all_categories.py

# 4. ML Service setup
cd ../ml-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 5. Frontend setup
cd ../frontend
npm install

# 6. Create upload directories
cd ..
mkdir -p Uploads/BNPL Uploads/Order Uploads/Dispute Uploads/Categories Uploads/Reviews/voices

# 7. Start all services (4 terminals)
# Terminal 1: cd Zaa/backend && npm run dev
# Terminal 2: cd Zaa/ml-service && source .venv/bin/activate && python app.py
# Terminal 3: cd Zaa/visual-ml-service && source .venv/bin/activate && python app.py
# Terminal 4: cd Zaa/frontend && npm run dev

# 8. Open http://localhost:3000

# 9. For Voice Agent: Upload run_on_colab.ipynb + tone-voice-agent-v2-colab.zip to Google Colab (T4 GPU)
```

---

## Summary of All Seed Files

| Order | Seed File | Location | What It Creates |
|-------|----------|----------|----------------|
| 1st | `seedAdmin.js` | `backend/seeds/` | Admin user + 6 categories |
| 2nd | `fixCategories.js` | `backend/seeds/` | Fixes decoration/misc subcategories |
| 3rd | `seedBnplBanks.js` | `backend/seeds/` | HBL + MCB BNPL banks |
| 4th | `seedAdminWallet.js` | `backend/seeds/` | PKR 10M admin wallet |
| 5th | `seedTraining.js` | `backend/seeds/` | 150 dowry training records |
| 6th | `seed_all_categories.py` | `visual-ml-service/` | Seller + ALL products across 6 categories |
| **7th (V.V.V Important)** | **`seedFullLifecycleV2.js`** | **`backend/seeds/`** | **Complete lifecycle: 3 buyers, 10 orders (all statuses), packages, BNPL, reviews, payouts, disputes, notifications, stock updates, budget tracking** |
| 8th (optional) | `seed_catalog.py` | `visual-ml-service/` | Legacy dress catalog |
| 9th (optional) | `migrateDowryBuyers.js` | `backend/seeds/` | Update buyer dowry fields |

---

## Summary of PKL / Model Files and Their Locations

| File | Location | Purpose | How to Regenerate |
|------|----------|---------|-------------------|
| `tone_config.pkl` | `visual-ml-service/models/tone_voice_agent/` | Cached voice agent config | Auto-generated on first synthesis run |
| `kmeans_model.pkl` | `ml-service/models/` | KMeans clustering for dowry predictor | `python kmeans_trainer.py` |
| `scaler.pkl` | `ml-service/models/` | Feature scaler for dowry predictor | `python kmeans_trainer.py` |
| `cluster_stats.pkl` | `ml-service/models/` | Cluster statistics | `python kmeans_trainer.py` |
| `tfidf_vectorizer.pkl` | `visual-ml-service/data/` | TF-IDF text search vectorizer | `python fit_corpus_vectorizer.py` or seed scripts |
| `category_classifier.pth` | `visual-ml-service/models/` | EfficientNet-B0 image classifier | Train on Colab (run_on_colab.ipynb) or `python trainer.py` |
