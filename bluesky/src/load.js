const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { iloUrlPattern } = require('./config');
const { STATUS_LABELS } = require('./status');

// The latest row per case, with the same filter as GET /api/ships
// (backend/src/routes/ships.js).
const LATEST_SHIPS = `
  SELECT abandonment_id, ship_name, ship_status, flag, imo_number, port_of_abandonment,
         abandonment_date, num_seafarers, circumstances, comments, fishing_vessel, ilo_url, scraped_at
  FROM ships
  WHERE scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)
  ORDER BY CAST(abandonment_id AS INTEGER)`;

function usabilityProblem(row) {
  if (!/^\d+$/.test(row.abandonment_id || '')) return 'non-numeric abandonment_id';
  if (!String(row.ship_name ?? '').trim()) return 'no ship name';
  if (!((row.ship_status ?? '') in STATUS_LABELS)) return `unknown status ${JSON.stringify(row.ship_status)}`;
  if (!iloUrlPattern(row.abandonment_id).test(row.ilo_url || '')) return 'ilo_url is not this case\'s ILO record';
  return null;
}

// Takes an open handle, so tests can pass an in-memory database.
function queryLatestShips(db) {
  const ships = [];
  const dropped = [];
  const seen = new Set();
  for (const row of db.prepare(LATEST_SHIPS).all()) {
    if (seen.has(row.abandonment_id)) continue;
    seen.add(row.abandonment_id);
    const problem = usabilityProblem(row);
    if (problem) dropped.push({ id: row.abandonment_id, problem });
    else ships.push({ ...row, ship_status: row.ship_status ?? '' });
  }

  let dataAsOf = null;
  try {
    dataAsOf = db.prepare('SELECT MAX(scraped_at) AS t FROM scrape_runs').get().t;
  } catch { /* a database from before scrape_runs existed */ }
  if (!dataAsOf) dataAsOf = db.prepare('SELECT MAX(scraped_at) AS t FROM ships').get().t;

  return { ships, dropped, dataAsOf };
}

// Node's built-in SQLite, opened read-only. Not better-sqlite3 (a native build
// the job would otherwise have to install) and not backend/src/db/database.js,
// which switches the file to WAL and runs the schema and a backfill INSERT.
function loadLatestShips(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error(`no database at ${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return queryLatestShips(db);
  } finally {
    db.close();
  }
}

module.exports = { loadLatestShips, queryLatestShips };
