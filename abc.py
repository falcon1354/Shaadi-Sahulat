#!/usr/bin/env python3
"""
Image Placeholder Replacer
==========================
- SOURCE_FOLDER: Contains all JPG images to pick from randomly
- TARGET_FOLDER: Contains subfolders with placeholder JPG files to replace
"""

import os
import shutil
import random

# ============ HARDCODED FOLDER NAMES ============
SOURCE_FOLDER = r"C:\semester_4\Data_Science\my notes\shaadi-sahulat\shaadi-sahulat\folder1"      # Folder with all JPG images
TARGET_FOLDER = r"C:\semester_4\Data_Science\my notes\my_pack\shaadi-sahulat\visual-ml-service\uploads\decoration\lights"        # Folder with subfolders containing placeholders
# ===============================================

def get_jpg_images(folder_path):
    """Get all JPG/JPEG images from a folder (case-insensitive)."""
    if not os.path.exists(folder_path):
        print(f"❌ ERROR: Folder not found: {folder_path}")
        return []
    
    images = []
    for file in os.listdir(folder_path):
        if file.lower().endswith(('.jpg', '.jpeg')):
            images.append(os.path.join(folder_path, file))
    
    print(f"📁 Found {len(images)} JPG images in: {folder_path}")
    return images

def get_subfolders(folder_path):
    """Get all subfolders in a directory."""
    if not os.path.exists(folder_path):
        print(f"❌ ERROR: Folder not found: {folder_path}")
        return []
    
    subfolders = [os.path.join(folder_path, d) for d in os.listdir(folder_path) 
                  if os.path.isdir(os.path.join(folder_path, d))]
    
    print(f"📂 Found {len(subfolders)} subfolders in: {folder_path}")
    return subfolders

def get_placeholder_jpgs(folder_path):
    """Get all JPG files in a subfolder (these are the placeholders to replace)."""
    placeholders = []
    for file in os.listdir(folder_path):
        if file.lower().endswith(('.jpg', '.jpeg')):
            placeholders.append(os.path.join(folder_path, file))
    return placeholders

def replace_placeholders():
    """Main function: Replace all placeholder JPGs with random images from source."""
    
    # Step 1: Get all source images
    print("=" * 50)
    print("STEP 1: Loading source images...")
    print("=" * 50)
    source_images = get_jpg_images(SOURCE_FOLDER)
    
    if not source_images:
        print("❌ No source images found. Exiting.")
        return
    
    # Step 2: Get all target subfolders
    print("\n" + "=" * 50)
    print("STEP 2: Scanning target subfolders...")
    print("=" * 50)
    subfolders = get_subfolders(TARGET_FOLDER)
    
    if not subfolders:
        print("❌ No subfolders found. Exiting.")
        return
    
    # Step 3: Process each subfolder
    print("\n" + "=" * 50)
    print("STEP 3: Replacing placeholders...")
    print("=" * 50)
    
    total_replaced = 0
    
    for subfolder in subfolders:
        subfolder_name = os.path.basename(subfolder)
        placeholders = get_placeholder_jpgs(subfolder)
        
        if not placeholders:
            print(f"  ⚠️  {subfolder_name}: No JPG placeholders found")
            continue
        
        print(f"\n  📂 Processing: {subfolder_name}")
        print(f"     Found {len(placeholders)} placeholder(s)")
        
        for placeholder in placeholders:
            # Pick a random source image
            random_image = random.choice(source_images)
            
            # Get the original filename to preserve it
            original_name = os.path.basename(placeholder)
            
            # Replace the placeholder
            try:
                shutil.copy2(random_image, placeholder)
                print(f"     ✅ Replaced: {original_name} ← {os.path.basename(random_image)}")
                total_replaced += 1
            except Exception as e:
                print(f"     ❌ Failed: {original_name} → {e}")
    
    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"  Total placeholders replaced: {total_replaced}")
    print(f"  Source images available: {len(source_images)}")
    print(f"  Subfolders processed: {len(subfolders)}")
    print("=" * 50)

if __name__ == "__main__":
    # Show current working directory
    print(f"Working directory: {os.getcwd()}")
    print(f"Source folder: {os.path.abspath(SOURCE_FOLDER)}")
    print(f"Target folder: {os.path.abspath(TARGET_FOLDER)}")
    print()
    
    replace_placeholders()