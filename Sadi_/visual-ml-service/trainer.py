"""
ShaadiSahulat Visual Recommendation - Trainer
===============================================
Two-phase training (backbone selected via config.BACKBONE):

  Phase 1 — Classification pre-training (CrossEntropyLoss)
    Forces the 128-dim embedding space to be category-separable.

  Phase 2 — Embedding refinement (TripletLoss, optional)
    Pulls same-category embeddings closer, pushes different ones apart.

Backbone options (set in config.py):
  "efficientnet_b0"  — default, ~5M params, 3× faster than ResNet50
  "resnet50"         — original, ~25M params

IMPORTANT: Run on Google Colab with GPU for best results.
           Local CPU training works but is slow (30–90 min per run).
"""

import os
import json
import time

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from config import (
    BACKBONE, TRAINING_CONFIG, TRIPLET_CONFIG,
    MODEL_DIR, TRAINING_HISTORY_PATH, FINE_TUNED_MODEL_PATH,
    EMBEDDING_EXTRACTOR_PATH, CATEGORY_CLASSIFIER_PATH,
)
from model import DressEmbeddingModel, TripletLoss, save_model_components
from data_loader import create_dataloaders, validate_dataset


def train_model(device: str = "cuda" if torch.cuda.is_available() else "cpu"):
    """
    Full training pipeline (Phase 1 + optional Phase 2).

    Parameters
    ----------
    device : "cuda" for GPU (Colab), "cpu" for local

    Returns
    -------
    dict  training history {train_loss, train_accuracy, val_loss, val_accuracy}
    None  if dataset validation fails
    """
    print(f"\n{'='*60}")
    print(f"  ShaadiSahulat — Model Training")
    print(f"{'='*60}")
    print(f"  Backbone : {BACKBONE}")
    print(f"  Device   : {device}")
    print(f"  LR       : {TRAINING_CONFIG['learning_rate']}")
    print(f"  Max epochs: {TRAINING_CONFIG['max_epochs']}")
    print(f"{'='*60}\n")

    is_valid, _, warnings = validate_dataset()
    for w in warnings:
        print(f"  {w}")
    if not is_valid:
        print("\n[ERROR] Dataset validation failed. Add more images before training.")
        return None

    train_loader, val_loader, _ = create_dataloaders(
        batch_size=TRAINING_CONFIG["batch_size"]
    )

    model = DressEmbeddingModel(backbone=BACKBONE).to(device)

    total_params     = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n[Model] {BACKBONE}")
    print(f"  Total params    : {total_params:,}")
    print(f"  Trainable params: {trainable_params:,}")
    print(f"  Frozen params   : {total_params - trainable_params:,}\n")

    # Phase 1: Classification pre-training
    print(f"{'─'*60}")
    print(f"  PHASE 1 — Classification Pre-Training")
    print(f"{'─'*60}")
    history = _train_classification(model, train_loader, val_loader, device)

    # Phase 2: Triplet Loss (optional)
    if TRIPLET_CONFIG["enabled"]:
        print(f"\n{'─'*60}")
        print(f"  PHASE 2 — Embedding Refinement (TripletLoss)")
        print(f"{'─'*60}")
        triplet_history = _train_triplet(model, train_loader, device)
        history["triplet_phase"] = triplet_history

    # Save
    os.makedirs(MODEL_DIR, exist_ok=True)
    save_model_components(model, MODEL_DIR)

    with open(TRAINING_HISTORY_PATH, "w") as fh:
        json.dump(history, fh, indent=2)

    best_val = max(history.get("val_accuracy", [0]))
    print(f"\n{'='*60}")
    print(f"  TRAINING COMPLETE")
    print(f"  Best validation accuracy: {best_val:.2f}%")
    print(f"  Model saved to: {MODEL_DIR}/")
    print(f"{'='*60}\n")

    return history


# ── Phase 1: Classification ────────────────────────────────────────────────

