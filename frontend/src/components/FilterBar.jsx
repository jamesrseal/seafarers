function portCountry(port) {
  if (!port) return null;
  const parts = port.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

const EMPTY = { status: '', flag: '', port: '', country: '', q: '' };

function derived(ships, key) {
  return [...new Set(ships.map(s => s[key]).filter(Boolean))].sort();
}

export default function FilterBar({ filters, setFilters, ships, options, total, onClearAll }) {
  const hasFilter = Object.values(filters).some(Boolean);

  // When a filter is active, narrow the other dropdowns to values present in the filtered results.
  // When no filter is active, show the full static lists.
  const visibleFlags = (() => {
    const base = hasFilter ? ships : null;
    const known = base ? derived(base, 'flag') : options.flags.filter(f => f !== 'Unknown');
    const hasUnknown = base
      ? base.some(s => !s.flag)
      : options.flags.includes('Unknown');
    return [...known, ...(hasUnknown ? ['Unknown'] : [])];
  })();
  const visiblePorts    = hasFilter
    ? derived(ships, 'port_of_abandonment')
    : filters.country
      ? options.ports.filter(p => portCountry(p) === filters.country)
      : options.ports;
  const visibleCountries = hasFilter
    ? [...new Set(derived(ships, 'port_of_abandonment').map(portCountry).filter(Boolean))].sort()
    : (options.countries ?? []);
  const visibleStatuses = hasFilter ? derived(ships, 'ship_status') : options.statuses;

  function set(key) {
    return (e) => {
      const value = e.target.value;
      setFilters(value ? { ...EMPTY, [key]: value } : { ...EMPTY });
    };
  }

  function setCountry(e) {
    setFilters({ ...EMPTY, country: e.target.value });
  }

  const STATUS_LABELS = { '': 'Unresolved', disputed: 'Disputed', inactive: 'Inactive', resolved: 'Resolved' };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search ship name or circumstances…"
          value={filters.q}
          onChange={set('q')}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <select
          value={filters.status}
          onChange={set('status')}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All statuses</option>
          {visibleStatuses.map(s => (
            <option key={s} value={STATUS_LABELS[s] ?? s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>

        <select
          value={filters.flag}
          onChange={set('flag')}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All flags (registration)</option>
          {visibleFlags.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <select
          value={filters.country}
          onChange={setCountry}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All countries (abandonment)</option>
          {visibleCountries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filters.port}
          onChange={set('port')}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All ports</option>
          {visiblePorts.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <button
          onClick={onClearAll}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          Reset
        </button>

        <span className="ml-auto text-sm text-gray-500">{total} records</span>
      </div>
    </div>
  );
}
