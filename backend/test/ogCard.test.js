const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  caseCardSvg, caseCardPng, caseCardAlt, renderPixels, wrap, factLines, fontsPresent,
  WIDTH, HEIGHT, PANEL_BOX, COLUMN,
} = require('../src/ogCard');
const { STATUS_COLORS, markerRadius } = require('../src/status');
const { BASEMAP_DIR, PANEL } = require('../src/basemap');

const SHIP = {
  abandonment_id: '1815', ship_name: 'Volgo-Don 5021', ship_status: '', flag: 'Palau',
  imo_number: '8955873', port_of_abandonment: 'Samsun, Türkiye', abandonment_date: '1 July 2026',
  num_seafarers: 14,
};

// A port that really has a baked panel, read back from the committed set, so
// these tests follow the basemaps rather than naming one that may be re-keyed.
function bakedPort() {
  if (!fs.existsSync(BASEMAP_DIR)) return null;
  const file = fs.readdirSync(BASEMAP_DIR).find(f => f.endsWith('.jpg'));
  if (!file) return null;
  const [lat, lon] = file.replace(/\.jpg$/, '').split('_');
  return { port_latitude: Number(lat), port_longitude: Number(lon) };
}

const onTheMap = bakedPort();
const noBasemaps = !onTheMap && 'no basemaps baked';
const pixel = ({ pixels, width }, x, y) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
const hex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
const close = (a, b, within = 8) => a.every((v, i) => Math.abs(v - b[i]) <= within);
const rgb = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));

test('the card shows the case, in the map\'s colour for its status', () => {
  const svg = caseCardSvg(SHIP);
  assert.match(svg, new RegExp(`<svg [^>]*width="${WIDTH}" height="${HEIGHT}"`));
  assert.match(svg, />Volgo-Don 5021</);
  assert.match(svg, />Unresolved</);
  assert.match(svg, />Samsun, Türkiye · 1 July 2026</);
  assert.match(svg, />14 seafarers · Palau · IMO 8955873</);
  assert.match(svg, />ILO case 1815</);
  assert.match(svg, />abandonedseafarers.org</);
  // The dot beside the label is the site's colour, never one written out here.
  assert.match(svg, new RegExp(`<circle[^>]*fill="${STATUS_COLORS[''].fill}"`));
  assert.equal(caseCardAlt(SHIP), 'Volgo-Don 5021: Unresolved abandonment case in Samsun, Türkiye.');
});

test('a record missing fields loses those parts, not the card', () => {
  const sparse = { abandonment_id: '7', ship_status: 'resolved' };
  const svg = caseCardSvg(sparse);
  assert.match(svg, />Case 7</);
  assert.match(svg, />Resolved</);
  assert.ok(!svg.includes('undefined') && !svg.includes('null'));
  assert.deepEqual(factLines(sparse), []);
  assert.deepEqual(factLines({ num_seafarers: 1, flag: 'Panama' }), ['1 seafarer · Panama']);
});

test('long names take up to three lines and long lines are cut', () => {
  // The ILO writes a former name into the name field, which two lines beside a
  // map panel would throw away most of.
  const name = 'Alexsander Antonov (ALEKSANDR ANTONOV)';
  const title = wrap(name, { size: 56, weight: 'bold', maxWidth: COLUMN.width, maxLines: 3 });
  assert.equal(title.length, 3);
  assert.ok(!title.some(l => l.endsWith('…')), 'the whole name fits');

  const cut = wrap('Inverkeithing, Scotland, United Kingdom of Great Britain and Northern Ireland',
    { size: 26, maxWidth: COLUMN.width, maxLines: 1 });
  assert.equal(cut.length, 1);
  assert.match(cut[0], /…$/);
  // A single unbroken word can't be wrapped, so it is cut instead of overflowing.
  assert.match(wrap('A'.repeat(200), { size: 56, weight: 'bold', maxWidth: COLUMN.width, maxLines: 3 })[0], /…$/);
});

// The card grows the name upwards as well as downwards, so the longest one
// still has to clear the wordmark above it and the facts below.
test('a three-line name stays inside the card', { skip: !fontsPresent() && 'fonts not installed' }, () => {
  const long = { ...SHIP, ship_name: 'Alexsander Antonov (ALEKSANDR ANTONOV)', ...(onTheMap || {}) };
  const svg = caseCardSvg(long);
  const baselines = [...svg.matchAll(/<text x="\d+" y="(\d+(?:\.\d+)?)"[^>]*font-size="56"/g)].map(m => Number(m[1]));
  assert.equal(baselines.length, 3, 'three lines of name');

  const eyebrow = Number(svg.match(/<text x="\d+" y="(\d+)"[^>]*font-size="19"/)[1]);
  const facts = [...svg.matchAll(/<text x="\d+" y="(\d+)"[^>]*font-size="26"/g)].map(m => Number(m[1]));
  assert.ok(Math.min(...baselines) - 56 > eyebrow, 'the first line clears the wordmark');
  assert.ok(Math.max(...baselines) < Math.min(...facts) - 56, 'the last line clears the facts');
});

