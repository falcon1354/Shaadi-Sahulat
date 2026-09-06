import { useState, useEffect, useCallback, useMemo } from 'react';

const BASE = 'http://localhost:5000/api/categories';
const BACKEND_BASE = 'http://localhost:5000';  // for resolving admin-uploaded icon paths

let _cache = null;
let _promise = null;
let _error = null;

function fetchCategories() {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = fetch(BASE)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to fetch categories: ${r.status}`);
        return r.json();
      })
      .then(d => { _cache = d.categories || []; return _cache; })
      .catch(err => {
        _error = err?.message || 'Failed to load categories';
        _promise = null;
        return [];
      });
  }
  return _promise;
}

export function invalidateCategoryCache() {
  _cache = null;
  _promise = null;
  _error = null;
}

/**
 * Resolve a category.icon value into a usable URL.
 *
 * AdminCategory.icon can hold either:
 *   - an emoji string (e.g. "📦") — return null so the caller renders it inline
 *   - a path like "Categories/<id>.png" or "/uploads/Categories/..." — return a fully-qualified URL
 *
 * Returns null for emoji / unknown icons so the caller can decide on a fallback.
 */
export function resolveCategoryIconUrl(icon) {
  if (!icon || typeof icon !== 'string') return null;
  const trimmed = icon.trim();
  // Already a fully-qualified URL
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Looks like a path (contains "/" or ends with image extension)
  if (trimmed.includes('/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(trimmed)) {
    // Normalise: strip leading "uploads/" or leading slash to build the URL
    let path = trimmed
      .replace(/^\/+/, '')
      .replace(/^uploads\/?/i, '');
    return `${BACKEND_BASE}/uploads/${path}`;
  }
  // Not a path → likely an emoji or short label
  return null;
}

export function useCategories() {
  const [categories, setCategories] = useState(_cache || []);
  const [isLoading, setLoading] = useState(!_cache);
  const [error, setError] = useState(_error || null);

  useEffect(() => {
    let mounted = true;
    fetchCategories().then(cats => {
      if (!mounted) return;
      setCategories(cats);
      setLoading(false);
      setError(_error);
    });
    return () => { mounted = false; };
  }, []);

  // Map of categoryId → subcategories array (memoised)
  const subcategoriesByCategory = useMemo(() => {
    const map = {};
    for (const c of categories) {
      map[c.category_id] = Array.isArray(c.subcategories) ? c.subcategories : [];
    }
    return map;
  }, [categories]);

  const getSubcategoriesFor = useCallback((categoryId) => {
    if (!categoryId) return [];
    const found = categories.find(c => c.category_id === categoryId);
    return Array.isArray(found?.subcategories) ? found.subcategories : [];
  }, [categories]);

  const getCategoryIcon = useCallback((categoryId) => {
    const found = categories.find(c => c.category_id === categoryId);
    if (!found?.icon) return null;
    return resolveCategoryIconUrl(found.icon);
  }, [categories]);

  return {
    categories,
    subcategoriesByCategory,
    getCategoryIcon,
    getSubcategoriesFor,
    isLoading,
    error,
    // Back-compat aliases (older consumers used `loading`)
    loading: isLoading,
  };
}

export default useCategories;
