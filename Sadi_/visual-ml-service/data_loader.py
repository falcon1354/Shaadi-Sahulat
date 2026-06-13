"""
ShaadiSahulat Visual Recommendation - Data Loader
===================================================
Loads images from the training_data/ folder structure,
applies data augmentation, creates PyTorch DataLoaders
for training and validation.

USAGE:
  1. Place 10-20 images per category in training_data/{category}/
  2. Run this module to verify your dataset
  3. The trainer will automatically use this module

FOLDER STRUCTURE EXPECTED:
  training_data/
  ├── bridal_lehenga/
  │   ├── bridal_lehenga_001.jpg
  │   ├── bridal_lehenga_002.jpg
  │   └── ...  (10-20 images)
  ├── bridal_sharara/
  │   └── ...  (10-20 images)
  └── ... (8 categories total)

MINIMUM: 10 images per category (80 total for 8 categories)
RECOMMENDED: 20 images per category (160 total)
"""

import os
import json
import numpy as np
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import torchvision.transforms.functional as TF
from torch.utils.data import Dataset, DataLoader
import torch
from config import (
    CATEGORIES, CATEGORY_IDS, NUM_CLASSES, IMAGE_SIZE,
    TRAINING_DATA_DIR, AUGMENTATION_MULTIPLIER, VALIDATION_SPLIT,
    AUGMENTATION_PARAMS, CLASS_NAMES_PATH,
)


class DressDataset(Dataset):
    """Custom Dataset for wedding dress images with augmentation support."""

    def __init__(self, image_paths, labels, augment=False):
        """
        Args:
            image_paths: List of full paths to image files
            labels: List of integer category labels
            augment: Whether to apply data augmentation
        """
        self.image_paths = image_paths
        self.labels = labels
        self.augment = augment

        # Base transform: resize + normalize (always applied)
        self.base_transform = transforms.Compose([
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],   # ImageNet means
                std=[0.229, 0.224, 0.225]      # ImageNet stds
            ),
        ])

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        label = self.labels[idx]

        # Load image
        image = Image.open(img_path).convert("RGB")

        if self.augment:
            image = self._apply_augmentation(image)

        image = self.base_transform(image)
        return image, label

    def _apply_augmentation(self, image):
        """Apply random augmentations to an image."""
        # Resize to slightly larger than target first
        image = image.resize((int(IMAGE_SIZE * 1.2), int(IMAGE_SIZE * 1.2)))

        # Random horizontal flip
        if np.random.random() < AUGMENTATION_PARAMS["horizontal_flip_prob"]:
            image = TF.hflip(image)

        # Random rotation
        angle = np.random.uniform(
            -AUGMENTATION_PARAMS["rotation_limit"],
            AUGMENTATION_PARAMS["rotation_limit"]
        )
        image = TF.rotate(image, angle)

        # Random crop back to target size
        i, j, h, w = transforms.RandomResizedCrop.get_params(
            image,
            scale=AUGMENTATION_PARAMS["crop_scale"],
            ratio=(0.75, 1.33)
        )
        image = TF.crop(image, i, j, h, w)

        # Color jitter
        jitter = transforms.ColorJitter(
            brightness=AUGMENTATION_PARAMS["brightness"],
            contrast=AUGMENTATION_PARAMS["contrast"],
            saturation=AUGMENTATION_PARAMS["saturation"],
        )
        image = jitter(image)

        # Resize to final target size
        image = image.resize((IMAGE_SIZE, IMAGE_SIZE))

        return image


def scan_training_data():
    """
    Scan the training_data/ directory and report what images exist.

    Returns:
        dict: {category_id: {"count": N, "files": [...]}}
    """
    results = {}

    for cat in CATEGORIES:
        cat_id = cat["id"]
        cat_dir = os.path.join(TRAINING_DATA_DIR, cat_id)

        if not os.path.exists(cat_dir):
            results[cat_id] = {"count": 0, "files": [], "label": cat["label"]}
            continue

        valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        files = sorted([
            f for f in os.listdir(cat_dir)
            if os.path.splitext(f)[1].lower() in valid_exts
        ])

        results[cat_id] = {
            "count": len(files),
            "files": [os.path.join(cat_dir, f) for f in files],
            "label": cat["label"],
        }

    return results


