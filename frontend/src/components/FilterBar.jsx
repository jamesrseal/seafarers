import { useState } from 'react';
import { downloadShipsCsv } from '../utils/exportCsv';

// Reopens the welcome message, which explains the map and how to read it.
function HelpButton({ onClick, className }) {
  return (
    <button
      onClick={onClick}
      aria-label="How to use this site"
      title="How to use this site"
      className={className}
    >
      {/* An info circle, from SVG Repo (svgrepo.com/svg/511031/info). */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="w-5 h-5"
      >
        <path d="M12 11V16M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21ZM12.0498 8V8.1L11.9502 8.1002V8H12.0498Z" />
      </svg>
    </button>
  );
}

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

// The search box fills its wrapper, which is what varies: fixed in the drawer,
// flexible in the desktop bar so the row's buttons never wrap to a line of
// their own when Reset appears.
function inputClass(active) {
  return `w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
    active ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700'
  }`;
}

// [filter key, label]. The key names the filter, its facet and its URL
// parameter. The first row always shows; the second is behind "More filters".
const PRIMARY = [
  ['status', 'Status'],
  ['flag', 'Flag'],
  ['country', 'Country of abandonment'],
  ['port', 'Port'],
];
const SECONDARY = [
  ['nationality', 'Crew nationality'],
  ['vessel', 'Vessel type'],
  ['payment', 'Payment'],
  ['repatriation', 'Repatriation'],
];

function FacetSelect({ label, facet, value, onChange, full }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</label>
      <select value={value} onChange={onChange} className={selectClass(!!value, full)}>
        <option value="">{withCount('All', facet.total)}</option>
        {facetOptions(facet, value).map(o => (
          <option key={o.value} value={o.value}>{withCount(o.value, o.count)}</option>
        ))}
      </select>
    </div>
  );
}

// Shows and hides the second row. The badge counts the filters set in it, so
// they stay visible while it's closed. On desktop it's a quiet line under the
// first row, styled like the labels: the first row has no width to spare, and
// a button in it would push Export and Reset onto a line of their own. In the
// drawer it's a full-width button.
function MoreToggle({ open, active, onClick, full }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={full
        ? 'w-full flex items-center justify-between px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50'
        : 'flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-800'}
    >
      <span className="flex items-center gap-1.5">
        More filters
        {active > 0 && (
          <span className="bg-blue-600 text-white text-xs font-semibold normal-case tracking-normal rounded-full px-1.5 py-0.5 leading-none">
            {active}
          </span>
        )}
      </span>
      <svg
        className={`${full ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

export default function FilterBar({ filters, setFilters, ships, facets, total, onClearAll, onShowWelcome }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasFilter = Object.values(filters).some(Boolean);
  const activeCount = Object.values(filters).filter(Boolean).length;
  // Before a refresh has captured the ILO fields their facets are empty, so the
  // second row's filters, and the toggle, stay hidden.
  const secondary = SECONDARY.filter(([key]) => facets[key].values.length || filters[key]);
  const activeSecondary = SECONDARY.filter(([key]) => filters[key]).length;
  // Open from the start when a link arrives with one of them set.
  const [moreOpen, setMoreOpen] = useState(activeSecondary > 0);

  // Filters combine: every dropdown AND the search, with port and country as
  // one. The dropdown options and counts come from /api/ships/facets, computed
  // for each facet from the OTHER active filters, so each list shows only what's
  // still available
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

  const select = (full) => ([key, label]) => (
    <FacetSelect key={key} label={label} facet={facets[key]} value={filters[key]} onChange={set(key)} full={full} />
  );

  // Shared filter inputs — rendered in both desktop bar and mobile drawer
  function filterInputs(full = false) {
    return (
      <>
        <div className={`flex flex-col gap-1 ${full ? '' : 'flex-1 min-w-[11rem] max-w-56'}`}>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Search</label>
          <input
            type="text"
            placeholder="Ship, insurer or circumstances…"
            value={filters.q}
            onChange={set('q')}
            className={inputClass(!!filters.q)}
          />
        </div>
        {PRIMARY.map(select(full))}
      </>
    );
  }

  function moreToggle(full = false) {
    if (!secondary.length) return null;
    return <MoreToggle open={moreOpen} active={activeSecondary} onClick={() => setMoreOpen(o => !o)} full={full} />;
  }

  const moreInputs = (full = false) => (moreOpen ? secondary.map(select(full)) : null);

  return (
    <>
      {/* ── Desktop bar (sm and up) ── */}
      <div className="hidden sm:block bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            {filterInputs(false)}
            <div className="flex items-end gap-3 ml-auto shrink-0">
              <span className="text-sm text-gray-500 pb-1.5">{total} {total === 1 ? 'case' : 'cases'}</span>
              <ExportButton
                ships={ships}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default"
              />
              <HelpButton
                onClick={onShowWelcome}
                className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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
          {moreToggle(false)}
          {moreOpen && secondary.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">{moreInputs(false)}</div>
          )}
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
          <span className="text-sm text-gray-500">{total} {total === 1 ? 'case' : 'cases'}</span>
          {hasFilter && (
            <button onClick={onClearAll} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Reset
            </button>
          )}
          {/* Export CSV lives in the drawer on phones, so the help sits out here instead. */}
          <HelpButton onClick={onShowWelcome} className="p-1 text-gray-500 hover:text-gray-700" />
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
            {moreToggle(true)}
            {moreInputs(true)}

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
