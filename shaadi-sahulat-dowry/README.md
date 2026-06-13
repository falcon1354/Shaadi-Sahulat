# ShaadiSahulat — Dowry Estimation Module

**FYP 2026 | NUCES Chiniot-Faisalabad Campus**

> A Hybrid Rule-Based + ML (K-Means) Dowry Budget Estimation System for Pakistani wedding planning.

---

## Project Overview

ShaadiSahulat is a wedding planning platform. This repository contains the **Dowry Estimation Module**, the core intelligence component that calculates personalized dowry budgets using a **Hybrid Engine**:

1. **Rule-Based Engine** — Generates a baseline budget using transparent, explainable financial formulas
2. **ML Personalization Layer** — K-Means clustering adjusts the budget ±20% based on similar user spending patterns
3. **Hybrid Merge** — Combines both outputs with final validation

### 8 Dowry Categories

| # | Category | Base Allocation | Includes |
|---|----------|----------------|----------|
| 1 | Bridal Dress | 15% | Bridal wear |
| 2 | Groom Dress | 10% | Groom wear |
| 3 | Furniture | 20% | Bedroom furniture + Bedding linens |
| 4 | Electronics | 15% | Large electronics + Small appliances |
| 5 | Jewelry | 20% | Gold, ornaments |
| 6 | Kitchen Items | 12% | Kitchen appliances + Crockery sets |
| 7 | Decoration | 5% | Decoration + Suitcase sets |
| 8 | Miscellaneous | 3% | Other items |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Frontend │────▶│  Express Backend │────▶│  Python ML      │
│   (Port 3000)    │     │  (Port 5000)     │     │  Service (5001) │
│   4-step Wizard  │     │  Rule Engine     │     │  K-Means Model  │
│   Recharts       │     │  Hybrid Engine   │     │  Flask API      │
└─────────────────┘     │  MongoDB         │     │  150+ Dataset   │
                        └────────┬────────┘     └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │    MongoDB       │
                        │  (Port 27017)   │
                        │  Estimations    │
                        │  User Profiles  │
                        └─────────────────┘
```

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.9+
- **MongoDB** 6.0+ (running locally or via MongoDB Atlas)
- **pip** (Python package manager)

---

## Quick Start

### 1. Start MongoDB

```bash
# If using local MongoDB
mongod --dbpath /path/to/data

# Or use MongoDB Atlas connection string in backend/.env
```

### 2. Start the ML Service

```bash
cd ml-service

# Install Python dependencies
pip install -r requirements.txt

# Start the Flask service (auto-generates dataset & trains model on first run)
python app.py
```

The ML service runs on **http://localhost:5001**.

### 3. Start the Backend

```bash
cd backend

# Install Node.js dependencies
npm install

# Start the server
npm run dev
```

The backend runs on **http://localhost:5000**.

### 4. Start the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend runs on **http://localhost:3000**.

### 5. Initialize ML Data (Optional)

If you want to regenerate the dataset or retrain the model:

```bash
# Via API
curl -X POST http://localhost:5001/ml/init -H 'Content-Type: application/json' -d '{"num_records": 150}'

# Or via backend
curl -X POST http://localhost:5000/api/dowry/ml/init -H 'Content-Type: application/json' -d '{"num_records": 150}'
```

---

## API Endpoints

### Dowry Estimation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/dowry/estimate` | Preview estimation (no save) |
| POST | `/api/dowry/save` | Estimate + save to DB + add to ML dataset |
| GET | `/api/dowry/history/:user_id` | Get user's estimation history |
| GET | `/api/dowry/:id` | Get single estimation by ID |
| POST | `/api/dowry/rule-only` | Rule-based only (no ML) |
| GET | `/api/dowry/ml/stats` | ML dataset statistics |
| POST | `/api/dowry/ml/init` | Initialize ML service |

### ML Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ml/dowry-adjustment` | Get ML adjustment factor |
| POST | `/ml/generate-dataset` | Generate synthetic dataset |
| POST | `/ml/train` | Train K-Means model |
| POST | `/ml/retrain` | Retrain with new data |
| POST | `/ml/add-user` | Add user to dataset + retrain |
| GET | `/ml/dataset-stats` | Dataset statistics |
| POST | `/ml/init` | Full pipeline: generate + train |

---

## Sample API Request

```json
POST /api/dowry/estimate
{
  "monthly_household_income": 100000,
  "total_savings_available": 800000,
  "expected_contribution": 50000,
  "total_family_members": 6,
  "married_children_count": 1,
  "unmarried_children_count": 2,
  "age_of_each_unmarried_child": [15, 20],
  "priorities": {
    "priority_bridal_dress": "High",
    "priority_groom_dress": "Medium",
    "priority_furniture": "High",
    "priority_electronics": "Medium",
    "priority_jewelry": "High",
    "priority_kitchen_items": "Low",
    "priority_decoration": "Low",
    "priority_miscellaneous": "Medium"
  }
}
```

### Sample Response

