# ShaadiSahulat — Wedding Planning Platform
> **FYP 2026 | NUCES Chiniot-Faisalabad**

AI-powered Visual Dress Recommendation System using EfficientNet-B0 + Hybrid Image & TF-IDF Search.

---

## Services Overview

| Service | Technology | Port | What It Does |
|---------|-----------|------|-------------|
| Frontend | React + Vite + Tailwind | 5173 | User interface in the browser |
| Backend API | Node.js + Express | 5000 | Main API, connects all services |
| Visual ML | Python + Flask + EfficientNet-B0 | 5002 | Recommends similar dresses |
| Database | MongoDB Atlas | Cloud | Stores catalog + embeddings (no local install needed) |

> **MongoDB Atlas is already configured** in `visual-ml-service/config.py` — no local MongoDB installation required.

---

# COMPLETE STEP-BY-STEP GUIDE

---

## PART 1 — Install Everything (Do This Once)

---

### Step 1: Install Python

1. Open your browser and go to https://www.python.org/downloads/
2. Click the yellow **"Download Python 3.11.x"** button (use 3.10 or 3.11 — do NOT use 3.12)
3. Run the downloaded installer (.exe file)
4. On the first screen, check **"Add Python 3.11 to PATH"** — this is very important, do not skip it
5. Click **"Install Now"** and wait for it to finish
6. Verify: open PowerShell and type:
   ```powershell
   python --version
   ```
   You should see: `Python 3.11.x`

---

### Step 2: Install Node.js

1. Open your browser and go to https://nodejs.org/
2. Click the **"LTS"** version button (e.g. "20.x.x LTS")
3. Run the installer, click Next on every screen, keep all defaults
4. Verify in PowerShell:
   ```powershell
   node --version
   npm --version
   ```
   You should see something like `v20.x.x` and `10.x.x`

---

### Step 3: Open PowerShell in the Project Folder

1. Open PowerShell (Windows key → type "powershell" → Enter)
2. Navigate to the project:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat"
   ```
3. Confirm you are in the right place:
   ```powershell
   dir
   ```
   You should see folders named `backend`, `frontend`, `visual-ml-service`

> All commands in this guide are typed from this project root unless stated otherwise.

---

### Step 4: Create and Activate Python Virtual Environment

1. Create the virtual environment:
   ```powershell
   python -m venv myvenv
   ```
2. Activate it:
   ```powershell
   .\myvenv\Scripts\activate
   ```
3. Confirm — your prompt should now start with `(myvenv)`:
   ```
   (myvenv) PS c:\semester_4\...shaadi-sahulat>
   ```

> **Every time you open a new PowerShell to run Python**, activate the venv first with `.\myvenv\Scripts\activate`.

---

### Step 5: Install Python Packages

Make sure you see `(myvenv)` before running these.

1. Install all packages:
   ```powershell
   pip install -r visual-ml-service\requirements.txt
   ```
   This installs Flask, PyTorch, EfficientNet, scikit-learn, pymongo, Pillow, and all other dependencies.

2. PyTorch is large (~800 MB) — this step takes 10–20 minutes. If it times out, run:
   ```powershell
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --timeout 300
   ```

3. Verify everything installed correctly:
   ```powershell
   python -c "import torch, torchvision, flask, pymongo, sklearn, PIL, numpy; print('All packages OK')"
   ```
   You should see: `All packages OK`

---

### Step 6: Install Node.js Packages for Backend

1. Open a **new** PowerShell window (no venv needed here)
2. Navigate to the backend:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat\backend"
   ```
3. Install packages:
   ```powershell
   npm install
   ```
4. Verify:
   ```powershell
   dir node_modules
   ```
   You should see many folders like `express`, `cors`, `mongoose`, `axios`

---

### Step 7: Install Node.js Packages for Frontend

1. In a PowerShell window, navigate to the frontend:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat\frontend"
   ```
2. Install packages:
   ```powershell
   npm install
   ```
3. Verify:
   ```powershell
   dir node_modules
   ```
   You should see folders like `react`, `vite`, `tailwindcss`, `axios`

---

### Step 8: Create the Backend .env File

1. Navigate to the backend folder:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat\backend"
   ```
