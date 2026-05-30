function portCountry(port) {
  if (!port) return null;
  const parts = port.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

export default function FilterBar({ filters, setFilters, options, total, onClearAll }) {
  function set(key) {
    return (e) => setFilters(f => ({ ...f, [key]: e.target.value }));
  }

  function setCountry(e) {
    const country = e.target.value;
    setFilters(f => ({
      ...f,
      country,
      // clear port if it belongs to a different country
      port: country && f.port && portCountry(f.port) !== country ? '' : f.port,
    }));
  }

  const visiblePorts = filters.country
    ? options.ports.filter(p => portCountry(p) === filters.country)
    : options.ports;

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
          {options.statuses.map(s => (
            <option key={s} value={s}>{s || '(Active)'}</option>
          ))}
        </select>

        <select
          value={filters.flag}
          onChange={set('flag')}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All flags (registration)</option>
          {options.flags.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <select
          value={filters.country}
          onChange={setCountry}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All countries (abandonment)</option>
          {(options.countries ?? []).map(c => (
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
