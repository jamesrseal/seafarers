import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { statusColor, statusLabel, markerRadius } from '../utils/statusColors';

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
  );
}
