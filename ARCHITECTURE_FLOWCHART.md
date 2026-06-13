# Data Flow & Architecture Diagram

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEDDING RECOMMENDATION SYSTEM                        │
│                            (FastAPI Backend)                                │
└─────────────────────────────────────────────────────────────────────────────┘

================================================================================
SELLER FLOW: Product Upload with Embedding Generation
================================================================================

    Seller                      FastAPI Backend              Storage
    ──────                      ───────────────              ───────
      │                              │                         │
      │ 1. Register                  │                         │
      ├─ POST /seller/register ─────→│                         │
      │                              │                         │
      │◄─ seller_id ────────────────┤                         │
      │   (abc123...)                │                         │
      │                              │                         │
      │ 2. Upload Product            │                         │
      │   + 3 Images                 │                         │
      ├─ POST /seller/product ──────→│ Validate                │
      │   (form-data)                ├─ Check fields           │
      │                              ├─ Verify images          │
      │                              │                         │
      │                              ├─ Generate filenames ────→ uploads/
      │                              │   (via filename_utils)     lehenga/
      │                              │                           prod_xyz/
      │                              ├─ Save images ──────────→ uuid1.jpg
      │                              │                        uuid2.jpg
      │                              │                        uuid3.jpg
      │                              │                         │
      │                              ├─ Create MongoDB entry   │
      │                              │  (status: processing)   │
      │◄─ product_id ──────────────┤  (no embeddings yet)    │
      │   (xyz789...)                │                         │
      │   status: processing         │                         │
      │                              │                         │
      │ 3. Background Task:          │                         │
      │                              │ ┌─ For each image:      │
      │                              │ │                       │
      │                              │ ├─ Read: uploads/  ────→ Get image
      │                              │ │        lehenga/       from disk
      │                              │ │        prod_xyz/      
      │                              │ │        uuid1.jpg      
      │                              │ │                       │
      │                              │ ├─ Extract embedding    │
      │                              │ │  via EfficientNet-B0  
      │                              │ │  → 1280-dim vector    
      │                              │ │                       │
      │                              │ ├─ Store in MongoDB  ──→ products
      │                              │ │  image_embeddings[]   collection
      │                              │ │                       
      │                              │ └─ Repeat for all       
      │                              │    3 images             
      │                              │                         │
      │                              ├─ Generate TF-IDF       │
      │                              │  from description       │
      │                              │  (via fitted vectorizer)
      │                              │                         │
      │                              ├─ Store TF-IDF in ─────→ products
      │                              │  MongoDB tfidf_vector   collection
      │                              │                         │
      │                              ├─ Update status: ────────→ products
      │                              │  "processing" → "available"
      │                              │  (~30-60 seconds)
      │                              │                         │
      │ 4. Check Status              │                         │
      ├─ GET /seller/products ──────→│ Query MongoDB          │
      │                              ├─ Filter by seller_id   │
      │◄─ [products list] ──────────┤ Return with status      │
      │   status: available          │                         │
      │   (now has embeddings)       │                         │
      │                              │                         │

