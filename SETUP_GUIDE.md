# ShaadiSahulat — Local Setup Guide

Complete steps to clone and run the project on your machine from scratch.

---

## Prerequisites

Install these before starting:

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://python.org |
| Git | any | https://git-scm.com |
| MongoDB Atlas account | — | https://cloud.mongodb.com (free tier works) |

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/Ahmadraza1211/Shaadi_FYP.git
cd Shaadi_FYP
```

---

## Step 2 — Create the `.env` File (Backend)

Inside the `backend/` folder, create a file named `.env`:

```
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/shaadisahulat?retryWrites=true&w=majority
PORT=5000
```

Replace `<username>`, `<password>`, and `<cluster>` with your MongoDB Atlas credentials.

> The `.gitignore` excludes `.env` for security — you must create this file manually every time you clone.

---

## Step 3 — Install Backend Dependencies

```bash
cd backend
npm install
```

---

## Step 4 — Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## Step 5 — Set Up Python Virtual Environment (ML Service)

```bash
cd ../visual-ml-service

# Create virtual environment
python -m venv myvenv

# Activate it
# Windows:
myvenv\Scripts\activate
# Mac/Linux:
source myvenv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

> PyTorch install may take a few minutes — it is a large package.

---

## Step 6 — Seed the Database (Run Once Only)

### 6a — Seed product catalog (Python ML service must be running first)

Start the ML service first (see Step 7), then in a **new terminal**:

```bash
cd visual-ml-service
myvenv\Scripts\activate   # Windows
python seed_all_categories.py
```

This seeds Ahmed Traders seller account + all products into MongoDB.

### 6b — Seed dowry training data

```bash
cd backend
node seeds/seedTraining.js
```

This seeds 150 synthetic dowry records. Run once — no server needed.

---

## Step 7 — Run All Three Services

Open **3 separate terminals**:

### Terminal 1 — Python ML Service (port 5002)

```bash
cd visual-ml-service
myvenv\Scripts\activate   # Windows  (source myvenv/bin/activate on Mac/Linux)
python app.py
```

### Terminal 2 — Node.js Backend (port 5000)

```bash
cd backend
npm run dev
```

### Terminal 3 — React Frontend (port 5173)

```bash
cd frontend
npm run dev
```

---

## Step 8 — Open the App

Go to: **http://localhost:5173**

---

## Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Seller (Ahmed Traders) | admin@shaadisahulat.com | ahmed123 |
| Buyer | Register a new account from the app |

---

## Folder Structure

```
Shaadi_FYP/
├── backend/               Node.js + Express API (port 5000)
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── seeds/             Run once: node seeds/seedTraining.js
│   └── server.js
├── frontend/              React + Vite + Tailwind (port 5173)
│   └── src/
├── visual-ml-service/     Flask + PyTorch ML API (port 5002)
│   ├── app.py
│   ├── seed_all_categories.py   Run once after app.py is running
│   ├── uploads/           Product images (committed to repo)
│   └── training_data/     Dress images for similarity search
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect to MongoDB` | Check `.env` MONGO_URI is correct |
| `Port 5000 already in use` | Change PORT in `.env` or kill the process |
| `No similar dresses found` | Run `python seed_all_categories.py` again |
| `Dowry estimation shows again` | Make sure you are logged in as a buyer with a registered account |
| `pip install` fails on torch | Try: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` |
