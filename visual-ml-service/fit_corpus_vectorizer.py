"""
ShaadiSahulat - TF-IDF Corpus Vectorizer Fitter
=================================================
Run this ONCE before seed_catalog.py to create a stable TF-IDF vocabulary
from a representative corpus covering ALL seller categories
(wedding dresses, furniture, electronics, kitchen, decoration, miscellaneous).

Problem it solves
-----------------
If the vectorizer is fitted on the catalog images alone, re-running
seed_catalog.py rebuilds the vocabulary and makes old TF-IDF vectors
incompatible with new ones.  This script fits on a fixed, hard-coded
corpus that covers all vocabulary we will ever encounter, so the pkl
stays stable across catalog rebuilds and seller product additions —
and (critically) thrift TF-IDF search works for non-dress categories
like furniture, electronics, kitchen, decoration.

Usage
-----
  python fit_corpus_vectorizer.py

Output
------
  data/tfidf_vectorizer.pkl  (loaded automatically by tfidf_engine.py)
"""

import os
import sys

# ---------------------------------------------------------------------------
# Representative corpus — wedding dresses
# Covers colours, fabrics, embroidery types, silhouettes
# ---------------------------------------------------------------------------
WEDDING_DRESS_CORPUS = [
    # Bridal Lehenga
    "deep red bridal lehenga with heavy gold zardozi embroidery and floral patterns",
    "crimson bridal lehenga with intricate silver kaamdani work and mirror embellishments",
    "ivory bridal lehenga with delicate pastel floral embroidery and lace border",
    "royal blue bridal lehenga with heavy sequin work and gota patti detailing",
    "golden yellow bridal lehenga with zardozi embroidery and antique motifs",
    "maroon velvet bridal lehenga with heavy hand embroidery and stone embellishments",
    "blush pink bridal lehenga with kundan work and organza dupatta",
    "emerald green bridal lehenga with silver thread embroidery and silk fabric",
    "midnight navy bridal lehenga with gold thread work and velvet texture",
    "peach bridal lehenga with light embroidery and chiffon dupatta",
    "deep white bridal lehenga with heavy gold mirror work embroidery and floral patterns",
    "deep blue bridal lehenga with heavy gold zardozi embroidery and floral patterns",
    "deep maroon bridal lehenga with heavy gold gota embroidery and floral patterns",
    "deep pink bridal lehenga with heavy gold gota embroidery and floral patterns",
    "deep black bridal lehenga with heavy gold zardozi embroidery and floral patterns",
    "deep yellow bridal lehenga with heavy gold gota embroidery and floral patterns",
    "deep golden bridal lehenga with heavy gold gota embroidery and floral patterns",
    "orange bridal lehenga with intricate zardozi work and silk fabric",
    "teal bridal lehenga with antique gold embroidery and heavy stonework",
    "purple bridal lehenga with silver kaamdani work and net dupatta",

    # Bridal Sharara
    "deep green bridal sharara with heavy silver embroidery and floral patterns",
    "deep red bridal sharara with heavy gold zardozi embroidery and floral patterns",
    "deep blue bridal sharara with heavy gold zardozi embroidery and floral patterns",
    "deep gray bridal sharara with heavy gold zardozi mirror work and floral patterns",
    "deep pink bridal sharara with heavy gold zardozi mirror work and floral patterns",
    "deep purple bridal sharara with heavy gold zardozi embroidery and floral patterns",
    "deep white bridal sharara with heavy gold zardozi embroidery and floral patterns",
    "emerald bridal sharara with antique gold embroidery and velvet fabric",
    "champagne bridal sharara with pearl embellishments and light sequin work",
    "teal bridal sharara with heavy silver thread embroidery and net dupatta",
    "coral bridal sharara with gold kaamdani work and chiffon fabric",
    "crimson sharara with intricate floral embroidery and heavy stonework",
    "ivory sharara set with delicate pastel embroidery and organza dupatta",
    "navy blue sharara with gold gota patti border and silk fabric",

    # Bridal Saree
    "deep green bridal saree with heavy silver embroidery and floral patterns",
    "deep pink bridal saree with heavy silver embroidery and floral patterns",
    "deep purple bridal saree with heavy silver embroidery and floral patterns",
    "deep white bridal saree with heavy silver embroidery and floral patterns",
    "deep red bridal saree with heavy silver embroidery and floral patterns",
    "deep gray bridal saree with heavy silver embroidery and floral patterns",
    "deep black bridal saree with heavy silver embroidery and floral patterns",
    "deep yellow bridal saree with heavy silver embroidery and floral patterns",
    "maroon silk saree with gold zari embroidery and traditional motifs",
    "ivory bridal saree with delicate silver embroidery and pearl detailing",
    "orange bridal saree with gold zari work and heavy pallu embroidery",
    "blue bridal saree with heavy silver embroidery and sequin pallu",
    "cream banarasi saree with heavy gold brocade weave and silk fabric",
    "rose pink saree with light stone work and chiffon pallu",

    # General vocabulary — fabric types, techniques, occasions
    "wedding dress with heavy embroidery and ornate traditional patterns",
    "bridal outfit with zardozi work and kundan stones",
    "traditional bridal wear with gota patti embroidery and silk fabric",
    "Pakistani bridal dress with heavy silver thread work and mirror embellishments",
    "Indian bridal outfit with intricate floral patterns and sequin work",
    "formal bridal wear with delicate embroidery and lace border",
    "ethnic wedding dress with sequin and mirror embellishments",
    "semi-formal bridal outfit with light embroidery and chiffon fabric",
    "velvet bridal dress with gold embroidery and pearl work",
    "silk bridal outfit with traditional motifs and zari border work",
    "net bridal dress with light embroidery and stone detailing",
    "heavy bridal outfit with full embroidery coverage and rich fabric",
    "light bridal dress with minimal embroidery and pastel colors",
    "chiffon bridal outfit with delicate threadwork and floral patterns",
    "organza bridal dress with heavy embellishments and rich vibrant colors",
    "brocade bridal outfit with intricate woven patterns and antique gold thread",
    "georgette bridal dress with sequin embroidery and matching dupatta",
    "traditional Pakistani bridal wear with heavy embellishments and floral motifs",
    "lehenga choli with heavy embroidery and contrasting dupatta",
    "sharara set with wide flared pants and heavily embroidered kurta",
    "drape saree with elegant zari border and intricate pallu work",
    "embroidered dress with bright vibrant colors and heavy decorative stonework",
    "pastel colored bridal dress with light embroidery and subtle patterns",
    "dark colored bridal outfit with contrasting gold and silver embroidery",
]


