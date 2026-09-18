const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STATUS_COLORS, STATUS_LABELS, STATUS_VALUES, STATUS_ORDER } = require('../src/status');

// src/status.js copies the site's labels and colours because it can't import
// them. Read the site's file and fail if the copy has drifted.
test('the statuses match the site', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/statusColors.js'), 'utf8');
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
