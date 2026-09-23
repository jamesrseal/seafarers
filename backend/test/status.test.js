const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STATUS_COLORS, STATUS_LABELS, STATUS_VALUES, STATUS_ORDER, markerRadius } = require('../src/status');

const SITE_STATUS_COLORS = path.join(__dirname, '../../frontend/src/utils/statusColors.js');

// src/status.js copies the site's labels and colours because it can't import
// them. Read the site's file and fail if the copy has drifted.
test('the statuses match the site', () => {
  const source = fs.readFileSync(SITE_STATUS_COLORS, 'utf8');
  const site = {};
  const entry = /^\s*'?([a-z]*)'?:\s*\{\s*label:\s*'([^']+)'[\s\S]*?fill:\s*'(#[0-9a-f]{6})'/gm;
  for (const [, value, label, fill] of source.matchAll(entry)) site[value] = { label, fill };

  assert.equal(Object.keys(site).length, 4, 'found the site\'s four statuses');
  assert.deepEqual(STATUS_COLORS, site);
  // The order the site lists them in is the order the facets endpoint returns.
  assert.deepEqual(STATUS_ORDER, Object.keys(site));
  assert.deepEqual(STATUS_LABELS, Object.fromEntries(Object.entries(site).map(([v, { label }]) => [v, label])));
  assert.deepEqual(STATUS_VALUES, Object.fromEntries(Object.entries(site).map(([v, { label }]) => [label, v])));
});

// The cards draw the map's markers, so the size of a dot is copied from the
// site as well. Lift the site's own function out of its module and compare what
// the two return, rather than trusting that the numbers still read alike.
test('a case\'s marker is the size the map draws it', () => {
  const source = fs.readFileSync(SITE_STATUS_COLORS, 'utf8');
  const [declaration] = source.match(/export function markerRadius[\s\S]*?\n}/) || [];
  assert.ok(declaration, 'found markerRadius in the site\'s file');
  const site = new Function(`${declaration.replace('export ', '')}; return markerRadius;`)();

  for (const crew of [undefined, null, '', 0, 1, 2, 7, 12, 50, 99, 100, 101, 400, '14', 'not a number']) {
    assert.equal(markerRadius(crew), site(crew), `marker for ${JSON.stringify(crew)}`);
  }
  // The ends of the scale the legend is drawn from, spelled out so that a
  // change to it has to be a deliberate one.
  assert.equal(markerRadius(1), 5.17);
  assert.equal(markerRadius(100), 22);
  assert.equal(markerRadius(1000), 22);
});
