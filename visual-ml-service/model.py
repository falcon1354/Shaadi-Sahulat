"""
ShaadiSahulat Visual Recommendation - Model Architecture
=========================================================
Supports two backbones (selected via config.BACKBONE):

  EfficientNet-B0  (default — lighter, faster, recommended)
    EfficientNet-B0 pretrained
      → last 3 feature blocks unfrozen (features.6, 7, 8)
      → Linear(1280, 512) → ReLU → Dropout(0.5) → Linear(512, 128)  ← 128-dim embedding
      → Linear(128, N)                                                ← classifier head

  ResNet50  (kept for comparison)
    ResNet50 pretrained
      → layer3 + layer4 unfrozen
      → Linear(2048, 512) → ReLU → Dropout(0.5) → Linear(512, 128)  ← 128-dim embedding
      → Linear(128, N)                                                ← classifier head

After training the classifier head is discarded.
Only get_embedding() is used at inference time.
"""

import os
import torch
import torch.nn as nn
import torchvision.models as models

from config import BACKBONE, EMBEDDING_DIM, NUM_CLASSES, TRAINING_CONFIG, MODEL_DIR


def _build_efficientnet_b0():
    """Build EfficientNet-B0 backbone with last 3 blocks unfrozen."""
    base = models.efficientnet_b0(
        weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1
    )
    # Freeze everything
    for param in base.parameters():
        param.requires_grad = False

    # Unfreeze features.6, features.7, features.8
    unfreeze = TRAINING_CONFIG["unfreeze_layers_efficientnet"]
    for name, param in base.named_parameters():
        if any(layer in name for layer in unfreeze):
            param.requires_grad = True

    in_features = base.classifier[1].in_features  # 1280
    base.classifier = nn.Identity()
    return base, in_features


def _build_resnet50():
    """Build ResNet50 backbone with layer3+layer4 unfrozen."""
    base = models.resnet50(
        weights=models.ResNet50_Weights.IMAGENET1K_V1
    )
    for param in base.parameters():
        param.requires_grad = False

    unfreeze = TRAINING_CONFIG["unfreeze_layers_resnet"]
    for name, param in base.named_parameters():
        if any(layer in name for layer in unfreeze):
            param.requires_grad = True

    in_features = base.fc.in_features  # 2048
    base.fc = nn.Identity()
    return base, in_features


class DressEmbeddingModel(nn.Module):
    """
    Dual-backbone embedding model.
    Backbone is chosen at instantiation via the `backbone` argument.
    After training, only get_embedding() is used (classifier discarded).
    """

    def __init__(
        self,
        backbone: str = BACKBONE,
        num_classes: int = NUM_CLASSES,
        embedding_dim: int = EMBEDDING_DIM,
    ):
        super().__init__()
        self.backbone_name = backbone

        if backbone == "efficientnet_b0":
            self.backbone, in_features = _build_efficientnet_b0()
        elif backbone == "resnet50":
            self.backbone, in_features = _build_resnet50()
        else:
            raise ValueError(f"Unknown backbone: {backbone!r}. Use 'efficientnet_b0' or 'resnet50'.")

        # Shared embedding head: in_features → 128
        self.embedding = nn.Sequential(
            nn.Linear(in_features, 512),
            nn.ReLU(),
            nn.Dropout(TRAINING_CONFIG["classifier_dropout"]),
            nn.Linear(512, embedding_dim),
        )

        # Classification head (training only, discarded after)
        self.classifier = nn.Linear(embedding_dim, num_classes)

    def forward(self, x):
        """Return (logits, embedding) — used during training."""
        features  = self.backbone(x)          # [B, in_features]
        embedding = self.embedding(features)   # [B, 128]
        logits    = self.classifier(embedding) # [B, N]
        return logits, embedding

    def get_embedding(self, x):
        """Return L2-normalised 128-dim embedding — training/triplet loss only."""
        features  = self.backbone(x)
        embedding = self.embedding(features)
        return nn.functional.normalize(embedding, p=2, dim=1)

    def get_backbone_features(self, x):
        """Return L2-normalised raw backbone features for similarity search.

        EfficientNet-B0 → 1280-dim  |  ResNet50 → 2048-dim
        These pretrained ImageNet features give real visual similarity
        even without fine-tuning — use these for catalog + query embedding.
        """
        features = self.backbone(x)          # (B, 1280) or (B, 2048)
        return nn.functional.normalize(features, p=2, dim=1)


class TripletLoss(nn.Module):
    """
    Triplet margin loss.
    Pulls same-category embeddings together, pushes different ones apart.
    L = max(d(anchor, positive) - d(anchor, negative) + margin, 0)
    """

    def __init__(self, margin: float = 0.2):
        super().__init__()
        self.margin = margin

    def forward(self, anchor, positive, negative):
        d_pos = torch.norm(anchor - positive, p=2, dim=1)
        d_neg = torch.norm(anchor - negative, p=2, dim=1)
        return torch.clamp(d_pos - d_neg + self.margin, min=0.0).mean()


# ── Save / Load helpers ────────────────────────────────────────────────────

def save_model_components(model: DressEmbeddingModel, save_dir: str = MODEL_DIR):
    os.makedirs(save_dir, exist_ok=True)
    backbone = model.backbone_name

    model_fname = (
        "fine_tuned_efficientnet_b0.pth"
        if backbone == "efficientnet_b0"
        else "fine_tuned_resnet50.pth"
    )
    torch.save(model.state_dict(), os.path.join(save_dir, model_fname))
    torch.save(model.classifier.state_dict(),
               os.path.join(save_dir, "category_classifier.pth"))

    print(f"[Model] Saved to {save_dir}/")
    print(f"  - {model_fname}")
    print(f"  - category_classifier.pth")


def load_model_for_inference(
    model_dir: str = MODEL_DIR,
    backbone: str = BACKBONE,
    device: str = "cpu",
) -> DressEmbeddingModel:
    """
    Load model for inference.

    Priority:
      1. Fine-tuned .pth file (best — use after Colab training)
      2. Pretrained ImageNet weights only (works immediately, no training needed)

    The pretrained-only model gives real visual similarity based on colours,
    textures, and patterns — far better than random demo mode.
    """
    model = DressEmbeddingModel(backbone=backbone)

    model_fname = (
        "fine_tuned_efficientnet_b0.pth"
        if backbone == "efficientnet_b0"
        else "fine_tuned_resnet50.pth"
    )
    model_path = os.path.join(model_dir, model_fname)

    if os.path.exists(model_path):
        model.load_state_dict(
            torch.load(model_path, map_location=device, weights_only=True)
        )
        print(f"[Model] Loaded fine-tuned {backbone} from {model_path}")
    else:
        # Use pretrained ImageNet weights (already loaded in __init__)
        print(f"[Model] No fine-tuned model found at {model_path}")
        print(f"[Model] Using pretrained {backbone} (ImageNet weights).")
        print(f"[Model] For better category accuracy, train on Colab and place .pth here.")

    model = model.to(device)
    model.eval()
    return model


def is_model_fine_tuned(model_dir: str = MODEL_DIR, backbone: str = BACKBONE) -> bool:
    """Return True if a fine-tuned .pth file exists."""
    fname = (
        "fine_tuned_efficientnet_b0.pth"
        if backbone == "efficientnet_b0"
        else "fine_tuned_resnet50.pth"
    )
    return os.path.exists(os.path.join(model_dir, fname))
