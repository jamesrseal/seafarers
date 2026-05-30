import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import Map from './components/Map';
import ShipTable from './components/ShipTable';
import ShipDetail from './components/ShipDetail';
import NoShipsModal from './components/NoShipsModal';
import { useShips, useFilters } from './hooks/useShips';

const EMPTY_FILTERS = { status: '', flag: '', port: '', country: '', q: '' };

export default function App() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [lastFilter, setLastFilter] = useState(null); // { key, value }
  const [selectedShip, setSelectedShip] = useState(null);
  const [highlightedShip, setHighlightedShip] = useState(null);
  const [view, setView] = useState('map');

  const { ships, loading } = useShips(filters);
  const filterOptions = useFilters();

  // Track which filter was most recently set to a non-empty value
  const prevFilters = useRef(filters);
  useEffect(() => {
    const changed = Object.entries(filters).find(
      ([k, v]) => v && v !== prevFilters.current[k]
    );
    if (changed) setLastFilter({ key: changed[0], value: changed[1] });
    prevFilters.current = filters;
  }, [filters]);

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const showNoShips = !loading && ships.length === 0 && hasActiveFilters;

  function clearAll() {
    setFilters(EMPTY_FILTERS);
    setLastFilter(null);
    setHighlightedShip(null);
    setSelectedShip(null);
  }

  function clearLast() {
    if (!lastFilter) return;
    setFilters(f => ({ ...f, [lastFilter.key]: '' }));
    setLastFilter(null);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <FilterBar
        filters={filters}
        setFilters={(f) => { setFilters(f); setHighlightedShip(null); }}
        options={filterOptions}
        total={ships.length}
        onClearAll={clearAll}
      />

      {/* View toggle */}
      <div className="bg-white border-b border-gray-200 px-6 py-1.5">
        <div className="max-w-7xl mx-auto flex gap-2">
          {[['map', 'Map'], ['split', 'Map + Table'], ['table', 'Table']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-3 py-1 rounded ${view === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <div className={`flex-1 overflow-hidden flex ${view === 'table' ? 'flex-col' : 'flex-row'}`}>
          {view !== 'table' && (
            <div className={view === 'split' ? 'flex-1' : 'flex-1'}>
              <Map ships={ships} onSelect={setSelectedShip} highlighted={highlightedShip} view={view} portFilter={filters.port} countryFilter={filters.country} />
            </div>
          )}
          {view !== 'map' && (
            <div className={`${view === 'split' ? 'w-1/2 border-l border-gray-200' : 'flex-1'} overflow-hidden`}>
              <ShipTable
                ships={ships}
                onSelect={(ship) => { setHighlightedShip(ship); if (ship) setView('split'); }}
                highlighted={highlightedShip}
              />
            </div>
          )}
        </div>
      )}

      <ShipDetail ship={selectedShip} onClose={() => setSelectedShip(null)} />
      {showNoShips && (
        <NoShipsModal lastFilter={lastFilter} onClearLast={clearLast} onClearAll={clearAll} />
      )}
    </div>
  );
}
