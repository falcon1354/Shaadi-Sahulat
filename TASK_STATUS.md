# ShaadiSahulat — Task Status
> Reference: `ShaadiSahulat_Module_Reference.md`

## §1 UI & Architecture
| Task | Status | Notes |
|------|--------|-------|
| §1.0 Unified UI (same colours, cards, fonts everywhere) | ✅ Done | All components use same Tailwind palette |
| §1.1 Buyer/Seller separation + Landing Page + Auth gate | ✅ Done | `LandingPage.jsx`, sidebar App.jsx, `BuyerAuthPage.jsx`, seller login via `SellerPage.jsx` |

---

## §2 Dowry Estimation Module
| Task | Status | Notes |
|------|--------|-------|
| §2.1 Wedding Dress merged (Bridal/Groom radio) | ✅ Done | `wedding_dress_type` stored |
| §2.2 4 Priority levels (High/Medium/Low/Not Wanted) + redistribution sub-prompt | ✅ Done | Wizard step 3 |
| §2.3 Hybrid estimation — 60% rule + 40% DB avg top-5 | ✅ Done | `dowry_routes.py` |
| §2.4 Adjustable sliders with step thresholds + colour deviation indicator | ✅ Done | Wizard result screen |
| §2.5 Training data storage — profile JSON in `training/dowry_profiles/` | ✅ Done | Fire-and-forget from `dowryController.js` |

---

## §3 Image Recommendation Module
| Task | Status | Notes |
|------|--------|-------|
| §3.1 UI matches platform style | ✅ Done | `VisualRecPage.jsx` |
| §3.2 Result cards show match %, price, seller, city | ✅ Done | `ResultsGrid.jsx` |
| §3.3 "View in Marketplace →" cross-module button | ✅ Done | `onNavigateToProduct` prop chain |

---

## §4 Seller Upload Module
| Task | Status | Notes |
|------|--------|-------|
| §4.1 Product Edit / Delete / Discount toggle | ✅ Done | `ProductList.jsx` with `EditModal` |
| §4.2 6 categories with full subcategory tree | ✅ Done | Upload form dynamic dropdowns |
| §4.3 Subcategory nesting (seller upload ↔ buyer browse) | ✅ Done | `major_category` + `subcategory` fields |
| §4.4 Marketplace per-category + budget banner (§Contract 1) | ✅ Done | `MarketplacePage.jsx` reads `ss_dowry_latest` |
| §4.5 TF-IDF vector generated on product save | ✅ Done | `seller_routes.py` rebuild on upload |

---

## §5 Buyer Marketplace & E-Commerce
| Task | Status | Notes |
|------|--------|-------|
| §5.1 Package Suggestion Feature (4-5 pre-built packages) | ✅ Done | PackageSuggestions shown when ss_dowry_latest exists |
| §5.2 Search (TF-IDF cosine ≥0.2, min 3 chars) | ✅ Done | `/api/seller/search` + debounced input |
| §5.2 Filter (price range, condition, city) + Sort | ✅ Done | Filter panel + sort dropdown |
| §5.2 Cart (add/remove/qty, localStorage `ss_cart`) | ✅ Done | `CartContext.jsx` + `CartDrawer.jsx` |
| §5.2 Wishlist (heart button → `ss_wishlist`) | ✅ Done | Toggle heart in ProductCard |
| §5.2 Recently Viewed (last 10, `ss_recently_viewed`) | ✅ Done | Saved on product detail open |
| §5.3 Cart budget warning (per-category overspend check) | ✅ Done | `CartDrawer.jsx` budget check section |

---

## §6 Cross-Module Data Contracts
| Task | Status | Notes |
|------|--------|-------|
| Contract 1: Dowry → `ss_dowry_latest` → Marketplace budget banner | ✅ Done | Written in Wizard, read in Marketplace + Dashboard |
| Contract 2: Order completion → budget deduction | ⚠️ Partial | Order system not yet built; deduction logic designed but no real orders |
| Contract 3: Seller product fields → Buyer marketplace display | ✅ Done | All required fields in product schema |
| Contract 4: Recommendation → Cart (source/similarity stored) | ✅ Done | `addItem` includes product data |

---

## §9 Budget Deduction Flow
| Task | Status | Notes |
|------|--------|-------|
| §9 Order → budget deduction on "Done" status | ✅ Done (simulated) | CartDrawer "Confirm Order" updates `ss_dowry_latest.category_budgets[x].spent` in localStorage |

---

## §10 Dummy Data
| Task | Status | Notes |
|------|--------|-------|
| §10 Ahmed Traders seller + 22 products across 6 categories | ✅ Done | `seed_all_categories.py` |

---

## §11 Seller & Budget Features
| Task | Status | Notes |
|------|--------|-------|
| §11.1 TF-IDF search bar (buyer, cosine similarity ≥0.2) | ✅ Done | `seller_routes.py` `/seller/search` |
| §11.2 MongoDB seed: 1 seller + all products with embeddings | ✅ Done | `seed_all_categories.py` |
| §11.3 3-priority price suggestion (subcategory+color+condition → subcategory → category) | ✅ Done | `dowry_routes.py` 3-level cascade |
| §11.4 Budget overshoot modal (Scenario A/B/C/D when adding to cart) | ✅ Done | `MarketplacePage.jsx` |
| §11.5 Budget shift module (manual + triggered, updates `ss_dowry_latest`) | ✅ Done | Inline shift modal in MarketplacePage |
| §11.6 DB fields: `suggested_price_ref`, `price_deviation_pct`, `was_price_warned` | ✅ Done | Stored on product in MongoDB |

---

## Files Deleted (Irrelevant / Unused)
| File | Reason |
|------|--------|
| `backend/exports/index.js` | Not imported anywhere in the backend |
| `backend/models/UserProfile.js` | Only referenced by the deleted exports/index.js |
| `backend/models/Product.js` | Only referenced by the deleted exports/index.js (Flask handles products) |

## Files Kept (Verified As Used)
| File | Used By |
|------|---------|
| `frontend/src/components/Seller/SellerPage.jsx` | `App.jsx` (login screen, upload tab, my-products tab) |
| `backend/models/VisualRecommendation.js` | `backend/services/visualClient.js`, `backend/controllers/visualController.js` |
