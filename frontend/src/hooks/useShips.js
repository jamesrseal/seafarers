import { useState, useEffect } from 'react';

// Debounce a fast-changing value (used for the free-text search box).
function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useShips(filters) {
  const [ships, setShips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Debounce only the search term so typing doesn't fire a request per
  // keystroke; dropdown filters still apply immediately.
  const debouncedQ = useDebounced(filters.q, 300);

  useEffect(() => {
    // Abort the previous request when filters change so a slow, stale response
    // can't land after a newer one and overwrite the displayed results.
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.status)  params.set('status', filters.status);
    if (filters.flag)    params.set('flag', filters.flag);
    if (filters.port)    params.set('port', filters.port);
    if (filters.country) params.set('country', filters.country);
    if (debouncedQ)      params.set('q', debouncedQ);

    fetch(`/api/ships?${params}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setShips(data); setLoading(false); })
      .catch(err => {
        if (err.name === 'AbortError') return; // superseded by a newer request
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [filters.status, filters.flag, filters.port, filters.country, debouncedQ]);

  return { ships, loading, error };
}

const EMPTY_FACETS = {
  status:  { total: 0, values: [] },
  flag:    { total: 0, values: [] },
  country: { total: 0, values: [] },
  port:    { total: 0, values: [] },
};

// Faceted option lists with result counts. Recomputed whenever filters change;
// each facet reflects the other active filters (see /api/ships/facets). Keeps
// the previous result during a refetch so counts don't flicker while typing.
export function useFacets(filters) {
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const debouncedQ = useDebounced(filters.q, 300);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.status)  params.set('status', filters.status);
    if (filters.flag)    params.set('flag', filters.flag);
    if (filters.port)    params.set('port', filters.port);
    if (filters.country) params.set('country', filters.country);
    if (debouncedQ)      params.set('q', debouncedQ);

    fetch(`/api/ships/facets?${params}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setFacets(data); })
      .catch(() => {}); // AbortError or fetch failure — keep the last facets

    return () => controller.abort();
  }, [filters.status, filters.flag, filters.port, filters.country, debouncedQ]);

  return facets;
}