2. Create a file named `.env` (open Notepad, paste, save as `.env` not `.env.txt`):
   ```
   PORT=5000
   MONGODB_URI=mongodb+srv://Ahmad:1GhCTKOfd2k9QVvQ@cluster0.p2qcckk.mongodb.net/shaadi-sahulat?appName=Cluster0
   VISUAL_ML_URL=http://localhost:5002
   NODE_ENV=development
   ```
3. Verify:
   ```powershell
   Get-Content .env
   ```
   You should see the 4 lines you just typed.

---

### Step 9: Create Required Folders

Run these commands from the project root:
```powershell
mkdir "visual-ml-service\models" -ErrorAction SilentlyContinue
mkdir "visual-ml-service\data"   -ErrorAction SilentlyContinue
```

---

## PART 2 — Train the Model on Google Colab (Do Once)

> **You can skip this section and come back later.**
> Without training, the system uses pretrained ImageNet weights — it still gives real visual similarity results, just without category-specific fine-tuning.
> For best accuracy, complete this section.

---

### Step 10: Prepare Your Training Images

**Image rules:**
- Full-length dress photo (not a face, not fabric close-up)
- Format: JPG or PNG (not HEIC or BMP)
- Minimum resolution: 400 × 600 pixels

**Categories (3 total):**

| Category | Folder | What to Collect |
|----------|--------|----------------|
| Bridal Lehenga | `bridal_lehenga` | Traditional bridal lehenga choli |
| Bridal Sharara | `bridal_sharara` | Bridal sharara suit (wide-leg pants + kurti) |
| Bridal Saree | `bridal_saree` | Bridal saree (draped fabric style) |

**Minimum:** 10 images per category (30 total). **Recommended:** 20 per category (60 total).

**Place your images in:**
```
visual-ml-service\training_data\bridal_lehenga\   ← lehenga photos
visual-ml-service\training_data\bridal_sharara\   ← sharara photos
visual-ml-service\training_data\bridal_saree\     ← saree photos
```

**Verify image counts:**
```powershell
(Get-ChildItem "visual-ml-service\training_data\bridal_lehenga" -File).Count
(Get-ChildItem "visual-ml-service\training_data\bridal_sharara" -File).Count
(Get-ChildItem "visual-ml-service\training_data\bridal_saree"   -File).Count
```

