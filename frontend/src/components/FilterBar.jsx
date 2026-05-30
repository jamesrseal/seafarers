function portCountry(port) {
  if (!port) return null;
  const parts = port.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

const EMPTY = { status: '', flag: '', port: '', country: '', q: '' };

function derived(ships, key) {
  return [...new Set(ships.map(s => s[key]).filter(Boolean))].sort();
}

const STATUS_LABELS = { '': 'Unresolved', disputed: 'Disputed', inactive: 'Inactive', resolved: 'Resolved' };

function selectClass(active) {
  return `w-40 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
    active ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700'
  }`;
}

export default function FilterBar({ filters, setFilters, ships, options, total, onClearAll }) {
  const hasFilter = Object.values(filters).some(Boolean);

  const visibleFlags = (() => {
    const base = hasFilter ? ships : null;
    const known = base ? derived(base, 'flag') : options.flags.filter(f => f !== 'Unknown');
    const hasUnknown = base ? base.some(s => !s.flag) : options.flags.includes('Unknown');
    return [...known, ...(hasUnknown ? ['Unknown'] : [])];
  })();
  const visiblePorts = hasFilter
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

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-end gap-3">

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Search</label>
          <input
            type="text"
            placeholder="Ship name or circumstances…"
            value={filters.q}
            onChange={set('q')}
            className={`w-56 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              filters.q ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700'
            }`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Status</label>
          <select value={filters.status} onChange={set('status')} className={selectClass(!!filters.status)}>
            <option value="">All</option>
            {visibleStatuses.map(s => (
              <option key={s} value={STATUS_LABELS[s] ?? s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Flag</label>
          <select value={filters.flag} onChange={set('flag')} className={selectClass(!!filters.flag)}>
            <option value="">All</option>
            {visibleFlags.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Country of abandonment</label>
          <select value={filters.country} onChange={set('country')} className={selectClass(!!filters.country)}>
            <option value="">All</option>
            {visibleCountries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Port</label>
          <select value={filters.port} onChange={set('port')} className={selectClass(!!filters.port)}>
            <option value="">All</option>
            {visiblePorts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-3 ml-auto">
          <span className="text-sm text-gray-500 pb-1.5">{total} records</span>
          {hasFilter && (
            <button
              onClick={onClearAll}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Reset
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
