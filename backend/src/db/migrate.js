// Columns added to `ships` after the committed database was first built. SQLite
// can't add a column with CREATE TABLE IF NOT EXISTS, so schema.sql declares
// them for a fresh database and migrate() adds any an existing one lacks. The
// two must agree; test/migrate.test.js fails if they drift.
//
// On rows written before a column existed it is NULL, which means "not
// captured then", not "blank" — ingest fills the latest row in place rather
// than recording a change (see ../ingest.js).
const ADDED_COLUMNS = [
  'vessel_type',                  // "General Cargo Ship"
  'financial_security_provider',  // the insurer, as the ILO names it
  'nationalities',                // JSON: [{ country, count }]
  'payment_status',               // JSON: [{ date, dateText, status, detail }], newest first
  'payment_latest',               // the newest payment entry's status
  'repatriation_status',          // JSON, as payment_status
  'repatriation_latest',          // the newest repatriation entry's status
  'actions_taken',                // JSON, as payment_status
];

// Derived from other columns by the scraper, so they never mark a change of
// their own: a fix to how they're derived is written in place, not as history.
const DERIVED_COLUMNS = ['payment_latest', 'repatriation_latest'];

function migrate(db) {
  const have = new Set(db.prepare('PRAGMA table_info(ships)').all().map(c => c.name));
  for (const column of ADDED_COLUMNS) {
    if (!have.has(column)) db.exec(`ALTER TABLE ships ADD COLUMN ${column} TEXT`);
  }
}

module.exports = { ADDED_COLUMNS, DERIVED_COLUMNS, migrate };
