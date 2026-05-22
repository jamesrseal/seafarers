#!/usr/bin/env node
/**
 * Corrects canonical port names chosen by dedup_ports.js that are clearly wrong:
 *   - ALL-CAPS names that lost to an uppercase-first sort
 *   - Wrong country in the canonical (Romania instead of Oman, etc.)
 *   - "En-route to X" chosen over the actual port name "X"
 */
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH     = path.join(__dirname, 'data/seafarers.db');
const SCRAPER_CSV = path.join(__dirname, '../scraper/cleaned_ports_list.csv');

const db = new Database(DB_PATH);

// Each entry: [ current canonical (wrong), correct name ]
const corrections = [
  // ALL-CAPS → proper case
  ['KAVALA, Greece',                                                               'Kavala, Greece'],
  ['POINTE NOIRE, Congo',                                                          'Pointe Noire, Congo'],
  ['GREAT YARMOUTH, United Kingdom of Great Britain and Northern Ireland',         'Great Yarmouth, United Kingdom of Great Britain and Northern Ireland'],
  ['TALLINN, Estonia',                                                              'Tallinn, Estonia'],

  // Wrong country in canonical
  ['Conakry, Papua New Guinea',    'Conakry, Guinea'],           // Conakry is in Guinea
  ['Salalah Anchorage, Romania',   'Salalah, Oman'],             // Salalah is in Oman
  ['Sohar OLP anchorage, Romania', 'Sohar, Oman'],               // Sohar is in Oman

  // "En-route to X" chosen over the actual port name
  ['Enroute to Fujairah, United Arab Emirates', 'Fujairah, United Arab Emirates'],
  ['Enroute to Port Said, Egypt',               'Port Said, Egypt'],
  ['En route to Samsun Port, Türkiye',          'Samsun, Türkiye'],
  ['Constanta Anchorage Area',                  'Constanta, Romania'],

  // Obscure name chosen over recognisable city name (1-way ties resolved alphabetically)
  ['Aoshanwan, China',             'Qingdao, China'],            // Qingdao is the well-known port
  ['Las Palmas (Spain), Spain',    'Las Palmas, Spain'],         // "Spain" duplicated in original
];

const stmt = db.prepare(`UPDATE ships SET port_of_abandonment = ? WHERE port_of_abandonment = ?`);
let total = 0;
for (const [wrong, correct] of corrections) {
  const info = stmt.run(correct, wrong);
  total += info.changes;
  if (info.changes > 0) console.log(`  "${wrong}" → "${correct}"  (${info.changes} rows)`);
  else                   console.log(`  SKIP (no rows): "${wrong}"`);
}
console.log(`\nDB: ${total} rows corrected\n`);

// Rebuild scraper CSV from DB canonical names
const canonicalPorts = db.prepare(`
  SELECT port_of_abandonment, port_latitude, port_longitude
  FROM ships
  WHERE port_latitude IS NOT NULL AND port_longitude IS NOT NULL
  GROUP BY port_of_abandonment
  ORDER BY port_of_abandonment ASC
`).all();
db.close();

const lines = ['Port of abandonment~lat~long',
  ...canonicalPorts.map(r => `${r.port_of_abandonment}~${r.port_latitude}~${r.port_longitude}`)
];
fs.writeFileSync(SCRAPER_CSV, lines.join('\n') + '\n');
console.log(`Scraper CSV rebuilt: ${lines.length - 1} unique port entries`);
