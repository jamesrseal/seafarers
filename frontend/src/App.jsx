import { useState } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import Map from './components/Map';
import ShipTable from './components/ShipTable';
import ShipDetail from './components/ShipDetail';
import Dashboard from './components/Dashboard';
import ReportForm from './components/ReportForm';
import { useShips, useFilters } from './hooks/useShips';

const EMPTY_FILTERS = { status: '', flag: '', port: '', country: '', q: '' };

export default function App() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedShip, setSelectedShip] = useState(null);
  const [highlightedShip, setHighlightedShip] = useState(null);
  const [view, setView] = useState('map');

  const { ships, loading } = useShips(filters);
  const filterOptions = useFilters();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      {view !== 'report' && <FilterBar
        filters={filters}
        setFilters={(f) => { setFilters(f); setHighlightedShip(null); }}
        ships={ships}
        options={filterOptions}
        total={ships.length}
        onClearAll={() => {
          setFilters(EMPTY_FILTERS);
          setHighlightedShip(null);
          setSelectedShip(null);
        }}
      />}

      {/* View toggle */}
      <div className="bg-white border-b border-gray-200 px-6 py-1.5">
        <div className="max-w-7xl mx-auto flex gap-2">
          {[['map', 'Map'], ['split', 'Map + Table'], ['table', 'Table'], ['dashboard', 'Dashboard'], ['report', 'Report']].map(([v, label]) => (
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

      {view === 'report' ? (
        <ReportForm />
      ) : view === 'dashboard' ? (
        <Dashboard />
      ) : loading ? (
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
    </div>
  );
}
