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
            Visualizing the ILO database of abandoned seafarer cases &mdash;{' '}
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
            {' '}&mdash;{' '}
            <a
              href="mailto:abandonedseafarers@gmail.com"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Contact
            </a>
            {' '}&mdash;{' '}
            <a
              href="https://bsky.app/profile/abandonedseafarers.bsky.social"
              target="_blank"
              rel="noreferrer"
              aria-label="Abandoned Seafarers on Bluesky"
              title="@abandonedseafarers.bsky.social"
              className="text-blue-400 hover:text-blue-300 inline-flex align-middle"
            >
              {/* Bluesky's butterfly, from Simple Icons (CC0). */}
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-4 h-4">
                <path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026" />
              </svg>
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
