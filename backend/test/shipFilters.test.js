const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ingestRun } = require('../src/ingest');
const { migrate } = require('../src/db/migrate');
const { whereSql, facets } = require('../src/shipFilters');

const SCHEMA = path.join(__dirname, '../src/db/schema.sql');
const R1 = '2026-01-01T00:00:00.000Z';
const R2 = '2026-01-02T00:00:00.000Z';

const entries = status => JSON.stringify([{ date: '2026-01-01', dateText: '1 January 2026', status, detail: '' }]);
const crew = (...list) => JSON.stringify(list.map(([country, count]) => ({ country, count })));

// A case as the scraper posts it. The ILO fields are left out unless given, so
// a case can also stand for one scraped before they were captured (NULL).
function ship(id, fields = {}) {
  return {
    abandonment_id: id, ship_name: `Ship ${id}`, ship_status: '', flag: 'Panama', imo_number: '',
    port_of_abandonment: 'Samsun, Türkiye', port_latitude: null, port_longitude: null,
    abandonment_date: '', notification_date: '', reporting_member: '', num_seafarers: 10,
    circumstances: '', comments: '', fishing_vessel: 0, ilo_url: '', vessel_finder_url: null,
    last_activity_date: null, ...fields,
  };
}

function ilo({ vessel = '', nationalities = '', payment = '', repatriation = '', insurer = '' }) {
  return {
    vessel_type: vessel, financial_security_provider: insurer, nationalities,
    payment_status: payment && entries(payment), payment_latest: payment,
    repatriation_status: repatriation && entries(repatriation), repatriation_latest: repatriation,
    actions_taken: '',
  };
}

// Case 4 had a Filipino crew and was paid in the first run; the second run is
// its latest row, and only that may match.
function seededDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  migrate(db);
  ingestRun(db, R1, [
    ship('4', ilo({ vessel: 'Bulk Carrier', nationalities: crew(['Philippines', 20]), payment: 'Paid', insurer: 'Hydor' })),
  ]);
  ingestRun(db, R2, [
    ship('1', { ship_status: 'resolved', ...ilo({ vessel: 'General Cargo Ship', nationalities: crew(['India', 10], ['Ukraine', 2]),
      payment: 'Paid', repatriation: 'Repatriated', insurer: 'Hydor AS' }) }),
    ship('2', ilo({ vessel: 'General Cargo', nationalities: crew(['Georgia', null], ['Greece', null]),
      payment: 'Payment Pending', repatriation: 'Repatriation pending', insurer: 'Unknown' })),
    ship('3', ilo({ payment: 'Other', repatriation: 'Other' })),
    ship('4', ilo({ vessel: 'Bulk Carrier', nationalities: crew(['India', 5]), payment: 'Partially paid', insurer: 'Hydor' })),
    ship('5'),
  ]);
  return db;
}

const db = seededDb();

function ids(filters) {
  const { sql, params } = whereSql(filters);
  return db.prepare(`SELECT ships.abandonment_id FROM ships ${sql} ORDER BY CAST(ships.abandonment_id AS INTEGER)`)
    .all(...params).map(r => r.abandonment_id);
}

const values = facet => facet.values.map(({ value, count }) => `${value}: ${count}`);

test('each case counts once, by its latest row, as the correlated MAX picked it', () => {
  const { sql, params } = whereSql({});
  const joined = db.prepare(`SELECT ships.id FROM ships ${sql} ORDER BY ships.id`).all(...params).map(r => r.id);
  const correlated = db.prepare(
    `SELECT id FROM ships WHERE scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id) ORDER BY id`
  ).all().map(r => r.id);
  assert.deepEqual(joined, correlated);
  assert.deepEqual(ids({}), ['1', '2', '3', '4', '5']);
});

test('a nationality matches the cases whose latest crew includes it', () => {
  assert.deepEqual(ids({ nationality: 'India' }), ['1', '4']);
  assert.deepEqual(ids({ nationality: 'Greece' }), ['2'], 'with or without a head count');
  assert.deepEqual(ids({ nationality: 'Philippines' }), [], "case 4's older crew doesn't count");
});

test('a vessel type matches every spelling of it', () => {
  assert.deepEqual(ids({ vessel: 'General Cargo Ship' }), ['1', '2']);
  assert.deepEqual(ids({ vessel: 'Bulk Carrier' }), ['4']);
});

test('payment and repatriation match the latest status', () => {
  assert.deepEqual(ids({ payment: 'Paid' }), ['1'], "case 4's earlier payment doesn't count");
  assert.deepEqual(ids({ repatriation: 'Other' }), ['3']);
});

test('the search finds an insurer however the ILO spells it, and a vessel type', () => {
  assert.deepEqual(ids({ q: 'hydor' }), ['1', '4']);
  assert.deepEqual(ids({ q: 'cargo' }), ['1', '2']);
});

test('the new facets list what the cases have, blanks and uncaptured cases left out', () => {
  const f = facets(db, {});
  assert.deepEqual(values(f.nationality), ['Georgia: 1', 'Greece: 1', 'India: 2', 'Ukraine: 1']);
  assert.deepEqual(values(f.vessel), ['Bulk Carrier: 1', 'General Cargo Ship: 2']);
  assert.deepEqual(values(f.payment), ['Paid: 1', 'Partially paid: 1', 'Payment Pending: 1', 'Other: 1'], 'Other last');
  assert.deepEqual(values(f.repatriation), ['Repatriated: 1', 'Repatriation pending: 1', 'Other: 1']);
  for (const key of ['nationality', 'vessel', 'payment', 'repatriation']) assert.equal(f[key].total, 5, key);
});

test('each facet is counted with the other filters, not its own', () => {
  const f = facets(db, { nationality: 'India' });
  assert.deepEqual(values(f.nationality), ['Georgia: 1', 'Greece: 1', 'India: 2', 'Ukraine: 1']);
  assert.equal(f.nationality.total, 5);
  assert.deepEqual(values(f.payment), ['Paid: 1', 'Partially paid: 1']);
  assert.equal(f.payment.total, 2);
  assert.deepEqual(values(f.status), ['Unresolved: 1', 'Resolved: 1']);
});
