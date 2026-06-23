const express = require('express');
const router = express.Router();
const db = require('../db/database');

// External status labels (used in the UI/URL) <-> raw stored values.
const STATUS_VALUES = { Unresolved: '', Disputed: 'disputed', Inactive: 'inactive', Resolved: 'resolved' };
const STATUS_LABELS = { '': 'Unresolved', disputed: 'Disputed', inactive: 'Inactive', resolved: 'Resolved' };
const STATUS_ORDER  = ['', 'disputed', 'inactive', 'resolved'];

// Restrict to the most recent row per ship.
const LATEST = `scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)`;

function countryOf(port) {
  if (!port) return null;
  const parts = port.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

// Build SQL filter clauses from query params. `exclude` lists filter keys to
// skip — the facets endpoint counts each facet with every filter applied EXCEPT
// its own, so a facet's options reflect the other selections rather than
// collapsing to the single value already chosen.
function buildFilters({ status, flag, port, country, q }, exclude = []) {
  const skip = new Set(exclude);
  const clauses = [];
  const params = [];

  if (status && !skip.has('status')) {
    clauses.push(`ship_status = ?`);
    params.push(status in STATUS_VALUES ? STATUS_VALUES[status] : status);
  }
  if (flag && !skip.has('flag')) {
    if (flag === 'Unknown') clauses.push(`(flag IS NULL OR flag = '')`);
    else { clauses.push(`flag = ?`); params.push(flag); }
  }
  // port takes precedence over country (the UI clears one when the other is set)
  if (port && !skip.has('port')) {
    clauses.push(`port_of_abandonment = ?`);
    params.push(port);
  } else if (country && !skip.has('country')) {
    clauses.push(`(port_of_abandonment LIKE ? OR port_of_abandonment = ?)`);
    params.push(`%, ${country}`, country);
  }
  if (q && !skip.has('q')) {
    clauses.push(`(ship_name LIKE ? OR circumstances LIKE ? OR port_of_abandonment LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  return { clauses, params };
}

function whereSql(filters, exclude = []) {
  const { clauses, params } = buildFilters(filters, exclude);
  return { sql: `WHERE ${[LATEST, ...clauses].join(' AND ')}`, params };
}

// Latest snapshot of every ship, with optional filters
router.get('/', (req, res) => {
  const { sql, params } = whereSql(req.query);
  // abandonment_date is free text ("September 2010", "2 July 2014"), so ordering
  // by it sorts alphabetically, not chronologically. Order by the most recent
  // activity (ISO dates, NULLs last) and break ties by newest case id — case
  // ids are assigned sequentially, so higher id ≈ more recently added.
  const ships = db.prepare(
    `SELECT * FROM ships ${sql}
     ORDER BY last_activity_date DESC, CAST(abandonment_id AS INTEGER) DESC`
  ).all(...params);
  res.json(ships);
});

// Faceted option lists with result counts. Each facet is counted with every
// filter applied EXCEPT its own, so the options show what's still available
// given the other selections, and each "total" is the count with that facet
// removed (the "All" count). Zero-count values are simply absent.
router.get('/facets', (req, res) => {
  const f = req.query;

  const totalExcluding = (exclude) => {
    const { sql, params } = whereSql(f, exclude);
    return db.prepare(`SELECT COUNT(*) AS c FROM ships ${sql}`).get(...params).c;
  };
  const groupBy = (column, exclude) => {
    const { sql, params } = whereSql(f, exclude);
    return db.prepare(`SELECT ${column} AS v, COUNT(*) AS c FROM ships ${sql} GROUP BY ${column}`).all(...params);
  };

  // Status — map raw values to labels, keep canonical order
  const statusMap = Object.fromEntries(groupBy('ship_status', ['status']).map(r => [r.v ?? '', r.c]));
  const status = STATUS_ORDER.filter(s => statusMap[s]).map(s => ({ value: STATUS_LABELS[s], count: statusMap[s] }));

  // Flag — fold NULL/'' into "Unknown"; known flags alphabetical, Unknown last
  let unknownFlag = 0;
  const flagMap = {};
  for (const r of groupBy('flag', ['flag'])) {
    if (!r.v) unknownFlag += r.c;
    else flagMap[r.v] = (flagMap[r.v] || 0) + r.c;
  }
  const flag = Object.keys(flagMap).sort().map(v => ({ value: v, count: flagMap[v] }));
  if (unknownFlag) flag.push({ value: 'Unknown', count: unknownFlag });

  // Port — drop null/empty, alphabetical (country filter still applies if set)
  const port = groupBy('port_of_abandonment', ['port'])
    .filter(r => r.v)
    .map(r => ({ value: r.v, count: r.c }))
    .sort((a, b) => a.value.localeCompare(b.value));

  // Country — derived from the port string; both geo filters removed
  const countryMap = {};
  for (const r of groupBy('port_of_abandonment', ['port', 'country'])) {
    const c = countryOf(r.v);
    if (c) countryMap[c] = (countryMap[c] || 0) + r.c;
  }
  const country = Object.keys(countryMap).sort().map(v => ({ value: v, count: countryMap[v] }));

  res.json({
    status:  { total: totalExcluding(['status']),          values: status },
    flag:    { total: totalExcluding(['flag']),            values: flag },
    country: { total: totalExcluding(['port', 'country']), values: country },
    port:    { total: totalExcluding(['port']),            values: port },
  });
});

// Single ship — latest
router.get('/:abandonment_id', (req, res) => {
  const ship = db.prepare(
    `SELECT * FROM ships WHERE abandonment_id = ? ORDER BY scraped_at DESC LIMIT 1`
  ).get(req.params.abandonment_id);
  if (!ship) return res.status(404).json({ error: 'Not found' });
  res.json(ship);
});

// Full scrape history for a ship
router.get('/:abandonment_id/history', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM ships WHERE abandonment_id = ? ORDER BY scraped_at DESC`
  ).all(req.params.abandonment_id);
  res.json(rows);
});

module.exports = router;