**Create the ZIP for Colab:**
1. In Windows Explorer, go to `visual-ml-service\`
2. Right-click the `training_data` folder → "Compress to ZIP file" (Win11) or "Send to → Compressed (zipped) folder" (Win10)
3. Name it `training_data.zip`

---

### Step 11: Run the Colab Notebook

1. Open Google Colab: https://colab.research.google.com
2. Click **File → Upload notebook**
3. Select `colab-notebook\ShaadiSahulat_Visual_Training.ipynb`
4. **Change runtime to GPU:** Runtime → Change runtime type → **T4 GPU** → Save
5. Run all cells **top to bottom** (click the play button on each cell in order):

| Cell | What It Does | Expected Output |
|------|-------------|----------------|
| Cell 1 | Install packages, check GPU | `CUDA available: True`, `GPU: Tesla T4` |
| Cell 2 | Upload your ZIP file | File picker appears → select `training_data.zip` |
| Cell 3 | Verify dataset | `✅ bridal_lehenga: 10+ images` per category |
| Cell 4 | Create data loaders | Training/validation split numbers |
| Cell 5 | Build EfficientNet-B0 model | `Trainable params: 3,471,872` |
| Cell 6 | Phase 1 Training (~20 min) | Epoch lines with loss + accuracy |
| Cell 7 | Phase 2 Triplet Loss (~4 min) | Triplet epoch lines with loss |
| Cell 8 | Training curves plot | Loss and accuracy charts shown |
| Cell 9 | Save + Download files | Browser downloads start automatically |

**Training targets (Phase 1):**

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Validation Accuracy | > 65% | > 75% | > 85% |
| Validation Loss | < 1.0 | < 0.7 | < 0.4 |

If accuracy stays below 60% after 10 epochs: images may not show full dresses, or there are too few.

---

### Step 12: Copy Trained Files to Local PC

After Colab downloads finish, find the files in your Downloads folder and copy them:

| Downloaded File | Copy to |
|----------------|---------|
| `fine_tuned_efficientnet_b0.pth` | `visual-ml-service\models\` |
| `category_classifier.pth` | `visual-ml-service\models\` |
| `training_history.json` | `visual-ml-service\models\` |
| `class_names.json` | `visual-ml-service\models\` |

Verify in PowerShell:
```powershell
dir "visual-ml-service\models"
```
You should see the 4 files listed.

---

## PART 3 — First-Time Catalog Setup (Do Once After Training)

This part populates your MongoDB Atlas database with dress data so recommendations work.

---

### Step 13: Write Descriptions for Your Training Images

1. Open `visual-ml-service\descriptions.json` in any text editor (Notepad, VS Code, etc.)
2. For each image, write a short natural-language description of what the dress looks like:

```json
{
  "bridal_lehenga": {
    "bridal_lehenga_001.jpg": "deep red bridal lehenga with heavy gold zardozi embroidery and floral patterns",
    "bridal_lehenga_002.jpg": "ivory and gold bridal lehenga with light embroidery and pearl detailing",
    "bridal_lehenga_003.jpg": ""
  }
}
```

**What makes a good description:**
- Include the dominant colour (red, ivory, golden, pink, navy blue, etc.)
- Mention embroidery style if visible (zardozi, gota, dabka, sequence, mirror work)
- Mention fabric if known (silk, chiffon, velvet, net)
- 1–2 sentences maximum

**If you leave a value empty `""`, the system auto-generates a description from colour and texture analysis of the image.** You do not need to fill every entry — fill the ones you can see clearly and leave the rest empty.

---

### Step 14: Run the Catalog Seeder

This script copies your training images to the searchable catalog, extracts embeddings, fits TF-IDF, and writes everything to MongoDB Atlas.

1. Activate venv and go to the visual-ml-service folder:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat"
   .\myvenv\Scripts\activate
   cd visual-ml-service
   ```
2. Run the seeder:
   ```powershell
   python seed_catalog.py
   ```
3. Wait — you will see output like:
   ```
   ============================================================
     ShaadiSahulat — Catalog Seeder
   ============================================================
   [Seed] descriptions.json: 22/30 descriptions filled in
   [Seed] Copying training images → catalog/ …
     [Seed] bridal_lehenga: copied 10 images → catalog/bridal_lehenga/
     [Seed] bridal_sharara: copied 10 images → catalog/bridal_sharara/
     [Seed] bridal_saree:   copied 10 images → catalog/bridal_saree/
   [Seed] 30 images copied.
   [Seed] Loading model (backbone=efficientnet_b0, device=cpu) …
   [Index] Phase 1 — extracting embeddings + descriptions …
   [Index] Phase 2 — fitting TF-IDF vectorizer …
   [Index] Phase 3 — writing to MongoDB …
   [Index] Build complete — 30 products in MongoDB

   ============================================================
     DONE!
     Total products indexed: 30
       Bridal Lehenga: 10
       Bridal Sharara: 10
       Bridal Saree:   10

     You can now start the Flask service:
     > python app.py
   ============================================================
   ```

> **This step only needs to be run once.** After that, the catalog persists in MongoDB Atlas. You only re-run it if you want to fully rebuild the catalog from scratch.

---

## PART 4 — Run All Services (Do This Every Day)

You need **3 separate PowerShell windows** open at the same time.

---

### Step 15: Start Visual ML Service (Terminal Window 1)

