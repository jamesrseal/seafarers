import { useState, useEffect } from 'react';

// The later of the data refresh and the last app-code change: one "Updated" time
// for the whole site. Both are full timestamps (the scrape time, and the commit
// time baked in by vite.config.js), shown in the viewer's local time with its
// zone, so a reader in New York and one in Manila see the same moment.
function latest(...values) {
  const times = values.filter(Boolean).map(v => new Date(v)).filter(d => !Number.isNaN(d.getTime()));
  return times.length ? new Date(Math.max(...times)) : null;
}

function fmtDateTime(date) {
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

export default function Header() {
  // undefined while /api/scrapes loads, so the app's commit time doesn't show
  // briefly and then jump forward; null if it failed or has no runs.
  const [dataUpdated, setDataUpdated] = useState(undefined);

  useEffect(() => {
    fetch('/api/scrapes')
      .then(r => r.json())
      .then(runs => setDataUpdated(runs[0]?.scraped_at ?? null))
      .catch(() => setDataUpdated(null));
  }, []);

  const updated = dataUpdated === undefined ? null : latest(dataUpdated, __APP_UPDATED__);

  return (
    <header className="bg-gray-900 text-white px-6 py-4 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-wide">Abandoned Seafarers</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            ILO database of abandoned seafarer cases &mdash;{' '}
            <a
              href="https://wwwex.ilo.org/dyn/r/abandonment/seafarers/search"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Source
            </a>
            {' '}&mdash;{' '}
            <a
              href="https://github.com/jamesrseal/seafarers"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              GitHub
            </a>
          </p>
        </div>
        <div className="text-right text-xs text-gray-400">
          Updated: <span className="text-gray-300">{fmtDateTime(updated)}</span>
        </div>
      </div>
    </header>
  );
}
