const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ADDED_COLUMNS, DERIVED_COLUMNS, migrate } = require('../src/db/migrate');

const SCHEMA = path.join(__dirname, '../src/db/schema.sql');
const DB_PATH = path.join(__dirname, '../data/seafarers.db');

// The ships table as the committed database was first built, before any column
// was added. Fixed history: it must not follow schema.sql.
const ORIGINAL_SHIPS = `CREATE TABLE ships (
  id INTEGER PRIMARY KEY AUTOINCREMENT, abandonment_id TEXT NOT NULL, scraped_at DATETIME NOT NULL,
  ship_name TEXT, ship_status TEXT, flag TEXT, imo_number TEXT, port_of_abandonment TEXT,
  port_latitude REAL, port_longitude REAL, abandonment_date TEXT, notification_date TEXT,
  reporting_member TEXT, num_seafarers INTEGER, circumstances TEXT, comments TEXT,
  fishing_vessel INTEGER DEFAULT 0, ilo_url TEXT, vessel_finder_url TEXT, flag_url TEXT,
  last_activity_date TEXT
)`;

const columns = db => db.prepare('PRAGMA table_info(ships)').all().map(c => `${c.name} ${c.type}`);

function fresh() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  return db;
}

test('an original database, migrated, has exactly the columns a fresh one has', () => {
  const old = new Database(':memory:');
  old.exec(ORIGINAL_SHIPS);
  old.exec(fs.readFileSync(SCHEMA, 'utf8')); // what database.js runs first: a no-op for ships
  migrate(old);
  assert.deepEqual(columns(old), columns(fresh()));
});

test('migrating twice changes nothing, and a fresh database needs nothing', () => {
  const db = fresh();
  const before = columns(db);
  migrate(db);
  migrate(db);
  assert.deepEqual(columns(db), before);
});

test('existing rows get NULL in the added columns: not captured, rather than blank', () => {
  const db = new Database(':memory:');
  db.exec(ORIGINAL_SHIPS);
  db.prepare(`INSERT INTO ships (abandonment_id, scraped_at, ship_name) VALUES ('1', '2026-01-01', 'A')`).run();
  migrate(db);
  const row = db.prepare('SELECT * FROM ships').get();
  for (const c of ADDED_COLUMNS) assert.equal(row[c], null, c);
});

test('derived columns are added columns', () => {
  for (const c of DERIVED_COLUMNS) assert.ok(ADDED_COLUMNS.includes(c), c);
});

test('the committed database migrates cleanly', { skip: !fs.existsSync(DB_PATH) && 'no committed database' }, () => {
  // A copy: migrating writes, and the committed file must stay as it is.
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-')), 'seafarers.db');
  fs.copyFileSync(DB_PATH, copy);
  const db = new Database(copy);
  try {
    const rows = db.prepare('SELECT COUNT(*) AS n FROM ships').get().n;
    migrate(db);
    assert.deepEqual(columns(db), columns(fresh()));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ships').get().n, rows);
  } finally {
    db.close();
    fs.rmSync(path.dirname(copy), { recursive: true, force: true });
  }
});
