import { useEffect, useRef } from 'react';

// Shown once per browser. A viewer who follows a link to a particular case
// (?ship=N) doesn't get it: the case they came for is already open behind it.
const SEEN_KEY = 'abandonedseafarers:welcome-seen';

export function hasSeenWelcome() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Private mode or blocked storage: treat as seen rather than greeting every load.
    return true;
  }
}

function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch { /* nothing to do: the modal just reappears next time */ }
}

export default function WelcomeModal({ onClose, onAbout }) {
  const closeRef = useRef(null);

  function dismiss() {
    markWelcomeSeen();
    onClose();
  }

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 id="welcome-title" className="text-xl font-semibold text-gray-900">
            Visualizing the scope & scale of seafarer abandonment
          </h2>

          <p className="text-sm text-gray-600 mt-3">
            In the maritime industry, seafarer abandonment occurs when shipowners or fishing vessel owners leave their crew stranded,
            often due to financial difficulties or because the cost of maintaining the vessel outweighs its value.
          </p>

          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-5">
            Abandonment is characterized by the failure to:
          </h3>
          <ol className="text-sm text-gray-600 mt-2 space-y-1.5 list-decimal pl-5">
            <li>Pay for the seafarer's return home; or</li>
            <li>Provide the seafarer without essential support and care; or</li>
            <li>Pay the seafarer's wages for at least two months.</li>
          </ol>

          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-5">
            Finding your way around
          </h3>
          <ul className="text-sm text-gray-600 mt-2 space-y-1.5 list-disc pl-5">
            <li>Each dot on the map is one case of seafarer abandonment. Bigger dots mean more abandoned seafarers. Color represents the case's status.</li>
            <li>Click a dot for the full case record.</li>
            <li>Search, or filter by case status, ship flag, abandonment country and port.</li>
          </ul>

          <p className="text-xs text-gray-400 mt-5">
            An independent project, not affiliated with the ILO or IMO.
          </p>

          <div className="flex flex-wrap gap-3 mt-5">
            <button
              ref={closeRef}
              onClick={dismiss}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Open the map
            </button>
            <button
              onClick={() => { markWelcomeSeen(); onAbout(); }}
              className="px-4 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              More about this site
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
