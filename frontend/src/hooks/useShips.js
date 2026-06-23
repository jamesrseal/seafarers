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

export function useFilters() {
  const [options, setOptions] = useState({ statuses: [], flags: [], ports: [], countries: [] });

  useEffect(() => {
    fetch('/api/ships/filters')
      .then(r => r.json())
      .then(setOptions)
      .catch(() => {});
  }, []);

  return options;
}