1. Open a new PowerShell window
2. Navigate to the project root and activate venv:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat"
   .\myvenv\Scripts\activate
   ```
3. Navigate to the visual-ml-service folder:
   ```powershell
   cd visual-ml-service
   ```
4. Start the service:
   ```powershell
   python app.py
   ```
5. You should see:
   ```
   ============================================================
     ShaadiSahulat — Visual Recommendation ML Service
   ============================================================
     Backbone : efficientnet_b0
     Port     : 5002
   ============================================================

   [MongoDB] Connected → ... db=shaadi-sahulat
   [Model] Loaded fine-tuned efficientnet_b0 from models/fine_tuned_efficientnet_b0.pth
    * Running on http://0.0.0.0:5002
   ```
   If it says `Using pretrained efficientnet_b0 (ImageNet weights)` instead of `Loaded fine-tuned` — that is OK, it means you skipped Colab training. It still works, just with ImageNet weights.

6. **Leave this window open and running.**

---

### Step 16: Start Backend API (Terminal Window 2)

1. Open a **new** PowerShell window
2. Navigate to the backend:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat\backend"
   ```
3. Start the backend:
   ```powershell
   npm run dev
   ```
4. You should see:
   ```
   [Server] ShaadiSahulat Backend running on port 5000
   [Server] Visual ML Service: http://localhost:5002
   [Server] API docs: http://localhost:5000/
   ```
5. **Leave this window open.**

---

### Step 17: Start Frontend (Terminal Window 3)

1. Open a **new** PowerShell window
2. Navigate to the frontend:
   ```powershell
   cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat\frontend"
   ```
3. Start the dev server:
   ```powershell
   npm run dev
   ```
4. You should see:
   ```
     VITE v5.x.x  ready in 450 ms

     ➜  Local:   http://localhost:5173/
   ```
5. Open your browser and go to: **http://localhost:5173**
6. You should see the ShaadiSahulat dress recommendation interface.
7. **Leave this window open.**

---

## PART 5 — Verify Everything is Working

Run all checks in any PowerShell window after starting services.

---

### Step 18: Health Check All Services

**Check 1 — Backend API:**
```powershell
Invoke-RestMethod "http://localhost:5000/api/health"
```
Expected:
```json
{"status": "ok", "service": "shaadi-sahulat-backend", "modules": ["visual-recommendation"]}
```

**Check 2 — Visual ML Service:**
```powershell
Invoke-RestMethod "http://localhost:5002/health"
```
Expected:
```json
{
  "status": "ok",
  "backbone": "efficientnet_b0",
  "model_trained": true,
  "index_built": true,
  "total_indexed": 30,
  "tfidf_fitted": true
}
```

| Field | What It Means |
|-------|--------------|
| `model_trained: true` | Fine-tuned `.pth` file found in `models/` |
| `model_trained: false` | Using pretrained ImageNet weights (still works) |
| `index_built: true` | Catalog data is in MongoDB — recommendations ready |
| `index_built: false` | Run `seed_catalog.py` (Step 14) |
| `tfidf_fitted: true` | TF-IDF vectorizer ready for text matching |

**Check 3 — Visual index stats:**
```powershell
Invoke-RestMethod "http://localhost:5002/visual/index-stats"
```
Expected:
```json
{
  "index_exists": true,
  "total_products": 30,
  "categories": {"bridal_lehenga": 10, "bridal_sharara": 10, "bridal_saree": 10},
  "tfidf_fitted": true
}
```

---

### Step 19: Test Dress Recommendation with a Real Image

1. Find any dress photo on your computer (JPG or PNG)
2. Run:
   ```powershell
   $form = @{
       image              = Get-Item "C:\path\to\your\dress.jpg"
       preferred_category = "bridal_lehenga"
   }
   Invoke-RestMethod -Method POST -Uri "http://localhost:5002/visual/recommend" -Form $form
   ```
