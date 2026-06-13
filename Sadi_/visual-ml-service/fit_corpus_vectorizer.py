"""
ShaadiSahulat - TF-IDF Corpus Vectorizer Fitter
=================================================
Run this ONCE before seed_catalog.py to create a stable TF-IDF vocabulary
from a representative wedding-dress corpus.

Problem it solves
-----------------
If the vectorizer is fitted on the catalog images alone, re-running
seed_catalog.py rebuilds the vocabulary and makes old TF-IDF vectors
incompatible with new ones.  This script fits on a fixed, hard-coded
corpus that covers all vocabulary we will ever encounter, so the pkl
stays stable across catalog rebuilds and seller product additions.

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
# Representative corpus — covers colours, fabrics, embroidery types, silhouettes
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


def main():
    # Bootstrap path so local imports work when run directly
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from tfidf_engine import fit_vectorizer, TFIDF_PKL_PATH

    print("=" * 60)
    print("  ShaadiSahulat — TF-IDF Corpus Vectorizer Fitter")
    print("=" * 60)
    print(f"  Corpus size : {len(WEDDING_DRESS_CORPUS)} descriptions")
    print(f"  Output      : {TFIDF_PKL_PATH}")
    print()

    vectorizer = fit_vectorizer(WEDDING_DRESS_CORPUS)

    print()
    print(f"[done] Vocabulary size: {len(vectorizer.vocabulary_)} terms")
    print(f"[done] Saved to: {TFIDF_PKL_PATH}")
    print()
    print("Next step: python seed_catalog.py  (or --clear to force rebuild)")


if __name__ == "__main__":
    main()
