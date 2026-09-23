// Draws assets/basemaps/<lat>_<lon>.jpg: the map picture behind each case
// card, one per port in the committed database.
//
// Run by hand, like frontend/scripts/og-image.mjs, and for the same reason —
// the artefact is committed, so the site needs no network to draw a card. A
// refresh that lands a port nobody has abandoned a ship in before leaves that
// card without a map until this is run again; backend/test/basemap.test.js
// fails while any port is missing one, so it can't go unnoticed for long.
//
//   node scripts/bake-basemaps.js              # just the ports with no panel
//   node scripts/bake-basemaps.js --force      # redraw every panel
//   node scripts/bake-basemaps.js --limit 20   # try a handful first
//
// It is polite to OpenStreetMap on purpose: every distinct tile is fetched once
// however many ports share it, two requests at a time, with a User-Agent that
// says who is asking. Their tile policy allows this sort of one-off bulk only
// at a modest rate — don't raise the concurrency to make it finish sooner.
//
// Tiles are also kept in .tile-cache (untracked), so redrawing every panel —
// after a change to the panel size, the zoom or the JPEG quality — costs no
// requests at all. Delete that directory to pull fresh tiles.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Resvg } = require('@resvg/resvg-js');
const jpeg = require('jpeg-js');
const { PANEL, BASEMAP_DIR, TILE, tilesFor, panelFile, panelKey } = require('../src/basemap');

const USER_AGENT = 'abandonedseafarers.org basemap baker (+https://abandonedseafarers.org)';
const SEA = '#aad3df';
const DEFAULT_DB = path.join(__dirname, '../data/seafarers.db');

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const FORCE = flag('force');
const LIMIT = Number(value('limit', Infinity));
// jpeg-js has no optimised tables and runs about a third larger than a typical
// encoder at the same number, so this is lower than it looks: the panels land
// near what another encoder would call quality 82.
const QUALITY = Number(value('quality', 74));
const CONCURRENCY = Number(value('concurrency', 2));
const DB_PATH = value('db', DEFAULT_DB);
const TILE_CACHE = value('tile-cache', path.join(__dirname, '../.tile-cache'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One fetch per distinct tile, however many ports share it and however often
// the panels are redrawn: in memory for this run, on disk for the next.
const cache = new Map();
let fetched = 0;
let reused = 0;
let failed = 0;

async function tileBytes({ z, x, y }) {
  const key = `${z}/${x}/${y}`;
  if (!cache.has(key)) cache.set(key, load(key));
  return cache.get(key);
}

async function load(key) {
  const file = path.join(TILE_CACHE, `${key.replace(/\//g, '_')}.png`);
  try {
    const bytes = fs.readFileSync(file);
    reused++;
    return bytes;
  } catch { /* not cached yet */ }
  const bytes = await download(key);
  if (bytes) fs.writeFileSync(file, bytes);
  return bytes;
}

async function download(key) {
  const url = `https://tile.openstreetmap.org/${key}.png`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fetched++;
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 3) {
        console.warn(`  tile ${key} failed: ${error.message}`);
        failed++;
        return null;
      }
      await sleep(attempt * 1000);
    }
  }
  return null;
}

// resvg composites the tiles and hands back raw pixels; jpeg-js encodes them.
// Missing tiles simply leave the sea behind them.
function encode(tiles) {
  const images = tiles
    .filter(t => t.bytes)
    .map(t =>
      `<image x="${t.dx.toFixed(2)}" y="${t.dy.toFixed(2)}" width="${TILE}" height="${TILE}" ` +
      `xlink:href="data:image/png;base64,${t.bytes.toString('base64')}"/>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${PANEL.width}" height="${PANEL.height}">` +
    `<rect width="${PANEL.width}" height="${PANEL.height}" fill="${SEA}"/>${images}</svg>`;
  const { pixels, width, height } = new Resvg(svg, {
    fitTo: { mode: 'width', value: PANEL.width },
  }).render();
  return jpeg.encode({ data: pixels, width, height }, QUALITY).data;
}

async function bake(port) {
  const tiles = tilesFor(port.lat, port.lon);
  const withBytes = [];
  for (let i = 0; i < tiles.length; i += CONCURRENCY) {
    const batch = tiles.slice(i, i + CONCURRENCY);
    const bytes = await Promise.all(batch.map(tileBytes));
    batch.forEach((tile, j) => withBytes.push({ ...tile, bytes: bytes[j] }));
  }
  if (!withBytes.some(t => t.bytes)) throw new Error('no tiles came back');
  const file = panelFile(port.lat, port.lon);
  fs.writeFileSync(file, encode(withBytes));
  return fs.statSync(file).size;
}

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const ports = db.prepare(
    `SELECT DISTINCT port_latitude AS lat, port_longitude AS lon FROM ships
     WHERE scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)
       AND port_latitude IS NOT NULL AND port_longitude IS NOT NULL
     ORDER BY lat, lon`
  ).all();
  db.close();

  fs.mkdirSync(BASEMAP_DIR, { recursive: true });
  fs.mkdirSync(TILE_CACHE, { recursive: true });
  const todo = ports.filter(p => FORCE || !fs.existsSync(panelFile(p.lat, p.lon))).slice(0, LIMIT);
  console.log(`${ports.length} ports in ${path.relative(process.cwd(), DB_PATH)}, ${todo.length} to draw`);
  if (!todo.length) return;

  let bytes = 0;
  const started = Date.now();
  for (const [i, port] of todo.entries()) {
    try {
      bytes += await bake(port);
    } catch (error) {
      console.error(`  ${panelKey(port.lat, port.lon)}: ${error.message}`);
      failed++;
    }
    if ((i + 1) % 25 === 0 || i + 1 === todo.length) {
      const done = i + 1;
      const rate = done / ((Date.now() - started) / 1000);
      const left = Math.round((todo.length - done) / rate);
      console.log(`  ${done}/${todo.length} panels, ${fetched} tiles fetched, ${reused} cached, ${(bytes / 1024 / 1024).toFixed(1)}MB` +
        (done < todo.length ? `, ~${Math.floor(left / 60)}m${left % 60}s left` : ''));
    }
  }

  const total = fs.readdirSync(BASEMAP_DIR).filter(f => f.endsWith('.jpg'))
    .reduce((sum, f) => sum + fs.statSync(path.join(BASEMAP_DIR, f)).size, 0);
  console.log(`done: ${fetched} tiles fetched, ${reused} from cache, ${failed} failures, ` +
    `${(total / 1024 / 1024).toFixed(1)}MB of basemaps on disk`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
