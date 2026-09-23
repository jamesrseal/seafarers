const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { newCohortAt, NEW_WINDOW_DAYS, FIRST_SEEN } = require('../src/newCases');

const SCHEMA = path.join(__dirname, '../src/db/schema.sql');
const DB_PATH = path.join(__dirname, '../data/seafarers.db');
const DAY = 86_400_000;

// Runs, oldest first. R1 is the backfill: the whole database arriving at once.
const R1 = '2026-01-01T00:00:00.000Z';
const R2 = '2026-02-01T00:00:00.000Z';
const R3 = '2026-03-01T00:00:00.000Z';
const R4 = '2026-03-05T00:00:00.000Z';

// An in-memory database built from the real schema, so a change to the schema
// can't quietly invalidate these. `rows` are [abandonment_id, scraped_at]:
// one row per time that case's data changed, which is what the ingest writes.
function seed(runs, rows) {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  const run = db.prepare(`INSERT INTO scrape_runs (scraped_at, received, inserted) VALUES (?, 0, 0)`);
  for (const at of runs) run.run(at);
  const ship = db.prepare(`INSERT INTO ships (abandonment_id, scraped_at, ship_name) VALUES (?, ?, ?)`);
  for (const [id, at] of rows) ship.run(id, at, `Ship ${id}`);
  return db;
}

// Which cases the route would mark, for a given cohort — the same comparison
// routes/ships.js makes, so the test covers the SQL the site actually runs.
const badged = (db, cohort) =>
  db.prepare(
    `SELECT abandonment_id FROM ships WHERE ${FIRST_SEEN} = ?
     GROUP BY abandonment_id ORDER BY abandonment_id`
  ).all(cohort).map(r => r.abandonment_id);

// The whole point of the feature: a refresh that edits a case must not make it
// look new. B arrived in February and was edited in March; only C arrived in
// March, so only C is new.
test('a case that was only updated is not new', () => {
  const db = seed([R1, R2, R3], [
    ['A', R1],
    ['B', R2], ['B', R3],
    ['C', R3],
  ]);
  const cohort = newCohortAt(db, Date.parse(R3));
  assert.equal(cohort, R3);
  assert.deepEqual(badged(db, cohort), ['C']);
  db.close();
});

test('the newest arrivals win, and older ones stop being new', () => {
  const db = seed([R1, R2, R3], [['A', R1], ['B', R2], ['C', R3], ['D', R3]]);
  const cohort = newCohortAt(db, Date.parse(R3));
  assert.deepEqual(badged(db, cohort), ['C', 'D'], 'both of March\'s arrivals');
  assert.ok(!badged(db, cohort).includes('B'), 'February\'s arrival is no longer new');
  db.close();
});

// Refreshes that bring nothing new are the normal case — the badge has to sit
// still through them rather than clearing overnight.
test('a refresh that brings no new cases leaves the badge where it is', () => {
  const db = seed([R1, R2, R3, R4], [
    ['A', R1], ['A', R4],
    ['C', R3], ['C', R4],
  ]);
  const cohort = newCohortAt(db, Date.parse(R4));
  assert.equal(cohort, R3, 'still March 1st, though a refresh ran on the 5th');
  assert.deepEqual(badged(db, cohort), ['C']);
  db.close();
});

// A fresh deployment is every case arriving at once, which is not news.
test('the first scrape run is not an arrival', () => {
  const db = seed([R1], [['A', R1], ['B', R1], ['C', R1]]);
  assert.equal(newCohortAt(db, Date.parse(R1)), null);
  db.close();
});

test('an empty database has nothing to mark', () => {
  const db = seed([], []);
  assert.equal(newCohortAt(db, Date.now()), null);
  db.close();
});

