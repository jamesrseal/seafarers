// Lightweight URL <-> app-state sync (no router dependency).
// Filters, the current view, and the open ship are reflected in the query
// string so that any view is a shareable, bookmarkable link.

const FILTER_KEYS = ['status', 'flag', 'port', 'country', 'q'];
const DEFAULT_VIEW = 'map';
const VALID_VIEWS = ['map', 'split', 'table', 'dashboard', 'report'];

export const EMPTY_FILTERS = { status: '', flag: '', port: '', country: '', q: '' };

export function readStateFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const filters = { ...EMPTY_FILTERS };
  for (const k of FILTER_KEYS) {
    const v = p.get(k);
    if (v) filters[k] = v;
  }
  const viewParam = p.get('view');
  const view = VALID_VIEWS.includes(viewParam) ? viewParam : DEFAULT_VIEW;
  const ship = p.get('ship') || null;
  return { filters, view, ship };
}

// Build the query string for a given state (without touching history).
function buildQuery({ filters, view, ship }) {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    if (filters?.[k]) p.set(k, filters[k]);
  }
  if (view && view !== DEFAULT_VIEW) p.set('view', view);
  if (ship) p.set('ship', String(ship));
  return p.toString();
}

// Reflect current state in the address bar. replaceState keeps the back button
// from filling up with every filter keystroke while the URL stays shareable.
export function writeStateToUrl(state) {
  const qs = buildQuery(state);
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

// Absolute, shareable link to a specific ship, preserving the current view/filters.
export function shipShareUrl(id) {
  const current = readStateFromUrl();
  const qs = buildQuery({ ...current, ship: id });
  return `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
}
