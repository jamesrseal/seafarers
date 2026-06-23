const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Latest snapshot of every ship, with optional filters
router.get('/', (req, res) => {
  const { status, flag, port, country, q } = req.query;

  let where = `
    WHERE scraped_at = (
      SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id
    )
  `;
  const params = [];

  if (status) {
    const STATUS_VALUES = { Unresolved: '', Disputed: 'disputed', Inactive: 'inactive', Resolved: 'resolved' };
    where += ` AND ship_status = ?`;
    params.push(status in STATUS_VALUES ? STATUS_VALUES[status] : status);
  }
  if (flag) {
    if (flag === 'Unknown') {
      where += ` AND (flag IS NULL OR flag = '')`;
    } else {
      where += ` AND flag = ?`;
      params.push(flag);
    }
  }
  if (port) {
    where += ` AND port_of_abandonment = ?`;
    params.push(port);
  } else if (country) {
    where += ` AND (port_of_abandonment LIKE ? OR port_of_abandonment = ?)`;
    params.push(`%, ${country}`, country);
  }
  if (q) {
    where += ` AND (ship_name LIKE ? OR circumstances LIKE ? OR port_of_abandonment LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  // abandonment_date is free text ("September 2010", "2 July 2014"), so ordering
  // by it sorts alphabetically, not chronologically. Order by the most recent
  // activity (ISO dates, NULLs last) and break ties by newest case id — case
  // ids are assigned sequentially, so higher id ≈ more recently added.
  const ships = db.prepare(
    `SELECT * FROM ships ${where}
     ORDER BY last_activity_date DESC, CAST(abandonment_id AS INTEGER) DESC`
  ).all(...params);
  res.json(ships);
});

// Filter option lists (for dropdowns) — derived from latest snapshot
router.get('/filters', (req, res) => {
  const latestWhere = `
    WHERE scraped_at = (
      SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id
    )
  `;
  const STATUS_LABELS = { '': 'Unresolved', disputed: 'Disputed', inactive: 'Inactive', resolved: 'Resolved' };
  const statuses = db.prepare(`SELECT DISTINCT ship_status FROM ships ${latestWhere} ORDER BY ship_status`).all()
    .map(r => STATUS_LABELS[r.ship_status] ?? r.ship_status)
    .filter(Boolean);
  const flagRows = db.prepare(`SELECT DISTINCT flag FROM ships ${latestWhere} ORDER BY flag`).all().map(r => r.flag);
  const hasUnknownFlag = flagRows.some(f => !f);
  const flags = [...flagRows.filter(Boolean), ...(hasUnknownFlag ? ['Unknown'] : [])];
  const ports = db.prepare(`SELECT DISTINCT port_of_abandonment FROM ships ${latestWhere} ORDER BY port_of_abandonment`).all().map(r => r.port_of_abandonment).filter(Boolean);
  const countries = [...new Set(ports.map(p => {
    const parts = p.split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : null;
  }).filter(Boolean))].sort();
  res.json({ statuses, flags, ports, countries });
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
