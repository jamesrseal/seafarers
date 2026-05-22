#!/usr/bin/env node
/**
 * Reads legacy/ports_review.csv and applies the port_of_abandonment_updated
 * column as the new canonical name for each port in the database.
 * Lat/lon coordinates are NOT changed.
 * Rebuilds scraper/cleaned_ports_list.csv with the updated names.
 */
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CSV_PATH    = path.join(__dirname, '../legacy/ports_review.csv');
const DB_PATH     = path.join(__dirname, 'data/seafarers.db');
const SCRAPER_CSV = path.join(__dirname, '../scraper/cleaned_ports_list.csv');

// ── CSV parser (handles quoted fields containing commas) ───────────────────
function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(current); current = ''; }
    else { current += ch; }
  }
  fields.push(current);
  return fields;
}

const rows = fs.readFileSync(CSV_PATH, 'utf8')
  .split('\n')
  .filter(l => l.trim())
  .map(parseCSVRow);

// Skip header row; columns: old_name, new_name, lat, lon, ship_count
const renames = [];
for (const row of rows.slice(1)) {
  const oldName = row[0]?.trim() ?? '';
  const newName = row[1]?.trim() ?? '';
  if (newName && oldName !== newName) {
    renames.push({ old: oldName, new: newName });
  }
}
console.log(`Renames to apply: ${renames.length}\n`);

// ── Apply to DB (all rows, all scrapes) ────────────────────────────────────
const db = new Database(DB_PATH);
const updateStmt  = db.prepare(`UPDATE ships SET port_of_abandonment = ? WHERE port_of_abandonment = ?`);
const updateEmpty = db.prepare(`UPDATE ships SET port_of_abandonment = ? WHERE port_of_abandonment IS NULL OR port_of_abandonment = ''`);

let total = 0;
for (const { old: from, new: to } of renames) {
  const info = from === ''
    ? updateEmpty.run(to)
    : updateStmt.run(to, from);
  total += info.changes;
  if (info.changes > 0) {
    const label = from === '' ? '(empty)' : `"${from}"`;
    console.log(`  ${label} → "${to}"  (${info.changes} rows)`);
  }
}
console.log(`\nDB: ${total} rows updated\n`);

// ── Rebuild scraper CSV from canonical names in DB (lat/lon unchanged) ─────
const ports = db.prepare(`
  SELECT port_of_abandonment, port_latitude, port_longitude
  FROM ships
  WHERE port_latitude IS NOT NULL AND port_longitude IS NOT NULL
  GROUP BY port_of_abandonment
  ORDER BY port_of_abandonment ASC
`).all();
db.close();

const lines = [
  'Port of abandonment~lat~long',
  ...ports.map(r => `${r.port_of_abandonment}~${r.port_latitude}~${r.port_longitude}`),
];
fs.writeFileSync(SCRAPER_CSV, lines.join('\n') + '\n');
console.log(`Scraper CSV rebuilt: ${lines.length - 1} unique port entries`);
