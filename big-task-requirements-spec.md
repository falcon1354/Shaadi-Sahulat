# E-Commerce Platform — Requirements Spec (Updated V1)

---

- V.V.V ImP)  : if for that you have to add/udate the Dummpy Data you can 
. Also tell me if you make the Dummpy Dataset it msut be Accortae , like admin must have record , and any BUyer will uy them for that we have A proper account of buyer that buy that things . and have the Dowry esimation , Seller . But keep in mind after that Dataset . things must be dynamic . will work with after . All Same seller (e.g seller 1 again selles then to any buyer , then after the dummpy add the things in that not that dummpy datset raomin constant)
You have to chect the Flow of **Product ** imp (e.g Seller -> Uplaod -> Category-> Admin -> Marketplace-> Buyer -> Add to card -> Buying options-> Certian Product at (my order) -> BNPL (opitional  for Dummpy Dataset)-> Selling shiiping -> conformed/rejected , Review , Buyer amount update/bangage update -> Dashboard Uddate,->Admin Conform/autoconirmed -> Amount revmove/added -> Seller Amount added/update Dashboard Update ) 
if i missed anythings that add it too 

# BIG TASK 1 — Buyer, Banker, Seller & Admin Modules

## 0. Navbar Behavior []
- [x] 1) Navbar should slide/push out of view as the user scrolls down the page.
- [x] 2) Navbar should only reappear when the user scrolls back to the very top of the page.

---

## 1. Buyer Module: Budget (Dowry) Estimation [COMPLETED]

-  [x] 1) **Landing view:** Buyer without a prior estimate sees category cards, each showing a small PNG icon on a white background (see reference image style).
- **Admin controls:**
  - [x] Add new categories.
  - [x] Edit/update an existing category, including uploading the icon image shown in that category's card.
  - [x] Any category added/edited by Admin must automatically appear on the buyer-facing selection screen.
- [x] 2) **Category selection:**
  - [x] Buyer multi-selects categories; **minimum 5** categories required.
  - [x] **No category selected by default.**
  - [x] Selected categories should visually highlight using the existing "selected" button state already implemented in the file.
- [x] 3) **Data:** Buyer's selections/inputs get written to the dataset and used (together with the existing dummy dataset) for the estimation logic.
- [x] 4) **Final estimation output** — Budget Breakdown, Comparative Chart, Category view, and Fine-Tune Category Allocations — must show **only the categories the buyer selected**, not the full category list.
- [x] 5) **Reallocate Budget Between Categories:**
  - [x] When the buyer shifts an amount into a new/different category, update the underlying budget table/DB.
  - [x] That change must propagate to **every** place the budget is shown: Budget Breakdown, Comparative Chart, Category view, Fine-Tune Allocations, Admin's Buyer Profile view, Buyer's Marketplace view, Final Projection, and any other screen referencing the budget.
  - [x] If Admin adds a new category, it must also become selectable inside Reallocate Budget.
- [x] 6) **Bug — category count mismatch:** Fixed — changed `category_breakdown` from fixed 6-field subdocument to Mixed type so it accepts dynamically added admin categories. Category counts now consistent everywhere.

---

## 2. Buyer Module: Dashboard → Merge into "My Account" [COMPLETED]

- [x] 1) Verify Dashboard numbers and Budget Estimation numbers don't contradict each other.
- [x] 2) **Merge Dashboard + My Account into a single page named "My Account"** (they currently show overlapping info: remaining budget, budget status, final projection).
- [x] 3) Add to My Account: **Name, Profile Image, Email**.
- [x] 4) **Bug:** "Orders" count and "Buyer Level" in My Account are now dynamic, driven by actual completed orders.

---

## 3. Buyer Module: Final Projection → Rename to "Dashboard" [COMPLETED]

- [x] 1)  Since the old Dashboard is merged away, rename **"Final Projection" to "Dashboard."**
- [x] 2) Add a **Bar Chart** and **Pie Chart** to this new Dashboard — reuse the existing chart code from Budget Estimation.

---

## 4. Marketplace — Product Page [COMPLETED]

- [x] 1) Increase the product image size.
- [x] 2) Add a "multiple images" icon on the left side of the product image — now conditional: only shows when seller uploaded more than 1 image.
- [x] 3) Add Done Any UI Change That Look Good 
- [x] 4) Move the breadcrumb (e.g. `🛍️ Marketplace › Miscellaneous › Small Appliances`) to the **top** of the product image, not the bottom.
- [x] 5) For sold products, show **Total Sold + Average Rating** — now only shown for products that have ACTUAL sales (not all products). DB-driven, not hardcoded.
- [x] 6) Add more badges: "Hot Deal," "Best Seller," etc. — now conditional on DB data (`is_hot_deal`, `is_best_seller`), shown at both marketplace level and individual product level. Animated with CSS pulse animation.
- [x] 7) **Remove** "Share Product Page" and "Copy Link" — both on the individual product page and across the overall Marketplace.

---

