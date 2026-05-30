import { useState, useEffect, useCallback } from 'react';

export function useShips(filters) {
  const [ships, setShips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchShips = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status)  params.set('status', filters.status);
    if (filters.flag)    params.set('flag', filters.flag);
    if (filters.port)    params.set('port', filters.port);
    if (filters.country) params.set('country', filters.country);
    if (filters.q)       params.set('q', filters.q);

    fetch(`/api/ships?${params}`)
      .then(r => r.json())
      .then(data => { setShips(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [filters.status, filters.flag, filters.port, filters.country, filters.q]);

  useEffect(() => { fetchShips(); }, [fetchShips]);

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