def validate_dataset(min_images=9):
    """
    Validate that all categories have enough images.

    Args:
        min_images: Minimum images required per category (default 10)

    Returns:
        tuple: (is_valid, scan_results, warnings)
    """
    scan = scan_training_data()
    warnings = []
    is_valid = True

    for cat_id, info in scan.items():
        count = info["count"]
        label = info["label"]

        if count == 0:
            warnings.append(
                f"❌ {label} ({cat_id}): NO images found! "
                f"Add at least {min_images} images to training_data/{cat_id}/"
            )
            is_valid = False
        elif count < min_images:
            warnings.append(
                f"⚠️  {label} ({cat_id}): Only {count} images. "
                f"Minimum is {min_images}, recommended is 20. "
                f"Training may not work well with so few images."
            )
            is_valid = False
        elif count < 20:
            warnings.append(
                f"✅ {label} ({cat_id}): {count} images (OK, but 20 recommended for better accuracy)"
            )
        else:
            warnings.append(
                f"✅ {label} ({cat_id}): {count} images (Great!)"
            )

    return is_valid, scan, warnings


def create_dataloaders(batch_size=16, val_split=VALIDATION_SPLIT):
    """
    Create PyTorch DataLoaders for training and validation.

    - Training images get augmented (multiplier creates N augmented versions)
    - Validation images are NOT augmented
    - Validation split is taken from original images (20%)

    Returns:
        tuple: (train_loader, val_loader, class_names)
    """
    scan = scan_training_data()

    # Build class name mapping
    class_names = CATEGORY_IDS.copy()

    # Save class names for later use
    with open(CLASS_NAMES_PATH, "w") as f:
        json.dump(class_names, f, indent=2)

    # Separate into train and val image paths
    train_paths = []
    train_labels = []
    val_paths = []
    val_labels = []

    for label_idx, cat_id in enumerate(CATEGORY_IDS):
        files = scan.get(cat_id, {}).get("files", [])

        if len(files) == 0:
            print(f"[WARNING] No images for {cat_id}, skipping category!")
            continue

        # Split into train/val
        n_val = max(1, int(len(files) * val_split))
        val_files = files[:n_val]
        train_files = files[n_val:]

        # Validation set (no augmentation)
        for fp in val_files:
            val_paths.append(fp)
            val_labels.append(label_idx)

        # Training set (will be augmented via AUGMENTATION_MULTIPLIER)
        for fp in train_files:
            for _ in range(AUGMENTATION_MULTIPLIER):
                train_paths.append(fp)
                train_labels.append(label_idx)

    print(f"[DataLoader] Training samples: {len(train_paths)} "
          f"({len(train_paths) // AUGMENTATION_MULTIPLIER} original × {AUGMENTATION_MULTIPLIER} augmented)")
    print(f"[DataLoader] Validation samples: {len(val_paths)} (no augmentation)")
    print(f"[DataLoader] Categories: {len(class_names)}")

    # Create datasets
    train_dataset = DressDataset(train_paths, train_labels, augment=True)
    val_dataset = DressDataset(val_paths, val_labels, augment=False)

    # Create dataloaders
    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True,
        num_workers=0, pin_memory=True
    )
    val_loader = DataLoader(
        val_dataset, batch_size=batch_size, shuffle=False,
        num_workers=0, pin_memory=True
    )

    return train_loader, val_loader, class_names


def print_dataset_report():
    """Print a formatted report of the current dataset status."""
    print("\n" + "=" * 60)
    print("  SHAADI SAHULAT - Dataset Status Report")
    print("=" * 60)
    print(f"\n  Training data directory: {TRAINING_DATA_DIR}")
    print(f"  Expected folder structure:\n")

    for cat in CATEGORIES:
        cat_dir = os.path.join(TRAINING_DATA_DIR, cat["id"])
        exists = "✓" if os.path.exists(cat_dir) else "✗"
        print(f"    [{exists}] {cat['id']}/  ({cat['label']})")

    print(f"\n  Image requirements:")
    print(f"    - Minimum 10 images per category (absolute minimum)")
    print(f"    - Recommended 20 images per category")
    print(f"    - Must show FULL DRESS (not face/jewelry/fabric)")
    print(f"    - Min resolution: 400×600, Preferred: 800×1200")
    print(f"    - Format: JPG or PNG")
    print(f"    - Naming: {{category}}_{{index:03d}}.jpg")

    is_valid, scan, warnings = validate_dataset()

    print(f"\n  Current dataset status:")
    total = 0
    for w in warnings:
        print(f"    {w}")

    for cat_id, info in scan.items():
        total += info["count"]

    print(f"\n  Total images: {total}")
    print(f"  Total after augmentation: ~{total * AUGMENTATION_MULTIPLIER}")
    print(f"  Dataset valid for training: {'YES' if is_valid else 'NO'}")
    print("=" * 60 + "\n")

    return is_valid


if __name__ == "__main__":
    print_dataset_report()
