const express = require('express');
const router = express.Router();
const db = require('../db/database');

// List all distinct scrape runs with record counts
router.get('/', (req, res) => {
  const runs = db.prepare(
    `SELECT scraped_at, COUNT(*) as record_count FROM ships GROUP BY scraped_at ORDER BY scraped_at DESC`
  ).all();
  res.json(runs);
});

// Bulk ingest from scraper: { scraped_at: ISO string, ships: [...] }
router.post('/ingest', (req, res) => {
  const { scraped_at, ships } = req.body;

  if (!scraped_at || !Array.isArray(ships)) {
    return res.status(400).json({ error: 'scraped_at and ships array required' });
  }

  const insert = db.prepare(`
    INSERT INTO ships (
      abandonment_id, scraped_at, ship_name, ship_status, flag, imo_number,
      port_of_abandonment, port_latitude, port_longitude, abandonment_date,
      notification_date, reporting_member, num_seafarers, circumstances,
      comments, fishing_vessel, ilo_url, vessel_finder_url, flag_url,
      last_activity_date
    ) VALUES (
      @abandonment_id, @scraped_at, @ship_name, @ship_status, @flag, @imo_number,
      @port_of_abandonment, @port_latitude, @port_longitude, @abandonment_date,
      @notification_date, @reporting_member, @num_seafarers, @circumstances,
      @comments, @fishing_vessel, @ilo_url, @vessel_finder_url, @flag_url,
      @last_activity_date
    )
  `);

  const insertMany = db.transaction((records) => {
    for (const ship of records) {
      insert.run({ ...ship, scraped_at });
    }
  });

  try {
    insertMany(ships);
    res.json({ inserted: ships.length, scraped_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