test('markup in a record can\'t break the SVG', () => {
  const svg = caseCardSvg({ ...SHIP, ship_name: 'Fish & <Chips> "x"' });
  assert.match(svg, />Fish &amp; &lt;Chips&gt; &quot;x&quot;</);
  assert.ok(!svg.includes('<Chips>'));
});

test('it rasterises to a PNG of the right size', { skip: !fontsPresent() && 'fonts not installed' }, () => {
  const png = caseCardPng(SHIP);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  // IHDR carries the dimensions, big-endian, right after the signature and length.
  assert.equal(png.readUInt32BE(16), WIDTH);
  assert.equal(png.readUInt32BE(20), HEIGHT);
  assert.ok(png.length > 10_000, 'the card has content, not just a background');
});

test('a case with a baked port is drawn on its map', { skip: noBasemaps || (!fontsPresent() && 'fonts not installed') }, () => {
  const ship = { ...SHIP, ...onTheMap };
  const svg = caseCardSvg(ship);
  assert.match(svg, /xlink:href="data:image\/jpeg;base64,/, 'the panel is embedded');
  // OpenStreetMap's basemap, credited wherever the card is shown.
  assert.match(svg, />© OpenStreetMap contributors</);

  // resvg draws nothing for an image it can't read, so look at the result: a
  // map is many colours, an empty panel is one.
  const drawn = renderPixels(svg);
  const shades = new Set();
  for (let x = PANEL_BOX.x + 20; x < PANEL_BOX.x + PANEL.width - 20; x += 17) {
    for (let y = PANEL_BOX.y + 20; y < PANEL_BOX.y + PANEL.height - 20; y += 17) {
      shades.add(hex(pixel(drawn, x, y)));
    }
  }
  assert.ok(shades.size > 20, `the panel holds a map, not a blank (${shades.size} shades)`);

  // The case's own marker is the middle of its panel: the card and the baker
  // agree about where the port is, or this is paper or basemap instead.
  const centre = pixel(drawn, PANEL_BOX.x + PANEL.width / 2, PANEL_BOX.y + PANEL.height / 2);
  assert.ok(close(centre, rgb(STATUS_COLORS[''].fill)),
    `the marker sits at the centre (found ${hex(centre)}, wanted ${STATUS_COLORS[''].fill})`);
});

test('a case with no coordinates keeps the card and loses the map', { skip: !fontsPresent() && 'fonts not installed' }, () => {
  const svg = caseCardSvg({ ...SHIP, port_latitude: null, port_longitude: null });
  assert.ok(!svg.includes('data:image/jpeg'), 'no panel is drawn');
  assert.ok(!svg.includes('OpenStreetMap'), 'and nothing to credit for it');
  assert.match(svg, />Volgo-Don 5021</, 'but the case is still there');

  const drawn = renderPixels(svg);
  const paper = pixel(drawn, WIDTH - 40, HEIGHT / 2);
  assert.ok(close(paper, [0xf8, 0xfa, 0xfc]), `the right of the card is paper (found ${hex(paper)})`);
});

test('a port no bake has reached yet falls back rather than failing', () => {
  // Nowhere near any port in the set: no file, so no panel.
  const svg = caseCardSvg({ ...SHIP, port_latitude: 12.3456, port_longitude: -45.6789 });
  assert.ok(!svg.includes('data:image/jpeg'));
  assert.match(svg, />Volgo-Don 5021</);
});

test('the cases nearby are drawn behind the one the card is about', { skip: noBasemaps }, () => {
  const ship = { ...SHIP, ...onTheMap };
  const nearby = [
    { abandonment_id: '9001', ship_status: 'resolved', num_seafarers: 8, ...onTheMap },
    // The card's own case, as the query hands it back: drawn once, as the subject.
    { abandonment_id: '1815', ship_status: '', num_seafarers: 14, ...onTheMap },
    { abandonment_id: '9002', ship_status: 'disputed', num_seafarers: 3, port_latitude: null, port_longitude: null },
  ];
  const svg = caseCardSvg(ship, nearby);
  // Two markers on the map: the neighbour and the subject, not the subject
  // twice. The card's accent is the same red as Disputed — it is the accent the
  // site's own card uses — so ask the circles, not the colour.
  const markers = svg.slice(svg.indexOf('clip-path')).match(/<circle[^>]*>/g) || [];
  assert.equal(markers.length, 2);
  assert.ok(markers.some(c => c.includes(`fill="${STATUS_COLORS.resolved.fill}"`)), 'the neighbour is drawn');
  assert.ok(!markers.some(c => c.includes(`fill="${STATUS_COLORS.disputed.fill}"`)),
    'the neighbour with no coordinates is not');
  assert.ok(markers.some(c => c.includes(`r="${markerRadius(8).toFixed(1)}"`)), 'sized by its crew');
});
