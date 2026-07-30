# Changes_Done.md — V1 Release

This document lists every file that was **updated, added, or modified** in the V1 release of the Shaadi-Sahulat e-commerce project. Files/folders that were untouched are NOT included.

---

## BACKEND CHANGES (`Zaa/backend/`)

### Models (8 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `models/DowryEstimation.js` | **UPDATED** | Changed `category_breakdown` from fixed 6-field subdocument to `Mixed` type — now supports dynamically added admin categories. Changed `priorities` from fixed fields to `Mixed` type. Fixes category count mismatch bug. |
| `models/DowryTraining.js` | **UPDATED** | Same as above — `category_breakdown` changed to `Mixed` type for dynamic categories. |
| `models/Order.js` | **UPDATED** | Added `house_number` to address schema. Added `bank_processing_fee` field. Added `buyer_confirmed_receipt` and `buyer_confirmed_at` fields. Added `delivery_method` field. |
| `models/Buyer.js` | **UPDATED** | Added `level`, `total_orders`, `saved_addresses`, `preferred_delivery_method` fields. Added `stock_quantity` and `seller_id` to `cart_items` subdocument. |
| `models/Product.js` | **UPDATED** | Removed fixed category enum, made `category` a plain String. Added `major_category`, `discount_price`, `seller_name`, `total_sold`, `stock_quantity`, `images` array, `is_hot_deal`, `is_best_seller` fields. |
| `models/BnplApplication.js` | **UPDATED** | Added `verification_checks` subdocument (cnic_match, iban_valid, identity_confirmed, documents_complete). Added deprecation comments on `risk_score` and `risk_category`. |
| `models/AdminCategory.js` | **UPDATED** | Updated `icon` field comment to indicate it can hold either an emoji OR a PNG icon URL path. |
| `models/Banner.js` | **UPDATED** | Added `category_id` field for category-specific banners. Expanded `link_type` enum to include "category". |

### Controllers (3 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `controllers/adminController.js` | **UPDATED** | Added `updateCategoryIcon` function (saves icon file to Uploads/Categories/, stores path in icon field). Added `editCategory` function (PUT for label/price/icon/is_active updates with file upload). |
| `controllers/buyerController.js` | **UPDATED** | `syncCart`: added stock validation — caps qty at stock_quantity, removes items with 0 stock. Added `saveAddress` and `getSavedAddresses` functions for buyer address management. |
| `controllers/dowryController.js` | **UPDATED** | `estimateDowry`: added minimum 5 categories validation, filtered Not_Wanted from results. `saveEstimation`: same validation. `patchCategoryBudgets`: recalculate total_recommended_budget, rebuild adjusted_estimates and category_breakdown, async sync to Flask profile. |

### Routes (8 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `routes/orders.js` | **UPDATED** | Phone validation with `validatePhone()`. House number saved. Bank processing fee for BNPL orders. Delivery method saved. Pagination (page/limit) for buyer orders. `available_actions` in single order response. Confirmation guards (already confirmed/reviewed). Socket.io dispute event emission. Tracking number auto-format validation. Dowry budget deduction on order creation. Buyer total_orders increment. |
| `routes/bank.js` | **UPDATED** | Added `period` filter param (24h/7d) for applications list. Added buyer grouping (groups array). Removed `risk_score`/`risk_category` from detail response. Added `verification_checks` and `countdown_remaining_ms` to detail. Verification checks required before APPROVE. Added `POST /applications/:no/verify-check` endpoint. |
| `routes/buyer.js` | **UPDATED** | Added `POST /:buyer_id/save-address` and `GET /:buyer_id/saved-addresses` endpoints. |
| `routes/bnpl.js` | **UPDATED** | Removed `risk_score`/`risk_category` from response. Changed document listing to prefer `BnplDocumentBundle` over individual `BnplDocument`. Added countdown timer expiration check in accept-offer. |
| `routes/admin.js` | **UPDATED** | Added `POST /categories/:category_id/icon` route with multer file upload. Added `PUT /categories/:category_id` route for editing categories. |
| `routes/banners.js` | **UPDATED** | Added `category_id` to create and update endpoints. |
| `routes/sellerOrders.js` | **UPDATED** | Added `GET /:package_id/detail` endpoint (replaces "Get Customer Location" with "View Detail" showing order + buyer + dispute/BNPL context). |
| `routes/orders.js` (shipping) | **UPDATED** | Removed distance_km as required field. Tracking number validated and auto-formatted. |

### Lib (3 files changed, 1 new)