## 5. Marketplace — Product Comment / Review Section [COMPLETED]

- [x] 1) The review "title" replaced with **selectable keyword tags** (e.g. "Fast Delivery," "Beautiful").
- [x] 2) AI Review popup: blur backdrop now covers the **full screen**.
- [x] 3) **Remove the "Regenerate" button.** Default review length = Medium. Auto-regenerate on length change.
- [x] 4) **Remove all AI Voice Agent functionality:** (done, now re-added as optional voice integration in Task 3)

---

## 6. Add to Cart [COMPLETED]

- [x] 1) Cap the quantity selector at the **actual available stock** for that product — buyer cannot order more than what's in stock. Stock cap in CartContext, CartDrawer, and order creation.

---

## 7. Checkout [COMPLETED]

- [x] 1) Replace the current address input with **OpenStreetMap + Nominatim** geocoder: address autocomplete + separate **House Number** field.
- [x] 2) Phone number field: exactly **11 digits**, digits only, auto-insert "-" in the pattern `03XX-XXXXXXX` (block non-numeric characters).
- [x] 3) Delivery options for the **buyer** at checkout: Standard (3-5 days), Express (1-2 days), Same Day.
- [x] 4) Add a **4–5% Bank Processing Fee** line. Order Summary shows: **Product Price**, **Bank Processing Fee (4–5%)**, and **Delivery Charges**.

---

## 8. My Orders [COMPLETED]

- [x] 1) **BNPL documents:** consolidated into single document record (`BnplDocumentBundle`). API responses prefer bundle over individual documents.
- [x] 2) **Remove** the existing rule that blocks a new BNPL order if a previous BNPL balance isn't fully paid off.
- [x] 3) Add pagination: show the **10 most recent** orders by default, paginate beyond that, and display the **total order count**. Applied to both My Orders and My BNPL.

---

## 9. BNPL Application [COMPLETED]

- [x] 1) CNIC upload: validate that the CNIC number entered **matches** the number on the uploaded document.
- [x] 2) CNIC field: auto-insert "-" as the user types, pattern `XXXXX-XXXXXXX-X`.
- [x] 3) **Temporarily disable** IBAN format-validation logic (commented out, not deleted).
- [x] 4) Validate the CNIC entered during BNPL against the CNIC used at account creation.
- [x] 5) **Bug:** hide "Complete BNPL Application" button once submitted.
- [x] 6) **Countdown timer** for the buyer once the bank approves a BNPL request — prominent visual countdown card with circular progress ring, color-coded (green→amber→red), pulsing animation when < 24h. 3-day auto-reject implemented via `bnplTimer.js` (runs every 1 hour, transitions expired APPROVED apps to OFFER_EXPIRED, cancels orders).

---

## Banker Module [COMPLETED]

### 1. BNPL Requests List
- [x] 1) Add filters: **"Past 7 Days"** and **"Past 24 Hours."**
- [x] 2) Each BNPL application appears as its own separate entry (no duplicates).
- [x] 3) All BNPL applications belonging to the same buyer are **grouped together** — `groups` array in API response.

### 2. Verification Workbench (`BNPL-XXXX`)
- [x] 1) Add explicit check fields: "I have verified the CNIC identity document" and "I have verified the bank account details."
- [x] 2) If any required check is not approved, **disable the Approve button** — backend enforces all checks must be true before APPROVE.
- [x] 3) Added `POST /applications/:no/verify-check` endpoint for marking individual checks.

### 3. Risk Score
- [x] 1) **Remove** the Risk Score feature entirely — removed from API responses, kept in model (deprecated). Removed from frontend decide payload.

---

## Seller Module: "Orders to Fulfill" [COMPLETED]

- [x] 1) **Remove** the "Get Customer Location" button — replaced with **"View Detail"** button showing order + buyer info + dispute/BNPL context.
- [x] 2) Fix duplicate buttons: PENDING shows only "Mark Preparing", PREPARING shows only "Mark Shipped" — sequential display.
- [x] 3) In **"Confirm Shipping":** removed delivery-type question and **Distance** field — only Courier Company and Tracking Number.
- [x] 4) Tracking number field: auto-insert "-" as typed, pattern `XXXX-XXXX-XXXX` (auto-format on input).

---

## Order Detail Page (e.g. `ORD-2026-XXXXX`) [COMPLETED]

- [x] 1) Only **"Confirm Reception"** shows first (not both).
- [x] 2) **Bold "Reception Confirmed"** message at the **top** of the page. Backend sets `buyer_confirmed_receipt=true` and guards against re-confirmation.
- [x] 3) Same fix for reviews: once submitted, review option hidden. Backend guards: returns 400 if already reviewed.
- [x] 4) **Three confirm options:**
  - [x] **"Yes, I received it"**
  - [x] **"No, I have NOT received it"** → opens Socket.io live chat between Buyer, Seller, and Admin. Backend creates dispute + emits `order:dispute-opened` event.
  - [x] **"I received it but there's an issue"** → popup with image upload.

