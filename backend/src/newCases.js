// Which cases the site should call new.
//
// A case's rows are only written when one of its fields changed, so its FIRST
// row is its arrival and every later row is an edit: MIN(scraped_at) per
// abandonment_id is when the ILO database first carried it, and an update can
// never move that minimum. That is what makes "new, not merely updated"
// expressible at all — scrape_runs.inserted can't do it, because it counts new
// and changed rows together (one refresh wrote nine rows of which four were
// arrivals, and another wrote nine of which none were).
//
// New means "in the most recent arrival cohort", not "arrived in the last
// refresh": refreshes that bring no new cases are the norm, and the badge has
// to survive them. The cohort is dropped once it is NEW_WINDOW_DAYS old —
// arrivals are irregular enough that a gap of 66 days has happened, and
// "New" on a two-month-old case is a lie.
//
// The first scrape run is excluded, because that run is the whole database
// arriving at once rather than news. feed.js applies the same exclusion for the
// same reason, so the badge and the Atom feed agree about what a new case is.

const NEW_WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;

// The run that filled the empty database. COALESCE covers a database whose
// scrape_runs is empty: SQL's `!= NULL` is NULL, not true, so without it every
// comparison below would fail and the badge would vanish in silence rather than
// raise anything. Falling back to the ships' own earliest row gives the same
// answer that schema.sql's scrape_runs backfill would have.
const FIRST_RUN = `COALESCE(
    (SELECT MIN(scraped_at) FROM scrape_runs),
    (SELECT MIN(scraped_at) FROM ships))`;

// The newest first-seen date among all cases, ignoring the backfill.
const COHORT = `
  SELECT MAX(first_seen) AS at FROM (
    SELECT MIN(scraped_at) AS first_seen FROM ships GROUP BY abandonment_id
  ) WHERE first_seen != (${FIRST_RUN})`;

// A case is new when its first row is this one. Compared against `first_seen`
// rather than joined, so the caller can compute it once per request instead of
// once per row.
const FIRST_SEEN = `(SELECT MIN(s3.scraped_at) FROM ships s3 WHERE s3.abandonment_id = ships.abandonment_id)`;

// Takes an open handle rather than the shared connection, so tests can pass an
// in-memory database (src/db/database.js writes on open).
function newCohortAt(db, now = Date.now()) {
  const row = db.prepare(COHORT).get();
  const at = row && row.at;
  if (!at) return null;
  return now - new Date(at).getTime() <= NEW_WINDOW_DAYS * MS_PER_DAY ? at : null;
}

module.exports = { newCohortAt, FIRST_SEEN, NEW_WINDOW_DAYS, COHORT };
