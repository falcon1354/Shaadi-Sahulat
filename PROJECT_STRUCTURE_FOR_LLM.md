# Shaadi-Sahulat — Complete Project Architecture & Structure Guide for LLMs

This document is the definitive guide to the **Shaadi-Sahulat** project repository structure, microservice breakdown, folder purposes, and file relationships.

---

## 🚀 Microservices Overview (5 Concurrent Services)

The system consists of **5 main services** operating together:

| Service | Technology | Port | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Node.js Backend** | Node.js, Express, Socket.io, Mongoose | `5000` | REST APIs, Auth, Orders, BNPL, Disputes, Banners, Real-time Sockets |
| **ML Recommendation Service** | Python, Flask | `5001` | Core ML recommendations & budget recommendation APIs |
| **Visual ML Service** | Python, Flask, PyTorch (EfficientNet-b0), PyMongo | `5002` | Image similarity, CNN feature extraction, dataset status, TF-IDF product search |
| **Tone Voice Agent** | Python, FastAPI, Kokoro TTS, Groq API | `8000` | Emotion classification, SSML tone rewriting, Kokoro audio synthesis, UI at `http://localhost:8000` |
| **React Frontend** | React 18, Vite, TailwindCSS | `3000` | Buyer portal, Seller dashboard, Admin control panel, Bank officer portal |

---

## 📂 Project Folder & File Structure

