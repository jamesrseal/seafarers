import { useState, useEffect } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import Map from './components/Map';
import ShipTable from './components/ShipTable';
import ShipDetail from './components/ShipDetail';
import Dashboard from './components/Dashboard';
import ReportForm from './components/ReportForm';
import { useShips, useFacets } from './hooks/useShips';
import { readStateFromUrl, writeStateToUrl, EMPTY_FILTERS } from './utils/urlState';

const VIEWS = [
  ['map', 'Map', 'Map'],
  ['split', 'Map + Table', 'Split'],
  ['table', 'Table', 'Table'],
  ['dashboard', 'Dashboard', 'Stats'],
  ['report', 'Report Seafarer Abandonment', 'Report'],
];

export default function App() {
  const initial = readStateFromUrl();
  const [filters, setFilters] = useState(initial.filters);
  const [selectedShip, setSelectedShip] = useState(null);
  const [highlightedShip, setHighlightedShip] = useState(null);
  const [view, setView] = useState(initial.view);
  // Holds the deep-linked ship id until its detail has loaded, so the URL keeps
  // ?ship=N during the fetch instead of momentarily dropping it.
  const [pendingShip, setPendingShip] = useState(initial.ship);

  const { ships, loading, error } = useShips(filters);
  const facets = useFacets(filters);

  // Deep link: if the URL names a ship, load it and open its detail on mount.
  useEffect(() => {
    if (!initial.ship) return;
    fetch(`/api/ships/${initial.ship}`)
      .then(r => (r.ok ? r.json() : null))
      // Don't clobber a ship the user opened manually before the fetch resolved.
      .then(ship => { if (ship) setSelectedShip(prev => prev ?? ship); })
      .catch(() => {})
      .finally(() => setPendingShip(null));
  }, []);

  // Keep the address bar in sync so every view is a shareable link.
  useEffect(() => {
    writeStateToUrl({ filters, view, ship: selectedShip?.abandonment_id ?? pendingShip });
  }, [filters, view, selectedShip, pendingShip]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      {view !== 'report' && <FilterBar
        filters={filters}
        setFilters={(f) => { setFilters(f); setHighlightedShip(null); }}
        ships={ships}
        facets={facets}
        total={ships.length}
        onClearAll={() => {
          setFilters(EMPTY_FILTERS);
          setHighlightedShip(null);
          setSelectedShip(null);
        }}
      />}

      {/* View toggle — horizontally scrollable on small screens */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-1.5">
        <div className="max-w-7xl mx-auto flex gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
          {VIEWS.map(([v, label, shortLabel]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-current={view === v}
              className={`text-xs px-3 py-1 rounded shrink-0 ${view === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'report' ? (
        <ReportForm />
      ) : view === 'dashboard' ? (
        <Dashboard />
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
          <p className="text-gray-600">Couldn’t load the data.</p>
          <p className="text-xs text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <div className={`flex-1 overflow-hidden flex ${view === 'table' ? 'flex-col' : view === 'split' ? 'flex-col sm:flex-row' : 'flex-row'}`}>
          {view !== 'table' && (
            <div className={view === 'split' ? 'flex-1 min-h-0' : 'flex-1'}>
              <Map ships={ships} onSelect={setSelectedShip} highlighted={highlightedShip} view={view} portFilter={filters.port} countryFilter={filters.country} onShowUnmapped={() => setView('table')} />
            </div>
          )}
          {view !== 'map' && (
            <div className={`${view === 'split' ? 'sm:w-1/2 flex-1 min-h-0 border-t sm:border-t-0 sm:border-l border-gray-200' : 'flex-1'} overflow-hidden`}>
              <ShipTable
                ships={ships}
                onSelect={(ship) => {
                  // No dot on the map to click (missing/zero coords) → open the
                  // detail panel directly, since there's no marker to reach it.
                  if (ship && !(ship.port_latitude && ship.port_longitude)) {
                    setSelectedShip(ship);
                    return;
                  }
                  // Otherwise highlight the dot on the map; clicking it opens detail.
                  setHighlightedShip(ship);
                  if (ship) { setView('split'); setSelectedShip(null); }
                }}
                highlighted={highlightedShip}
              />
            </div>
          )}
        </div>
      )}

      <ShipDetail ship={selectedShip} onClose={() => setSelectedShip(null)} />

      <footer className="shrink-0 bg-gray-50 border-t border-gray-200 px-6 py-1.5 text-center text-xs text-gray-400">
        Disclaimer: This site is not affiliated with the ILO/IMO Joint Database on Abandonment of Seafarers and takes no responsibility for maintaining, updating, or reporting on abandoned seafarers.
      </footer>
    </div>
  );
}
