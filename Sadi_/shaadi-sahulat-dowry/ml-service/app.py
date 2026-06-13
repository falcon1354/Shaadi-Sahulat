"""
ShaadiSahulat ML Microservice (Flask)
======================================
Provides REST API endpoints for:
  - Dataset generation
  - Model training / retraining
  - Adjustment factor prediction
  - Dataset statistics

Run: python app.py
Default port: 5001
"""

import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

# Local modules
from dataset_generator import generate_dataset, save_dataset, load_dataset, append_user_to_dataset, CSV_PATH
from kmeans_trainer import train_kmeans, save_model, load_and_preprocess, retrain_with_new_data
from predictor import predict_adjustment

app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


# ── Health check ───────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "shaadi-sahulat-ml"})


# ── Generate dataset ──────────────────────────────────────────────────────
@app.route("/ml/generate-dataset", methods=["POST"])
def generate_dataset_endpoint():
    """Generate synthetic dataset with N records (default 150)."""
    try:
        data = request.get_json(silent=True) or {}
        num_records = data.get("num_records", 150)
        rows = generate_dataset(num_records)
        save_dataset(rows)
        return jsonify({
            "success": True,
            "records_generated": len(rows),
            "csv_path": CSV_PATH,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Train model ───────────────────────────────────────────────────────────
@app.route("/ml/train", methods=["POST"])
def train_model_endpoint():
    """Train K-Means model on the existing dataset."""
    try:
        if not os.path.exists(CSV_PATH):
            return jsonify({"success": False, "error": "Dataset not found. Generate it first."}), 400

        df = load_and_preprocess()
        model, scaler, cluster_stats = train_kmeans(df)
        save_model(model, scaler, cluster_stats)

        return jsonify({
            "success": True,
            "records_used": len(df),
            "clusters": {
                str(k): v for k, v in cluster_stats.items()
            },
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Retrain model (with new data) ────────────────────────────────────────
@app.route("/ml/retrain", methods=["POST"])
def retrain_model_endpoint():
    """Retrain model incorporating new user data."""
    try:
        model, scaler, cluster_stats = retrain_with_new_data()
        return jsonify({
            "success": True,
            "clusters": {
                str(k): v for k, v in cluster_stats.items()
            },
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Predict adjustment factor ─────────────────────────────────────────────
@app.route("/ml/dowry-adjustment", methods=["POST"])
def predict_adjustment_endpoint():
    """
    Predict the ML adjustment factor for a user.

    Body: {
        "income": 80000,
        "savings": 500000,
        "unmarried_children": 2,
        "youngest_age": 16
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON body provided"}), 400

        required = ["income", "savings", "unmarried_children", "youngest_age"]
        for field in required:
            if field not in data:
                return jsonify({"success": False, "error": f"Missing field: {field}"}), 400

        result = predict_adjustment(
            monthly_income=float(data["income"]),
            total_savings=float(data["savings"]),
            unmarried_children=int(data["unmarried_children"]),
            youngest_unmarried_age=int(data["youngest_age"]),
        )

        return jsonify({"success": True, **result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Add new user to dataset ──────────────────────────────────────────────
@app.route("/ml/add-user", methods=["POST"])
def add_user_endpoint():
    """
    Add a new user's estimation data to the dataset.
    Also triggers model retraining.

    Body: Full user estimation data (from dowry save endpoint)
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON body provided"}), 400

        new_id = append_user_to_dataset(data)

        # Retrain model with new data
        try:
            retrain_with_new_data()
            retrained = True
        except Exception:
            retrained = False

        return jsonify({
            "success": True,
            "new_user_id": new_id,
            "model_retrained": retrained,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Dataset statistics ───────────────────────────────────────────────────
@app.route("/ml/dataset-stats", methods=["GET"])
def dataset_stats_endpoint():
    """Get statistics about the current dataset."""
    try:
        if not os.path.exists(CSV_PATH):
            return jsonify({"success": False, "error": "Dataset not found"}), 404

        df = load_and_preprocess()
        stats = {
            "total_records": len(df),
            "income_range": {
                "min": int(df["monthly_income"].min()),
                "max": int(df["monthly_income"].max()),
                "mean": int(df["monthly_income"].mean()),
            },
            "savings_range": {
                "min": int(df["total_savings"].min()),
                "max": int(df["total_savings"].max()),
                "mean": int(df["total_savings"].mean()),
            },
            "budget_range": {
                "min": int(df["estimated_budget"].min()),
                "max": int(df["estimated_budget"].max()),
                "mean": int(df["estimated_budget"].mean()),
            },
        }
        return jsonify({"success": True, "stats": stats})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Full pipeline: generate + train ──────────────────────────────────────
@app.route("/ml/init", methods=["POST"])
def init_pipeline():
    """Generate dataset + train model in one call. Call on first setup."""
    try:
        data = request.get_json(silent=True) or {}
        num_records = data.get("num_records", 150)

        # Generate dataset
        rows = generate_dataset(num_records)
        save_dataset(rows)

        # Train model
        df = load_and_preprocess()
        model, scaler, cluster_stats = train_kmeans(df)
        save_model(model, scaler, cluster_stats)

        return jsonify({
            "success": True,
            "records_generated": len(rows),
            "model_trained": True,
            "clusters": {
                str(k): v for k, v in cluster_stats.items()
            },
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Main ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Auto-initialize if dataset doesn't exist
    if not os.path.exists(CSV_PATH):
        print("[init] No dataset found. Generating default dataset (150 records)...")
        rows = generate_dataset(150)
        save_dataset(rows)

        print("[init] Training K-Means model...")
        df = load_and_preprocess()
        model, scaler, cluster_stats = train_kmeans(df)
        save_model(model, scaler, cluster_stats)
        print("[init] Setup complete!")

    print("[server] Starting ML microservice on port 5001...")
    app.run(host="0.0.0.0", port=5001, debug=True)