```
shaadi-sahulat/
├── Uploads/                         # Central storage for application upload assets (Port 5000)
│   ├── BNPL/                        # Buyer CNIC & salary proof document bundles
│   ├── Banners/                     # Seller promotional deal banner images
│   ├── Dispute/                     # Seller/Buyer dispute proof attachments
│   └── Reviews/                     # Buyer review photos & Kokoro synthesized WAV voices
│       └── voices/                  # Synthesized audio files (.wav)
│
├── backend/                         # Node.js REST API & Real-time Socket.io Server (Port 5000)
│   ├── server.js                    # Entry point: Express app, DB connection, Socket.io, cron timers
│   ├── config/                      # Database configuration & helpers
│   ├── lib/
│   │   └── helpers.js               # IBAN, CNIC, and utility validation functions
│   ├── middleware/                  # Auth verification (JWT/Session) for Buyer, Seller, Admin
│   ├── models/                      # Mongoose database schemas
│   │   ├── AdminCategory.js         # Dynamic category & custom field schemas
│   │   ├── Banner.js                # Deal of the Day & seller promotional offers
│   │   ├── BnplApplication.js       # BNPL application state & credit scoring
│   │   ├── BnplDocumentBundle.js    # Bundled buyer CNIC/salary proof file metadata
│   │   ├── Dispute.js               # Buyer-Seller order disputes
│   │   ├── Order.js                 # Buyer order details, items, shipping, & payment status
│   │   ├── Product.js               # Product listings (New & Thrift)
│   │   ├── Review.js                # Product reviews & voice metadata links
│   │   └── User.js                  # Buyer, Seller, Admin, Bank Officer user accounts
│   ├── routes/                      # API endpoint handlers
│   │   ├── admin.js                 # Admin management endpoints
│   │   ├── bank.js                  # Bank officer verification & application approval endpoints
│   │   ├── banners.js               # Storefront & seller banner offer routes
│   │   ├── bnpl.js                  # Buyer BNPL application & OCR extraction routes
│   │   ├── buyer.js                 # Buyer profile, wishlist, and dowry budget routes
│   │   ├── categories.js            # Dynamic category retrieval & filtering
│   │   ├── disputes.js              # Order dispute creation & status routes
│   │   ├── orders.js                # Order creation, list, pagination, and status updates
│   │   ├── reviews.js               # Review submission & rating routes
│   │   └── seller.js                # Seller product creation & thrift product approval routes
│   └── seeds/                       # Database initialization & migration scripts
│       └── migrateToThrift.js       # MongoDB Atlas migration script for Thrift products
│
├── frontend/                        # React Single Page Application (Port 3000)
│   ├── index.html                   # HTML document root
│   ├── vite.config.js               # Vite bundler configuration
│   └── src/
│       ├── App.jsx                  # Main routing tree (React Router v6) & layout wrappers
│       ├── api/                     # Axios/Fetch API client modules
│       │   ├── adminApi.js          # Admin dashboard & management API calls
│       │   ├── buyerApi.js          # Buyer profile, budget, & wishlist API calls
│       │   ├── orderApi.js          # Order & checkout API calls
│       │   └── sellerApi.js         # Seller product & banner offer API calls
│       ├── components/
│       │   ├── Admin/               # Admin Management UI (Banners, Categories, Wallet, Disputes)
│       │   │   ├── AdminDisputesPage.jsx
│       │   │   ├── AdminLayout.jsx
│       │   │   ├── AdminLoginPage.jsx
│       │   │   ├── AdminReviewsPage.jsx
│       │   │   ├── AdminWalletPage.jsx
│       │   │   ├── BannerManager.jsx
│       │   │   ├── BuyerManagement.jsx
│       │   │   ├── CategoryManager.jsx
│       │   │   ├── FinancialDashboard.jsx
│       │   │   └── SellerManagement.jsx
│       │   ├── BNPL/                # BNPL application flow & status
│       │   │   ├── BNPLApplyPage.jsx
│       │   │   └── BNPLStatusPage.jsx
│       │   ├── Bank/                # Bank Officer verification panel
│       │   │   ├── BankDashboardPage.jsx
│       │   │   └── BankLoginPage.jsx
│       │   ├── Buyer/               # Buyer portal pages
│       │   │   ├── BuyerAccountPage.jsx
│       │   │   ├── BuyerAuthPage.jsx
│       │   │   ├── BuyerDashboard.jsx
│       │   │   └── FinalProjection.jsx
│       │   ├── Cart/                # Shopping Cart & Checkout UI
│       │   │   ├── CartDrawer.jsx
│       │   │   └── CheckoutPage.jsx
│       │   ├── Common/              # Shared components (Banners, Notifications)
│       │   │   ├── DealOfTheDayBanner.jsx
│       │   │   └── NotificationBell.jsx
│       │   ├── Disputes/            # Socket.io live chat for order disputes
│       │   │   └── DisputeChatPage.jsx
│       │   ├── Dowry/               # Dowry budget estimation wizard
│       │   │   ├── DowryPage.jsx
│       │   │   └── Wizard.jsx
│       │   ├── Marketplace/         # New & Thrift combined marketplace
│       │   │   ├── MarketplacePage.jsx
│       │   │   └── ProductDetailPage.jsx
│       │   ├── Orders/              # Buyer order list & order details
│       │   │   ├── BuyerOrderDetailPage.jsx
│       │   │   └── BuyerOrdersPage.jsx
│       │   ├── Seller/              # Seller dashboard, uploads, banner requests
│       │   │   ├── ProductList.jsx
│       │   │   ├── ProductUpload.jsx
│       │   │   ├── SellerAuthPage.jsx
│       │   │   ├── SellerBannerOffer.jsx
│       │   │   ├── SellerDashboard.jsx
│       │   │   ├── SellerFinancialProjection.jsx
│       │   │   ├── SellerOrdersPage.jsx
│       │   │   ├── SellerPage.jsx
│       │   │   └── SellerReviewsPage.jsx
│       │   ├── Thrift/              # Dedicated Thrift marketplace homepage
│       │   │   ├── ThriftHomePage.jsx
│       │   │   └── ThriftProductCard.jsx
│       │   └── VisualRec/           # AI Photo dress matcher UI
│       │       └── VisualRecPage.jsx
│       ├── context/                 # Global React Contexts
│       │   ├── CartContext.jsx      # Shopping cart state, open drawer state, cart item persistence
│       │   └── SocketContext.jsx    # Real-time Socket.io connection manager
│       ├── hooks/                   # Custom React hooks
│       │   ├── useCategories.js     # Category retrieval & helper functions
│       │   └── useNavbarScroll.js   # Navbar auto-hide on scroll handler
│       └── styles/                  # Global Tailwind CSS styles
│           └── index.css
│
├── ml-service/                      # Python ML Recommendation microservice (Port 5001)
│   ├── app.py                       # Flask server entry point
│   ├── recommendation_engine.py    # Budget recommendation & similarity matching algorithms
│   └── requirements.txt
│
├── tone-voice/                      # Standalone Tone-Aware Review Voice Agent (Port 8000) [ACTIVE]
│   ├── app.py                       # FastAPI entry point: pre-loads Kokoro pipelines on startup, serves static UI
│   ├── tone_analyzer.py             # Groq emotion classification (detects primary emotion, intensity, mismatch)
│   ├── tone_resolver.py             # Resolves emotion flavor and tone labels
│   ├── tone_router.py               # Determines SSML vs LLM emotion carrier routing
│   ├── tone_voice_routes.py         # Sub-app routes (/tone-voice/analyze, /tone-voice/synthesize)
│   ├── llm_groq.py                  # Groq LLM SSML tone rewrite & Hindustani translation
│   ├── tts_kokoro.py                # Kokoro TTS model loader (cached globally) & WAV audio generator
│   ├── cache.py                     # In-memory TTL cache for analysis results
│   ├── tone_config.py & .json       # Config loader & tunable routing rules/voice IDs
│   ├── static/
│   │   └── index.html               # Tone Voice Agent interactive UI webpage
│   └── outputs/                     # Temporary generated audio files (.wav)
│
└── visual-ml-service/               # PyTorch Visual Search ML Microservice (Port 5002)
    ├── app.py                       # Flask entry point for image embedding & recommendation APIs
    ├── config.py                    # MongoDB Atlas URI & EfficientNet model configuration
    ├── model.py                     # PyTorch EfficientNet-b0 CNN feature extraction model
    ├── predictor.py                 # Visual similarity predictor & inference engine
    ├── seller_routes.py             # Public search, product upload, & thrift approval endpoints
    ├── dowry_routes.py              # Dowry estimation ML endpoints
    ├── tfidf_engine.py              # TF-IDF cosine similarity search engine for product text matching
    ├── embedding_index.py           # Feature vector embedding indexer
    ├── mongo_seller.py              # PyMongo queries for seller product catalogs
    ├── mongo_catalog.py             # PyMongo queries for catalog dresses
    ├── data_loader.py               # Image preprocessing pipeline
    ├── seed_all_categories.py       # Seed database categories into MongoDB Atlas
    ├── models/                      # Trained model weights (.pth files)
    └── uploads/                     # Categorized image upload folders for feature processing
        ├── bridal_lehenga/
        ├── bridal_saree/
        ├── bridal_sharara/
        ├── decoration/
        ├── electronics/
        ├── furniture/
        ├── kitchen_items/
        ├── miscellaneous/
        └── wedding_dress/
```

