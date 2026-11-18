const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { dataUpdatedAt } = require('../src/dataUpdated');

const SCHEMA = path.join(__dirname, '../src/db/schema.sql');

// An in-memory database built from the real schema.
function seed({ runs = [], removals = [] }) {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  const run = db.prepare('INSERT INTO scrape_runs (scraped_at, received, inserted) VALUES (?, 0, 0)');
  for (const at of runs) run.run(at);
  const removal = db.prepare("INSERT INTO removed_cases (abandonment_id, removed_at, reason) VALUES ('1', ?, 'test')");
  for (const at of removals) removal.run(at);
  return db;
}

test('the newest run, when nothing has been removed since', () => {
  const db = seed({ runs: ['2026-11-02T15:47:39.223Z', '2026-11-13T16:39:32.356Z'], removals: ['2026-11-10T09:00:00.000Z'] });
  assert.equal(dataUpdatedAt(db), '2026-11-13T16:39:32.356Z');
});

test('a case removed after the last run moves the date', () => {
  const db = seed({ runs: ['2026-11-13T16:39:32.356Z'], removals: ['2026-11-18T14:07:07.000Z'] });
  assert.equal(dataUpdatedAt(db), '2026-11-18T14:07:07.000Z');
});

test('a database with no runs and no removals has no date', () => {
  assert.equal(dataUpdatedAt(seed({})), null);
});
