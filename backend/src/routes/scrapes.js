const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { ingestRun } = require('../ingest');

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

  try {
    const { inserted, filled } = ingestRun(db, scraped_at, ships);
    res.json({ received: ships.length, inserted, filled, unchanged: ships.length - inserted, scraped_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