---

## ❓ Frequently Asked Questions & Confusions Clarified

### 1. Are the `Uploads` folders inside `backend` and `visual-ml-service` different?
- **Root `/Uploads` (Used by Backend on Port 5000)**: This is the **primary production upload directory** serving user assets via Express static middleware (`/uploads`). It holds BNPL CNIC bundles (`/Uploads/BNPL`), seller banner offers (`/Uploads/Banners`), dispute proof images (`/Uploads/Dispute`), and review photos/synthesized WAV files (`/Uploads/Reviews/voices`).
- **`visual-ml-service/uploads` (Used by Visual ML Service on Port 5002)**: This is a **local ML category dataset directory** holding categorized dress and product images (`bridal_lehenga`, `furniture`, `electronics`, etc.) used for CNN feature extraction, visual index building, and image embeddings.
- **`backend/Uploads`**: An un-used folder path; all backend file uploads are routed to the central project root **`/Uploads`**.

### 2. Is `tone_voice_agent` inside `visual-ml-service/models` used, or root `tone-voice`?
- **Active Service: `tone-voice` (Root Directory)**: This is the **only active microservice** running standalone on **Port 8000** via FastAPI & Uvicorn. It pre-loads Kokoro TTS models on startup and serves the interactive UI at `http://localhost:8000`.
- **`visual-ml-service/models/tone_voice_agent`**: This is a **legacy embedded copy** from early prototyping before the Voice Agent was separated into its own standalone microservice folder. It is **not used** during runtime. Always work inside root **`/tone-voice`**.

---

## 🔄 How the 5 Services Communicate

1. **Buyer & Seller Browsing**: Frontend (`Port 3000`) ➔ Node.js Backend (`Port 5000`) ➔ MongoDB Atlas.
2. **Visual Dress Recommendation & Image Search**: Frontend (`Port 3000`) ➔ Visual ML Service (`Port 5002`) ➔ PyTorch EfficientNet-b0 ➔ Returns matching MongoDB product IDs ➔ Frontend fetches full details from Port 5000.
3. **Tone-Aware Review Voice Generation**: User submits review ➔ Frontend/Voice UI (`Port 8000`) ➔ `tone-voice` (`Port 8000`) ➔ Groq LLM (Emotion & SSML rewrite) ➔ Kokoro TTS ➔ Saves `.wav` file to `/Uploads/Reviews/voices/` ➔ Node.js Backend updates `Review` document with voice metadata URL.
4. **Real-time Dispute Chat**: Frontend (`Port 3000`) ↔ Socket.io (`ws://localhost:5000/socket.io/`) ↔ Node.js Backend (`Port 5000`).
