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
              aria-label="Source code on GitHub"
              title="github.com/jamesrseal/seafarers"
              className="text-blue-400 hover:text-blue-300 inline-flex align-middle"
            >
              {/* GitHub's mark, from Simple Icons (CC0). */}
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-4 h-4">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
            {' '}&mdash;{' '}
            <a
              href="mailto:abandonedseafarers@gmail.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Email Abandoned Seafarers"
              title="abandonedseafarers@gmail.com"
              className="text-blue-400 hover:text-blue-300 inline-flex align-middle"
            >
              {/* Neu Icons' "so-email", via SVG Repo. MIT License, Copyright (c) 2020 Royyan Wijaya (github.com/neuicons/neu). */}
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-4 h-4">
                <path d="M22,5V9L12,13,2,9V5A1,1,0,0,1,3,4H21A1,1,0,0,1,22,5ZM2,11.154V19a1,1,0,0,0,1,1H21a1,1,0,0,0,1-1V11.154l-10,4Z" />
              </svg>
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
