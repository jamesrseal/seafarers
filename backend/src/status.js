// The case statuses, as the site shows them. Labels and colours are copied from
// frontend/src/utils/statusColors.js, which the backend can't import (the site
// is ESM, this is CommonJS) — the same bind bluesky/src/status.js is in, and the
// same answer: test/status.test.js reads the site's file and fails on drift.
const STATUS_COLORS = {
  '':         { label: 'Unresolved', fill: '#e8e288' },
  disputed:   { label: 'Disputed',   fill: '#de1a1a' },
  inactive:   { label: 'Inactive',   fill: '#9ca3af' },
  resolved:   { label: 'Resolved',   fill: '#7dce82' },
};

// How big a case's dot is drawn, copied from the same file for the same reason:
// the case cards put the map's own markers on their basemap, and a card whose
// dots were sized differently from the map it advertises would be a drawing of
// the site rather than the site. test/status.test.js checks this too.
function markerRadius(numSeafarers) {
  const n = parseInt(numSeafarers, 10) || 1;
  // Scale 1–100 seafarers to radius 5–22px
  return Math.min(22, Math.max(5, 5 + (n / 100) * 17));
}

// External status labels (used in the UI/URL) <-> raw stored values.
const STATUS_LABELS = Object.fromEntries(Object.entries(STATUS_COLORS).map(([value, { label }]) => [value, label]));
const STATUS_VALUES = Object.fromEntries(Object.entries(STATUS_COLORS).map(([value, { label }]) => [label, value]));
const STATUS_ORDER = Object.keys(STATUS_COLORS);

module.exports = { STATUS_COLORS, STATUS_VALUES, STATUS_LABELS, STATUS_ORDER, markerRadius };