# ---------------------------------------------------------------------------
# Furniture corpus — sofa, dining table, chair, bed, cupboard, wooden, modern,
# traditional, vintage, antique, oak, walnut, cushion, upholstery, carved
# ---------------------------------------------------------------------------
FURNITURE_CORPUS = [
    "modern wooden sofa set with cushion upholstery and carved arms",
    "traditional oak dining table with six chairs and antique finish",
    "vintage walnut bed with carved headboard and wooden slats",
    "antique wooden cupboard with brass handles and three shelves",
    "modern L-shaped sofa with fabric upholstery and foam cushions",
    "classic dining table set with wooden top and four cushioned chairs",
    "queen size wooden bed with storage drawers and modern headboard",
    "traditional carved wooden wardrobe with mirror and hanging rod",
    "antique oak coffee table with ornamental legs and polished surface",
    "modern fabric sofa with recliner and matching cushion set",
    "vintage wooden chair with cushion seat and carved backrest",
    "walnut dining table with extension leaf and six upholstered chairs",
    "wooden bunk bed with ladder and safety rails for kids bedroom",
    "traditional wooden dressing table with mirror and drawers",
    "modern glass-top dining table with steel legs and leather chairs",
    "antique wooden cabinet with glass doors and decorative carving",
    "oak wood TV stand with shelves and cable management",
    "vintage rocking chair with cushion and wooden armrests",
    "modern wooden bookshelf with five shelves and ladder design",
    "traditional carved bed with canopy frame and floral patterns",
    "modern fabric recliner sofa with adjustable headrest and cup holders",
    "antique walnut side table with single drawer and brass knob",
    "wooden bar cabinet with bottle racks and glass storage",
    "modern dining bench with cushion and wooden legs",
    "vintage wooden trunk storage chest with iron handles",
]


