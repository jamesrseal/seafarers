// Takes a case out of the committed database because the ILO has withdrawn it,
// and records that in removed_cases. The site never deletes a case on its own:
// a withdrawn case's page opens empty, and the scraper skips an empty page.
//
//   node scripts/remove-case.js 1884 --reason "Withdrawn by the ILO" --dry-run
//   node scripts/remove-case.js 1884 --reason "Withdrawn by the ILO"
//
// Check first that the ILO really has withdrawn it: its total and filter counts
// one lower, and the case's page empty. Then commit the database. The header's
// date moves to the removal (src/dataUpdated.js).

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../data/seafarers.db');
const SCHEMA = path.join(__dirname, '../src/db/schema.sql');

const argv = process.argv.slice(2);
const id = argv.find((a, i) => /^\d+$/.test(a) && argv[i - 1] !== '--reason');
const reasonAt = argv.indexOf('--reason');
const reason = reasonAt === -1 ? null : argv[reasonAt + 1];
const DRY_RUN = argv.includes('--dry-run');

if (!id || !reason) {
  console.error('Usage: node scripts/remove-case.js <case ID> --reason "<why>" [--dry-run]');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: DRY_RUN });
if (!DRY_RUN) db.exec(fs.readFileSync(SCHEMA, 'utf8'));

const rows = db.prepare('SELECT ship_name, scraped_at FROM ships WHERE abandonment_id = ? ORDER BY scraped_at').all(id);
if (!rows.length) {
  console.error(`Case ${id} isn't in the database.`);
  process.exit(1);
}
const shipName = rows[rows.length - 1].ship_name;
console.log(`Case ${id}, ${shipName}: ${rows.length} row(s), first seen ${rows[0].scraped_at}.`);

if (DRY_RUN) {
  console.log('Dry run: nothing written.');
  process.exit(0);
}

const removedAt = new Date().toISOString();
db.transaction(() => {
  db.prepare('DELETE FROM ships WHERE abandonment_id = ?').run(id);
  db.prepare('INSERT INTO removed_cases (abandonment_id, removed_at, ship_name, reason) VALUES (?, ?, ?, ?)')
    .run(id, removedAt, shipName, reason);
})();
// As the refresh and the importer leave it: everything in the main file.
db.pragma('wal_checkpoint(TRUNCATE)');
db.pragma('journal_mode = DELETE');
db.close();
console.log(`Removed case ${id} at ${removedAt}. Commit the database.`);
