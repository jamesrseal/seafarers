#!/usr/bin/env node
/**
 * Imports ILO case pages saved by hand in a browser, for while the ILO refuses
 * the scraper (see "Scheduled refresh" in CLAUDE.md).
 *
 * Usage:
 *   node import-pages.js <folder> [--dry-run] [--db ../backend/data/seafarers.db]
 *
 * Each file is one case page, saved in Chrome as "Webpage, Single File" and
 * named by its case ID (1835.mhtml). Pages are read the way the scraper reads
 * them (toRecord, iloFields.js) and ingested into the database as one scrape
 * run, so new cases get the New badge and the feed. Afterwards, draw basemaps
 * for any new port (node ../backend/scripts/bake-basemaps.js) and commit the
 * database with them, as the refresh does.
 *
 *   --dry-run  read and print the cases, write nothing
 */

const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { toRecord } = require('./scrape');
const { loadPortOverrides, seedGeocache } = require('./geocode');

const BACKEND = path.join(__dirname, '../backend');
const Database = require(path.join(BACKEND, 'node_modules/better-sqlite3'));
const { ingestRun } = require(path.join(BACKEND, 'src/ingest'));
const { migrate } = require(path.join(BACKEND, 'src/db/migrate'));

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dbArg   = args.indexOf('--db');
const DB_PATH = dbArg !== -1 ? path.resolve(args[dbArg + 1]) : path.join(BACKEND, 'data/seafarers.db');
const FOLDER  = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--db');

// extractApexFields reads the page's hidden form inputs, which a saved page
// doesn't keep: Chrome leaves them out of an .mhtml. The same values are shown
// beside each label (P3_<ITEM>_DISPLAY), so this reads those and returns the
// same shape. In text, each <br> is the line break the input held; spaces are
// kept as written, as the inputs keep them. The dated lists stay markup for
// iloFields.js to parse. Runs in the page.
function extractSavedFields() {
  const display = item => document.getElementById(`${item}_DISPLAY`);
  const decode = html => {
    const t = document.createElement('textarea');
    t.innerHTML = html;
    return t.value;
  };
  function text(item) {
    const el = display(item);
    return el ? decode(el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).trim() : null;
  }
  function markup(item) {
    const el = display(item);
    return el ? el.innerHTML.trim() : null;
  }
  // As in extractApexFields.
  function commentsText() {
    const title = [...document.querySelectorAll('.t-Region-title, h2')]
      .find(h => /comments and observations/i.test(h.innerText || ''));
    if (!title) return '';
    const region = title.closest('.t-Region');
    const dyn = region && region.querySelector('a-dynamic-content, .a-dynamic-content');
    return dyn ? (dyn.innerText || dyn.textContent || '').trim() : '';
  }

  const shipName = text('P3_SHIP_NAME');
  if (!shipName) return null;

  // The page shows "unresolved" for the status the ILO stores as blank.
  const status = (text('P3_CASE_STATUS_DISPLAY') || '').toLowerCase();
  const imoRaw = text('P3_IMO_NO') || '';
  const imo    = imoRaw.replace(/\D/g, '');

  return {
    id:                  text('P3_ABANDONMENT_ID'),
    ship_name:           shipName,
    ship_status:         status === 'unresolved' ? '' : status,
    flag:                text('P3_FLAG_WITH_FLAG') || '',
    imo_number:          imoRaw,
    vessel_type:         text('P3_IMO_SHIP_TYPE') || '',
    port_of_abandonment: text('P3_PORT') || '',
    abandonment_date:    text('P3_ABAND_DATE') || '',
    notification_date:   text('P3_NOTIF_DATE') || '',
    reporting_member:    text('P3_REPORTING') || '',
    num_seafarers:       parseInt(text('P3_SEAFARERS_NUMBER') || '', 10) || null,
    circumstances:       text('P3_CIRCUMSTANCES') || '',
    comments:            commentsText(),
    vessel_finder_url:   imo ? `https://www.vesselfinder.com/?imo=${imo}` : null,
    ilo: {
      vessel_type:                 text('P3_IMO_SHIP_TYPE'),
      financial_security_provider: text('P3_PANDI'),
      nationalities:               text('P3_NATIONALITIES'),
      payment:                     markup('P3_PAYMENT'),
      repatriation:                markup('P3_REPAT'),
      actions:                     markup('P3_ACTIONS'),
    },
  };
}

async function main() {
  if (!FOLDER) {
    console.error('Usage: node import-pages.js <folder> [--dry-run] [--db <path>]');
    process.exit(1);
  }
  const files = fs.readdirSync(FOLDER)
    .map(name => ({ name, id: (name.match(/^(\d+)\.(mhtml|mht|html?)$/i) || [])[1] }))
    .filter(f => f.id)
    .sort((a, b) => a.id - b.id);
  if (!files.length) {
    console.error(`No saved pages named by case ID (e.g. 1835.mhtml) in ${FOLDER}`);
    process.exit(1);
  }

  // Coordinates the database already has seed the geocoder, as in the scraper,
  // so only a new port is looked up on Nominatim.
  const db = new Database(DB_PATH, { readonly: DRY_RUN });
  if (!DRY_RUN) migrate(db);
  const known = new Set(db.prepare('SELECT DISTINCT abandonment_id FROM ships').all().map(r => r.abandonment_id));
  seedGeocache(db.prepare(
    `SELECT port_of_abandonment, port_latitude, port_longitude FROM ships WHERE port_latitude IS NOT NULL`
  ).all());
  const portOverrides = loadPortOverrides();

  const browser = await chromium.launch({ headless: true });
  const records = [];
  for (const { name, id } of files) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(FOLDER, name)).href, { waitUntil: 'load' });
    const fields = await page.evaluate(extractSavedFields);
    await page.close();
    if (!fields) throw new Error(`${name}: no case on this page`);
    // The page names its own case. A file saved under the wrong name, or a page
    // showing another case's details (the ILO's page can, for an ID with no
    // case), mustn't be stored under this ID.
    if (parseInt(fields.id, 10) !== Number(id)) {
      throw new Error(`${name}: the page is case ${fields.id}, not ${id}`);
    }
    const { id: _, ...pageFields } = fields;
    const record = await toRecord(id, pageFields, portOverrides);
    records.push(record);
    const where = record.port_latitude == null ? 'no coordinates' : `${record.port_latitude.toFixed(3)}, ${record.port_longitude.toFixed(3)}`;
    console.log(`  [${id}] ${known.has(id) ? 'update' : 'new   '} ${record.ship_name} — ${record.port_of_abandonment} (${where})`);
  }
  await browser.close();

  if (DRY_RUN) {
    console.log(`\nDry run: ${records.length} case(s) read, nothing written.`);
    console.log(JSON.stringify(records, null, 2));
    db.close();
    return;
  }

  const scrapedAt = new Date().toISOString();
  const { inserted, filled } = ingestRun(db, scrapedAt, records);
  // As the refresh leaves it: everything in the main file, no WAL alongside.
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.close();
  console.log(`\nIngested ${records.length} case(s) as the run of ${scrapedAt}: ${inserted} row(s) written, ${filled} filled in place.`);
  console.log('Next: node ../backend/scripts/bake-basemaps.js, then commit the database and any new basemaps.');
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
