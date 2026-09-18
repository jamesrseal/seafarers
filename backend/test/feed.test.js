const test = require('node:test');
const assert = require('node:assert/strict');
const { caseEvents, feedXml, entryTitle, entrySummary, MAX_ENTRIES } = require('../src/feed');

const FIRST_RUN = '2026-01-01T00:00:00.000Z';
const row = (id, at, status, extra = {}) => ({
  abandonment_id: id, scraped_at: at, ship_status: status,
  ship_name: `Ship ${id}`, port_of_abandonment: 'Samsun, Türkiye', num_seafarers: 12,
  flag: 'Palau', imo_number: '8955873', abandonment_date: '1 July 2026', ...extra,
});

// Ordered by abandonment_id then scraped_at, as the query returns them.
const ROWS = [
  row('1', FIRST_RUN, ''),                       // there when the site started
  row('1', '2026-03-01T00:00:00.000Z', 'resolved'),
  row('2', '2026-02-01T00:00:00.000Z', ''),      // genuinely new
  row('2', '2026-02-05T00:00:00.000Z', '', { num_seafarers: 14 }),  // a change, but not of status
  row('3', FIRST_RUN, 'disputed'),
];

test('the first scrape is the site arriving, not news', () => {
  const events = caseEvents(ROWS, FIRST_RUN);
  assert.deepEqual(events.map(e => [e.type, e.ship.abandonment_id, e.at]), [
    ['status', '1', '2026-03-01T00:00:00.000Z'],
    ['new', '2', '2026-02-01T00:00:00.000Z'],
  ]);
});

test('entries read as news, and say what the dates mean', () => {
  const [change, added] = caseEvents(ROWS, FIRST_RUN);
  assert.equal(entryTitle(added), 'New case: Ship 2 abandoned in Samsun, Türkiye');
  assert.equal(entryTitle(change), 'Ship 1: Unresolved → Resolved');
  assert.match(entrySummary(added), /^12 seafarers abandoned on the Ship 2 \(IMO 8955873, flag Palau\) in Samsun, Türkiye, 1 July 2026\. ILO case 2\. Status: Unresolved\.$/);
  assert.match(entrySummary(change), /status changed from Unresolved to Resolved; this refresh is when the change was seen, not when it was made\.$/);
});

test('the feed is valid Atom, newest first, capped', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({
    type: 'new', at: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`, ship: row(String(i + 10), '', ''),
  }));
  const xml = feedXml(caseEvents(ROWS, FIRST_RUN).concat(many).sort((a, b) => (a.at < b.at ? 1 : -1)));
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.equal((xml.match(/<entry>/g) || []).length, MAX_ENTRIES);
  assert.match(xml, /<link rel="self" type="application\/atom\+xml" href="https:\/\/abandonedseafarers\.org\/feed\.xml"\/>/);
  // Each entry links to its case and has a stable, unique id.
  const ids = [...xml.matchAll(/<id>(tag:[^<]+)<\/id>/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(xml, /<link rel="alternate" type="text\/html" href="https:\/\/abandonedseafarers\.org\/\?ship=\d+"\/>/);
  const updated = [...xml.matchAll(/<entry>[\s\S]*?<updated>([^<]+)<\/updated>/g)].map(m => m[1]);
  assert.deepEqual(updated, [...updated].sort().reverse(), 'entries run newest first');
});

test('XML special characters in a ship name are escaped', () => {
  const xml = feedXml([{ type: 'new', at: '2026-05-01T00:00:00.000Z', ship: row('9', '', '', { ship_name: 'Fish & <Chips>' }) }]);
  assert.match(xml, /New case: Fish &amp; &lt;Chips&gt; abandoned/);
  assert.ok(!xml.includes('<Chips>'));
});
