const test = require('node:test');
const assert = require('node:assert/strict');
const { caseCardSvg, caseCardPng, caseCardAlt, wrap, factLines, fontsPresent, WIDTH, HEIGHT } = require('../src/ogCard');
const { STATUS_COLORS } = require('../src/status');

const SHIP = {
  abandonment_id: '1815', ship_name: 'Volgo-Don 5021', ship_status: '', flag: 'Palau',
  imo_number: '8955873', port_of_abandonment: 'Samsun, Türkiye', abandonment_date: '1 July 2026',
  num_seafarers: 14,
};

test('the card shows the case, in the map\'s colour for its status', () => {
  const svg = caseCardSvg(SHIP);
  assert.match(svg, new RegExp(`<svg [^>]*width="${WIDTH}" height="${HEIGHT}"`));
  assert.match(svg, />Volgo-Don 5021</);
  assert.match(svg, />Unresolved</);
  assert.match(svg, />Samsun, Türkiye · 1 July 2026</);
  assert.match(svg, />14 seafarers · Palau · IMO 8955873</);
  assert.match(svg, />ILO case 1815</);
  // The status colour is the site's, not a copy: circle, label and the band at the foot.
  assert.equal((svg.match(new RegExp(STATUS_COLORS[''].fill, 'g')) || []).length, 3);
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

test('long names wrap to two lines and long lines are cut', () => {
  const name = 'WHITE ARROW (originally reported as Vestlandia)';
  assert.equal(wrap(name, { size: 72, weight: 'bold', maxWidth: 1056, maxLines: 2 }).length, 2);
  const cut = wrap('Inverkeithing, Scotland, United Kingdom of Great Britain and Northern Ireland', { size: 34, maxWidth: 1056, maxLines: 1 });
  assert.equal(cut.length, 1);
  assert.match(cut[0], /…$/);
  // A single unbroken word can't be wrapped, so it is cut instead of overflowing.
  assert.match(wrap('A'.repeat(200), { size: 72, weight: 'bold', maxWidth: 1056, maxLines: 2 })[0], /…$/);
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
