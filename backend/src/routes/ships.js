const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Latest snapshot of every ship, with optional filters
router.get('/', (req, res) => {
  const { status, flag, port, q } = req.query;

  let where = `
    WHERE scraped_at = (
      SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id
    )
  `;
  const params = [];

  if (status) {
    where += ` AND ship_status = ?`;
    params.push(status);
  }
  if (flag) {
    where += ` AND flag = ?`;
    params.push(flag);
  }
  if (port) {
    where += ` AND port_of_abandonment = ?`;
    params.push(port);
  }
  if (q) {
    where += ` AND (ship_name LIKE ? OR circumstances LIKE ? OR port_of_abandonment LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const ships = db.prepare(`SELECT * FROM ships ${where} ORDER BY abandonment_date DESC`).all(...params);
  res.json(ships);
});

// Filter option lists (for dropdowns) — derived from latest snapshot
router.get('/filters', (req, res) => {
  const latestWhere = `
    WHERE scraped_at = (
      SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id
    )
  `;
  const statuses = db.prepare(`SELECT DISTINCT ship_status FROM ships ${latestWhere} ORDER BY ship_status`).all().map(r => r.ship_status).filter(Boolean);
  const flags = db.prepare(`SELECT DISTINCT flag FROM ships ${latestWhere} ORDER BY flag`).all().map(r => r.flag).filter(Boolean);
  const ports = db.prepare(`SELECT DISTINCT port_of_abandonment FROM ships ${latestWhere} ORDER BY port_of_abandonment`).all().map(r => r.port_of_abandonment).filter(Boolean);
  res.json({ statuses, flags, ports });
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
