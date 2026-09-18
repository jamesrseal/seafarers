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

// External status labels (used in the UI/URL) <-> raw stored values.
const STATUS_LABELS = Object.fromEntries(Object.entries(STATUS_COLORS).map(([value, { label }]) => [value, label]));
const STATUS_VALUES = Object.fromEntries(Object.entries(STATUS_COLORS).map(([value, { label }]) => [label, value]));
const STATUS_ORDER = Object.keys(STATUS_COLORS);

module.exports = { STATUS_COLORS, STATUS_VALUES, STATUS_LABELS, STATUS_ORDER };
