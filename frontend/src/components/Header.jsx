import { useState, useEffect } from 'react';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Header() {
  const [dataUpdated, setDataUpdated] = useState(null);

  useEffect(() => {
    fetch('/api/scrapes')
      .then(r => r.json())
      .then(runs => { if (runs[0]) setDataUpdated(runs[0].scraped_at); })
      .catch(() => {});
  }, []);

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
        <div className="text-right text-xs text-gray-400 space-y-0.5">
          <div>Data updated: <span className="text-gray-300">{fmtDate(dataUpdated)}</span></div>
          <div>App updated: <span className="text-gray-300">{fmtDate(__APP_UPDATED__)}</span></div>
        </div>
      </div>
    </header>
  );
}
