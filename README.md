# ShaadiSahulat — Quick Start Guide

---

## Step 1 — Install dependencies (first time only)

Open **3 separate terminals**, one per folder:

**Terminal A — Python (Flask ML)**
```bash
cd visual-ml-service
pip install flask flask-cors pymongo torch torchvision pillow numpy scikit-learn werkzeug
```

**Terminal B — Node.js (Backend)**
```bash
cd backend
npm install
```

**Terminal C — React (Frontend)**
```bash
cd frontend
npm install
```

---

## Step 2 — Seed demo data (first time only)

In Terminal A (visual-ml-service still active):
```bash
python seed_all_categories.py
```

Creates Ahmed Traders seller + 22 products. Takes ~30 sec.

---

## Step 3 — Start all 3 services (every time)

Run each in its own terminal and **wait for the ready message**:

| Terminal | Command | Ready when you see |
|----------|---------|-------------------|
| A | `cd visual-ml-service && python app.py` | `Running on http://0.0.0.0:5002` |
| B | `cd backend && node server.js` | `Server running on port 5000` |
| C | `cd frontend && npm run dev` | `Local: http://localhost:3000` |

Then open **http://localhost:3000** in your browser.

---

## Step 4 — (Optional) Train the dress AI model in Google Colab

> Only needed if you want better visual dress matching.
> Skip this — the app works with pretrained ImageNet weights by default.

1. Open the Colab notebook in `colab/ShaadiSahulat_Train.ipynb`
2. Upload your dress images to `training_data/` folders
3. Run all cells — downloads fine-tuned model weights
4. Copy `models/fine_tuned_efficientnet_b0.pth` back to `visual-ml-service/models/`
5. Call `POST http://localhost:5002/visual/build-index` to rebuild the search index

---

## Demo Logins

| Role   | Email | Password |
|--------|-------|----------|
| Seller | ahmed@shaadisahulat.com | Test@1234 |
| Buyer  | Register on "My Account" tab | — |

---

## Pages at a glance

| Tab | What it does |
|-----|-------------|
| Marketplace | Browse, search by text (TF-IDF), filter, add to cart |
| Find by Photo | Upload dress image → AI finds similar; click "View in Marketplace" |
| Budget Estimator | Dowry wizard → estimate + adjust sliders → saves budget |
| Seller Panel | Register/login, upload products, edit listings, see price suggestions |
| My Account | Buyer signup / login |