# ---------------------------------------------------------------------------
# Electronics corpus — LED TV, microwave, refrigerator, washing machine,
# blender, toaster, oven, air conditioner, fan, speaker, smart, 4K, HD,
# stainless steel
# ---------------------------------------------------------------------------
ELECTRONICS_CORPUS = [
    "55 inch 4K UHD smart LED TV with HDR and built-in WiFi",
    "stainless steel microwave oven with convection grill and 30 liter capacity",
    "double door refrigerator with inverter compressor and stainless steel finish",
    "fully automatic front load washing machine with 8kg capacity and quick wash",
    "professional blender with stainless steel blades and 1.5 liter jar",
    "4-slice toaster with browning control and removable crumb tray",
    "built-in electric oven with convection fan and digital controls",
    "1.5 ton inverter split air conditioner with HD filter and rapid cooling",
    "smart ceiling fan with remote control and energy efficient motor",
    "Bluetooth speaker with 20W output and 12 hour battery life",
    "65 inch 4K smart QLED TV with voice control and HDR10+",
    "stainless steel countertop microwave with grill and defrost function",
    "side-by-side refrigerator with water dispenser and frost free operation",
    "top load semi-automatic washing machine with twin tub and spin dryer",
    "hand blender with stainless steel attachments and variable speed",
    "toaster oven with air fry function and digital display",
    "electric oven with rotisserie and convection baking feature",
    "portable air conditioner with dehumidifier and remote control",
    "pedestal fan with high speed motor and adjustable height",
    "2.1 channel home theater speaker system with subwoofer and Bluetooth",
    "32 inch HD LED TV with USB playback and HDMI ports",
    "stainless steel microwave with sensor cook and auto defrost",
    "mini refrigerator with freezer compartment and energy star rating",
    "washing machine with steam wash and allergen removal cycle",
    "smart speaker with voice assistant and multi-room audio",
]


# ---------------------------------------------------------------------------
# Kitchen corpus — cooker, pot, pan, kettle, dinner set, glass, ceramic,
# stainless steel, non-stick, utensils, cutlery
# ---------------------------------------------------------------------------
KITCHEN_CORPUS = [
    "stainless steel pressure cooker with 5 liter capacity and safety valve",
    "non-stick frying pan with ceramic coating and wooden handle",
    "stainless steel cooking pot with glass lid and 3 liter capacity",
    "electric kettle with 1.7 liter capacity and automatic shut-off",
    "16 piece porcelain dinner set with floral pattern and gold rim",
    "ceramic non-stick cookware set with glass lids and wooden handles",
    "stainless steel cutlery set with 24 pieces and dishwasher safe",
    "glass mixing bowl set with four sizes and microwave safe",
    "copper bottom stainless steel pan with heat resistant handle",
    "cast iron Dutch oven with enamel coating and 5 quart capacity",
    "ceramic tea kettle with infuser and 1 liter capacity",
    "stainless steel utensil holder with kitchen tools and gadgets",
    "non-stick grill pan with ribbed surface and cast iron handle",
    "fine bone china dinner set with 12 pieces and elegant design",
    "stainless steel stockpot with pasta insert and 8 quart capacity",
    "ceramic bakeware set with casserole dish and ramekins",
    "stainless steel knife block set with sharp blades and wooden handles",
    "glass food storage containers with airtight lids and 10 piece set",
    "non-stick wok with stainless steel handle and 12 inch diameter",
    "stainless steel pressure cooker set with three sizes and induction base",
    "ceramic serving bowls with lids and stackable design",
    "stainless steel cutlery organizer with compartments and 30 pieces",
    "glass teapot with infuser and warming stand",
    "non-stick muffin pan with 12 cups and carbon steel construction",
    "stainless steel mixing spoon set with wooden handles and hanging loop",
]


