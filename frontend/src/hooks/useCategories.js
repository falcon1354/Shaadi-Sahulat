import { useState, useEffect } from 'react';

const BASE = 'http://localhost:5000/api/categories';

let _cache = null;
let _promise = null;

function fetchCategories() {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = fetch(BASE)
      .then(r => r.json())
      .then(d => { _cache = d.categories || []; return _cache; })
      .catch(() => { _promise = null; return []; });
  }
  return _promise;
}

export function invalidateCategoryCache() {
  _cache = null;
  _promise = null;
}

export function useCategories() {
  const [categories, setCategories] = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    fetchCategories().then(cats => {
      setCategories(cats);
      setLoading(false);
    });
  }, []);

  return { categories, loading };
}
