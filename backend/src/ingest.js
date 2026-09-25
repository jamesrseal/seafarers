const { ADDED_COLUMNS, DERIVED_COLUMNS } = require('./db/migrate');

// Every column the scraper supplies, in the order they're inserted.
const COLUMNS = [
  'ship_name', 'ship_status', 'flag', 'imo_number', 'port_of_abandonment',
  'port_latitude', 'port_longitude', 'abandonment_date', 'notification_date',
  'reporting_member', 'num_seafarers', 'circumstances', 'comments',
  'fishing_vessel', 'ilo_url', 'vessel_finder_url', 'last_activity_date',
  ...ADDED_COLUMNS,
];

// A ship is only stored when one of these differs from its latest row, so daily
// scrapes don't duplicate the whole dataset — history keeps one row per actual
// change. Derived columns aren't among them: they follow from the others.
const COMPARED = COLUMNS.filter(c => !DERIVED_COLUMNS.includes(c));

// null/undefined and '' are treated as equal; numbers compare by value.
const norm = v => (v === null || v === undefined ? '' : String(v));

// Stores one scrape run: { scraped_at, ships } as the scraper posts it.
//
// Two things are written in place on the latest row rather than as a new one,
// because neither is a change to the case:
// - a column that row never captured (NULL: it was added to the table after
//   the row was written) gets its first value — otherwise adding a field would
//   write a row for every case on the next refresh;
// - a derived column that no longer matches is brought up to date, so a change
//   to how it is derived doesn't either.
// The filled row keeps its scraped_at, so the dates the site reports from
// history (new cases, status changes, the feed, sitemap lastmod) don't move.
//
// A record without one of the added columns — an older saved scrape, or a
// field the page stopped serving — keeps the latest row's value for it.
function ingestRun(db, scrapedAt, records) {
  const latestRow = db.prepare(
    `SELECT * FROM ships WHERE abandonment_id = ? ORDER BY scraped_at DESC LIMIT 1`
  );
  const insert = db.prepare(
    `INSERT INTO ships (abandonment_id, scraped_at, ${COLUMNS.join(', ')})
     VALUES (@abandonment_id, @scraped_at, ${COLUMNS.map(c => `@${c}`).join(', ')})`
  );
  // OR IGNORE: a retried post of the same run keeps the original counts.
  const logRun = db.prepare(
    `INSERT OR IGNORE INTO scrape_runs (scraped_at, received, inserted) VALUES (?, ?, ?)`
  );
  const updates = new Map();
  const updateOf = columns => {
    const key = columns.join(',');
    if (!updates.has(key)) {
      updates.set(key, db.prepare(`UPDATE ships SET ${columns.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`));
    }
    return updates.get(key);
  };

  const run = db.transaction(() => {
    let inserted = 0;
    let filled = 0;
    for (const record of records) {
      const latest = latestRow.get(String(record.abandonment_id));
      const ship = { ...record };
      for (const c of ADDED_COLUMNS) {
        if (ship[c] === undefined) ship[c] = latest ? latest[c] : null;
      }

      const uncaptured = new Set(latest ? ADDED_COLUMNS.filter(c => latest[c] === null) : []);
      const changed = !latest || COMPARED.some(c => !uncaptured.has(c) && norm(latest[c]) !== norm(ship[c]));
      if (changed) {
        insert.run({ ...ship, scraped_at: scrapedAt });
        inserted++;
        continue;
      }

      const inPlace = ADDED_COLUMNS.filter(c =>
        (uncaptured.has(c) && ship[c] !== null)
        || (DERIVED_COLUMNS.includes(c) && norm(latest[c]) !== norm(ship[c])));
      if (inPlace.length) {
        updateOf(inPlace).run({ ...Object.fromEntries(inPlace.map(c => [c, ship[c]])), id: latest.id });
        filled++;
      }
    }
    logRun.run(scrapedAt, records.length, inserted);
    return { inserted, filled };
  });

  return run();
}

module.exports = { ingestRun, COLUMNS };