```json
{
  "success": true,
  "data": {
    "total_recommended_budget": 528000,
    "category_breakdown": {
      "bridal_dress": 103488,
      "groom_dress": 57744,
      "furniture": 138144,
      "electronics": 69216,
      "jewelry": 138144,
      "kitchen_items": 55776,
      "decoration": 23136,
      "miscellaneous": 5199
    },
    "baseline_budget": 528000,
    "ml_adjustment_factor": 0.08,
    "responsibility_score": 0.75,
    "budget_sources": {
      "from_income": 480000,
      "from_savings": 48000,
      "from_contribution": 50000,
      "income_percentage": 90.9,
      "savings_percentage": 9.1
    },
    "notes": [
      "Maximum budget from income (40% of annual): PKR 480,000",
      "Maximum budget from savings (80%): PKR 640,000",
      "Base pool (min of income/savings caps + contribution): PKR 530,000",
      "Budget reduced by 15% due to 2 unmarried children",
      "Budget reduced by 10% — youngest unmarried child is 15"
    ],
    "source": "Hybrid Engine"
  }
}
```

---

## Project Structure

```
shaadi-sahulat-dowry/
├── backend/
│   ├── server.js                  # Express server entry point
│   ├── package.json
│   ├── .env                       # Environment config
│   ├── config/
│   │   └── db.js                  # MongoDB connection
│   ├── models/
│   │   ├── DowryEstimation.js     # Mongoose model for estimations
│   │   └── UserProfile.js         # Mongoose model for users
│   ├── services/
│   │   ├── ruleEngine.js          # ⭐ Rule-Based Engine (standalone)
│   │   ├── mlClient.js            # ⭐ ML Service client (standalone)
│   │   └── hybridEngine.js        # ⭐ Hybrid merge logic (standalone)
│   ├── routes/
│   │   └── dowry.js               # API route definitions
│   ├── controllers/
│   │   └── dowryController.js     # Request handlers
│   └── exports/
│       └── index.js               # ⭐ Export module for other modules
├── ml-service/
│   ├── app.py                     # Flask API server
│   ├── requirements.txt
│   ├── dataset_generator.py       # ⭐ Synthetic dataset generator (150+ rows)
│   ├── kmeans_trainer.py          # ⭐ K-Means training logic (standalone)
│   ├── predictor.py               # ⭐ Prediction logic (standalone)
│   ├── data/
│   │   └── user_profiles_synthetic.csv  # Generated dataset
│   └── models/
│       ├── kmeans_model.pkl       # Trained K-Means model
│       ├── scaler.pkl             # Feature scaler
│       └── cluster_stats.pkl      # Cluster statistics
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── dowryApi.js        # API client
│   │   ├── components/
│   │   │   ├── Wizard.jsx         # Main wizard container
│   │   │   ├── StepFinancial.jsx  # Step 1: Financial Profile
│   │   │   ├── StepFamily.jsx     # Step 2: Family Context
│   │   │   ├── StepPriority.jsx   # Step 3: Priority Settings
│   │   │   └── StepResults.jsx    # Step 4: Results Dashboard
│   │   └── styles/
│   │       └── index.css
│   └── public/
└── README.md
```

---

## Using Exports in Other Modules

The `backend/exports/index.js` file provides a clean API for other modules to use:

```javascript
// In your BNPL or Spending Analytics module:
const { ruleEngine, hybridEstimate, BASE_ALLOCATION, mlClient } = require('./exports');

// Get category breakdown for spending analytics
const result = ruleEngine(userInputs);
// result.category_breakdown → { bridal_dress: 270000, furniture: 360000, ... }

// Run hybrid estimation
const hybrid = await hybridEstimate(userInputs);
// hybrid.total_recommended_budget → 1500000

// Get ML adjustment factor
const ml = await mlClient.getAdjustmentFactor({
  income: 80000, savings: 500000,
  unmarried_children: 2, youngest_age: 16
});
```

---

## How the ML Dataset Grows

When a new user completes the dowry estimation:

1. Their data is **saved to MongoDB** (primary storage)
2. Their data is **appended to the CSV dataset** (via ML service)
3. The **K-Means model is retrained** automatically with the new data
4. Future users benefit from a more accurate model with more data points

This ensures the system becomes smarter over time.

---

## Rule Engine Logic

| Rule | Description |
|------|-------------|
| Rule 1 | Income Cap: max 40% of annual income |
| Rule 2 | Savings Cap: max 80% of total savings |
| Rule 3 | Base Pool = min(income cap, savings cap) + contributions |
| Rule 4 | Responsibility Score: reduce budget based on unmarried children and their ages |
| Rule 5 | Baseline Budget = Base Pool × Responsibility Score |
| Rule 6 | Category Allocation: base % × priority multiplier, then normalize |
| Rule 7 | Hard Validator: floor at PKR 50,000, ceiling at 6 months income + savings |

---

## ML Model Details

- **Algorithm**: K-Means Clustering (k=5)
- **Features**: monthly_income, total_savings, unmarried_children, youngest_unmarried_age
- **Preprocessing**: StandardScaler normalization
- **Adjustment**: Mean deviation of cluster, capped at ±20%
- **Dataset**: 150+ synthetic Pakistani household profiles

---

## FYP Team

| Name | ID |
|------|-----|
| Ahsan Iftikhar | 22P-9280 |
| Ahmad Raza | 22F-3325 |
| Ahmad Zubair | 22F-3161 |

**Supervised by:** Dr. Muhammad Usama

**Department of Computer Science, NUCES Chiniot-Faisalabad Campus, Pakistan**
