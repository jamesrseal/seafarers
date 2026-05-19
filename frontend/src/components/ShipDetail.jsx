import { statusColor } from '../utils/statusColors';

export default function ShipDetail({ ship, onClose }) {
  if (!ship) return null;
  const { badge } = statusColor(ship.ship_status);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{ship.ship_name}</h2>
            <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
              {ship.ship_status || 'Active'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <dl className="p-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Abandonment ID" value={ship.abandonment_id} />
          <Field label="IMO Number" value={ship.imo_number} />
          <Field label="Flag" value={
            <span className="flex items-center gap-2">
              {ship.flag_url && <img src={ship.flag_url} alt="" className="h-4" />}
              {ship.flag}
            </span>
          } />
          <Field label="Fishing Vessel" value={ship.fishing_vessel ? 'Yes' : 'No'} />
          <Field label="Port of Abandonment" value={ship.port_of_abandonment} full />
          <Field label="Abandonment Date" value={ship.abandonment_date} />
          <Field label="Notification Date" value={ship.notification_date} />
          <Field label="Seafarers" value={ship.num_seafarers} />
          <Field label="Reporting Org." value={ship.reporting_member} full />
          {ship.circumstances && (
            <Field label="Circumstances" value={ship.circumstances} full />
          )}
          {ship.comments && (
            <Field label="Comments" value={ship.comments} full />
          )}
        </dl>

        <div className="px-5 pb-5 flex gap-3">
          {ship.ilo_url && (
            <a href={ship.ilo_url} target="_blank" rel="noreferrer"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              ILO Record
            </a>
          )}
          {ship.vessel_finder_url && (
            <a href={ship.vessel_finder_url} target="_blank" rel="noreferrer"
              className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">
              VesselFinder
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-gray-500 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{value ?? '—'}</dd>
    </div>
  );
}