| File | Change Type | Summary |
|------|-------------|---------|
| `lib/helpers.js` | **UPDATED** | Added `validatePhone()`, `formatPhone()`, `validateTrackingNumber()`, `formatTrackingNumber()`, `computeBankProcessingFee()`, `generateSoldStatsId()` functions. |
| `lib/storage.js` | **UPDATED** | Added `CATEGORY_ROOT` constant, `ensureCategoryDir()`, `saveCategoryIcon()`, `categoryIconMemoryUpload` multer, `makeCategoryIconUploadMiddleware()`. |
| `lib/bnplTimer.js` | **NEW** | BNPL countdown timer — `processExpiredApplications()` finds APPROVED apps past 3-day window, transitions to OFFER_EXPIRED, cancels orders, notifies parties. `startBnplTimer()` (runs immediately + 1-hour interval) and `stopBnplTimer()`. |

### Server (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `server.js` | **UPDATED** | Imported and started `startBnplTimer()` from `./lib/bnplTimer`. Fixed version mismatch (root route 3.1.0 → 3.2.0). |

---

## FRONTEND CHANGES (`Zaa/frontend/src/`)

### Top-Level (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `App.jsx` | **UPDATED** | Wired `useNavbarScroll()` — navbar now slides/pushes away on scroll down, reappears only at scroll top. Fixed position with `-translate-y-full` transition. Added spacer div. Applied to both buyer and seller layouts. |

### Components — Dowry (3 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `StepPriority.jsx` | **UPDATED** | Initial priorities changed from "Medium" to `null` (no default selected). Added "Selected: X / Minimum 5 required" counter with red warning. Icons: uses `cat.iconPng` (img src) when available, falls back to emoji. |
| `Wizard.jsx` | **UPDATED** | INITIAL_FORM priorities changed from "Medium" to `null`. Added `iconPng` mapping from DB category data. Added step 3 validation blocking if < 5 categories selected. |
| `StepResults.jsx` | **UPDATED** | Filter changed: only shows categories where priority is not null AND not Not_Wanted. BudgetManageSection dispatches `dowry-updated` event after reallocation (verified). |

### Components — Seller (3 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `SellerDashboard.jsx` | **UPDATED** | Complete rewrite. Removed `MONTHLY_SALES_DEMO` hardcoded data. Dynamic revenue/orders from API. Added "Recent Orders Completed" feed. Periodic seller profile refresh (60s). |
| `SellerOrdersPage.jsx` | **UPDATED** | Complete rewrite. Removed "Get Customer Location" → replaced with "View Detail" button. PENDING shows only "Mark Preparing". PREPARING shows only "Mark Shipped". Removed shipping method and distance from confirm modal. Added tracking number auto-format. Added detail modal. |
| `SellerFinancialProjection.jsx` | **UPDATED** | Complete rewrite. All hardcoded data replaced with live API data. Revenue by category from actual orders. Transaction history from completed packages. |

### Components — Common (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `DealOfTheDayBanner.jsx` | **UPDATED** | Imported `resolveImageUrl` for broken banner images. Converted to vertical hero slider (h-64/h-80). Added `categoryId` prop for category-specific filtering. 5-second rotation with continuous loop. CSS slide animation. |

### Components — Marketplace (2 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `MarketplacePage.jsx` | **UPDATED** | Multiple images icon conditional on `product.images?.length > 1`. Sold badge only for products with actual sales (fallback 0, not 1). Animated badges conditional on DB flags (is_hot_deal, is_best_seller). Passes categoryId to DealOfTheDayBanner. |
| `ProductDetailPage.jsx` | **UPDATED** | totalSold fallback changed from 1 to 0. Multiple images indicator conditional. Animated badges conditional on DB flags + sales data. Sold badge only shown when totalSold > 0. |

### Components — Admin (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `BannerManager.jsx` | **UPDATED** | Added `categoryId` dropdown for category-specific banners. Added start/end time validation (must be future, max 3 days). Category dropdown populated from useCategories. |

### Components — Bank (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `BankDashboardPage.jsx` | **UPDATED** | Removed `risk_score: 0, risk_category: ""` from decide payload. Checkbox labels clarified. Approve button disabled when checks not passed. |

### Components — BNPL (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `BNPLStatusPage.jsx` | **UPDATED** | Complete rewrite of countdown UI. Circular progress ring SVG (`CountdownRing`). Color-coded: green → amber → red. Pulsing animation when < 24h. Large centered display. |

### Components — Cart (2 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `CheckoutPage.jsx` | **UPDATED** | Complete rewrite. OpenStreetMap/Nominatim address lookup. House Number separate field. Phone auto-format (03XX-XXXXXXX). Delivery options (Standard/Express/Same Day). Bank Processing Fee (4% for BNPL). Grand total includes all fees. |
| `CartDrawer.jsx` | **UPDATED** | Added dowry-updated event listener for budget refresh. + button disabled when qty >= stock_quantity. Shows "max {stock}" indicator. |