3. Expected response:
   ```json
   {
     "status": "success",
     "validation": {
       "predicted_category": "bridal_lehenga",
       "confidence": 0.8734
     },
     "query_analysis": {
       "description": "deep red bridal lehenga with heavy embroidery",
       "color": "deep red",
       "embroidery": "heavy"
     },
     "results": [
       {
         "product_id": "BRL-003",
         "category": "bridal_lehenga",
         "description": "deep red bridal lehenga with heavy gold zardozi embroidery",
         "image_similarity": 0.9234,
         "text_similarity":  0.7812,
         "hybrid_score":     0.8812,
         "match_percentage": 88.1
       },
       {
         "product_id": "BRL-007",
         "hybrid_score":     0.8431,
         "match_percentage": 84.3
       }
     ],
     "search_metadata": {
       "results_returned": 2,
       "search_time_ms": 180,
       "model_backbone": "efficientnet_b0"
     }
   }
   ```

If `status` is `"rejected"` with low confidence: the uploaded photo may not show a full dress, or the model has not been fine-tuned yet. Try a clearer dress photo.

---

## PART 6 — Every Time You Want to Run the Project

After completing Parts 1–3 once, start the project with only these commands:

| Terminal | Commands |
|----------|---------|
| Window 1 (Visual ML) | `cd ...shaadi-sahulat` → `.\myvenv\Scripts\activate` → `cd visual-ml-service` → `python app.py` |
| Window 2 (Backend)   | `cd ...shaadi-sahulat\backend` → `npm run dev` |
| Window 3 (Frontend)  | `cd ...shaadi-sahulat\frontend` → `npm run dev` |
| Browser              | Open **http://localhost:5173** |

To stop: press `Ctrl + C` in each terminal window.

---

## PART 7 — Configuration Reference

---

### Changing Number of Recommendations (currently: 2)

Open `visual-ml-service\config.py`:
```python
MAX_RESULTS_DEFAULT = 2    # change to 5 for 5 recommendations
```
Restart the Visual ML service.

---

### Switching Between EfficientNet-B0 and ResNet50

Open `visual-ml-service\config.py`:
```python
BACKBONE = "efficientnet_b0"   # default — 5M params, fast
# BACKBONE = "resnet50"        # alternative — 25M params, slower
```
After changing: retrain on Colab, copy new `.pth`, rebuild catalog (`python seed_catalog.py --clear`), restart service.

---

### Adding New Dress Categories

1. Open `visual-ml-service\config.py` and add to `CATEGORIES`:
   ```python
   CATEGORIES = [
       {"id": "bridal_lehenga",  "label": "Bridal Lehenga",  "type": "bridal"},
       {"id": "bridal_sharara",  "label": "Bridal Sharara",  "type": "bridal"},
       {"id": "bridal_saree",    "label": "Bridal Saree",    "type": "bridal"},
       # New:
       {"id": "groom_sherwani",  "label": "Groom Sherwani",  "type": "groom"},
   ]
   ```
