"""
K-Means Trainer for ShaadiSahulat Dowry Estimation Module
==========================================================
Trains a K-Means clustering model on the synthetic dataset.
Saves the trained model and scaler as joblib files.

Features used for clustering:
  - monthly_income
  - total_savings
  - unmarried_children
  - youngest_unmarried_age

k = 5 clusters (user segments)
"""

import os
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import joblib

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
CSV_PATH = os.path.join(DATA_DIR, "user_profiles_synthetic.csv")

PRIORITY_MAP = {"High": 3, "Medium": 2, "Low": 1}
FEATURE_COLUMNS = [
    "monthly_income",
    "total_savings",
    "unmarried_children",
    "youngest_unmarried_age",
]
K_CLUSTERS = 5
RANDOM_STATE = 42


def load_and_preprocess(csv_path: str = CSV_PATH) -> pd.DataFrame:
    """Load CSV and convert priority strings to numeric."""
    df = pd.read_csv(csv_path)

    # Convert priority columns to numeric
    priority_cols = [c for c in df.columns if c.startswith("priority_")]
    for col in priority_cols:
        df[col] = df[col].map(PRIORITY_MAP)

    return df


def train_kmeans(df: pd.DataFrame, k: int = K_CLUSTERS):
    """
    Train K-Means on the feature columns.
    Returns the trained model, scaler, and cluster statistics.
    """
    # Extract features
    X = df[FEATURE_COLUMNS].values.astype(float)

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train K-Means
    model = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10, max_iter=300)
    model.fit(X_scaled)

    # Assign clusters to dataframe
    df["cluster_id"] = model.labels_

    # Compute cluster statistics (for deviation analysis)
    cluster_stats = {}
    for cid in range(k):
        cluster_df = df[df["cluster_id"] == cid]
        deviations = []
        for _, row in cluster_df.iterrows():
            est = row["estimated_budget"]
            act = row["actual_spent"]
            if est > 0:
                deviations.append((act - est) / est)
        cluster_stats[cid] = {
            "count": len(cluster_df),
            "mean_deviation": float(np.mean(deviations)) if deviations else 0.0,
            "mean_income": float(cluster_df["monthly_income"].mean()),
            "mean_savings": float(cluster_df["total_savings"].mean()),
            "mean_budget": float(cluster_df["estimated_budget"].mean()),
        }

    return model, scaler, cluster_stats


def save_model(model, scaler, cluster_stats,
               model_dir: str = MODEL_DIR):
    """Save trained model, scaler, and stats to disk."""
    os.makedirs(model_dir, exist_ok=True)

    joblib.dump(model, os.path.join(model_dir, "kmeans_model.pkl"))
    joblib.dump(scaler, os.path.join(model_dir, "scaler.pkl"))
    joblib.dump(cluster_stats, os.path.join(model_dir, "cluster_stats.pkl"))

    print(f"[kmeans_trainer] Model saved to {model_dir}")
    print(f"[kmeans_trainer] Cluster statistics:")
    for cid, stats in cluster_stats.items():
        print(f"  Cluster {cid}: {stats['count']} users, "
              f"mean deviation = {stats['mean_deviation']:.4f}, "
              f"mean income = {stats['mean_income']:.0f}")


def load_model(model_dir: str = MODEL_DIR):
    """Load saved model, scaler, and cluster stats."""
    model = joblib.load(os.path.join(model_dir, "kmeans_model.pkl"))
    scaler = joblib.load(os.path.join(model_dir, "scaler.pkl"))
    cluster_stats = joblib.load(os.path.join(model_dir, "cluster_stats.pkl"))
    return model, scaler, cluster_stats


def retrain_with_new_data(csv_path: str = CSV_PATH, k: int = K_CLUSTERS):
    """
    Retrain the model incorporating new user data.
    Called when new users complete the estimation.
    """
    df = load_and_preprocess(csv_path)
    model, scaler, cluster_stats = train_kmeans(df, k)
    save_model(model, scaler, cluster_stats)
    return model, scaler, cluster_stats


# ── CLI entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Generate dataset if it doesn't exist
    if not os.path.exists(CSV_PATH):
        from dataset_generator import generate_dataset, save_dataset
        rows = generate_dataset(150)
        save_dataset(rows)

    df = load_and_preprocess()
    print(f"Loaded {len(df)} records from dataset")

    model, scaler, stats = train_kmeans(df)
    save_model(model, scaler, stats)
    print("Training complete!")
