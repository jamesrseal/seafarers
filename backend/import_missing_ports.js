#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH      = path.join(__dirname, 'data/seafarers.db');
const MISSING_CSV  = path.join(__dirname, '../legacy/missing_ports.csv');
const SCRAPER_CSV  = path.join(__dirname, '../scraper/cleaned_ports_list.csv');

// Parse missing_ports.csv  (Port~Ships affected~lat~long)
const missingLines = fs.readFileSync(MISSING_CSV, 'utf8').split('\n').slice(1);
const ports = [];
for (const line of missingLines) {
  if (!line.trim()) continue;
  const parts = line.split('~');
  if (parts.length < 4) continue;
  const [port, , latStr, lonStr] = parts;
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (!port.trim() || isNaN(lat) || isNaN(lon)) continue;
  ports.push({ port: port.trim(), lat, lon });
}
console.log(`Parsed ${ports.length} ports from missing_ports.csv`);

// Update database — all rows for each port
const db = new Database(DB_PATH);
const updateStmt = db.prepare(
  `UPDATE ships SET port_latitude = ?, port_longitude = ? WHERE port_of_abandonment = ?`
);
let totalUpdated = 0;
for (const { port, lat, lon } of ports) {
  const info = updateStmt.run(lat, lon, port);
  if (info.changes > 0) {
    console.log(`  DB: updated ${info.changes} row(s) for "${port}"`);
    totalUpdated += info.changes;
  }
}
console.log(`\nDatabase: ${totalUpdated} total rows updated`);
db.close();

// Append new entries to scraper/cleaned_ports_list.csv
const existing = new Set(
  fs.readFileSync(SCRAPER_CSV, 'utf8')
    .split('\n')
    .slice(1)
    .map(l => l.split('~')[0]?.trim())
    .filter(Boolean)
);

let appended = 0;
const newLines = [];
for (const { port, lat, lon } of ports) {
  if (!existing.has(port)) {
    newLines.push(`${port}~${lat}~${lon}`);
    appended++;
  }
}

if (newLines.length > 0) {
  const current = fs.readFileSync(SCRAPER_CSV, 'utf8');
  const separator = current.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(SCRAPER_CSV, current + separator + newLines.join('\n') + '\n');
  console.log(`Scraper CSV: appended ${appended} new entries`);
} else {
  console.log('Scraper CSV: no new entries to append (all already present)');
}
