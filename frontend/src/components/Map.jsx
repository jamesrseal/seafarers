import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvent } from 'react-leaflet';
import { statusColor, statusLabel, markerRadius, markerRecency, STATUS_COLORS, RECENCY_LEGEND } from '../utils/statusColors';
import { spreadOffsets, groupByCoordinate, JITTER_FROM_ZOOM } from '../utils/jitter';
import NewBadge from './NewBadge';

const SIZE_EXAMPLES = [
  { label: '10', r: markerRadius(10) },
  { label: '50', r: markerRadius(50) },
  { label: '100+', r: markerRadius(100) },
];

// One copy of the world: panning stops at its edges, so the markers can't be
// dragged out of view. The tiles still wrap because Leaflet lets the view
// overshoot a bound by up to 1px, and that pixel should look like map.
const WORLD_BOUNDS = [[-85, -180], [85, 180]];

// The lowest zoom at which the world covers the whole map, leaving no empty
// margin beside or above it. Fractional, so the world fits the map exactly.
function coverZoom(map) {
  const [[south, west], [north, east]] = WORLD_BOUNDS;
  const nw = map.project([north, west], 0);
  const se = map.project([south, east], 0);
  const size = map.getSize();
  return Math.log2(Math.max(size.x / (se.x - nw.x), size.y / (se.y - nw.y)));
}