================================================================================
BUYER FLOW: Recommendation with Hybrid Scoring
================================================================================

    Buyer                       FastAPI Backend            Storage & ML
    ─────                       ───────────────            ──────────────
      │                              │                         │
      │ 1. Upload Query Image        │                         │
      ├─ POST /buyer/recommend ─────→│ Read image bytes       │
      │   (image: query.jpg)         │                         │
      │   category: lehenga          │                         │
      │   image_weight: 0.7          │                         │
      │   text_weight: 0.3           │                         │
      │   query_text: (optional)     │                         │
      │                              │                         │
      │                              ├─ Save temp ───────────→ uploads/
      │                              │  (temp/uuid.jpg)         temp/
      │                              │                         │
      │                              ├─ Extract query ────────→ EfficientNet-B0
      │                              │  embedding              (1280-dim)
      │                              │  (via embedding_service)
      │                              │◄─────────────────────────
      │                              │  query_embedding
      │                              │  (1280 floats)          │
      │                              │                         │
      │                              ├─ Generate query ────────→ TF-IDF
      │                              │  TF-IDF                 Vectorizer
      │                              │  (via tfidf_service)    (.pkl file)
      │                              │◄─────────────────────────
      │                              │  query_tfidf            │
      │                              │  (sparse dict)          │
      │                              │                         │
      │                              ├─ Query MongoDB ────────→ Get all
      │                              │  (available products)    available
      │                              │                          products
      │                              │◄────────────────────────
      │                              │  List of 150 products
      │                              │  with embeddings &
      │                              │  TF-IDF vectors
      │                              │                         │
      │                              ├─ For each product:      │
      │                              │  ┌─ Get image ─────────→ product_emb
      │                              │  │  embeddings           (from MongoDB)
      │                              │  │                       
      │                              │  ├─ Compute image ──────→ Cosine
      │                              │  │  similarity           similarity
      │                              │  │  (cosine distance)    computation
      │                              │  │  query ←→ product     
      │                              │  │  → max across 5       
      │                              │  │    product images     │
      │                              │  │                       │
      │                              │  ├─ Get TF-IDF ────────→ product_tfidf
      │                              │  │  from product         (from MongoDB)
      │                              │  │                       
      │                              │  ├─ Compute text ───────→ Cosine
      │                              │  │  similarity           similarity
      │                              │  │  (TF-IDF cosine)      computation
      │                              │  │  query ←→ product     
      │                              │  │                       │
      │                              │  ├─ Compute hybrid:      │
      │                              │  │  score = 0.7 × img_sim
      │                              │  │         + 0.3 × text_sim
      │                              │  │                       │
      │                              │  └─ Store result        
      │                              │                         │
      │                              ├─ Sort by hybrid_score   │
      │                              │  (descending)           │
      │                              │                         │
      │                              ├─ Take top-5             │
      │                              │                         │
      │                              ├─ Build response ────────→ Get image
      │                              │  (with image URLs)       URLs from
      │                              │  (from filesystem)       MongoDB
      │                              │                         │
      │◄─ Recommendations ──────────┤ [                       │
      │   Top-5 results             │   {                     │
      │   with scores               │     product_id: "...",  │
      │                             │     image_similarity: 0.87,
      │                             │     text_similarity: 0.65,
      │                             │     hybrid_score: 0.79,  │
      │                             │     primary_image_url: "/api/images/..."
      │                             │   },                    │
      │                             │   ...                   │
      │                             │ ]                       │
      │                             │                         │
      │ 2. View Recommendations    │                         │
      ├─ Get image URLs            │                         │
      ├─ GET /api/images/... ─────→│ Serve image file ──────→ Read from
      │                             │                        uploads/
      │◄─ Image binary ────────────┤                         lehenga/prod123/
      │   (JPG stream)              │                         uuid.jpg
      │                             │                         │
      │ 3. Clean Up               │                         │
      │                             ├─ Delete temp image ──→ Remove
      │                             │                      uploads/temp/uuid.jpg
      │                             │                      │

================================================================================
DATA STRUCTURES IN MONGODB
================================================================================

Collection: sellers
──────────────────
{
  _id: ObjectId,
  seller_id: "abc123xyz",
  name: "Bridal Dreams",
  email: "shop@bridalreams.com",
  phone: "+92-333-1234567",
  city: "Karachi",
  created_at: ISODate("2024-01-15T10:30:00"),
  updated_at: ISODate("2024-01-15T10:30:00")
}

Collection: products
────────────────────
{
  _id: ObjectId,
  product_id: "xyz789abc",
  seller_id: "abc123xyz",
  seller_name: "Bridal Dreams",
  title: "Red Bridal Lehenga",
  description: "Deep red bridal lehenga with heavy embroidery",
  category: "lehenga",
  color: "Deep Red",
  fabric: "Silk",
  embroidery_type: "Mirror Work",
  bridal_type: "formal",
  price: 50000,
  discount_price: 45000,
  stock_quantity: 5,
  availability_status: "available",
  
  images: [
    {
      image_id: "id-uuid-1",
      original_name: "photo1.jpg",
      stored_filename: "id-uuid-1.jpg",
      relative_path: "uploads/lehenga/xyz789abc/id-uuid-1.jpg",
      absolute_path: "/path/to/uploads/lehenga/xyz789abc/id-uuid-1.jpg",
      is_primary: true,
      uploaded_at: ISODate("...")
    },
    ...
  ],
  
  image_embeddings: [
    {
      image_id: "id-uuid-1",
      embedding: [0.123, -0.456, ..., 0.789]  ← 1280 floats
    },
    ...
  ],
  
  tfidf_vector: {
    "red": 0.451,
    "lehenga": 0.382,
    "embroidery": 0.315,
    "heavy": 0.201,
    "bridal": 0.189,
    ...
  },
  
  upload_date: ISODate("2024-01-15T10:30:00"),
  last_updated: ISODate("2024-01-15T10:35:00")
}

