const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Every column the scraper supplies. A ship is only stored when one of these
// differs from its latest row, so daily scrapes don't duplicate the whole
// dataset — history keeps one row per actual change.
const FIELDS = [
  'ship_name', 'ship_status', 'flag', 'imo_number', 'port_of_abandonment',
  'port_latitude', 'port_longitude', 'abandonment_date', 'notification_date',
  'reporting_member', 'num_seafarers', 'circumstances', 'comments',
  'fishing_vessel', 'ilo_url', 'vessel_finder_url', 'last_activity_date',
];

// null/undefined and '' are treated as equal; numbers compare by value.
const norm = v => (v === null || v === undefined ? '' : String(v));

function hasChanged(latest, ship) {
  return !latest || FIELDS.some(f => norm(latest[f]) !== norm(ship[f]));
}

// Ingest writes to the live database, so it requires the shared secret in
// INGEST_TOKEN, sent as "Authorization: Bearer <token>". With no token set,
// local development stays open but production refuses every ingest.
function requireIngestToken(req, res, next) {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Ingest disabled: INGEST_TOKEN is not configured' });
    }
    return next();
  }
  const given    = Buffer.from((req.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// List scrape runs, newest first. record_count is the number of records
// scraped; inserted is how many of them were new or changed.
router.get('/', (req, res) => {
  const runs = db.prepare(
    `SELECT scraped_at, received AS record_count, inserted FROM scrape_runs ORDER BY scraped_at DESC`
  ).all();
  res.json(runs);
});

// Bulk ingest from scraper: { scraped_at: ISO string, ships: [...] }
router.post('/ingest', requireIngestToken, (req, res) => {
  const { scraped_at, ships } = req.body;

  if (!scraped_at || !Array.isArray(ships)) {
    return res.status(400).json({ error: 'scraped_at and ships array required' });
  }

  const latest = db.prepare(
    `SELECT * FROM ships WHERE abandonment_id = ? ORDER BY scraped_at DESC LIMIT 1`
  );

  const insert = db.prepare(`
    INSERT INTO ships (
      abandonment_id, scraped_at, ship_name, ship_status, flag, imo_number,
      port_of_abandonment, port_latitude, port_longitude, abandonment_date,
      notification_date, reporting_member, num_seafarers, circumstances,
      comments, fishing_vessel, ilo_url, vessel_finder_url, last_activity_date
    ) VALUES (
      @abandonment_id, @scraped_at, @ship_name, @ship_status, @flag, @imo_number,
      @port_of_abandonment, @port_latitude, @port_longitude, @abandonment_date,
      @notification_date, @reporting_member, @num_seafarers, @circumstances,
      @comments, @fishing_vessel, @ilo_url, @vessel_finder_url, @last_activity_date
    )
  `);

  // OR IGNORE: a retried post of the same run keeps the original counts.
  const logRun = db.prepare(
    `INSERT OR IGNORE INTO scrape_runs (scraped_at, received, inserted) VALUES (?, ?, ?)`
  );

  const ingest = db.transaction((records) => {
    let inserted = 0;
    for (const ship of records) {
      if (!hasChanged(latest.get(String(ship.abandonment_id)), ship)) continue;
      insert.run({ ...ship, scraped_at });
      inserted++;
    }
    logRun.run(scraped_at, records.length, inserted);
    return inserted;
  });

  try {
    const inserted = ingest(ships);
    res.json({ received: ships.length, inserted, unchanged: ships.length - inserted, scraped_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
