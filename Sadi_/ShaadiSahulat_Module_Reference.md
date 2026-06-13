# ShaadiSahulat — Complete Module Reference & Integration Guide
> **Purpose:** This document is the single source of truth for all current modules.
> It covers every change, every data field that must be persisted, and every
> cross-module dependency. Read this before writing any code for any module.

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Dowry Estimation Module — All Changes](#2-dowry-estimation-module--all-changes)
3. [Image Recommendation Module — Changes](#3-image-recommendation-module--changes)
4. [Seller Upload Module — Full Spec](#4-seller-upload-module--full-spec)
5. [Buyer Marketplace & E-Commerce Module](#5-buyer-marketplace--e-commerce-module)
6. [Cross-Module Data Contracts](#6-cross-module-data-contracts)
7. [Database Schema — All Collections/Tables](#7-database-schema--all-collectionstables)
8. [What Must Be Stored & Why](#8-what-must-be-stored--why)
9. [Category & Budget Deduction Flow](#9-category--budget-deduction-flow)
10. [Dummy Data Specification](#10-dummy-data-specification)

---
Context
I have two existing codebases:

shaadisahulat-main — Contains the primary UI, buyer/seller separation logic, and partial cart logic. This is the base UI reference. Do not touch the Dowry module inside it — remove it completely from this folder. Keep only the UI components, the buyer/seller role separation, and the cart logic.
shaadi-sahulat-dowry — Contains the Dowry Estimation module with its own separate frontend and backend. Rename this folder to shaadisahulat-dowry-logic. Strip everything except the core Dowry estimation logic files. Remove its standalone backend and frontend entry points — the logic will be integrated into the main project, not run independently.

Integrate UI Unification and Dowry Estimation Module into Mian Logic So the UI look consistenct , not need to again write the Dowry estimation logiv from scratch 



Rule Before Starting
Read both folders completely before writing a single line. Identify what already exists. If something described below is already implemented correctly, do not rewrite it — note it as done and move on. Only build what is missing or needs changing.

Part 1 — UI Unification
Take all UI components from "shaadisahulat-main" as the design reference. Convert every new screen and every existing screen to match that UI style — same colour palette, same card style, same header, same font, same button styles. No module should look different from the rest of the application.

Part 2 — Dowry Estimation Module — Remaining Work
The majority of Dowry logic exists in "shaadi-sahulat-dowry". Integrate it into the main project. Then apply every change listed below. If a change is already implemented, skip it.



## 1. System Architecture Overview

```
ShaadiSahulat
│
├── AUTH (shared)
│   ├── Buyer Signup / Login
│   └── Seller Signup / Login
│
├── BUYER SIDE
│   ├── Dowry Estimation Wizard       ← CHANGED (see Section 2)
│   ├── Image Recommendation          ← CHANGED (see Section 3)
│   ├── Marketplace / Browse          ← NEW (see Section 5)
│   ├── Cart & Checkout
│   ├── BNPL Module
│   ├── Order Tracking
│   └── Spending Analytics
│
└── SELLER SIDE
    ├── Seller Dashboard
    ├── Product Upload / Edit / Delete ← CHANGED (see Section 4)
    ├── Order Management
    └── Seller Analytics
```

### The Core Data Chain (Read This First)
```
Dowry Estimation
    ↓ saves category_budgets{}
    ↓
Buyer browses Marketplace (filtered by category)
    ↓ buyer purchases item from category X
    ↓
Order marked "Done"
    ↓ deducts from category_budgets[X].remaining
    ↓
Spending Analytics shows estimated vs actual per category
```
Every module must respect this chain. The `category_budgets` object stored
after Dowry Estimation is the financial backbone of the entire buyer journey.

---

## 2. Dowry Estimation Module (BIg Part Done)— All Changes

### 2.1 Category List Change — Bridal/Groom Merged

**BEFORE:** Two separate fixed categories: "Bridal Dress" and "Groom Dress"

**AFTER:** One category called **"Wedding Dress"** with a radio selector:
- Option A: Bridal
- Option B: Groom

This appears in Step 3 (Priority Settings) of the wizard.
The user picks one. The selected type is stored as `wedding_dress_type: "bridal" | "groom"`.
All other 7 categories remain unchanged:
Furniture, Electronics, Jewelry, Kitchen Items, Decoration, Miscellaneous,
plus the merged Wedding Dress = **8 categories total** (same count, cleaner UX).

**What to store:**
```json
{
  "wedding_dress_type": "bridal",
  "categories": {
    "wedding_dress": { "priority": "high", "type": "bridal" },
    "furniture": { "priority": "medium" },
    "electronics": { "priority": "high" },
    "jewelry": { "priority": "low" },
    "kitchen_items": { "priority": "medium" },
    "decoration": { "priority": "high" },
    "miscellaneous": { "priority": "low" }
  }
}
```

### 2.2 Priority Selection — 4 Options Instead of 3

**BEFORE:** High / Medium / Low (3 options)

**AFTER:** 4 options per category:

| Option | Meaning | Budget Weight |
|--------|---------|---------------|
| High | Very important, allocate maximum | 30% weight |
| Medium | Important, moderate allocation | 20% weight |
| Low | Nice to have, minimal allocation | 10% weight |
| **Not Wanted** | Do not budget for this at all | 0% weight |

**When user selects "Not Wanted":**
A sub-prompt appears:
> "Would you like to move this category's budget into your priority categories?"
> [ Yes, redistribute ] [ No, just skip it ]

If **Yes** → the skipped category's calculated budget amount is distributed
proportionally among all "High" and Small amount in Medium Catrgies priority categories.
If **No** → the budget is simply removed (total estimate is lower).

**What to store:**
```json
{
  "priority": "not_wanted",
  "redistribute": true
}
```
The redistribution flag must be stored so the Spending Analytics module
knows this category will never have purchases, and the budget chart
should not show it as a slice.

### 2.3 Estimation Based on Top-5 DB Products + Rule Engine

**BEFORE:** Rule-based only.

**AFTER:** Hybrid — Rule Engine generates baseline, then system queries the
actual product database for each category and uses the **average of the
top-5 cheapest available products** (filtered by subcategory and the
buyer's selected priority tier) to ground the estimate in real market data.

**Logic per category: (Already Done but can change )**
```
rule_baseline = income_bracket_formula(income, savings, priority_weight)
db_avg = AVG(price) of top-5 cheapest active products in that category
final_estimate = (0.6 × rule_baseline) + (0.4 × db_avg)
```
If fewer than 5 products exist in DB for a category → fall back to
rule_baseline only and flag it: `"estimate_source": "rule_only"`.

**What to store:**
```json
{
  "category": "decoration",
  "rule_baseline": 120000,
  "db_avg_reference": 95000,
  "final_estimate": 110000,
  "estimate_source": "hybrid",
  "top5_product_ids": ["pid1", "pid2", "pid3", "pid4", "pid5"]
}
```

### 2.4 Adjustable Estimation with Scrollbar + Threshold

After the estimate is shown, the buyer sees a **range slider** per category
that lets them manually adjust the estimated amount up or down.

**Threshold rules (movement sensitivity):**
the trhesholde Means you can Increase or Decrease the Price of Dowry By there is Some Thresold 
| Estimated Amount | Scroll Step Size | Meaning |
|---|---|---|
| Below PKR 5 Lakh | PKR 5,000 per step | Free movement  |
| PKR 5L – 10L | PKR 2,000 per step | Moderate friction |
| PKR 10L – 15L | PKR 1,000 per step | Tighter control |
| Above PKR 15L | PKR 500 per step | Very tight control |

**Live update behaviour:**
- Each slider change instantly updates that category's value.
- The **Total Estimated Budget** at the top recalculates in real-time.
- Show a colour indicator: Green = within original estimate ±10%,
  Yellow = 10–30% deviation, Red = >30% deviation from rule baseline.

**What to store after final confirmation:**
```json
{
  "category": "furniture",
  "system_estimate": 250000,
  "buyer_adjusted_estimate": 280000,
  "was_manually_adjusted": true,
  "adjustment_delta": 30000
}
```
The `buyer_adjusted_estimate` is what gets saved as the official budget
for that category. All future deductions happen against this number.

### 2.5 Training Data Storage Rules

**Two separate storage locations: **
The Dowry data is store in 2 catroies training dummpy Data and Buyer like 5 Buyer's Make a Dowry estimation . there All Dataset  and therir Catfies Wise DATASET will also Stored 
. So when new Buye add Data and it Get the Result is Base upo Rulebase and Training+ Past buyer Data  
| Folder | Purpose | Who writes to it |
|---|---|---|
| `training/` | ML model training dataset | System only |
| `uploads/{buyer_name}/` | Buyer's personal uploads | Buyer actions |

**Training folder structure:**
```
training/
  dowry_profiles/
    profile_{uuid}.json     ← Each completed estimation saved here
  dress_images/
    lehenga/
    sharara/
    saree/
```

**When a new buyer completes the Dowry Estimation wizard:**
1. Their full input (income, savings, family, priorities, final estimates)
   is saved as a JSON file in `training/dowry_profiles/`.
2. This becomes training data for the ML personalization layer.
3. The same data is also saved to the `dowry_estimations` database table
   for the buyer's own use (Spending Analytics etc.).
4. These are two separate writes — one for ML training, one for the app.

**When a buyer uploads a dress image (recommendation module):**
1. Image saved to `uploads/{buyer_name}/query_images/{timestamp}_{filename}`
2. After embedding is generated, image is also copied to
   `training/dress_images/{category}/` if the buyer confirms
   "Was this recommendation helpful?" = Yes.
   This gives you high-quality confirmed training examples over time.

---

## 3. Image Recommendation Module (Mostly Done ) — Changes

### 3.1 UI Change

The UI must visually match the existing platform UI style (same header,
same card style, same colour palette as the rest of the buyer dashboard).
Do not use a standalone page with a different look — it must feel like
part of the same application.

**Layout:**
```
[ Upload Your Dress Photo ]   [ Select Category ▼ ]   [ Find Similar ]

─────────────────────────────────────────────────────────────
Your Image          Top Recommendations
[ preview ]         [ Card 1 ]  [ Card 2 ]  [ Card 3 ]
                    94% match   87% match   81% match
                    PKR 12,500  PKR 9,800   PKR 14,000
                    [ View ]    [ View ]    [ View ]
─────────────────────────────────────────────────────────────
```

**Category dropdown options** (must match Seller upload categories exactly):
- Bridal Dress → Lehenga / Sharara / Gharara / Bridal Gown
- Groom Dress → Sherwani / Shalwar Kameez / Suit
- (Other categories not applicable for dress recommendation)

### 3.2 What the Recommendation Returns

Each result card shows:
- Product image (primary image from Cloudinary)
- Similarity % (e.g. "94% match")
- Product title
- Price (and discount price if applicable)
- Seller name
- City
- [ View Details ] button

### 3.3 Cross-Module Connection
- [ View Details ] button -> When Use Click on that CARD hen Goes to that That Card (that we use for buyer buy that product )

---

## 4. Seller Upload Module — Full Spec

### 4.1 Product Edit / Delete / Discount

Sellers can after upload:
- **Edit**: title, description, price, discount, stock, images
- **Delete**: removes product and all images
- **Add/Remove Discount**: toggle a discount on any saved product

**Discount system:**
- Seller enters: Original Price, Discount Percentage (0–50%)
- System calculates and stores: `discount_price = original_price × (1 - discount_pct/100)`
- In Buyer View: shows original price crossed out + discount price + "X% OFF" badge

### 4.2 The 6 Categories — Full Subcategory Tree

Each category maps to a folder in MongoDB and a folder in file storage.

---

#### Category 1: Wedding Dress
*(Seller selects: Bridal or Groom — same as buyer)*

**Sub-options for Bridal:**
Thrift (under PKR 50,000) / New (up to PKR 150,000)
| Subcategory | Price Tier Options | Notes |
|---|---|---|
| Lehenga |  | |
| Sharara | Thrift / New | |
| Gharara | Thrift / New | |
| Bridal Gown | Thrift / New | |

**Sub-options for Groom:**
Thrift (under PKR 40,000) / New (up to PKR 100,000)
| Subcategory | Price Tier | Notes |
|---|---|---|
| Sherwani | Thrift / New | |
| Shalwar Kameez | Thrift / New | |
| Suit | Thrift / New | |

**Required fields for Wedding Dress products: (for Bridal already Done ,but change ht eDiscount button)**
- Color (text input + color picker)
- Fabric / Material (dropdown: Chiffon / Silk / Velvet / Net / Cotton / Other)
- Embroidery Type (dropdown: Heavy / Medium / Light / None)
- Size (S / M / L / XL / Custom)
- Condition (New / Like New / Used — for Thrift tier)

---

#### Category 2: Furniture

**Subcategories:**

| Subcategory | Key Options | Estimated Price Range |
|---|---|---|
| Sofa Set | Seating: 3+2+1 / L-Shape / Corner; Material: Fabric/Leather; Color | PKR 25,000 – 400,000 |
| Bed Set | Size: Single/Double/King; Type: Divan/Panel/Sleigh; Color; 1-sided/2-sided headboard | PKR 30,000 – 350,000 |
| Dressing Table | With/Without Mirror; Wood Type; Color | PKR 8,000 – 80,000 |
| Dining Table | Pieces: 54-piece / 72-piece; Seating: 4/6/8; Material: Wood/Glass/Steel; Color | PKR 20,000 – 250,000 |
| Wardrobe | Doors: 2/3/4; With/Without Mirror; Color | PKR 15,000 – 200,000 |

**Required fields for all Furniture:**
- Material / Wood Type
- Color
- Dimensions (optional but recommended)
- Condition (New / Used)

---

#### Category 3: Electronics

**Subcategories:**

| Subcategory | Key Options | Estimated Price Range |
|---|---|---|
| LED TV | Size: 32"/43"/55"/65"; Brand; Smart/Non-Smart | PKR 30,000 – 450,000 |
| Refrigerator | Size (cubic feet); Type: Single/Double door; Brand; Color | PKR 45,000 – 400,000 |
| Washing Machine | Type: Auto/Semi-Auto; Capacity (kg); Brand | PKR 25,000 – 200,000 |
| Air Conditioner | Ton: 1/1.5/2; Type: Split/Window; Brand | PKR 50,000 – 350,000 |

---

#### Category 4: Kitchen Items

**Two tiers — Large Appliances and General/Small Items:**

**Large Kitchen Appliances (Subcategory):**

| Item | Key Options | Estimated Price |
|---|---|---|
| Microwave | Capacity (litres); With/Without grill; Brand | PKR 8,000 – 60,000 |
| Juicer / Blender Set | Pieces count; Brand; Wattage | PKR 3,000 – 25,000 |
| Toaster | 2-slice / 4-slice; Brand | PKR 2,000 – 10,000 |
| Dishwasher | Capacity; Brand | PKR 40,000 – 150,000 |

**General Kitchen Items (Subcategory — smaller/miscellaneous):**

| Item | Key Options | Estimated Price |
|---|---|---|
| Crockery Set | Pieces: 54 / 72; Material: Bone China/Porcelain/Steel; Color | PKR 5,000 – 80,000 |
| Cooking Set | Pieces count; Material: Steel/Non-stick; Brand | PKR 3,000 – 40,000 |
| Pressure Cooker | Size (litres); Brand | PKR 2,000 – 15,000 |
| Kettle + Tea Set | Pieces; Material; Color | PKR 1,500 – 12,000 |
| Casserole Set | Pieces; Material | PKR 1,000 – 8,000 |

---

#### Category 5: Decoration

| Subcategory | Key Options | Estimated Price |
|---|---|---|
| Lights / Fairy Lights | Indoor/Outdoor; Length (metres); Color | PKR 500 – 15,000 |
| Artificial Flowers | Type; Colour; Bundle size | PKR 500 – 20,000 |
| Stage Setup Materials | Type; Color theme | PKR 5,000 – 150,000 |
| Wall Decor | Type: Frames/Mirrors/Hangings; Size | PKR 1,000 – 30,000 |
| Table Centerpieces | Style; Material | PKR 500 – 10,000 |

---

#### Category 6: Miscellaneous

**Small Appliances (Subcategory):**

| Item | Key Options | Estimated Price |
|---|---|---|
| Iron | Type: Dry/Steam; Brand; Wattage | PKR 2,000 – 15,000 |
| Vacuum Cleaner | Type: Upright/Handheld/Robot; Brand | PKR 5,000 – 80,000 |
| Pedestal Fan | Size; Brand; Speed settings | PKR 3,000 – 25,000 |
| Hair Dryer | Wattage; Brand | PKR 1,500 – 12,000 |

**Other Miscellaneous (Subcategory):**

| Item | Notes |
|---|---|
| Wedding Invitations | Custom printed, quantity-based pricing |
| Photography Packages | Package type; Hours; Deliverables |
| Favour / Gift Items | Type; Quantity |
| Mehendi Supplies | Kit type |

---

### 4.3 How General Items Nest Under Big Categories

In the Seller upload form:
```
Category: Kitchen Items ▼
  └── Subcategory: Large Appliances ▼
      └── Item Type: Microwave
  └── Subcategory: General Kitchen Items ▼
      └── Item Type: Crockery Set
```

In the Buyer marketplace:
```
Browse by Category > Kitchen Items
  └── Large Appliances
      └── [list of products]
  └── General Kitchen Items
      └── [list of products]
```

The nesting is consistent between Seller upload and Buyer browse.
Never let a seller pick "Kitchen Items" without also picking a subcategory.

### 4.4 Seller Product View in Buyer Marketplace

When a Buyer opens a category (e.g. Decoration), they see:
- All active products in that category from all sellers
- Each product card shows: image, title, price, discount badge, seller name, city
- Filter sidebar: Price Range slider, Color, Subcategory, Condition (New/Used)
- Sort options: Price Low→High, Price High→Low, Newest First, Most Relevant

**The connection to Dowry Estimation:**
If the buyer has a saved Dowry Estimate, a banner shows at the top of
the Decoration marketplace page:
> "Your Decoration budget: PKR 80,000 — You've spent PKR 12,000 — Remaining: PKR 68,000"

This banner uses `category_budgets.decoration.remaining` from the saved
estimation. It updates live when orders are placed.

### 4.5 TF-IDF for Product Description

When seller saves a product:
1. Seller has written a description (e.g. "Heavy embroidered red Lehenga
   with golden zari work, pure silk fabric, suitable for Barat ceremony")
2. Backend runs the description through the fitted TF-IDF vectorizer
3. The resulting vector is stored in the product document
4. This vector is used by the Image Recommendation module as the text
   component of the hybrid similarity score

**The seller must be told:** "Write a detailed description — it helps
buyers find your product through our smart search." This is the only
instruction needed in the UI. Do not expose TF-IDF to the seller.

---

## 5. Buyer Marketplace & E-Commerce Module

### 5.1 Package Suggestion Feature

When the buyer opens the marketplace after completing Dowry Estimation,
the system offers **4–5 pre-built packages** based on their selected
categories and budget.

**How a package is built:**
```
Package "Standard Bridal" =
   product from Wedding Dress (within budget)
   from Furniture (within budget)
   from Electronics (within budget)
   from Kitchen Items (within budget)
   from Jewelry (within budget)

Total package price is shown.
```

**Package types to generate automatically:**
1. **Budget Package** — cheapest combination across all selected categories
2. **Balanced Package** — mix of price tiers, ~80% of total estimate
3. **Premium Package** — best-rated products, may exceed estimate
4. **Category Focus: Dress** — best dress, budget items for rest
5. **Category Focus: Furniture** — best furniture, budget items for rest

**In each package, buyer can:**
- Swap out any individual item ("Replace this sofa")
- Remove an item from the package
- The package total updates live when items are swapped

### 5.2 Standard E-Commerce Features

| Feature | Specification |
|---|---|
| Search | Full-text search across title, description, category. Minimum 3 characters to trigger. |
| Filter by Price | Range slider. Min/Max in PKR. Applied per category page. |
| Filter by Color | Checkbox list of available colours in that category |
| Filter by Condition | New / Used / All |
| Filter by City | Dropdown — show sellers in buyer's city first |
| Sort | Price ↑, Price ↓, Newest, Relevance (hybrid score if recommendation was used) |
| Wishlist | Buyer can save products. Stored in `buyer_wishlist` table. |
| Product Detail Page | All product fields, all images (gallery), seller info, "Ask Seller" button, Add to Cart |
| Cart | Add/remove, update quantity, see category tag per item |
| Recently Viewed | Last 10 products viewed, stored in `buyer_activity` table |

### 5.3 Cart — Category Budget Connection

Each item in the cart is tagged with its category.
Below the cart total:
```
Cart Total: PKR 145,000

Budget Check:
  Wedding Dress:   PKR 80,000  (Budget: PKR 120,000 ✓ OK)
  Furniture:       PKR 65,000  (Budget: PKR 50,000  ⚠ Over by PKR 15,000) 
  

[ Proceed to Checkout ]
```
This is not a blocker — buyer can still proceed. It is an informational
warning that connects back to their Dowry Estimation.

---

## 6. Cross-Module Data Contracts

These are the exact data fields that one module saves and another module reads.
If any field is renamed or removed, multiple modules break.

### Contract 1: Dowry Estimation → Spending Analytics

Dowry Estimation **saves** to `dowry_estimations` table:
```json
{
  "buyer_id": "uuid",
  "estimation_id": "uuid",
  "total_estimated_budget": 1500000,
  "category_budgets": {
    "wedding_dress":  { "estimated": 200000, "spent": 0, "remaining": 200000, "active": true },
    "furniture":      { "estimated": 300000, "spent": 0, "remaining": 300000, "active": true },
    "electronics":    { "estimated": 250000, "spent": 0, "remaining": 250000, "active": true },
    "jewelry":        { "estimated": 150000, "spent": 0, "remaining": 150000, "active": true },
    "kitchen_items":  { "estimated": 120000, "spent": 0, "remaining": 120000, "active": true },
    "decoration":     { "estimated": 100000, "spent": 0, "remaining": 100000, "active": true },
    "miscellaneous":  { "estimated": 80000,  "spent": 0, "remaining": 80000,  "active": false }
  },
  "wedding_dress_type": "bridal",
  "created_at": "datetime",
  "last_updated": "datetime"
}
```

Spending Analytics **reads** `category_budgets` from this record.
Order module **writes** to `category_budgets[category].spent` and
**recalculates** `remaining = estimated - spent` on every order completion.

### Contract 2: Order Completion → Budget Deduction

When an order status changes to `"done"`:
```
order.items.forEach(item => {
  category = item.product.category          // e.g. "decoration"
  price = item.quantity × item.unit_price
  UPDATE dowry_estimations
    SET category_budgets[category].spent += price,
        category_budgets[category].remaining -= price
    WHERE buyer_id = order.buyer_id
})
```
This must happen in a database transaction — if the update fails, the
order status change should also roll back (or at minimum be retried).

### Contract 3: Seller Product → Buyer Marketplace

When seller saves a product, these fields MUST be present for the buyer
marketplace to display correctly:
```
product.category          → used for marketplace routing
product.subcategory       → used for filter sidebar
product.price             → shown on card
product.discount_price    → shown on card (nullable)
product.color             → used for color filter
product.images[0]         → primary image on card (is_primary: true)
product.availability_status = "available"  → only available products shown
product.city              → used for city filter
product.tfidf_vector      → used for text similarity in recommendation
product.image_embeddings  → used for visual similarity in recommendation
```

### Contract 4: Image Recommendation → Cart

When buyer adds from recommendation results:
```json
{
  "product_id": "pid_abc",
  "quantity": 1,
  "unit_price": 12500,
  "category": "wedding_dress",
  "source": "recommendation",
  "recommendation_similarity": 0.94,
  "recommendation_query_image": "temp_uuid_deleted"
}
```
The `source` and `similarity` fields are for future analytics — which
recommendation results actually convert to purchases.

---

## 7. Database Schema — All Collections/Tables

### PostgreSQL Tables (existing stack)

#### `users` (existing — no change)
id, full_name, email, phone, password_hash, role, city, is_active, created_at

#### `dowry_estimations` (new — critical)
```sql
id                    UUID PRIMARY KEY
buyer_id              UUID REFERENCES users(id)
estimation_id         UUID UNIQUE
total_estimated       INTEGER
category_budgets      JSONB   -- the full object from Contract 1
wedding_dress_type    VARCHAR(10)  -- 'bridal' | 'groom'
income_at_time        INTEGER  -- snapshot of income when estimated
rule_baseline_total   INTEGER
db_avg_reference_total INTEGER
was_ml_adjusted       BOOLEAN
ml_multiplier         FLOAT
created_at            TIMESTAMPTZ
last_updated          TIMESTAMPTZ
```

#### `products` (new)
```sql
id                    UUID PRIMARY KEY
seller_id             UUID REFERENCES users(id)
category              VARCHAR(50)   -- wedding_dress | furniture | electronics | kitchen_items | decoration | miscellaneous
subcategory           VARCHAR(100)
item_type             VARCHAR(100)  -- e.g. Lehenga, Sofa Set
title                 VARCHAR(200)
description           TEXT
price                 INTEGER
discount_price        INTEGER       -- NULL if no discount
discount_pct          FLOAT         -- NULL if no discount
stock_qty             INTEGER
color                 VARCHAR(50)
condition             VARCHAR(20)   -- new | thrift | used
city                  VARCHAR(100)
availability_status   VARCHAR(20)   -- available | out_of_stock | hidden | processing
wedding_dress_type    VARCHAR(10)   -- bridal | groom (NULL for non-dress categories)
image_urls            TEXT[]        -- Cloudinary URLs
cloudinary_ids        TEXT[]        -- for deletion
avg_ref_price         INTEGER       -- snapshot of avg at upload time
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ
```

#### `product_embeddings` (separate table — keeps products table clean)
```sql
id                    UUID PRIMARY KEY
product_id            UUID REFERENCES products(id) ON DELETE CASCADE
image_index           INTEGER       -- 0 = primary image
embedding             FLOAT8[]      -- 1280-dim EfficientNet vector (pgvector VECTOR type)
dominant_colours      JSONB         -- [{r,g,b}, ×5]
tfidf_vector          FLOAT8[]      -- 500-dim TF-IDF dense vector
vocabulary_version    VARCHAR(32)   -- hash of vectorizer.pkl
generated_at          TIMESTAMPTZ
```

#### `orders` (existing structure, additions noted)
```sql
id                    UUID PRIMARY KEY
buyer_id              UUID REFERENCES users(id)
seller_id             UUID REFERENCES users(id)
status                VARCHAR(30)   -- processing | packed | shipped | done | disputed | cancelled
items                 JSONB         -- [{product_id, category, qty, unit_price, source}]
total_amount          INTEGER
payment_method        VARCHAR(20)   -- direct | bnpl
category_summary      JSONB         -- {decoration: 15000, furniture: 80000} for budget deduction
created_at            TIMESTAMPTZ
completed_at          TIMESTAMPTZ   -- set when status = done
```

#### `buyer_wishlist` (new)
```sql
id                    UUID PRIMARY KEY
buyer_id              UUID REFERENCES users(id)
product_id            UUID REFERENCES products(id)
added_at              TIMESTAMPTZ
```

#### `buyer_activity` (new — for recently viewed)
```sql
id                    UUID PRIMARY KEY
buyer_id              UUID REFERENCES users(id)
product_id            UUID REFERENCES products(id)
viewed_at             TIMESTAMPTZ
```

---

## 8. What Must Be Stored & Why

This section lists every important data point, where it is stored, and
which future module depends on it.

| Data | Stored In | Used By |
|---|---|---|
| `category_budgets` JSONB | `dowry_estimations` | Spending Analytics, Marketplace budget banner, Cart warning |
| `buyer_adjusted_estimate` per category | `dowry_estimations.category_budgets[x].estimated` | All budget displays |
| `was_manually_adjusted` flag | `dowry_estimations` | ML training (adjusted estimates are less reliable signals) |
| `wedding_dress_type` (bridal/groom) | `dowry_estimations` AND `products` | Marketplace filtering, recommendation category matching |
| `top5_product_ids` used in estimation | `dowry_estimations` | Audit trail, explainability in FYP defense |
| `category_budgets[x].spent` | Updated on order completion | Spending Analytics real-time chart |
| `product.category` + `product.subcategory` | `products` | Marketplace routing, budget deduction |
| `product.tfidf_vector` | `product_embeddings` | Hybrid recommendation text component |
| `product.image_embeddings` | `product_embeddings` | Visual similarity search |
| `order.items[].source` | `orders.items` JSONB | Analytics: which orders came from recommendations |
| `order.items[].category` | `orders.items` JSONB | Budget deduction — must know which budget to deduct from |
| `buyer_wishlist` | `buyer_wishlist` table | Wishlist feature, future: price drop notifications |
| Training profile JSON | `training/dowry_profiles/` folder | ML model re-training |
| Confirmed dress image | `training/dress_images/{category}/` | EfficientNet re-training |
| `discount_price` + `discount_pct` | `products` | Buyer marketplace display |

---

## 9. Category & Budget Deduction Flow

### Step-by-step when buyer completes a purchase:

```
1. Buyer checks out cart
   → cart.items = [{product_id, category, qty, unit_price}, ...]

2. Payment confirmed (direct or BNPL)
   → order created with status = "processing"

3. Seller marks order "Shipped"
   → order status = "shipped"

4. Buyer confirms receipt ("I Have Received Item")
   → order status = "done"
   → TRIGGER: budget_deduction_job(order_id, buyer_id)

5. budget_deduction_job:
   → load buyer's active dowry_estimation
   → for each item in order:
       category = item.category
       amount = item.qty × item.unit_price
       category_budgets[category].spent += amount
       category_budgets[category].remaining -= amount
   → save updated category_budgets
   → if remaining < 0: set overspend_flag = true for that category

6. Spending Analytics chart auto-refreshes
   → shows new "spent" vs "remaining" for affected categories
```

### What happens if buyer has NO dowry estimation:
- Purchase still goes through normally
- No budget deduction (nothing to deduct from)
- Spending Analytics shows: "Set up your budget estimate to track spending"
- Order is still recorded in `orders` table for history

---

## 10. Dummy Data Specification

### One Seller Account
```
Name: Ahmed Traders
Email: ahmed@shaadisahulat.com
Password: Test@1234
City: Lahore
Role: seller
```

### Products per Category (minimum 2 per subcategory):

**Wedding Dress — Bridal:**
- Lehenga (Thrift): Red embroidered Lehenga, pure cotton base, light
  embroidery. Price: PKR 35,000.
- Lehenga (New): Heavy bridal Lehenga, silk, heavy zari work, maroon+gold.
  Price: PKR 120,000.
- Sharara (New): White and gold Sharara set, 3-piece, silk fabric.
  Price: PKR 85,000.

**Wedding Dress — Groom:**
- Sherwani (New): Navy blue embroidered Sherwani with off-white shalwar.
  Price: PKR 45,000.
- Sherwani (Thrift): Cream Sherwani, used once, good condition.
  Price: PKR 18,000.

**Furniture:**
- Sofa Set (3+2+1): Beige fabric, wooden frame, 6-seater. PKR 85,000.
- Bed Set (King): Dark walnut panel bed with 2-sided headboard. PKR 120,000.
- Dining Table (72-piece): White with gold trim, 8-seater. PKR 95,000.
- Dressing Table: White with full mirror, 3 drawers. PKR 22,000.

**Electronics:**
- LED TV: 43-inch Samsung Smart TV. PKR 75,000.
- Refrigerator: Haier 14 cubic ft double door, silver. PKR 85,000.
- Washing Machine: Dawlance 8kg fully automatic. PKR 55,000.

**Kitchen Items:**
- Crockery Set (72-piece): Bone china, white with blue border. PKR 18,000.
- Microwave: Dawlance 25L with grill. PKR 22,000.
- Juicer/Blender Set: National 3-in-1, 800W. PKR 8,500.
- Cooking Set (12-piece): Stainless steel, non-stick coating. PKR 6,500.

**Decoration:**
- Fairy Lights (20m): Warm white, indoor use. PKR 2,500.
- Artificial Flowers: Rose bundle, red and white, 50 pieces. PKR 3,500.
- Stage Setup Kit: Backdrop frame + curtain, gold and ivory. PKR 25,000.

**Miscellaneous:**
- Iron: Westpoint steam iron, 2200W. PKR 3,500.
- Pedestal Fan: GFC 18-inch, 3 speed, white. PKR 4,200.
- Vacuum Cleaner: Philips handheld, 1000W. PKR 8,500.

**Each product must have:**
1. A written description of 2–3 sentences (for TF-IDF generation)
2. At least 1 image (placeholder from Unsplash or a stock photo)
3. All required fields filled (color, condition, stock_qty=5)
4. `availability_status = "available"`

---

*Document version: 1.0 | Project: ShaadiSahulat FYP*
*Update this document every time a schema change, new module, or*
*cross-module dependency is added. Never let the code drift from this spec.*
## 11. Seller Module — Additions & Clarifications

### 11.1 TF-IDF on Product Description → Search Bar

- Seller writes a product description (plain text, free-form).
- On save, backend runs description through the **fitted TF-IDF vectorizer** (same `vectorizer.pkl` used in recommendation). Resulting vector stored in `product_embeddings.tfidf_vector`.
- **Search bar behaviour (Buyer side):** Buyer types a query (e.g. "heavy embroidered red lehenga"). Query is also vectorized using the same vectorizer. Cosine similarity computed against all `tfidf_vector` values in DB. Products with similarity > 0.2 threshold returned, sorted by score descending.
- **If no results:** Return message `"No products found matching your search."` — do not show empty grid, do not fallback silently.
- **Minimum description length enforced:** 20 words. Seller sees inline warning if below threshold before saving.

---

### 11.2 Dummy Data — 1 Seller in MongoDB

**Storage structure in MongoDB:**

```
db.products  (single collection, category acts as logical folder via `category` field)

MongoDB folder simulation = compound index on (category, subcategory)
Physical file storage = uploads/{category}/{subcategory}/{product_id}/
```

One seller account seeded:
```
seller_id:  SELLER_001
name:       Ahmed Traders
email:      ahmed@shaadisahulat.com
city:       Lahore
```

Each product document saved with **all fields populated**, description written for TF-IDF, `image_embeddings` and `tfidf_vector` generated at seed time and stored. `availability_status = "available"`. See Section 10 for full product list.

---

### 11.3 Seller Price Suggestion — Priority-Based DB Lookup

When a seller enters a price, the system runs a background lookup and shows a **suggested price range** before the seller finalises.

**Lookup priority (tries in order, stops when 5 records found):**

| Priority | Match Condition | Example |
|---|---|---|
| 1st (highest) | Same subcategory + same item_type + same color + same condition | Lehenga + Heavy embroidery + Red + New |
| 2nd | Same subcategory + same item_type + any color/condition | Lehenga + Heavy embroidery |
| 3rd | Same subcategory + any item_type | All Bridal Dress subcategory |

Rule: collect up to 5 records per level. If level 1 gives ≥5 → use only level 1. If level 1 gives 3 + level 2 gives 2 → combine to reach 5. Always prefer higher-priority matches.

**Suggested price = AVG of collected prices.** Display to seller as:

```
Based on similar listings: PKR 42,000 – PKR 68,000
Your price is within the recommended range ✓
```

**Allowed fluctuation bands (seller can deviate from suggestion):**
| Price Range | Allowed Deviation |
|---|---|
| Under PKR 30,000 | ± 35% |
| PKR 30,001 – 1,00,000 | ± 30% |
| PKR 1,00,001 – 2,00,000 | ± 25% |
| PKR 2,00,001 – 5,00,000 | ± 15% |
| Above PKR 5,00,000 | ± 8% |

If seller's entered price exceeds the upper band → **soft warning** (not a hard block): `"Your price is X% above similar listings. Are you sure?"` Seller can still proceed. If price exceeds 2× the DB average → **hard block**: `"Price too high. Maximum allowed: PKR X"`.

Store on product: `suggested_price_ref`, `price_deviation_pct`, `was_price_warned`.

---

### 11.4 Budget Overshoot — Buyer Notifications & Suggestions

**When buyer adds a product to cart:**

System compares `item.price` against `category_budgets[item.category].remaining`.

**Four scenarios:**

| Scenario | Definition | System Action |
|---|---|---|
| **A — Fine** | item.price ≤ remaining | No message. Proceed normally. |
| **B — Small overshoot (small category)** | item.price > remaining AND category is Miscellaneous / Decoration / Kitchen General Items AND overshoot ≤ PKR 5,000 | Show subtle notice: `"This item slightly exceeds your budget for this category by PKR X."` Allow add to cart. |
| **C — Large overshoot (small category)** | Overshoot > PKR 5,000 on a small category | Show modal: `"This exceeds your Decoration budget by PKR X. Would you like to shift PKR X from another category?"` → Shift prompt (see 11.5). |
| **D — Any overshoot (big category)** | Big categories = Furniture, Electronics, Wedding Dress. Any overshoot. | Show modal with two options: `"Shift budget from another category"` OR `"Continue anyway (over-budget)"`. If continue → tag order item as `over_budget: true` for analytics. |

**"Big category small exceed" (e.g. Furniture budget PKR 300,000, item is PKR 310,000):** treat as scenario D — offer shift but allow override. Do not block purchase.

**"Big category big exceed" (e.g. Furniture budget PKR 300,000, item is PKR 500,000):** Same D flow, but add a second suggestion: `"Consider our BNPL option to spread the cost."` Link to BNPL module.

---

### 11.5 Budget Shift Module (Buyer-Facing)

Available in two places:
1. **Triggered automatically** when buyer hits a scenario C or D (see 11.4).
2. **Accessible manually** from the Dowry Estimation page as `[ Manage Budget ]`.

**UI flow:**

```
┌─ Budget Shift ──────────────────────────────────────────────────┐
│ Shift from:  [ Decoration ▼ ]   Available: PKR 35,000           │
│ Amount:      [ PKR 10,000   ]                                    │
│ Shift to:    [ Furniture   ▼ ]   Current:  PKR 280,000          │
│                                                                   │
│              [ Confirm Shift ]   [ Cancel ]                      │
└──────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Cannot shift more than `remaining` of the source category.
- Cannot shift from a category that has `spent > 0` unless remaining > 0.
- Cannot shift to a `not_wanted` category (priority = 0) — must first re-activate it.
- All shifts are logged in `budget_shift_log` table (buyer_id, from_category, to_category, amount, timestamp, trigger: "manual" | "overshoot_prompt").
- The shift updates `dowry_estimations.category_budgets` immediately and permanently.

**What to store:**
```json
{
  "shift_id": "uuid",
  "buyer_id": "uuid",
  "estimation_id": "uuid",
  "from_category": "decoration",
  "to_category": "furniture",
  "amount": 10000,
  "trigger": "overshoot_prompt",
  "triggered_by_product_id": "pid_abc",
  "timestamp": "datetime"
}
```

**Special case — category price below minimum available:**
If buyer's remaining budget for a category is less than the cheapest available product in that category (checked at marketplace entry), show banner:

> `"Your remaining Decoration budget (PKR 2,000) is below the lowest available product (PKR 2,500). Shift budget to continue shopping in this category?"  [ Shift Now ] [ Dismiss ]`

---

### 11.6 Fields to Add to DB for Above Features

**`products` table — new columns:**
```sql
suggested_price_ref    INTEGER    -- avg of 5 comparable products at upload time
price_deviation_pct    FLOAT      -- how far seller's price is from suggestion
was_price_warned       BOOLEAN    -- seller saw the soft warning
price_lookup_level     INTEGER    -- 1/2/3 — which priority level gave the reference
```

**`budget_shift_log` table (new):**
```sql
id                     UUID PRIMARY KEY
buyer_id               UUID REFERENCES users(id)
estimation_id          UUID REFERENCES dowry_estimations(id)
from_category          VARCHAR(50)
to_category            VARCHAR(50)
amount                 INTEGER
trigger                VARCHAR(20)   -- 'manual' | 'overshoot_prompt'
triggered_by_product   UUID          -- NULL if manual
timestamp              TIMESTAMPTZ
```

**`orders.items` JSONB — add fields:**
```json
{
  "over_budget": false,
  "budget_at_purchase": 45000,
  "remaining_after": 12000
}
```