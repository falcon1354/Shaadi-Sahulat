"""
Predictor for ShaadiSahulat Dowry Estimation Module
====================================================
Uses the trained K-Means model to predict the adjustment factor
for a new user based on their cluster membership.
"""

import os
import numpy as np
from kmeans_trainer import load_model, FEATURE_COLUMNS

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MAX_ADJUSTMENT = 0.20  # ±20% cap


def predict_adjustment(
    monthly_income: float,
    total_savings: float,
    unmarried_children: int,
    youngest_unmarried_age: int,
    model_dir: str = MODEL_DIR,
) -> dict:
    """
    Predict the ML adjustment factor for a new user.

    Args:
        monthly_income: User's monthly household income (PKR)
        total_savings: User's total savings (PKR)
        unmarried_children: Number of unmarried children
        youngest_unmarried_age: Age of youngest unmarried child

    Returns:
        {
            "adjustment_factor": float,  # between -0.20 and +0.20
            "cluster_id": int,
            "similar_users_count": int,
            "cluster_mean_deviation": float
        }
    """
    model, scaler, cluster_stats = load_model(model_dir)

    # Build feature vector
    features = np.array([[
        float(monthly_income),
        float(total_savings),
        float(unmarried_children),
        float(youngest_unmarried_age),
    ]])

    # Scale features
    features_scaled = scaler.transform(features)

    # Predict cluster
    cluster_id = int(model.predict(features_scaled)[0])

    # Get cluster statistics
    stats = cluster_stats.get(cluster_id, {})
    mean_deviation = stats.get("mean_deviation", 0.0)
    similar_users = stats.get("count", 0)

    # Cap adjustment factor to ±20%
    adjustment_factor = max(-MAX_ADJUSTMENT, min(MAX_ADJUSTMENT, mean_deviation))

    return {
        "adjustment_factor": round(adjustment_factor, 4),
        "cluster_id": cluster_id,
        "similar_users_count": similar_users,
        "cluster_mean_deviation": round(mean_deviation, 4),
    }


# ── CLI entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Example test case
    result = predict_adjustment(
        monthly_income=80000,
        total_savings=500000,
        unmarried_children=2,
        youngest_unmarried_age=16,
    )
    print("Prediction result:")
    print(f"  Adjustment Factor: {result['adjustment_factor']}")
    print(f"  Cluster ID: {result['cluster_id']}")
    print(f"  Similar Users: {result['similar_users_count']}")
    print(f"  Cluster Mean Deviation: {result['cluster_mean_deviation']}")
