const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { whereSql, facets } = require('../shipFilters');
const { newCohortAt, FIRST_SEEN } = require('../newCases');

// Marks the cases the site calls new (see ../newCases.js). Deliberately absent
// from /facets, which counts every facet on its own — a subquery per row there
// would be paid once per count.
const IS_NEW = `${FIRST_SEEN} = ? AS is_new`;

// Latest snapshot of every ship, with optional filters
router.get('/', (req, res) => {
  const { sql, params } = whereSql(req.query);
  // abandonment_date is free text ("September 2010", "2 July 2014"), so ordering
  // by it sorts alphabetically, not chronologically. Order by the most recent
  // activity (ISO dates, NULLs last) and break ties by newest case id — case
  // ids are assigned sequentially, so higher id ≈ more recently added.
  // ships.*, not *: whereSql joins each case's latest row, which would add its
  // columns to *.
  const ships = db.prepare(
    `SELECT ships.*, ${IS_NEW} FROM ships ${sql}
     ORDER BY last_activity_date DESC, CAST(abandonment_id AS INTEGER) DESC`
  ).all(newCohortAt(db), ...params);
  res.json(ships);
});

// Every status change the refreshes have recorded: consecutive history rows of
// one ship whose status differs. History only goes back to the first scrape
// run, so this is what the site has seen, not every change the ILO ever made.
// previous_scraped_at is when the old status was last seen, so a change found
// after a gap in refreshes can be dated honestly as "some time since then".
// Declared before /:abandonment_id, which would otherwise take the path.
router.get('/status-changes', (req, res) => {
  const runs = db.prepare(`SELECT scraped_at FROM scrape_runs ORDER BY scraped_at`).all().map(r => r.scraped_at);
  const rows = db.prepare(
    `SELECT abandonment_id, scraped_at, ship_status FROM ships ORDER BY abandonment_id, scraped_at`
  ).all();
  const changes = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const row = rows[i];
    if (prev.abandonment_id !== row.abandonment_id) continue;
    const from = prev.ship_status ?? '';
    const to = row.ship_status ?? '';
    if (from !== to) changes.push({ scraped_at: row.scraped_at, previous_scraped_at: prev.scraped_at, from, to });
  }
  res.json({ runs, changes });
});

// Faceted option lists with result counts (see ../shipFilters.js).
router.get('/facets', (req, res) => {
  res.json(facets(db, req.query));
});

// Single ship — latest
router.get('/:abandonment_id', (req, res) => {
  // Carries is_new too: a deep-linked case is fetched here, not from the list.
  const ship = db.prepare(
    `SELECT ships.*, ${IS_NEW} FROM ships
     WHERE abandonment_id = ? ORDER BY scraped_at DESC LIMIT 1`
  ).get(newCohortAt(db), req.params.abandonment_id);
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
