import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { statusColor, markerRadius } from '../utils/statusColors';

export default function Map({ ships, onSelect }) {
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
      {mappable.map(ship => {
        const { fill } = statusColor(ship.ship_status);
        const r = markerRadius(ship.num_seafarers);
        return (
          <CircleMarker
            key={ship.abandonment_id}
            center={[ship.port_latitude, ship.port_longitude]}
            radius={r}
            pathOptions={{ fillColor: fill, fillOpacity: 0.8, color: '#333', weight: 0.5 }}
            eventHandlers={{ click: () => onSelect(ship) }}
          >
            <Tooltip>
              <div className="text-xs leading-snug">
                <div className="font-bold">{ship.ship_name}</div>
                <div>{ship.port_of_abandonment}</div>
                <div>{ship.num_seafarers} seafarers · {ship.ship_status || 'Active'}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