================================================================================
SCORING EXAMPLE
================================================================================

Query Image: Red lehenga
Query Text: "red lehenga with embroidery" (optional)

Product A: Red Bridal Lehenga
  ├─ Image Similarity: 0.8732
  │  (Query ↔ Product image embeddings via cosine similarity)
  │  (Very similar color, silhouette, style)
  │
  ├─ Text Similarity: 0.6543
  │  (Query TF-IDF ↔ Product TF-IDF via cosine similarity)
  │  (Keywords: red, lehenga, embroidery match)
  │
  └─ Hybrid Score = (0.7 × 0.8732) + (0.3 × 0.6543)
                   = 0.6112 + 0.1963
                   = 0.8075 ✓ (Ranked 1st)

Product B: Pink Sharara
  ├─ Image Similarity: 0.6234
  │  (Different color, different silhouette)
  │
  ├─ Text Similarity: 0.5123
  │  (Only "embroidery" keyword matches)
  │
  └─ Hybrid Score = (0.7 × 0.6234) + (0.3 × 0.5123)
                   = 0.4364 + 0.1537
                   = 0.5901 ✗ (Ranked 2nd)

Product C: Red Sharara
  ├─ Image Similarity: 0.7845
  │  (Same color, but different silhouette)
  │
  ├─ Text Similarity: 0.7234
  │  (Keywords: red, embroidery match, but not "lehenga")
  │
  └─ Hybrid Score = (0.7 × 0.7845) + (0.3 × 0.7234)
                   = 0.5492 + 0.2170
                   = 0.7662 ✓ (Ranked 2nd overall)

Final Ranking:
  1. Product A: 0.8075
  2. Product C: 0.7662
  3. Product B: 0.5901
  ...

================================================================================
KEY SYNCHRONIZATION POINTS
================================================================================

Filename Sync (Critical):
  ├─ generate_image_record() in filename_utils.py
  │  generates image_id (UUID)
  │
  ├─ Same image_id used as:
  │  ├─ Filename on disk: /uploads/.../uuid.jpg
  │  ├─ MongoDB key in images[]
  │  └─ MongoDB key in image_embeddings[]
  │
  └─ Result: Perfect sync between DB and filesystem

TF-IDF Consistency:
  ├─ Vectorizer fitted ONCE on representative corpus
  ├─ Saved to ml/vectorizer.pkl
  ├─ Loaded at app startup
  ├─ Never refitted on individual documents
  └─ All products use same vocabulary

Embedding Storage:
  ├─ Extracted from query image at recommendation time
  ├─ Extracted for each product image in background
  ├─ Stored in MongoDB image_embeddings[] array
  ├─ Indexed by image_id for quick lookup
  └─ Loaded into memory for fast similarity search

================================================================================
```

## Key Points

1. **Seller Upload**
   - Files saved to organized folders: `uploads/{category}/{product_id}/{uuid}.jpg`
   - Image metadata stored in MongoDB `images[]`
   - Background task extracts embeddings and TF-IDF
   - Status changes from "processing" to "available"

2. **Buyer Recommendation**
   - Query image embedded using same model as products
   - TF-IDF generated from query text (if provided)
   - All products scored using hybrid function
   - Top-K returned sorted by hybrid_score

3. **Synchronization**
   - Image IDs are the sync key between DB and filesystem
   - Single source of truth for filename generation
   - Perfect 1:1 mapping between MongoDB records and disk files

4. **Performance**
   - Products cached in memory for fast search
   - TF-IDF uses sparse representation
   - Embeddings pre-computed and stored
   - No re-computation on queries
