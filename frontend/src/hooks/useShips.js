import { useState, useEffect } from 'react';
import { FILTER_KEYS } from '../utils/urlState';

// Debounce a fast-changing value (used for the free-text search box).
function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// The filters as an /api/ships query string. Only the search term is debounced,
// so typing doesn't fire a request per keystroke while the dropdowns still apply
// immediately. Effects depend on the string, so they rerun only when it changes.
function useFilterQuery(filters) {
  const debouncedQ = useDebounced(filters.q, 300);
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = key === 'q' ? debouncedQ : filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function useShips(filters) {
  const [ships, setShips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const query = useFilterQuery(filters);

  useEffect(() => {
    // Abort the previous request when filters change so a slow, stale response
    // can't land after a newer one and overwrite the displayed results.
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/ships?${query}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setShips(data); setLoading(false); })
      .catch(err => {
        if (err.name === 'AbortError') return; // superseded by a newer request
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  return { ships, loading, error };
}

const EMPTY_FACET = { total: 0, values: [] };
const EMPTY_FACETS = Object.fromEntries(
  ['status', 'flag', 'country', 'port', 'nationality', 'vessel', 'payment', 'repatriation'].map(k => [k, EMPTY_FACET]),
);

// Faceted option lists with result counts. Recomputed whenever filters change;
// each facet reflects the other active filters (see /api/ships/facets). Keeps
// the previous result during a refetch so counts don't flicker while typing.
export function useFacets(filters) {
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const query = useFilterQuery(filters);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ships/facets?${query}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setFacets(data); })
      .catch(() => {}); // AbortError or fetch failure — keep the last facets

    return () => controller.abort();
  }, [query]);

  return facets;
}