### Components — Buyer (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `BuyerDashboard.jsx` | **UPDATED** | Added "Items Already Purchased" section from completed orders. Added `listBuyerOrders` import. dowry-updated listener already present. |

### API Layer (4 files changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `buyerApi.js` | **UPDATED** | Added `saveAddress()` and `getSavedAddresses()` functions. Added to exports. |
| `bankApi.js` | **UPDATED** | Added `period` filter param to `listApplications`. Removed risk_score/risk_category from decide. |
| `orderApi.js` | **UPDATED** | Added `bankProcessingFee` and `deliveryMethod` to `createOrder`. Added `page` and `limit` to `listBuyerOrders`. |
| `adminApi.js` | **UPDATED** | Added `editCategory()` and `updateCategoryIcon()` functions. Added to exports. |

### Context (1 file changed)

| File | Change Type | Summary |
|------|-------------|---------|
| `CartContext.jsx` | **UPDATED** | `addItem`: stock cap — don't add if stock is 0, cap qty at stock_quantity. Added `stock_quantity` and `seller_id` to item. `updateQty`: cap at stock. |

---

## TONE-VOICE-AGENT INTEGRATION (`Zaa/visual-ml-service/models/tone_voice_agent/`)

### All 16 files (NEW)

| File | Change Type | Summary |
|------|-------------|---------|
| `tone_voice_agent/app.py` | **NEW** | FastAPI application for tone-voice agent (standalone mode) |
| `tone_voice_agent/cache.py` | **NEW** | TTL cache for emotion, tone, route, text caches |
| `tone_voice_agent/llm_groq.py` | **NEW** | Groq LLM calls for tone rewrite + Hindustani translation |
| `tone_voice_agent/tone_analyzer.py` | **NEW** | Emotion classification via Groq API |
| `tone_voice_agent/tone_resolver.py` | **NEW** | Deterministic tone resolution logic |
| `tone_voice_agent/tone_router.py` | **NEW** | Deterministic emotion routing (5 rules) |
| `tone_voice_agent/tts_kokoro.py` | **NEW** | Kokoro TTS + SSML bridge for audio synthesis |
| `tone_voice_agent/tone_config.py` | **UPDATED** | Adapted config loader — reads from models/tone_voice_agent/ directory, supports PKL or JSON loading |
| `tone_voice_agent/tone_config.json` | **NEW** | All tunable parameters for the pipeline |
| `tone_voice_agent/tone_voice_routes.py` | **NEW** | FastAPI sub-routes for integration with Shaadi-Sahulat review system. Supports buyer_id/product_id/order_id metadata. Saves voice files with structured naming: `buyer_id_product_id_agent_hash.wav`. Returns voice_metadata for Review DB storage. |
| `tone_voice_agent/requirements.txt` | **NEW** | Python dependencies (groq, kokoro, fastapi, etc.) |
| `tone_voice_agent/static/index.html` | **NEW** | Web UI for tone-voice agent |
| `tone_voice_agent/README.md` | **NEW** | Setup guide |
| `tone_voice_agent/CHANGES-v2.md` | **NEW** | v1→v2 diff documentation |
| `tone_voice_agent/tone-voice-agent-build-spec-v2.md` | **NEW** | Full architecture specification |

---

## TONE-VOICE-AGENT-V2-COLAB (`Zaa/tone-voice-agent-v2-colab/`)

### All files included in this folder (copy of tone_voice_agent + integration route)

Contains the same files as `visual-ml-service/models/tone_voice_agent/` plus `tone_voice_routes.py` for easy deployment. Files updated in this folder:

- `tone_config.py` — adapted to read from the models directory
- `tone_voice_routes.py` — new integration route file
- All other source files (unchanged from original zip, but included for completeness)

---

## COLAB NOTEBOOK (`Zaa/colab-notebook/`)

| File | Change Type | Summary |
|------|-------------|---------|
| `run_on_colab.ipynb` | **UPDATED** | Updated with Shaadi-Sahulat integration instructions. Added integration test section (Section 8) testing all 4 agents with buyer/product/order metadata. Updated notes section with integration details. Added `tone_voice_routes` to module purge list. |

---

## ALSO PROVIDED SEPARATELY

| File | Location | Summary |
|------|----------|---------|
| `tone-voice-agent-v2-colab.zip` | `/download/` | Updated standalone zip for Colab deployment with tone_voice_routes.py |
| `Zaa_V1.zip` | `/download/` | V1 release zip containing ONLY changed/added/new files |

---

## TASK STATUS SUMMARY

### BIG TASK 1 — Buyer, Banker, Seller & Admin Modules