function MapLegend() {
  const [open, setOpen] = useState(false);
  const maxR = SIZE_EXAMPLES[SIZE_EXAMPLES.length - 1].r;
  const svgH = maxR * 2 + 4;

  return (
    <div className="absolute bottom-8 left-3 z-[1000] text-xs text-gray-700">
      <div className="bg-white/90 border border-gray-200 rounded-lg shadow-md overflow-hidden">
        <button
          className="flex items-center gap-1.5 px-3 py-2 w-full text-left text-[11px] font-semibold text-gray-600 hover:bg-gray-50 pointer-events-auto"
          onClick={() => setOpen(o => !o)}
        >
          <span>{open ? '▾' : '▸'}</span>
          Legend
        </button>
        {open && (
          <div className="px-3 pb-2.5 space-y-2.5 pointer-events-none border-t border-gray-100">
            <div className="pt-2">
              <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">Status</div>
              <div className="space-y-1">
                {Object.entries(STATUS_COLORS).map(([key, { fill, label, definition }]) => (
                  <div key={key} className="flex items-center gap-2" title={definition}>
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: fill, border: '1px solid #555' }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">Last activity</div>
              <div className="space-y-1">
                {RECENCY_LEGEND.map(({ label, fillOpacity, weight, strokeColor }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{
                      background: '#9ca3af',
                      opacity: fillOpacity,
                      border: `${weight}px solid ${strokeColor}`,
                    }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Seafarers</div>
              {/* Each circle takes only its own width, and the row spreads them across the
                  legend, so the space between them is the same however much the sizes differ.
                  Equal-width cells would leave the small circle looking marooned. */}
              <div className="flex items-end justify-between">
                {SIZE_EXAMPLES.map(({ label, r }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <svg width={r * 2 + 2} height={svgH}>
                      <circle
                        cx={r + 1}
                        cy={svgH - r - 2}
                        r={r}
                        fill="#9ca3af"
                        fillOpacity={0.8}
                        stroke="#555"
                        strokeWidth={0.5}
                      />
                    </svg>
                    <span className="text-[10px] text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The markers, with cases that share a port's coordinate spread around it once
// the map is close enough (see ../utils/jitter.js). The spread is worked out in
// pixels and turned back into coordinates at the current zoom, so it keeps its
// shape and spacing however far in you go.
function ShipMarkers({ ships, onSelect, highlighted }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvent('zoomend', () => setZoom(map.getZoom()));

  const placed = useMemo(() => {
    const shown = ships.filter(ship => !highlighted || highlighted.abandonment_id === ship.abandonment_id);
    if (zoom < JITTER_FROM_ZOOM) {
      return shown.map(ship => ({ ship, position: [ship.port_latitude, ship.port_longitude] }));
    }
    return [...groupByCoordinate(shown).values()].flatMap(group => {
      const centre = [group[0].port_latitude, group[0].port_longitude];
      if (group.length < 2) return [{ ship: group[0], position: centre }];
      const point = map.project(centre, zoom);
      return spreadOffsets(group.map(ship => markerRadius(ship.num_seafarers))).map(([dx, dy], i) => ({
        ship: group[i],
        position: map.unproject([point.x + dx, point.y + dy], zoom),
      }));
    });
  }, [ships, highlighted, zoom, map]);

  return placed.map(({ ship, position }) => {
    const isHighlighted = !!highlighted;
    const { fill } = statusColor(ship.ship_status);
    const r = markerRadius(ship.num_seafarers);
    const recency = markerRecency(ship.last_activity_date);
    return (
      <CircleMarker
        key={ship.abandonment_id}
        center={position}
        radius={isHighlighted ? r + 5 : r}
        pathOptions={{
          fillColor: fill,
          fillOpacity: isHighlighted ? 1 : recency.fillOpacity,
          color: isHighlighted ? '#fff' : recency.strokeColor,
          weight: isHighlighted ? 2.5 : recency.weight,
        }}
        eventHandlers={{ click: () => onSelect(ship) }}
      >
        <Tooltip>
          <div className="text-xs leading-snug">
            <div className="font-bold flex items-center gap-1.5">
              {ship.ship_name}
              <NewBadge ship={ship} />
            </div>
            <div>{ship.port_of_abandonment}</div>
            <div>{ship.num_seafarers} seafarers · {statusLabel(ship.ship_status)}</div>
          </div>
        </Tooltip>
      </CircleMarker>
    );
  });
}

function MapController({ ship, view, portFilter, countryFilter, ships }) {
  const map = useMap();
  const pendingPortFly = useRef(null);
  const pendingCountryFit = useRef(null);

  useEffect(() => { map.invalidateSize(); }, [view]);

  useEffect(() => {
    // Leaflet rounds every zoom to a whole level, which puts a fractional
    // minimum out of reach whenever it rounds up (2.9 → 3). Treat the minimum
    // as a level of its own and snap to whichever is nearer.
    const limitZoom = map._limitZoom;
    map._limitZoom = function (zoom) {
      const limited = limitZoom.call(this, zoom);
      const min = this.getMinZoom();
      return Math.abs(zoom - min) < Math.abs(zoom - limited) ? min : limited;
    };

    const fit = () => {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const zoom = coverZoom(map);
      const outside = map.getZoom() < zoom;
      // Step inside the new minimum first, so setMinZoom doesn't animate a zoom of its own.
      if (outside) map.setView(map.getCenter(), Math.ceil(zoom), { animate: false });
      map.setMinZoom(zoom);
      if (outside) map.setZoom(zoom, { animate: false });
    };
    fit();
    map.on('resize', fit);
    return () => {
      map.off('resize', fit);
      map._limitZoom = limitZoom;
    };
  }, [map]);

  useEffect(() => {
    if (ship?.port_latitude && ship?.port_longitude) {
      map.flyTo([ship.port_latitude, ship.port_longitude], Math.max(map.getZoom(), 5), { duration: 1 });
    }
  }, [ship]);

  useEffect(() => {
    pendingPortFly.current = portFilter || null;
  }, [portFilter]);

  useEffect(() => {
    pendingCountryFit.current = countryFilter || null;
  }, [countryFilter]);

  useEffect(() => {
    if (pendingPortFly.current) {
      const target = ships.find(s => s.port_latitude && s.port_longitude);
      if (target) {
        map.setView([target.port_latitude, target.port_longitude], 6, { animate: true, duration: 0.4 });
        pendingPortFly.current = null;
      }
      return;
    }
    if (pendingCountryFit.current) {
      const coords = ships.filter(s => s.port_latitude && s.port_longitude)
        .map(s => [s.port_latitude, s.port_longitude]);
      if (coords.length > 0) {
        map.fitBounds(coords, { padding: [40, 40], maxZoom: 8, animate: true, duration: 0.4 });
        pendingCountryFit.current = null;
      }
    }
  }, [ships]);

  return null;
}

export default function Map({ ships, onSelect, highlighted, view, portFilter, countryFilter }) {
  const mappable = useMemo(() => ships.filter(s => s.port_latitude && s.port_longitude), [ships]);

  return (
    <div className="relative h-full w-full">
    <MapLegend />
    <MapContainer
      center={[20, 10]}
      zoom={2}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController ship={highlighted} view={view} portFilter={portFilter} countryFilter={countryFilter} ships={mappable} />
      <ShipMarkers ships={mappable} onSelect={onSelect} highlighted={highlighted} />
    </MapContainer>
    </div>
  );
}
