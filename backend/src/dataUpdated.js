// When the cases last changed: the newest scrape run or import, or the newest
// case removed by hand, whichever is later. A removal scrapes nothing, so it
// isn't a run, but the site's cases changed when it happened.
const DATA_UPDATED = `
  SELECT MAX(at) AS at FROM (
    SELECT MAX(scraped_at) AS at FROM scrape_runs
    UNION ALL
    SELECT MAX(removed_at) FROM removed_cases
  )`;

// Takes an open handle rather than the shared connection, so tests can pass an
// in-memory database (src/db/database.js writes on open).
function dataUpdatedAt(db) {
  return db.prepare(DATA_UPDATED).get().at ?? null;
}

module.exports = { dataUpdatedAt };