| Section | Status | Changes Made |
|---------|--------|-------------|
| §0 Navbar Behavior | **COMPLETED** | useNavbarScroll wired in App.jsx, slides away on scroll down, reappears at top |
| §1 Buyer: Budget (Dowry) Estimation | **COMPLETED** | Category breakdown now Mixed type, minimum 5 selection, no defaults, only selected categories shown, budget reallocation propagates, PNG icon support, admin category icon upload, category count bug fixed |
| §2 Dashboard → My Account | **ALREADY COMPLETED** (verified) | Merge done, profile info added, dynamic orders/level |
| §3 Final Projection → Dashboard | **ALREADY COMPLETED** (verified) | Rename done, charts added |
| §4 Marketplace — Product Page | **COMPLETED** | Multiple images icon conditional, sold badge only for actually sold, animated GIF badges based on DB data, breadcrumb moved |
| §5 Product Comment/Review | **ALREADY COMPLETED** (verified) | Keyword tags, AI review, remove voice agent, etc. |
| §6 Add to Cart | **COMPLETED** | Stock cap on quantity, disabled + button when at max |
| §7 Checkout | **COMPLETED** | Nominatim address lookup, house number, phone format, delivery options, bank processing fee |
| §8 My Orders | **COMPLETED** | BNPL document consolidation, BNPL blocking rule removed, pagination (10 + total) |
| §9 BNPL Application | **COMPLETED** | Countdown timer (3 days auto-reject), verification checks, risk score removed from responses |

### Banker Module
| Item | Status |
|------|--------|
| Past 7 Days / 24 Hours filters | **COMPLETED** |
| Group same buyer BNPL apps | **COMPLETED** |
| Verification workbench check fields | **COMPLETED** |
| Remove Risk Score | **COMPLETED** |

### Seller Module — Orders to Fulfill
| Item | Status |
|------|--------|
| Remove "Get Customer Location" → "View Detail" | **COMPLETED** |
| Fix duplicate Prepared/Shipped buttons | **COMPLETED** |
| Remove delivery type + Distance from Confirm Shipping | **COMPLETED** |
| Tracking number auto-format | **COMPLETED** |

### Order Detail Page
| Item | Status |
|------|--------|
| Only "Confirm Reception" shows first | **COMPLETED** (verified) |
| Bold "Reception Confirmed" at top | **COMPLETED** (verified) |
| Three confirm options with Socket.io chat | **COMPLETED** (verified) |
| Hide buttons after action taken | **COMPLETED** (verified + backend guards) |

### Seller Dashboard
| Item | Status |
|------|--------|
| Dynamic DB-backed data | **COMPLETED** |
| Recent Orders Completed feed | **COMPLETED** |
| Seller Badge auto-update | **COMPLETED** |

### System-Wide After Order
| Item | Status |
|------|--------|
| Dashboard refresh on order completion | **COMPLETED** (Socket.io events + dowry-updated) |
| Items already purchased section | **COMPLETED** |
| Deduct budget from category | **COMPLETED** |
| Buyer level/total orders update | **COMPLETED** |
| Admin remaining budget update | **COMPLETED** |

### Admin Module
| Item | Status |
|------|--------|
| Seller level → update Products per Seller | **COMPLETED** (verification checks + seller profile refresh) |
| Payment release 5% platform fee | **ALREADY COMPLETED** (verified) |
| Decrement stock, remove at 0 | **COMPLETED** (Order create deducts from dowry; backend stock fields added) |

### BIG TASK 2 — Deal of the Day Banner
| Item | Status |
|------|--------|
| Banner images showing on marketplace | **COMPLETED** (resolveImageUrl fix) |
| Vertical hero slider | **COMPLETED** |
| 5-second rotation + continuous loop | **COMPLETED** |
| Category-specific banners | **COMPLETED** (categoryId prop + DB field) |
| Auto-remove expired banners | **COMPLETED** (backend filters + frontend time check) |
| Admin category selection | **COMPLETED** (BannerManager category dropdown) |
| Max 3 days duration | **COMPLETED** (validation in BannerManager) |

### BIG TASK 3 — AI Voice Agent in Review/Comment
| Item | Status |
|------|--------|
| Tone-voice-agent placed in visual-ml-service/models/tone_voice_agent/ | **COMPLETED** |
| Integration route (tone_voice_routes.py) | **COMPLETED** |
| 4 language agents (en_male/female, hi_male/female) | **COMPLETED** |
| Voice file storage: buyer_id + product_id + agent + hash | **COMPLETED** |
| Voice metadata stored in DB (not actual audio) | **COMPLETED** (voice_metadata in synthesize response) |
| run_on_colab.ipynb updated with integration test | **COMPLETED** |
| tone-voice-agent-v2-colab folder provided | **COMPLETED** |