// A database whose scrape_runs is empty used to mark nothing at all: `!= NULL`
// is NULL in SQL, so every comparison failed and the badge vanished without an
// error to notice. COALESCE falls back to the ships' own earliest row.
test('an empty scrape_runs falls back to the ships themselves', () => {
  const db = seed([], [['A', R1], ['B', R2], ['C', R3]]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scrape_runs').get().n, 0, 'no runs recorded');
  const cohort = newCohortAt(db, Date.parse(R3));
  assert.equal(cohort, R3, 'still finds the newest arrivals');
  assert.deepEqual(badged(db, cohort), ['C']);
  assert.ok(!badged(db, cohort).includes('A'), 'and still treats the earliest row as the backfill');
  db.close();
});

// Arrivals are irregular — a 66-day gap has happened — so without a cap "New"
// would end up on a two-month-old case.
test('the badge expires once the arrivals are old', () => {
  const db = seed([R1, R2, R3], [['A', R1], ['C', R3]]);
  const arrived = Date.parse(R3);
  assert.equal(newCohortAt(db, arrived), R3, 'the day it arrived');
  assert.equal(newCohortAt(db, arrived + NEW_WINDOW_DAYS * DAY - 1), R3, 'just inside the window');
  assert.equal(newCohortAt(db, arrived + NEW_WINDOW_DAYS * DAY + 1), null, 'just outside it');
  db.close();
});

// The rule has to hold against the real history, not just hand-built rows.
// Deliberately not pinned to specific case ids: arrivals land every few days,
// so a test naming them would fail on the cadence of the data rather than on a
// mistake, and would soon be deleted for crying wolf. These are the things that
// stay true however often the ILO adds a case.
test("the committed database marks a cohort of real arrivals", { skip: !fs.existsSync(DB_PATH) && "no committed database" }, () => {
  const db = new Database(DB_PATH, { readonly: true });
  const at = db.prepare(
    `SELECT MAX(first_seen) AS at FROM (
       SELECT MIN(scraped_at) AS first_seen FROM ships GROUP BY abandonment_id
     ) WHERE first_seen != (SELECT MIN(scraped_at) FROM scrape_runs)`
  ).get().at;
  assert.ok(at, "there is a cohort to find");

  // Anchored to the cohort's own date rather than the clock, so this keeps
  // testing the rule as the committed data ages.
  assert.equal(newCohortAt(db, Date.parse(at)), at, "marked on the day it arrived");
  assert.equal(newCohortAt(db, Date.parse(at) + (NEW_WINDOW_DAYS + 1) * DAY), null, "and not a fortnight later");

  const runs = db.prepare(`SELECT scraped_at FROM scrape_runs`).all().map(r => r.scraped_at);
  assert.ok(runs.includes(at), "the cohort is a real refresh, not a stray timestamp");

  const marked = badged(db, at);
  const cases = db.prepare(`SELECT COUNT(DISTINCT abandonment_id) AS n FROM ships`).get().n;
  assert.ok(marked.length > 0, "some cases arrived in it");
  assert.ok(marked.length < cases / 2, `${marked.length} of ${cases} is an arrival, not the whole database`);

  // Every case it marks really does begin there — no case with earlier history
  // can slip in, which is the whole distinction between added and updated.
  const firstSeen = db.prepare(`SELECT MIN(scraped_at) AS at FROM ships WHERE abandonment_id = ?`);
  for (const id of marked) {
    assert.equal(firstSeen.get(id).at, at, `case ${id} first appears in the cohort`);
  }

  // The case the refreshes have rewritten most often is the one a rule built on
  // scrape_runs.inserted would call new most often. It never is.
  const busiest = db.prepare(
    `SELECT abandonment_id AS id, COUNT(*) AS rows FROM ships
     GROUP BY abandonment_id ORDER BY COUNT(*) DESC, CAST(abandonment_id AS INTEGER) LIMIT 1`
  ).get();
  assert.ok(busiest.rows > 1, "some case has been edited since it arrived");
  assert.ok(!marked.includes(busiest.id),
    `case ${busiest.id} has ${busiest.rows} rows: edited that many times, added once, and not recently`);
  db.close();
});
