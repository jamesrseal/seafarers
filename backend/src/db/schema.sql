CREATE TABLE IF NOT EXISTS ships (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  abandonment_id       TEXT NOT NULL,
  scraped_at           DATETIME NOT NULL,
  ship_name            TEXT,
  ship_status          TEXT,
  flag                 TEXT,
  imo_number           TEXT,
  port_of_abandonment  TEXT,
  port_latitude        REAL,
  port_longitude       REAL,
  abandonment_date     TEXT,
  notification_date    TEXT,
  reporting_member     TEXT,
  num_seafarers        INTEGER,
  circumstances        TEXT,
  comments             TEXT,
  fishing_vessel       INTEGER DEFAULT 0,
  ilo_url              TEXT,
  vessel_finder_url    TEXT,
  flag_url             TEXT,
  last_activity_date   TEXT
);

CREATE INDEX IF NOT EXISTS idx_abandonment_id ON ships(abandonment_id);
CREATE INDEX IF NOT EXISTS idx_scraped_at ON ships(scraped_at);

-- One row per ingest. Ingest only stores ships whose data changed since their
-- latest row, so this table (not ships) is the record of when scrapes ran.
CREATE TABLE IF NOT EXISTS scrape_runs (
  scraped_at  DATETIME PRIMARY KEY,
  received    INTEGER NOT NULL,  -- records the scraper sent
  inserted    INTEGER NOT NULL   -- rows stored (new or changed ships)
);

-- Backfill runs ingested before scrape_runs existed. Every run with stored
-- rows is present afterwards, so this is a no-op on later startups.
INSERT OR IGNORE INTO scrape_runs (scraped_at, received, inserted)
  SELECT scraped_at, COUNT(*), COUNT(*) FROM ships GROUP BY scraped_at;
