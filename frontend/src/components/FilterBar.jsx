import { useState } from 'react';

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

function selectClass(active, full = false) {
  return `${full ? 'w-full' : 'w-40'} border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
    active ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700'
  }`;
}

function inputClass(active, full = false) {
  return `${full ? 'w-full' : 'w-56'} border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
    active ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700'
  }`;
}

export default function FilterBar({ filters, setFilters, ships, options, total, onClearAll }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasFilter = Object.values(filters).some(Boolean);
  const activeCount = Object.values(filters).filter(Boolean).length;

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

  // Shared filter inputs — rendered in both desktop bar and mobile drawer
  function filterInputs(full = false) {
    return (
      <>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Search</label>
          <input
            type="text"
            placeholder="Ship name or circumstances…"
            value={filters.q}
            onChange={set('q')}
            className={inputClass(!!filters.q, full)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Status</label>
          <select value={filters.status} onChange={set('status')} className={selectClass(!!filters.status, full)}>
            <option value="">All</option>
            {visibleStatuses.map(s => (
              <option key={s} value={STATUS_LABELS[s] ?? s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Flag</label>
          <select value={filters.flag} onChange={set('flag')} className={selectClass(!!filters.flag, full)}>
            <option value="">All</option>
            {visibleFlags.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Country of abandonment</label>
          <select value={filters.country} onChange={set('country')} className={selectClass(!!filters.country, full)}>
            <option value="">All</option>
            {visibleCountries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Port</label>
          <select value={filters.port} onChange={set('port')} className={selectClass(!!filters.port, full)}>
            <option value="">All</option>
            {visiblePorts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Desktop bar (sm and up) ── */}
      <div className="hidden sm:block bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-end gap-3">
          {filterInputs(false)}
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

      {/* ── Mobile trigger bar ── */}
      <div className="sm:hidden bg-white border-b border-gray-200 shadow-sm px-4 py-2.5 flex items-center justify-between">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M10 12h4" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="ml-1 bg-blue-600 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">
              {activeCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{total} records</span>
          {hasFilter && (
            <button onClick={onClearAll} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-[2000] flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />

          {/* Sheet */}
          <div className="relative bg-white rounded-t-2xl shadow-2xl px-5 pt-4 pb-8 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-gray-900">Filters</h3>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {filterInputs(true)}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setDrawerOpen(false); }}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Show {total} results
              </button>
              {hasFilter && (
                <button
                  onClick={() => { onClearAll(); setDrawerOpen(false); }}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
