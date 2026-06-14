/**
 * Server-side API helpers for fetching product data.
 * These run on the Next.js server (Node.js), NOT in the browser.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const ML_URL      = process.env.ML_URL      || 'http://localhost:5002';

/**
 * Fetch a single product by its product_id.
 * Uses ISR (Incremental Static Regeneration) — revalidates every 60s.
 */
export async function fetchProduct(id) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/seller/product/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.product || data || null;
  } catch (err) {
    console.error('[fetchProduct] Error:', err.message);
    return null;
  }
}

/**
 * Fetch public products for a category (used on browse pages).
 */
export async function fetchPublicProducts({ major_category, page = 1, limit = 12, sort_by = 'newest' } = {}) {
  try {
    const params = new URLSearchParams();
    if (major_category) params.set('major_category', major_category);
    params.set('page', page);
    params.set('limit', limit);
    params.set('sort_by', sort_by);

    const res = await fetch(`${BACKEND_URL}/api/seller/products/public?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { products: [], total: 0 };
    const data = await res.json();
    return {
      products: data.products || [],
      total:    data.total || 0,
    };
  } catch (err) {
    console.error('[fetchPublicProducts] Error:', err.message);
    return { products: [], total: 0 };
  }
}

/**
 * Resolve an image URL from the ML service.
 * Converts relative paths to absolute URLs pointing at the Flask service.
 */
export function resolveImageUrl(imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${ML_URL}${imageUrl}`;
}
