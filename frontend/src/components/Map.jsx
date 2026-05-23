import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { statusColor, statusLabel, markerRadius, STATUS_COLORS } from '../utils/statusColors';

const SIZE_EXAMPLES = [
  { label: '10', r: markerRadius(10) },
  { label: '50', r: markerRadius(50) },
  { label: '100+', r: markerRadius(100) },
];

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
                {Object.entries(STATUS_COLORS).map(([key, { fill, label }]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: fill, border: '1px solid #555' }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Seafarers</div>
              <div className="flex items-end gap-3">
                {SIZE_EXAMPLES.map(({ label, r }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <svg width={maxR * 2 + 4} height={svgH}>
                      <circle
                        cx={(maxR * 2 + 4) / 2}
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

function MapController({ ship, view, portFilter, ships }) {
  const map = useMap();
  const pendingPortFly = useRef(null);

  useEffect(() => { map.invalidateSize(); }, [view]);

  useEffect(() => {
    if (ship?.port_latitude && ship?.port_longitude) {
      map.flyTo([ship.port_latitude, ship.port_longitude], Math.max(map.getZoom(), 5), { duration: 1 });
    }
  }, [ship]);

  // Mark that a fly is needed when the port filter changes
  useEffect(() => {
    pendingPortFly.current = portFilter || null;
  }, [portFilter]);

  // Execute the fly once ships load for the selected port
  useEffect(() => {
    if (!pendingPortFly.current) return;
    const target = ships.find(s => s.port_latitude && s.port_longitude);
    if (target) {
      map.flyTo([target.port_latitude, target.port_longitude], 6, { duration: 1 });
      pendingPortFly.current = null;
    }
  }, [ships]);

  return null;
}

export default function Map({ ships, onSelect, highlighted, view, portFilter }) {
  const mappable = ships.filter(s => s.port_latitude && s.port_longitude);

  return (
    <div className="relative h-full w-full">
    <MapLegend />
    <MapContainer
      center={[20, 10]}
      zoom={2}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController ship={highlighted} view={view} portFilter={portFilter} ships={mappable} />
      {mappable.filter(ship => !highlighted || highlighted.abandonment_id === ship.abandonment_id).map(ship => {
        const isHighlighted = !!highlighted;
        const { fill } = statusColor(ship.ship_status);
        const r = markerRadius(ship.num_seafarers);
        return (
          <CircleMarker
            key={ship.abandonment_id}
            center={[ship.port_latitude, ship.port_longitude]}
            radius={isHighlighted ? r + 5 : r}
            pathOptions={{
              fillColor: fill,
              fillOpacity: isHighlighted ? 1 : 0.8,
              color: isHighlighted ? '#fff' : '#333',
              weight: isHighlighted ? 2.5 : 0.5,
            }}
            eventHandlers={{ click: () => onSelect(ship) }}
          >
            <Tooltip>
              <div className="text-xs leading-snug">
                <div className="font-bold">{ship.ship_name}</div>
                <div>{ship.port_of_abandonment}</div>
                <div>{ship.num_seafarers} seafarers · {statusLabel(ship.ship_status)}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
    </div>
  );
}
