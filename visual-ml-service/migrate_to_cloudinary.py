"""Upload any remaining local relative media paths to Cloudinary and patch MongoDB."""
from __future__ import annotations

import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for line in (root / ".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pymongo import MongoClient
from config import MONGO_URI, MONGO_DB, PRODUCTS_COLLECTION, UPLOADS_DIR
from cloudinary_storage import is_configured, upload_file

NODE_UPLOADS = root / "Uploads"


def is_http(url: str) -> bool:
    return bool(url) and str(url).startswith(("http://", "https://"))


def migrate_products(db) -> int:
    updated = 0
    for doc in db[PRODUCTS_COLLECTION].find({}, {"product_id": 1, "primary_image_url": 1, "image_url": 1, "images": 1}):
        changes = {}
        images = list(doc.get("images") or [])
        new_images = []
        images_changed = False
        for img in images:
            url = img.get("image_url") or ""
            rel = img.get("relative_path") or ""
            if is_http(url):
                new_images.append(img)
                continue
            local = None
            if rel:
                local = Path(UPLOADS_DIR) / rel
            elif url.startswith("/images/"):
                local = Path(UPLOADS_DIR) / url[len("/images/"):]
            if local and local.is_file():
                folder = f"products/{'/'.join(Path(rel or url[len('/images/'):]).parts[:-1])}"
                public_id = local.stem
                result = upload_file(str(local), folder=folder, public_id=public_id)
                img = {**img, "image_url": result["secure_url"], "cloudinary_public_id": result.get("public_id")}
                images_changed = True
            new_images.append(img)
        if images_changed:
            changes["images"] = new_images
            primary = next((i.get("image_url") for i in new_images if i.get("is_primary")), None)
            if not primary and new_images:
                primary = new_images[0].get("image_url")
            if primary and is_http(primary):
                changes["primary_image_url"] = primary
                changes["image_url"] = primary
        else:
            for field in ("primary_image_url", "image_url"):
                url = doc.get(field) or ""
                if url and not is_http(url) and url.startswith("/images/"):
                    local = Path(UPLOADS_DIR) / url[len("/images/"):]
                    if local.is_file():
                        folder = f"products/{'/'.join(local.relative_to(UPLOADS_DIR).parts[:-1])}"
                        result = upload_file(str(local), folder=folder, public_id=local.stem)
                        changes[field] = result["secure_url"]
        if changes:
            db[PRODUCTS_COLLECTION].update_one({"_id": doc["_id"]}, {"$set": changes})
            updated += 1
            print("product", doc.get("product_id"), "-> cloudinary")
    return updated


def migrate_categories(db) -> int:
    updated = 0
    for doc in db["admincategories"].find({}, {"category_id": 1, "icon": 1}):
        icon = doc.get("icon") or ""
        if not icon or is_http(icon) or len(icon) <= 2:
            continue
        # emoji or short label
        if not ("/" in icon or "." in icon):
            continue
        rel = icon.replace("\\", "/").lstrip("/")
        if rel.lower().startswith("uploads/"):
            rel = rel[8:]
        local = NODE_UPLOADS / rel
        if not local.is_file():
            # try Categories/<id>
            alt = NODE_UPLOADS / "Categories" / Path(rel).name
            local = alt if alt.is_file() else local
        if not local.is_file():
            print("skip category icon missing", doc.get("category_id"), icon)
            continue
        result = upload_file(str(local), folder="Categories", public_id=local.stem)
        db["admincategories"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"icon": result["secure_url"]}},
        )
        updated += 1
        print("category", doc.get("category_id"), "->", result["secure_url"])
    return updated


def migrate_banners(db) -> int:
    updated = 0
    if "banners" not in db.list_collection_names():
        return 0
    for doc in db["banners"].find({}, {"image_url": 1, "banner_id": 1}):
        url = doc.get("image_url") or ""
        if not url or is_http(url):
            continue
        local = NODE_UPLOADS / url.replace("\\", "/").lstrip("/")
        if not local.is_file():
            print("skip banner missing", doc.get("banner_id"), url)
            continue
        result = upload_file(str(local), folder="Banners", public_id=local.stem)
        db["banners"].update_one({"_id": doc["_id"]}, {"$set": {"image_url": result["secure_url"]}})
        updated += 1
        print("banner", doc.get("banner_id"), "-> cloudinary")
    return updated


def main():
    if not is_configured():
        print("Cloudinary not configured")
        sys.exit(1)
    db = MongoClient(MONGO_URI, serverSelectionTimeoutMS=15000)[MONGO_DB]
    print("products updated", migrate_products(db))
    print("categories updated", migrate_categories(db))
    print("banners updated", migrate_banners(db))


if __name__ == "__main__":
    main()
