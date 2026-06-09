import { statusColor, statusLabel } from '../utils/statusColors';

const MONTHS = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
};

// Splits circumstances into typed lines:
// - first plain-text line becomes a 'summary'
// - "Label: Value" or "Label?: Value" lines become 'field'
// - everything else becomes 'text'
function parseCircumstances(text) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let foundSummary = false;
  return lines.map(line => {
    const m = line.match(/^([A-Za-z][A-Za-z\s]{0,50}\??)\s*:\s+(.+)$/);
    if (m) return { type: 'field', label: m[1].trim().replace(/\?$/, ''), value: m[2].trim() };
    if (!foundSummary) { foundSummary = true; return { type: 'summary', text: line }; }
    return { type: 'text', text: line };
  });
}

function parseComments(comments) {
  if (!comments) return [];
  const re = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*:/gi;
  const matches = [...comments.matchAll(re)];
  if (matches.length === 0) return [{ dateLabel: null, ts: 0, text: comments.trim() }];

  return matches
    .map((m, i) => {
      const start = m.index + m[0].length;
      const end   = matches[i + 1]?.index ?? comments.length;
      const ts    = new Date(parseInt(m[3], 10), MONTHS[m[2].toLowerCase()], parseInt(m[1], 10)).getTime();
      return { dateLabel: `${m[1]} ${m[2]} ${m[3]}`, ts, text: comments.slice(start, end).trim() };
    })
    .sort((a, b) => b.ts - a.ts);
}

export default function ShipDetail({ ship, onClose }) {
  if (!ship) return null;
  const { badge } = statusColor(ship.ship_status);
  const commentEntries = parseComments(ship.comments);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-semibold text-gray-900">{ship.ship_name}</h2>
            <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
              {statusLabel(ship.ship_status)}
            </span>
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
          <Field label="Last Activity" value={ship.last_activity_date ?? '—'} />
          <Field label="Seafarers" value={ship.num_seafarers} />
          <Field label="Reporting Org." value={ship.reporting_member} full />
          {ship.circumstances && (
            <div className="col-span-2">
              <dt className="text-gray-500 text-xs uppercase tracking-wide mb-2">Circumstances</dt>
              <dd className="space-y-1.5">
                {parseCircumstances(ship.circumstances).map((item, i) => {
                  if (item.type === 'summary') return (
                    <p key={i} className="text-sm font-medium text-gray-900">{item.text}</p>
                  );
                  if (item.type === 'field') return (
                    <div key={i} className="flex flex-wrap gap-x-2 text-sm">
                      <span className="text-gray-500">{item.label}:</span>
                      <span className="text-gray-800">{item.value}</span>
                    </div>
                  );
                  return <p key={i} className="text-sm text-gray-700">{item.text}</p>;
                })}
              </dd>
            </div>
          )}
          {commentEntries.length > 0 && (
            <div className="col-span-2">
              <dt className="text-gray-500 text-xs uppercase tracking-wide mb-2">Updates</dt>
              <div className="space-y-3">
                {commentEntries.map((entry, i) => (
                  <div key={i} className="border-l-2 border-gray-200 pl-3">
                    {entry.dateLabel && (
                      <p className="text-xs font-semibold text-gray-400 mb-0.5">{entry.dateLabel}</p>
                    )}
                    <p className="text-sm text-gray-800 leading-snug">{entry.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </dl>
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
