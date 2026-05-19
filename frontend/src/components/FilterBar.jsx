export default function FilterBar({ filters, setFilters, options, total }) {
  function set(key) {
    return (e) => setFilters(f => ({ ...f, [key]: e.target.value }));
  }

  function clear() {
    setFilters({ status: '', flag: '', port: '', q: '' });
  }

  const hasFilter = filters.status || filters.flag || filters.port || filters.q;

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
          <option value="">All flags</option>
          {options.flags.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <select
          value={filters.port}
          onChange={set('port')}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All ports</option>
          {options.ports.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {hasFilter && (
          <button
            onClick={clear}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-sm text-gray-500">{total} records</span>
      </div>
    </div>
  );
}
