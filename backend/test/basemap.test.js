const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { PANEL, TILE, BASEMAP_DIR, panelOrigin, project, tilesFor, panelFile, panelKey, hasCoords } = require('../src/basemap');

const DB_PATH = path.join(__dirname, '../data/seafarers.db');
const SAMSUN = { lat: 41.2928, lon: 36.3313 };

// The panel is cut around its port, so the case the card is about is always the
// middle of the picture. Everything else on the card is placed from this.
test('the port is the centre of its own panel', () => {
  const origin = panelOrigin(SAMSUN.lat, SAMSUN.lon);
  const { x, y } = project(SAMSUN.lat, SAMSUN.lon, origin);
  assert.ok(Math.abs(x - PANEL.width / 2) < 0.5, `x ${x} is the middle`);
  assert.ok(Math.abs(y - PANEL.height / 2) < 0.5, `y ${y} is the middle`);
});

test('north is up and east is right', () => {
  const origin = panelOrigin(SAMSUN.lat, SAMSUN.lon);
  const here = project(SAMSUN.lat, SAMSUN.lon, origin);
  assert.ok(project(SAMSUN.lat + 0.2, SAMSUN.lon, origin).y < here.y, 'further north is higher up');
  assert.ok(project(SAMSUN.lat, SAMSUN.lon + 0.2, origin).x > here.x, 'further east is further right');
});

// A gap between the tiles would show as a band of bare sea across the map.
test('the tiles cover the whole panel', () => {
  for (const [lat, lon] of [[SAMSUN.lat, SAMSUN.lon], [0, 0], [60.2, -5.1], [-33.9, 151.2]]) {
    const tiles = tilesFor(lat, lon);
    assert.ok(tiles.length >= 4, `${lat},${lon} needs several tiles`);
    assert.ok(Math.min(...tiles.map(t => t.dx)) <= 0, 'covered at the left edge');
    assert.ok(Math.min(...tiles.map(t => t.dy)) <= 0, 'covered at the top edge');
    assert.ok(Math.max(...tiles.map(t => t.dx)) + TILE >= PANEL.width, 'covered at the right edge');
    assert.ok(Math.max(...tiles.map(t => t.dy)) + TILE >= PANEL.height, 'covered at the bottom edge');
    // Every tile is one that exists to be asked for.
    for (const t of tiles) {
      assert.ok(t.x >= 0 && t.x < 2 ** PANEL.zoom, `x ${t.x} is on the map`);
      assert.ok(t.y >= 0 && t.y < 2 ** PANEL.zoom, `y ${t.y} is on the map`);
    }
  }
});

test('a port by the antimeridian asks for tiles that exist', () => {
  for (const lon of [179.9, -179.9, 180, -180]) {
    for (const { x } of tilesFor(-16.9, lon)) {
      assert.ok(x >= 0 && x < 2 ** PANEL.zoom, `x ${x} wrapped into range for lon ${lon}`);
    }
  }
});

test('ports that round together share one panel', () => {
  assert.equal(panelKey(41.29284, 36.33127), panelKey(41.292839, 36.331271));
  assert.notEqual(panelKey(41.2928, 36.3313), panelKey(41.2929, 36.3313));
  assert.equal(panelKey(-3.4, 1), '-3.4000_1.0000');
});

test('a record without coordinates has no panel to draw', () => {
  assert.equal(hasCoords({ port_latitude: null, port_longitude: null }), false);
  assert.equal(hasCoords({ port_latitude: '', port_longitude: '' }), false);
  assert.equal(hasCoords({}), false);
  assert.equal(hasCoords({ port_latitude: 0, port_longitude: 0 }), true);
  assert.equal(hasCoords({ port_latitude: '41.29', port_longitude: '36.33' }), true);
});

// The head of a file, which is all the JPEG dimensions need.
function head(file, bytes = 4096) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    return buffer.subarray(0, fs.readSync(fd, buffer, 0, bytes, 0));
  } finally {
    fs.closeSync(fd);
  }
}

// The width and height a baseline JPEG declares, from its start-of-frame.
function jpegSize(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'starts with the JPEG marker');
  let at = 2;
  while (at < buffer.length - 9) {
    if (buffer[at] !== 0xff) return null;
    const marker = buffer[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
    }
    at += 2 + buffer.readUInt16BE(at + 2);
  }
  return null;
}

// The guard on the committed artefact: a refresh that lands a port nobody has
// been abandoned in before leaves that case's card without a map until
// scripts/bake-basemaps.js is run again, and this is what says so.
test('every port in the database has a basemap', { skip: !fs.existsSync(DB_PATH) && 'no committed database' }, () => {
  const db = new Database(DB_PATH, { readonly: true });
  const ports = db.prepare(
    `SELECT DISTINCT port_latitude AS lat, port_longitude AS lon FROM ships
     WHERE scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)
       AND port_latitude IS NOT NULL AND port_longitude IS NOT NULL`
  ).all();
  db.close();

  assert.ok(ports.length > 100, `${ports.length} ports is a whole database`);
  const missing = ports.filter(p => !fs.existsSync(panelFile(p.lat, p.lon)));
  assert.deepEqual(
    missing.map(p => panelKey(p.lat, p.lon)), [],
    `run: node scripts/bake-basemaps.js (${missing.length} ports without a panel)`
  );
});

test('the basemaps are JPEGs the size the card draws them', { skip: !fs.existsSync(BASEMAP_DIR) && 'no basemaps' }, () => {
  const files = fs.readdirSync(BASEMAP_DIR).filter(f => f.endsWith('.jpg'));
  assert.ok(files.length > 100, `${files.length} panels is a whole set`);
  for (const file of files) {
    const full = path.join(BASEMAP_DIR, file);
    // resvg draws nothing at all for a format it can't read, so a panel that
    // isn't a JPEG of the right size would empty the map without failing.
    const size = jpegSize(head(full));
    assert.deepEqual(size, { width: PANEL.width, height: PANEL.height }, `${file} is the panel size`);
    assert.ok(fs.statSync(full).size > 2_000, `${file} has a picture in it`);
  }
});
