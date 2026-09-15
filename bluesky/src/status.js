// The site's own status labels (frontend/src/utils/statusColors.js), keyed by
// the raw stored value. A post states status in these words and no others;
// test/drift.test.js fails if the site's labels change without this file.
const STATUS_LABELS = {
  '': 'Unresolved',
  disputed: 'Disputed',
  inactive: 'Inactive',
  resolved: 'Resolved',
};

function statusLabel(status) {
  return STATUS_LABELS[status ?? ''];
}

module.exports = { STATUS_LABELS, statusLabel };
