// The card's accent colour is the site's status fill
// (frontend/src/utils/statusColors.js), so a case looks the same colour here as
// it does on the map. `ink` is the text colour that reads on that fill.
// test/drift.test.js fails if the site's fills change without this file.
const STATUS_CARD_COLORS = {
  '':        { fill: '#e8e288', ink: '#3f3a12' },
  disputed:  { fill: '#de1a1a', ink: '#ffffff' },
  inactive:  { fill: '#9ca3af', ink: '#1f2937' },
  resolved:  { fill: '#7dce82', ink: '#14532d' },
};

function statusCardColor(status) {
  return STATUS_CARD_COLORS[status ?? ''] ?? STATUS_CARD_COLORS[''];
}

module.exports = { STATUS_CARD_COLORS, statusCardColor };
