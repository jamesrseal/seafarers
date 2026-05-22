#!/usr/bin/env node
/**
 * Deduplicates port names by exact coordinates.
 * Ships that share the same (lat, lon) are merged under the most-common name.
 * Updates all rows in the DB (all scrapes), then rebuilds scraper/cleaned_ports_list.csv.
 */
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH     = path.join(__dirname, 'data/seafarers.db');
const SCRAPER_CSV = path.join(__dirname, '../scraper/cleaned_ports_list.csv');

const db = new Database(DB_PATH);

// ── 1. Find canonical names ────────────────────────────────────────────────
// Use latest snapshot to count ships per (port, lat, lon), then group by coords.
const rows = db.prepare(`
  SELECT port_of_abandonment, port_latitude, port_longitude, COUNT(*) AS n
  FROM ships
  WHERE port_latitude IS NOT NULL
    AND scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)
  GROUP BY port_of_abandonment, port_latitude, port_longitude
  ORDER BY n DESC, port_of_abandonment ASC
`).all();

const byCoord = new Map();
for (const r of rows) {
  const k = `${r.port_latitude},${r.port_longitude}`;
  if (!byCoord.has(k)) byCoord.set(k, []);
  byCoord.get(k).push(r);
}

const dupeGroups = [...byCoord.values()].filter(g => g.length > 1);
console.log(`Groups with duplicate names: ${dupeGroups.length}`);
console.log(`Aliases to merge:            ${dupeGroups.reduce((s, g) => s + g.length - 1, 0)}\n`);

// ── 2. Build alias → canonical map ────────────────────────────────────────
// canonical = entry with most ships in the group (first after ORDER BY n DESC)
const aliasToCanonical = new Map(); // alias name → canonical name

for (const group of dupeGroups) {
  const canonical = group[0].port_of_abandonment;
  for (const row of group.slice(1)) {
    aliasToCanonical.set(row.port_of_abandonment, canonical);
  }
}

// ── 3. Update DB (all rows, all scrapes) ──────────────────────────────────
const updateName = db.prepare(`UPDATE ships SET port_of_abandonment = ? WHERE port_of_abandonment = ?`);
let totalRows = 0;

for (const [alias, canonical] of aliasToCanonical) {
  const info = updateName.run(canonical, alias);
  if (info.changes > 0) {
    totalRows += info.changes;
    console.log(`  "${alias}" → "${canonical}"  (${info.changes} rows)`);
  }
}
console.log(`\nDB: ${totalRows} rows updated\n`);

// ── 4. Rebuild scraper CSV with unique canonical entries ───────────────────
// Source of truth: distinct (port, lat, lon) from DB after update
const canonicalPorts = db.prepare(`
  SELECT port_of_abandonment, port_latitude, port_longitude
  FROM ships
  WHERE port_latitude IS NOT NULL AND port_longitude IS NOT NULL
  GROUP BY port_of_abandonment
  ORDER BY port_of_abandonment ASC
`).all();

db.close();

const csvLines = ['Port of abandonment~lat~long'];
for (const { port_of_abandonment, port_latitude, port_longitude } of canonicalPorts) {
  csvLines.push(`${port_of_abandonment}~${port_latitude}~${port_longitude}`);
}
fs.writeFileSync(SCRAPER_CSV, csvLines.join('\n') + '\n');
console.log(`Scraper CSV rebuilt: ${csvLines.length - 1} unique port entries`);
