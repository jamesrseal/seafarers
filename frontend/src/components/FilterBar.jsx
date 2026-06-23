import { useState } from 'react';
import { downloadShipsCsv } from '../utils/exportCsv';

function ExportButton({ ships, className }) {
  return (
    <button
      onClick={() => downloadShipsCsv(ships)}
      disabled={!ships.length}
      title="Download the current results as CSV"
      className={className}
    >
      Export CSV
    </button>
  );
}

// Build a facet's <option> data: each still-available value with its count.
// Keep the active value selectable even if it dropped to 0 under the other
// filters — otherwise the controlled <select> would have no matching option
// (the trap that previously froze the Status filter on Unresolved).
function facetOptions(facet, selected) {
  const values = facet.values;
  if (selected && !values.some(v => v.value === selected)) {
    return [...values, { value: selected, count: 0 }];
  }
  return values;
}

const withCount = (label, count) => `${label} (${count.toLocaleString()})`;

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

export default function FilterBar({ filters, setFilters, ships, facets, total, onClearAll }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasFilter = Object.values(filters).some(Boolean);
  const activeCount = Object.values(filters).filter(Boolean).length;

  // Filters combine (status AND flag AND port/country AND search). The dropdown
  // options and counts come from /api/ships/facets, computed for each facet from
  // the OTHER active filters, so each list shows only what's still available
  // (and "All" shows the total with that facet removed).

  function set(key) {
    return (e) => {
      const value = e.target.value;
      // Merge so filters stack instead of replacing each other. Port and country
      // are hierarchical and the API treats port as the more specific of the
      // two, so keep them from contradicting each other.
      const next = { ...filters, [key]: value };
      if (key === 'country') next.port = '';
      if (key === 'port') next.country = '';
      setFilters(next);
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
            <option value="">{withCount('All', facets.status.total)}</option>
            {facetOptions(facets.status, filters.status).map(({ value, count }) => (
              <option key={value} value={value}>{withCount(value, count)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Flag</label>
          <select value={filters.flag} onChange={set('flag')} className={selectClass(!!filters.flag, full)}>
            <option value="">{withCount('All', facets.flag.total)}</option>
            {facetOptions(facets.flag, filters.flag).map(({ value, count }) => (
              <option key={value} value={value}>{withCount(value, count)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Country of abandonment</label>
          <select value={filters.country} onChange={set('country')} className={selectClass(!!filters.country, full)}>
            <option value="">{withCount('All', facets.country.total)}</option>
            {facetOptions(facets.country, filters.country).map(({ value, count }) => (
              <option key={value} value={value}>{withCount(value, count)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Port</label>
          <select value={filters.port} onChange={set('port')} className={selectClass(!!filters.port, full)}>
            <option value="">{withCount('All', facets.port.total)}</option>
            {facetOptions(facets.port, filters.port).map(({ value, count }) => (
              <option key={value} value={value}>{withCount(value, count)}</option>
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
            <ExportButton
              ships={ships}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default"
            />
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
            <ExportButton
              ships={ships}
              className="w-full py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            />
          </div>
        </div>
      )}
    </>
  );
}
