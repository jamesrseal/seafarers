// External status labels (used in the UI/URL) <-> raw stored values.
const STATUS_VALUES = { Unresolved: '', Disputed: 'disputed', Inactive: 'inactive', Resolved: 'resolved' };
const STATUS_LABELS = { '': 'Unresolved', disputed: 'Disputed', inactive: 'Inactive', resolved: 'Resolved' };
const STATUS_ORDER  = ['', 'disputed', 'inactive', 'resolved'];

module.exports = { STATUS_VALUES, STATUS_LABELS, STATUS_ORDER };