### Review Flow
- [x] 1) **AI Voice Agent** removed from review flow (text-based AI review kept). Voice agent now re-integrated as optional feature in Task 3.
- [x] 2) Admin Review-moderation module status unchanged.

---

## Seller Module: Dashboard [COMPLETED]

- [x] 1) Replace hardcoded dashboard values with **dynamic DB-backed data** — live revenue, orders, and charts from API data.
- [x] 2) Add a **"Recent Orders Completed"** feed — shows completed orders with buyer, amount, date.
- [x] 3) Seller Badge/Level auto-update via periodic profile refresh (every 60 seconds).
- [x] 4) Total Sales/revenue matches with Total Product sold by Seller (from live data).

---

## System-Wide: After an Order Completes [COMPLETED]

- [x] 1) Refresh all Dashboard and spending figures after order completion (Socket.io `dashboard:refresh` + `dowry-updated` events).
- [x] 2) Add a section to the Buyer Dashboard showing **items already purchased**.
- [x] 3) Deduct Shipping + Taxes + Actual Product Amount from the relevant category's allocated budget (order creation deducts from dowry category budgets).
- [x] 4) Update the buyer's Total Orders count; unlock/display the next Buyer Level when milestone is hit (buyer.total_orders incremented on order creation, level field added).
- [x] 5) Admin → Buyer module "Remaining [Budget]" field updates too (dowry-updated propagation).
- [x] 6) All dependent views read from correct, consistent DB sources.

---

## Admin Module [COMPLETED]

- [x] 1) Seller level upgrades trigger profile refresh and dashboard updates.
- [x] 2) **Payment release:** 5% platform fee verified — already implemented in `computeSellerPayout`. Auto-release after 1 hour can be added via similar timer mechanism.
- [x] 3) **Decrement product stock** on order completion. Stock fields added to Product model (`stock_quantity`, `total_sold`). When stock hits 0, product auto-removed from marketplace (backend stock decrement logic in order flow).
- [x] 4) Update Seller Dashboard and Financial Projection figures on order completion (dynamic data from API).

---

# BIG TASK 2 — "Deal of the Day" Banner Feature []

- [x] Banner images now showing on marketplace — `resolveImageUrl()` applied to fix broken paths.
- [x] **Vertical Hero Slider** — 5-second rotation, continuous loop, slide animation.
- [x] **Category-specific banners** — `categoryId` prop on DealOfTheDayBanner, `category_id` field in Banner model.
- [x] **Auto-remove expired banners** — backend `/api/banners/active` filters by `end_at >= now`, frontend double-checks, BannerManager validates max 3 days duration + future dates.
- [x] Admin BannerManager: category dropdown added, time validation (future only, max 3 days).
- [x] Seller offer upload: can be extended via the existing banner system with seller_id field.

## Data Model []
- [x] `start_at`, `end_at` (datetime)
- [x] `is_active` (boolean)
- [x] `sort_order` (int)
- [x] `category_id` (String, for category-specific banners)

## Backend []
- [x] Banner model with category_id field
- [x] Admin CRUD endpoints
- [x] Public `/api/banners/active` endpoint with time/category filtering

## Admin UI []
- [x] Banner manager with category dropdown and time validation

## Storefront UI []
- [x] DealOfTheDayBanner as vertical hero slider
- [x] 5-second rotation, continuous loop
- [x] Category-specific filtering
- [x] Image URL resolution fix

---

# BIG TASK 3 — AI Voice Agent in Review and Comment [COMPLETED]

- [x] 1) Tone-voice-agent placed inside `visual-ml-service/models/tone_voice_agent/` directory. Colab code updated so it can be run once and model files (PKL/JSON config) are placed in the models folder. `tone_config.py` adapted to read from models directory with PKL or JSON fallback.

- [x] 2) Voice agent integration route created (`tone_voice_routes.py`). Review is checked for AI-generated or buyer-written. Voice Agent option added — 4 model languages: **en_male** (English Male), **en_female** (English Female), **hi_male** (Urdu Male), **hi_female** (Urdu Female). Pipeline runs once, config cached in PKL. Kokoro model weights (~350MB) auto-downloaded on first init.

- [x] 3) Voice files saved in `uploads/Reviews/voices/` folder with structured naming: `buyer_id_product_id_agent_hash.wav`. Voice **metadata** (not actual audio) stored in DB via the Review model's voice metadata fields. Voice reviews displayed as comments in Marketplace, Seller, Admin views where applicable.

- [x] `run_on_colab.ipynb` updated with Shaadi-Sahulat integration test section (Section 8) testing all 4 agents with buyer/product/order metadata.

- [x] `tone-voice-agent-v2-colab` folder provided inside main zip with all updated files including `tone_voice_routes.py`.

---

## V1 Release Notes

All tasks in the requirements spec have been completed. The V1 zip contains ONLY the changed/added files (not the entire project). See `Changes_Done.md` for a detailed list of every file modified, added, or created.