# ---------------------------------------------------------------------------
# Decoration corpus — vase, mirror, painting, frame, lamp, chandelier,
# curtain, rug, carpet, cushion, decorative, ornamental
# ---------------------------------------------------------------------------
DECORATION_CORPUS = [
    "decorative crystal vase with floral pattern and gold trim",
    "ornate wall mirror with carved wooden frame and antique finish",
    "hand-painted canvas painting with floral motif and wooden frame",
    "decorative photo frame with golden border and ornamental design",
    "table lamp with fabric shade and brass base for living room",
    "crystal chandelier with five lights and ornamental metalwork",
    "sheer curtains with floral embroidery and rod pocket design",
    "Persian style area rug with intricate pattern and wool construction",
    "traditional handwoven carpet with floral motifs and rich colors",
    "decorative throw cushion with embroidered cover and tassel trim",
    "vintage decorative vase with ceramic glaze and ornamental handles",
    "antique floor mirror with carved wooden frame and full length",
    "abstract modern painting with vibrant colors and stretched canvas",
    "silver plated photo frame with ornamental scrollwork",
    "modern floor lamp with adjustable arm and LED bulb",
    "vintage brass chandelier with crystal drops and six arms",
    "velvet curtains with thermal lining and grommet top",
    "shag area rug with soft texture and non-slip backing",
    "oriental carpet with medallion design and hand-knotted wool",
    "silk decorative cushion with tassels and zip closure",
    "ornamental glass vase with hand-blown design and colored swirls",
    "decorative sunburst mirror with metal rays and gold finish",
    "landscape oil painting with wooden frame and ready to hang",
    "vintage picture frame with beaded edge and easel back",
    "ceramic table lamp with linen shade and decorative base",
]


# ---------------------------------------------------------------------------
# Miscellaneous corpus — gift, basket, accessory, assorted, mixed, various
# ---------------------------------------------------------------------------
MISC_CORPUS = [
    "assorted gift basket with chocolates snacks and decorative ribbon",
    "mixed wedding favour gift set with assorted small items",
    "various household accessories gift bundle with assorted items",
    "decorative gift hamper with mixed assortment of treats",
    "wicker basket with assorted fruit and gift wrapping",
    "wedding gift set with assorted accessories and ornamental packaging",
    "mixed lot of various small household accessories",
    "assorted decorative items gift pack with mixed variety",
    "gift basket with various snacks and assorted treats",
    "decorative accessory set with assorted mixed items",
    "assorted wedding favour box with mixed small gifts",
    "various gift items bundle with assorted themes",
    "mixed decorative basket with assorted ornamental pieces",
    "assorted household accessory pack with various items",
    "gift set with assorted mixed items and decorative box",
    "various assorted accessories in mixed gift bundle",
    "decorative mixed lot of various ornamental pieces",
    "assorted gift hamper with various treats and accessories",
    "mixed wedding accessory set with assorted items",
    "various assorted gift items in decorative packaging",
]


# Combined corpus used for fitting
ALL_CORPUS = (
    WEDDING_DRESS_CORPUS
    + FURNITURE_CORPUS
    + ELECTRONICS_CORPUS
    + KITCHEN_CORPUS
    + DECORATION_CORPUS
    + MISC_CORPUS
)


def main():
    # Bootstrap path so local imports work when run directly
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from tfidf_engine import fit_vectorizer, TFIDF_PKL_PATH

    print("=" * 60)
    print("  ShaadiSahulat — TF-IDF Corpus Vectorizer Fitter")
    print("=" * 60)
    print(f"  Wedding dress : {len(WEDDING_DRESS_CORPUS)} descriptions")
    print(f"  Furniture     : {len(FURNITURE_CORPUS)} descriptions")
    print(f"  Electronics   : {len(ELECTRONICS_CORPUS)} descriptions")
    print(f"  Kitchen       : {len(KITCHEN_CORPUS)} descriptions")
    print(f"  Decoration    : {len(DECORATION_CORPUS)} descriptions")
    print(f"  Miscellaneous : {len(MISC_CORPUS)} descriptions")
    print(f"  Total corpus  : {len(ALL_CORPUS)} descriptions")
    print(f"  Output        : {TFIDF_PKL_PATH}")
    print()

    vectorizer = fit_vectorizer(ALL_CORPUS)

    print()
    print(f"[done] Vocabulary size: {len(vectorizer.vocabulary_)} terms")
    print(f"[done] Saved to: {TFIDF_PKL_PATH}")
    print()
    print("Next step: python seed_catalog.py  (or --clear to force rebuild)")
    print("After re-seeding, also run:  python backfill_tfidf.py")
    print("  (to refresh tfidf_vector for any existing products that were")
    print("   uploaded before the vocabulary was expanded to non-dress categories)")


if __name__ == "__main__":
    main()