2. Create `visual-ml-service\training_data\groom_sherwani\` and add 10–20 images
3. Retrain on Colab (it reads `CATEGORIES` from config automatically)
4. Copy new `.pth` to `models\`, add descriptions for new images in `descriptions.json`
5. Run `python seed_catalog.py --clear` to rebuild

---

### Seller: Adding a New Dress (No Retraining Needed)

To add a new product after the catalog is already built, use the API endpoint:
```powershell
$form = @{
    image       = Get-Item "C:\path\to\new_dress.jpg"
    category    = "bridal_lehenga"
    description = "crimson bridal lehenga with heavy silver embroidery and mirror work"
}
Invoke-RestMethod -Method POST -Uri "http://localhost:5002/visual/add-product" -Form $form
```
The image is saved to `catalog\bridal_lehenga\` and its embedding is added to MongoDB immediately. No retraining or reindexing needed.

---

### Rebuilding the Index

If you want to reprocess all catalog images (for example after writing new descriptions):
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:5002/visual/build-index"
```
This rebuilds from `catalog\` using the latest `descriptions.json`. Works with or without a fine-tuned model.

---

## PART 8 — Troubleshooting

---

### Problem: `python is not recognized as the name of a cmdlet`

**Cause:** Python was installed but not added to Windows PATH.

**Solution:**
1. Uninstall Python from Windows Settings → Apps
2. Download again from https://www.python.org/downloads/
3. Run installer — on the **first screen**, check **"Add Python 3.11 to PATH"**
4. Close all PowerShell windows and open a new one
5. Type `python --version`

---

### Problem: `pip install torch` fails or times out

**Solution:**
```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --timeout 300
```
If still failing: try a different internet connection (mobile hotspot).

---

### Problem: MongoDB Atlas connection fails (`ServerSelectionTimeoutError`)

**Cause:** No internet connection, or the Atlas URI is wrong.

**Solution:**
1. Check internet connection is working
2. Open `visual-ml-service\config.py` and verify `MONGO_URI` is:
   ```
   mongodb+srv://Ahmad:1GhCTKOfd2k9QVvQ@cluster0.p2qcckk.mongodb.net/shaadi-sahulat?appName=Cluster0
   ```
3. Go to MongoDB Atlas (cloud.mongodb.com) → Network Access → confirm `0.0.0.0/0` is in the IP whitelist

---

### Problem: `index_built: false` — no recommendations returned

**Cause:** `seed_catalog.py` has not been run yet, or MongoDB catalog is empty.

**Solution:**
```powershell
cd "c:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat"
.\myvenv\Scripts\activate
cd visual-ml-service
python seed_catalog.py
```

---

### Problem: Visual ML service prints `Using pretrained efficientnet_b0 (ImageNet weights)`

**This is normal** — it means you have not completed Colab training yet. The service still works:
- Visual similarity (colour, texture) works well with pretrained weights
- Category classification accuracy is lower until you fine-tune on your dress images

To fix: complete Steps 10–12 (Colab training) and copy the `.pth` file to `models\`.

---

### Problem: `ModuleNotFoundError: No module named 'flask'`

**Cause:** Virtual environment was not activated.

**Solution:**
```powershell
.\myvenv\Scripts\activate
```
Confirm `(myvenv)` appears in the prompt, then run `python app.py` again.

---

### Problem: Port already in use (`EADDRINUSE`)

**Solution:**
```powershell
# Find the process using port 5002 (change number for other ports)
netstat -ano | findstr :5002
# Kill the process (replace 12345 with the PID from above)
taskkill /PID 12345 /F
```

---

### Problem: Frontend shows blank page or "Network Error"

**Solution:**
1. Check all 3 terminal windows are running with no errors
2. Run the health checks from Step 18
3. Fix whichever service is failing
4. Refresh the browser

---

### Problem: Colab disconnects during training

**Cause:** Colab free tier disconnects after ~90 minutes of inactivity.

**Solution:**
1. Keep the Colab tab active and your laptop plugged in
2. If disconnected: Runtime → Reconnect → re-run all cells from the beginning
3. Run training late at night when you can leave the browser open

---

## PART 9 — Project Structure

```
shaadi-sahulat/
│
├── frontend/                           React + Vite + Tailwind (port 5173)
│   ├── src/
│   │   ├── App.jsx                     Main app — Visual Recommendation only
│   │   ├── api/
│   │   │   └── visualApi.js            API calls to backend
│   │   └── components/
│   │       └── VisualRec/              Dress recommendation UI components
│   └── package.json
│
├── backend/                            Node.js + Express (port 5000)
│   ├── server.js                       Main server entry point
│   ├── routes/
│   │   └── visual.js                   /api/visual/* routes
│   ├── services/
│   │   └── visualClient.js             Calls Visual ML service (port 5002)
│   ├── models/                         MongoDB schemas (Mongoose)
│   ├── .env                            ← YOU MUST CREATE THIS (see Step 8)
│   └── package.json
│
├── visual-ml-service/                  Visual ML — Python + Flask (port 5002)
│   ├── app.py                          Flask API — all endpoints
│   ├── config.py                       ← EDIT: backbone, categories, MongoDB URI
│   ├── model.py                        EfficientNet-B0 architecture + loaders
│   ├── description_generator.py        Auto colour + embroidery description
│   ├── tfidf_engine.py                 TF-IDF vectorizer for text similarity
│   ├── mongo_catalog.py                MongoDB Atlas CRUD operations
│   ├── embedding_index.py              Hybrid index build + cosine search
│   ├── predictor.py                    3-stage recommendation pipeline
│   ├── trainer.py                      Training (run on Colab, not locally)
│   ├── data_loader.py                  PyTorch dataset + augmentation
│   ├── seed_catalog.py                 ← RUN THIS to populate MongoDB (Step 14)
│   ├── descriptions.json               ← FILL THIS with dress descriptions (Step 13)
│   │
│   ├── training_data/                  ← PUT TRAINING IMAGES HERE (Step 10)
│   │   ├── bridal_lehenga/             (10–20 .jpg images)
│   │   ├── bridal_sharara/             (10–20 .jpg images)
│   │   └── bridal_saree/               (10–20 .jpg images)
│   │
│   ├── catalog/                        Searchable product catalog (auto-filled by seed_catalog.py)
│   │   ├── bridal_lehenga/
│   │   ├── bridal_sharara/
│   │   └── bridal_saree/
│   │
│   ├── models/                         ← PUT .pth FILES FROM COLAB HERE (Step 12)
│   │   ├── fine_tuned_efficientnet_b0.pth
│   │   ├── category_classifier.pth
│   │   ├── training_history.json
│   │   └── class_names.json
│   │
│   ├── data/                           TF-IDF vectorizer cache (auto-created)
│   └── requirements.txt
│
├── colab-notebook/
│   └── ShaadiSahulat_Visual_Training.ipynb   ← UPLOAD THIS TO COLAB (Step 11)
│
├── myvenv/                             Python virtual environment
└── README.md                           This file
```

---

## PART 10 — API Reference

### Visual Recommendation — Direct (port 5002)

| Method | URL | What It Does |
|--------|-----|-------------|
| GET | `http://localhost:5002/health` | Full health check — model/index/tfidf status |
| POST | `http://localhost:5002/visual/recommend` | Upload image → 2 similar dress recommendations |
| POST | `http://localhost:5002/visual/add-product` | Seller adds new dress image to catalog |
| POST | `http://localhost:5002/visual/build-index` | Rebuild entire index from catalog/ |
| GET | `http://localhost:5002/visual/categories` | List supported dress categories |
| GET | `http://localhost:5002/visual/index-stats` | Total products + per-category counts |
| GET | `http://localhost:5002/visual/dataset-status` | Training image count per folder |

### Visual Recommendation — Via Backend (port 5000)

| Method | URL | What It Does |
|--------|-----|-------------|
| POST | `http://localhost:5000/api/visual/recommend` | Upload image → 2 similar dress recommendations |
| POST | `http://localhost:5000/api/visual/add-product` | Seller adds new dress |
| GET | `http://localhost:5000/api/visual/categories` | List supported categories |
| GET | `http://localhost:5000/api/visual/ml-health` | Check Visual ML service health |
| GET | `http://localhost:5000/api/visual/index-stats` | MongoDB index statistics |
| GET | `http://localhost:5000/api/visual/dataset-status` | Image count per category |
| GET | `http://localhost:5000/api/visual/history/:user_id` | Past recommendations for a user |

### Recommend Endpoint — Request Format

```
POST /visual/recommend
Content-Type: multipart/form-data

Fields:
  image              (required) — image file, JPG/PNG/WebP, max 5 MB
  preferred_category (optional) — "bridal_lehenga" | "bridal_sharara" | "bridal_saree"
  limit              (optional) — integer, always capped at 2
```

### Add-Product Endpoint — Request Format

```
POST /visual/add-product
Content-Type: multipart/form-data

Fields:
  image       (required) — image file, JPG/PNG/WebP, max 5 MB
  category    (required) — "bridal_lehenga" | "bridal_sharara" | "bridal_saree"
  description (required) — seller's text description of the dress
```
