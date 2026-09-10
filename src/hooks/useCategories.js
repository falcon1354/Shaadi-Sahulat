import { useState, useEffect, useCallback, useMemo } from 'react';
import { isRetiredCategory } from '../lib/dowryDisplay';

const BASE = 'http://localhost:5000/api/categories';
const BACKEND_BASE = 'http://localhost:5000';

const _cacheByKey = {};
const _promiseByKey = {};
let _error = null;

function cacheKey(includeInactive) {
  return includeInactive ? 'all' : 'active';
}

function fetchCategories(includeInactive = false) {
  const key = cacheKey(includeInactive);
  if (_cacheByKey[key]) return Promise.resolve(_cacheByKey[key]);
  if (!_promiseByKey[key]) {
    const qs = includeInactive ? '?include_inactive=1' : '';
    _promiseByKey[key] = fetch(`${BASE}${qs}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to fetch categories: ${r.status}`);
        return r.json();
      })
      .then(d => {
        _cacheByKey[key] = (d.categories || []).filter(c => !isRetiredCategory(c.category_id, c.label));
        return _cacheByKey[key];
      })
      .catch(err => {
        _error = err?.message || 'Failed to load categories';
        _promiseByKey[key] = null;
        return [];
      });
  }
  return _promiseByKey[key];
}

export function invalidateCategoryCache() {
  Object.keys(_cacheByKey).forEach(k => { delete _cacheByKey[k]; });
  Object.keys(_promiseByKey).forEach(k => { delete _promiseByKey[k]; });
  _error = null;
}

/**
 * Resolve a category.icon / placeholder_image value into a usable URL.
 */
export function resolveCategoryIconUrl(icon) {
  if (!icon || typeof icon !== 'string') return null;
  const trimmed = icon.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.includes('/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(trimmed)) {
    let path = trimmed
      .replace(/^\/+/, '')
      .replace(/^uploads\/?/i, '');
    return `${BACKEND_BASE}/uploads/${path}`;
  }
  return null;
}

/** Prefer Cloudinary placeholder, then icon path/URL. */
export function resolveCategoryPlaceholderUrl(cat) {
  if (!cat) return null;
  return (
    cat.placeholder_url ||
    resolveCategoryIconUrl(cat.placeholder_image) ||
    resolveCategoryIconUrl(cat.icon_url) ||
    resolveCategoryIconUrl(cat.icon) ||
    null
  );
}

/**
 * @param {{ includeInactive?: boolean }} [options]
 * includeInactive — soft-deleted categories (for Dowry Fine-Tune / dashboard)
 */
export function useCategories(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const key = cacheKey(includeInactive);
  const [categories, setCategories] = useState(_cacheByKey[key] || []);
  const [isLoading, setLoading] = useState(!_cacheByKey[key]);
  const [error, setError] = useState(_error || null);

  useEffect(() => {
    let mounted = true;
    setLoading(!_cacheByKey[key]);
    fetchCategories(includeInactive).then(cats => {
      if (!mounted) return;
      setCategories(cats);
      setLoading(false);
      setError(_error);
    });
    return () => { mounted = false; };
  }, [includeInactive, key]);

  const subcategoriesByCategory = useMemo(() => {
    const map = {};
    for (const c of categories) {
      map[c.category_id] = Array.isArray(c.subcategories) ? c.subcategories : [];
    }
    return map;
  }, [categories]);

  const activeCategories = useMemo(
    () => categories.filter(c => c.is_active !== false),
    [categories]
  );

  const getSubcategoriesFor = useCallback((categoryId) => {
    if (!categoryId) return [];
    const found = categories.find(c => c.category_id === categoryId);
    return Array.isArray(found?.subcategories) ? found.subcategories : [];
  }, [categories]);

  const getCategoryIcon = useCallback((categoryId) => {
    const found = categories.find(c => c.category_id === categoryId);
    return resolveCategoryPlaceholderUrl(found);
  }, [categories]);

  return {
    categories,
    activeCategories,
    subcategoriesByCategory,
    getCategoryIcon,
    getSubcategoriesFor,
    isLoading,
    error,
    loading: isLoading,
  };
}

export default useCategories;
