const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ingestRun } = require('../src/ingest');
const { ADDED_COLUMNS, migrate } = require('../src/db/migrate');

const SCHEMA = path.join(__dirname, '../src/db/schema.sql');

const R1 = '2026-01-01T00:00:00.000Z';
const R2 = '2026-01-02T00:00:00.000Z';
const R3 = '2026-01-03T00:00:00.000Z';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  migrate(db);
  return db;
}

// A ship as the scraper posted it before the added columns existed.
const OLD_SHIP = {
  abandonment_id: '1821', ship_name: 'Nikolay Meshkov', ship_status: '', flag: 'Palau',
  imo_number: '8955873', port_of_abandonment: 'Samsun, Türkiye', port_latitude: 41.29,
  port_longitude: 36.33, abandonment_date: '1 July 2026', notification_date: '17 August 2026',
  reporting_member: "International Transport Workers' Federation", num_seafarers: 13,
  circumstances: 'Owed wages of 3 months.', comments: '17 August 2026: ITF\nNo reply.',
  fishing_vessel: 0, ilo_url: 'https://example.org/1821', vessel_finder_url: null,
  last_activity_date: '2026-08-17',
};

// …and as it posts it now.
const PAYMENT = JSON.stringify([{ date: '2026-08-17', dateText: '17 August 2026', status: 'Payment Pending', detail: 'US$70,000' }]);
const SHIP = {
  ...OLD_SHIP,
  vessel_type: 'General Cargo Ship',
  financial_security_provider: 'Hydor',
  nationalities: JSON.stringify([{ country: 'Azerbaijan', count: 11 }]),
  payment_status: PAYMENT,
  payment_latest: 'Payment Pending',
  repatriation_status: '',
  repatriation_latest: '',
  actions_taken: '',
};

const rows = (db, id = '1821') =>
  db.prepare('SELECT * FROM ships WHERE abandonment_id = ? ORDER BY scraped_at').all(id);

// A database whose history predates the added columns: rows ingested the old
// way, then the columns added by migrate(), as happens to the committed file.
function historyBeforeTheColumns() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  for (const c of ADDED_COLUMNS) db.exec(`ALTER TABLE ships DROP COLUMN ${c}`);
  const cols = Object.keys(OLD_SHIP);
  db.prepare(`INSERT INTO ships (scraped_at, ${cols.join(', ')}) VALUES (@scraped_at, ${cols.map(c => `@${c}`).join(', ')})`)
    .run({ ...OLD_SHIP, scraped_at: R1 });
  migrate(db);
  return db;
}

test('a new case is inserted, and an unchanged one is not', () => {
  const db = freshDb();
  assert.deepEqual(ingestRun(db, R1, [SHIP]), { inserted: 1, filled: 0 });
  assert.deepEqual(ingestRun(db, R2, [SHIP]), { inserted: 0, filled: 0 });
  assert.equal(rows(db).length, 1);
  assert.deepEqual(db.prepare('SELECT * FROM scrape_runs ORDER BY scraped_at').all(), [
    { scraped_at: R1, received: 1, inserted: 1 },
    { scraped_at: R2, received: 1, inserted: 0 },
  ]);
});

test('the first capture of the added columns fills the latest row in place', () => {
  const db = historyBeforeTheColumns();
  assert.deepEqual(ingestRun(db, R2, [SHIP]), { inserted: 0, filled: 1 });
  const [row] = rows(db);
  assert.equal(rows(db).length, 1, 'no history row for a field that was never captured');
  assert.equal(row.scraped_at, R1, 'the filled row keeps its date');
  assert.equal(row.nationalities, SHIP.nationalities);
  assert.equal(row.payment_latest, 'Payment Pending');
  assert.equal(row.repatriation_status, '', 'a blank field is filled with a blank, so NULL is gone');
  // and after that, nothing is left to fill
  assert.deepEqual(ingestRun(db, R3, [SHIP]), { inserted: 0, filled: 0 });
});

test('a real change on the same run is a new row, and the old row stays uncaptured', () => {
  const db = historyBeforeTheColumns();
  assert.deepEqual(ingestRun(db, R2, [{ ...SHIP, ship_status: 'resolved' }]), { inserted: 1, filled: 0 });
  const [old, now] = rows(db);
  assert.equal(old.nationalities, null);
  assert.equal(now.ship_status, 'resolved');
  assert.equal(now.nationalities, SHIP.nationalities);
});

test('once captured, a change in an added column is history', () => {
  const db = freshDb();
  ingestRun(db, R1, [SHIP]);
  const paid = JSON.stringify([{ date: '2026-09-20', dateText: '20 September 2026', status: 'Paid', detail: '' }, ...JSON.parse(PAYMENT)]);
  assert.deepEqual(ingestRun(db, R2, [{ ...SHIP, payment_status: paid, payment_latest: 'Paid' }]), { inserted: 1, filled: 0 });
  assert.deepEqual(rows(db).map(r => r.payment_latest), ['Payment Pending', 'Paid']);
});

test('a blank field that gets a value is a change', () => {
  const db = freshDb();
  ingestRun(db, R1, [SHIP]);
  assert.equal(ingestRun(db, R2, [{ ...SHIP, actions_taken: '[{"date":null}]' }]).inserted, 1);
});

test('a derived column that no longer matches is corrected in place', () => {
  const db = freshDb();
  ingestRun(db, R1, [SHIP]);
  assert.deepEqual(ingestRun(db, R2, [{ ...SHIP, payment_latest: 'Payment pending (renamed)' }]), { inserted: 0, filled: 1 });
  assert.equal(rows(db).length, 1);
  assert.equal(rows(db)[0].payment_latest, 'Payment pending (renamed)');
});

test('a record without the added columns keeps what is stored', () => {
  const db = freshDb();
  ingestRun(db, R1, [SHIP]);
  // e.g. re-ingesting a scraped_*.json saved before the columns existed
  assert.deepEqual(ingestRun(db, R2, [OLD_SHIP]), { inserted: 0, filled: 0 });
  // and when something else did change, the new row carries them forward
  assert.equal(ingestRun(db, R3, [{ ...OLD_SHIP, ship_status: 'resolved' }]).inserted, 1);
  const latest = rows(db).at(-1);
  assert.equal(latest.nationalities, SHIP.nationalities);
  assert.equal(latest.payment_latest, 'Payment Pending');
});

test('a record without the added columns, for a new case, stores them as NULL', () => {
  const db = freshDb();
  assert.equal(ingestRun(db, R1, [OLD_SHIP]).inserted, 1);
  assert.equal(rows(db)[0].nationalities, null);
  // …which the next full scrape then fills
  assert.deepEqual(ingestRun(db, R2, [SHIP]), { inserted: 0, filled: 1 });
});

test('a retried post of the same run changes nothing', () => {
  const db = historyBeforeTheColumns();
  ingestRun(db, R2, [SHIP]);
  assert.deepEqual(ingestRun(db, R2, [SHIP]), { inserted: 0, filled: 0 });
  assert.deepEqual(db.prepare('SELECT inserted FROM scrape_runs WHERE scraped_at = ?').get(R2), { inserted: 0 });
});

test('NULL and blank still compare equal in the original columns', () => {
  const db = freshDb();
  ingestRun(db, R1, [{ ...SHIP, vessel_finder_url: null }]);
  assert.equal(ingestRun(db, R2, [{ ...SHIP, vessel_finder_url: '' }]).inserted, 0);
});
