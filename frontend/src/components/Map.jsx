import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { statusColor, statusLabel, markerRadius } from '../utils/statusColors';

const STATUS_PRIORITY = { disputed: 4, '': 3, resolved: 2, inactive: 1 };

function worstStatus(ships) {
  return ships.reduce(
    (best, ship) => (STATUS_PRIORITY[ship.ship_status] ?? 0) > (STATUS_PRIORITY[best] ?? 0) ? ship.ship_status : best,
    ships[0].ship_status
  );
}

function MapController({ ship, view, onMapClick }) {
  const map = useMap();
  useMapEvents({ click: onMapClick });
  useEffect(() => { map.invalidateSize(); }, [view]);
  useEffect(() => {
    if (ship?.port_latitude && ship?.port_longitude) {
      map.flyTo([ship.port_latitude, ship.port_longitude], Math.max(map.getZoom(), 5), { duration: 1 });
    }
  }, [ship]);
  return null;
}

export default function Map({ ships, onSelect, highlighted, view }) {
  const [panel, setPanel] = useState(null); // { ships, x, y }
  const wrapperRef = useRef(null);

  useEffect(() => { setPanel(null); }, [ships, highlighted]);

  const groups = useMemo(() => {
    if (highlighted) {
      return [{ key: String(highlighted.abandonment_id), ships: [highlighted] }];
    }
    const mappable = ships.filter(s => s.port_latitude && s.port_longitude);
    const byLocation = new Map();
    for (const ship of mappable) {
      const key = `${ship.port_latitude},${ship.port_longitude}`;
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key).push(ship);
    }
    return [...byLocation.entries()].map(([key, groupShips]) => ({ key, ships: groupShips }));
  }, [ships, highlighted]);

  function closePanel() { setPanel(null); }

  return (
    <div ref={wrapperRef} style={{ height: '100%', width: '100%', position: 'relative' }}>
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
        <MapController ship={highlighted} view={view} onMapClick={closePanel} />
        {groups.map(({ key, ships: groupShips }) => {
          const isHighlighted = !!highlighted;
          const isGroup = groupShips.length > 1;
          const status = isGroup ? worstStatus(groupShips) : groupShips[0].ship_status;
          const { fill } = statusColor(status);
          const totalSeafarers = groupShips.reduce((s, sh) => s + (sh.num_seafarers || 0), 0);
          const r = markerRadius(totalSeafarers);
          return (
            <CircleMarker
              key={key}
              center={[groupShips[0].port_latitude, groupShips[0].port_longitude]}
              radius={isHighlighted ? r + 5 : r}
              pathOptions={{
                fillColor: fill,
                fillOpacity: isHighlighted ? 1 : 0.8,
                color: isGroup ? '#fff' : (isHighlighted ? '#fff' : '#333'),
                weight: isGroup ? 2 : (isHighlighted ? 2.5 : 0.5),
              }}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent.stopPropagation();
                  if (groupShips.length === 1) {
                    onSelect(groupShips[0]);
                    closePanel();
                  } else {
                    setPanel({ ships: groupShips, x: e.containerPoint.x, y: e.containerPoint.y });
                  }
                },
              }}
            >
              <Tooltip>
                <div className="text-xs leading-snug">
                  {isGroup ? (
                    <>
                      <div className="font-bold">{groupShips.length} ships at this location</div>
                      <div>{groupShips[0].port_of_abandonment}</div>
                      <div>{totalSeafarers} seafarers total · click to pick</div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold">{groupShips[0].ship_name}</div>
                      <div>{groupShips[0].port_of_abandonment}</div>
                      <div>{groupShips[0].num_seafarers} seafarers · {statusLabel(groupShips[0].ship_status)}</div>
                    </>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {panel && (() => {
        const wrapW = wrapperRef.current?.clientWidth ?? 9999;
        const wrapH = wrapperRef.current?.clientHeight ?? 9999;
        const panelW = 260;
        const left = panel.x + 14 + panelW > wrapW ? panel.x - panelW - 14 : panel.x + 14;
        const top = Math.min(panel.y - 14, wrapH - 320);
        return (
          <div
            className="absolute z-[1000] bg-white rounded-lg shadow-xl border border-gray-200 overflow-y-auto"
            style={{ left, top, width: panelW, maxHeight: 300 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100 sticky top-0 bg-white">
              {panel.ships.length} ships · {panel.ships[0].port_of_abandonment}
            </div>
            {panel.ships.map(ship => {
              const { badge } = statusColor(ship.ship_status);
              return (
                <button
                  key={ship.abandonment_id}
                  onClick={() => { onSelect(ship); closePanel(); }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-start gap-2 border-b border-gray-50 last:border-0"
                >
                  <span className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{ship.ship_name}</div>
                    <div className="text-xs text-gray-500">{ship.num_seafarers ?? '?'} seafarers</div>
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${badge}`}>
                    {statusLabel(ship.ship_status)}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