def _train_classification(model, train_loader, val_loader, device):
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=TRAINING_CONFIG["learning_rate"],
        weight_decay=TRAINING_CONFIG["weight_decay"],
    )
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min",
        factor=TRAINING_CONFIG["scheduler_factor"],
        patience=TRAINING_CONFIG["scheduler_patience"],
    )

    history = {
        "train_loss": [], "train_accuracy": [],
        "val_loss":   [], "val_accuracy":   [],
    }
    best_val_loss    = float("inf")
    patience_counter = 0

    for epoch in range(TRAINING_CONFIG["max_epochs"]):
        t0 = time.time()

        # ── train ──
        model.train()
        run_loss, correct, total = 0.0, 0, 0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            logits, _ = model(imgs)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            run_loss += loss.item()
            _, preds = torch.max(logits, 1)
            correct  += (preds == labels).sum().item()
            total    += labels.size(0)

        train_loss = run_loss / len(train_loader)
        train_acc  = 100.0 * correct / total

        # ── validate ──
        model.eval()
        v_loss, v_correct, v_total = 0.0, 0, 0
        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs, labels = imgs.to(device), labels.to(device)
                logits, _ = model(imgs)
                v_loss    += criterion(logits, labels).item()
                _, preds   = torch.max(logits, 1)
                v_correct  += (preds == labels).sum().item()
                v_total    += labels.size(0)

        val_loss = v_loss / len(val_loader)
        val_acc  = 100.0 * v_correct / v_total

        scheduler.step(val_loss)

        history["train_loss"].append(round(train_loss, 4))
        history["train_accuracy"].append(round(train_acc, 2))
        history["val_loss"].append(round(val_loss, 4))
        history["val_accuracy"].append(round(val_acc, 2))

        elapsed = time.time() - t0
        print(
            f"  Epoch {epoch+1:2d}/{TRAINING_CONFIG['max_epochs']} │ "
            f"Train: loss={train_loss:.4f} acc={train_acc:.1f}% │ "
            f"Val: loss={val_loss:.4f} acc={val_acc:.1f}% │ "
            f"{elapsed:.1f}s"
        )

        if val_loss < best_val_loss:
            best_val_loss    = val_loss
            patience_counter = 0
            torch.save(model.state_dict(), FINE_TUNED_MODEL_PATH)
            print("    → checkpoint saved")
        else:
            patience_counter += 1
            if patience_counter >= TRAINING_CONFIG["early_stopping_patience"]:
                print(f"\n  Early stop — val loss flat for "
                      f"{TRAINING_CONFIG['early_stopping_patience']} epochs.")
                break

    return history


# ── Phase 2: Triplet Loss ──────────────────────────────────────────────────

def _train_triplet(model, train_loader, device):
    criterion = TripletLoss(margin=TRIPLET_CONFIG["margin"])
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=TRIPLET_CONFIG["learning_rate"],
    )
    history = {"triplet_loss": []}

    model.eval()
    all_embs, all_labels = [], []
    with torch.no_grad():
        for imgs, labels in train_loader:
            all_embs.append(model.get_embedding(imgs.to(device)).cpu())
            all_labels.extend(labels.numpy())

    all_embs   = torch.cat(all_embs, dim=0)
    all_labels = np.array(all_labels)
    n          = len(all_labels)

    model.train()
    for epoch in range(TRIPLET_CONFIG["epochs"]):
        epoch_loss, n_triplets = 0.0, 100

        for _ in range(n_triplets):
            a_idx = np.random.randint(0, n)
            a_lbl = all_labels[a_idx]

            pos_ids = np.where(all_labels == a_lbl)[0]
            neg_ids = np.where(all_labels != a_lbl)[0]
            if len(pos_ids) < 2 or len(neg_ids) < 1:
                continue

            p_idx = np.random.choice(pos_ids)
            n_idx = np.random.choice(neg_ids)

            anchor   = all_embs[a_idx].unsqueeze(0).to(device)
            positive = all_embs[p_idx].unsqueeze(0).to(device)
            negative = all_embs[n_idx].unsqueeze(0).to(device)

            optimizer.zero_grad()
            loss = criterion(anchor, positive, negative)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()

        avg = epoch_loss / n_triplets
        history["triplet_loss"].append(round(avg, 4))
        print(f"  Triplet epoch {epoch+1:2d}/{TRIPLET_CONFIG['epochs']} │ loss={avg:.4f}")

    return history


if __name__ == "__main__":
    train_model()
