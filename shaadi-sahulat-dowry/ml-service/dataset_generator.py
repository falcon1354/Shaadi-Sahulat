"""
Dataset Generator for ShaadiSahulat Dowry Estimation Module
============================================================
Generates a synthetic dataset of 150+ Pakistani household profiles
with realistic financial and family parameters for K-Means clustering.

Categories (8):
  1. bridal_dress    - 15%
  2. groom_dress     - 10%
  3. furniture       - 20%  (bedroom_furniture + bedding_linens)
  4. electronics     - 15%  (large_electronics + small_appliances)
  5. jewelry         - 20%
  6. kitchen_items   - 12%  (kitchen_appliances + crockery_sets)
  7. decoration      - 5%   (decoration + suitcase_sets)
  8. miscellaneous   - 3%
"""

import csv
import random
import os
import json
from datetime import datetime

# ── 8 Category base allocations (must match rule engine) ──────────────────
BASE_ALLOCATION = {
    "bridal_dress": 0.15,
    "groom_dress": 0.10,
    "furniture": 0.20,
    "electronics": 0.15,
    "jewelry": 0.20,
    "kitchen_items": 0.12,
    "decoration": 0.05,
    "miscellaneous": 0.03,
}

PRIORITY_MAP = {"High": 3, "Medium": 2, "Low": 1}
PRIORITY_MULTIPLIERS = {"High": 1.2, "Medium": 1.0, "Low": 0.8}

MIN_BUDGET = 50000
MAX_INCOME_RATIO = 0.40
MAX_SAVINGS_RATIO = 0.80
NUM_RECORDS = 150

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
CSV_PATH = os.path.join(DATA_DIR, "user_profiles_synthetic.csv")


def generate_priority():
    """Return a random priority level."""
    return random.choice(["High", "Medium", "Low"])


def compute_rule_engine_budget(
    monthly_income: int,
    total_savings: int,
    expected_contribution: int,
    family_members: int,
    married_children: int,
    unmarried_children: int,
    youngest_age: int,
    priorities: dict,
) -> dict:
    """
    Replicate the rule engine logic inside Python so the synthetic
    dataset can have a realistic 'estimated_budget' column.
    """
    # Rule 1 & 2
    max_from_income = monthly_income * 12 * MAX_INCOME_RATIO
    max_from_savings = total_savings * MAX_SAVINGS_RATIO

    # Rule 3
    base_pool = min(max_from_income, max_from_savings) + expected_contribution

    # Rule 4 — responsibility score
    score = 1.0
    if unmarried_children > 1:
        score -= 0.15 * (unmarried_children - 1)
    if youngest_age < 18:
        score -= 0.10
    elif 18 <= youngest_age <= 22:
        score -= 0.05
    score = max(score, 0.50)

    # Rule 5
    baseline_budget = int(base_pool * score)

    # Rule 6 — category allocation
    weighted = {}
    for cat, base_pct in BASE_ALLOCATION.items():
        pri_key = f"priority_{cat}"
        multiplier = PRIORITY_MULTIPLIERS.get(priorities.get(pri_key, "Medium"), 1.0)
        weighted[cat] = base_pct * multiplier

    total_weight = sum(weighted.values())
    category_breakdown = {}
    for cat, w in weighted.items():
        ratio = w / total_weight
        category_breakdown[cat] = int(baseline_budget * ratio)

    # Rule 7 — hard validator
    total_liquid = monthly_income * 6 + total_savings
    final_budget = max(baseline_budget, MIN_BUDGET)
    final_budget = min(final_budget, total_liquid)

    # Re-scale categories to final budget
    if baseline_budget > 0:
        scale = final_budget / baseline_budget
        category_breakdown = {k: int(v * scale) for k, v in category_breakdown.items()}

    return {
        "baseline_budget": baseline_budget,
        "final_budget": final_budget,
        "responsibility_score": round(score, 2),
        "category_breakdown": category_breakdown,
    }


def generate_dataset(num_records: int = NUM_RECORDS) -> list:
    """
    Generate synthetic Pakistani household profiles.
    Returns a list of dicts ready for CSV export.
    """
    rows = []
    for i in range(1, num_records + 1):
        monthly_income = random.randint(30000, 300000)
        # Round to nearest 5000 for realism
        monthly_income = round(monthly_income / 5000) * 5000

        total_savings = random.randint(100000, 2000000)
        total_savings = round(total_savings / 10000) * 10000

        expected_contribution = random.choice([0, 0, 0, 50000, 100000, 150000, 200000])

        family_members = random.randint(4, 12)
        married_children = random.randint(0, min(3, family_members - 2))
        unmarried_children = random.randint(1, min(4, family_members - married_children - 1))

        ages = sorted(
            [random.randint(10, 28) for _ in range(unmarried_children)], reverse=True
        )
        youngest_age = ages[-1] if ages else 22
        ages_str = json.dumps(ages)

        priorities = {}
        for cat in BASE_ALLOCATION:
            priorities[f"priority_{cat}"] = generate_priority()

        result = compute_rule_engine_budget(
            monthly_income,
            total_savings,
            expected_contribution,
            family_members,
            married_children,
            unmarried_children,
            youngest_age,
            priorities,
        )

        # actual_spent: estimated_budget * random(0.7, 1.3)
        actual_spent = int(result["final_budget"] * random.uniform(0.7, 1.3))

        # Build the row
        row = {
            "user_id": f"USR-{i:03d}",
            "monthly_income": monthly_income,
            "total_savings": total_savings,
            "expected_contribution": expected_contribution,
            "family_members": family_members,
            "married_children": married_children,
            "unmarried_children": unmarried_children,
            "youngest_unmarried_age": youngest_age,
            "ages_of_unmarried": ages_str,
            **priorities,
            "estimated_budget": result["final_budget"],
            "actual_spent": actual_spent,
            "responsibility_score": result["responsibility_score"],
            "category_breakdown": json.dumps(result["category_breakdown"]),
        }
        rows.append(row)

    return rows


def save_dataset(rows: list, path: str = CSV_PATH):
    """Save the generated dataset to CSV."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"[dataset_generator] Saved {len(rows)} records to {path}")


def load_dataset(path: str = CSV_PATH) -> list:
    """Load dataset from CSV."""
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def append_user_to_dataset(user_data: dict, path: str = CSV_PATH):
    """
    Append a new user's completed estimation data to the dataset.
    This is called after a user completes the dowry estimation.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # Determine next user_id
    existing = load_dataset(path) if os.path.exists(path) else []
    if existing:
        last_id = max(int(r["user_id"].split("-")[1]) for r in existing)
        new_id = f"USR-{last_id + 1:03d}"
    else:
        new_id = "USR-001"

    user_data["user_id"] = new_id
    fieldnames = list(user_data.keys())

    file_exists = os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow(user_data)

    print(f"[dataset_generator] Appended user {new_id} to dataset")
    return new_id


# ── CLI entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    rows = generate_dataset(NUM_RECORDS)
    save_dataset(rows)
    print(f"Generated {len(rows)} synthetic profiles.")
