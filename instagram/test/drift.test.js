// theme.js copies the site's status fills rather than importing them (the
// frontend is ESM/React). This fails when the site changes them, the same way
// bluesky/test/drift.test.js guards the status labels.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { STATUS_CARD_COLORS } = require('../src/theme');

const STATUS_COLORS_JS = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'statusColors.js');

test('the card\'s status colours are the site\'s fills', () => {
  const source = fs.readFileSync(STATUS_COLORS_JS, 'utf8');
  const site = {};
  for (const m of source.matchAll(/^\s*(?:'([^']*)'|(\w+))\s*:\s*\{[^}]*?fill:\s*'(#[0-9a-fA-F]{3,8})'/gm)) {
    site[m[1] ?? m[2]] = m[3];
  }
  assert.ok(Object.keys(site).length >= 4, `parsed no fills from ${STATUS_COLORS_JS}`);
  const card = Object.fromEntries(Object.entries(STATUS_CARD_COLORS).map(([status, { fill }]) => [status, fill]));
  assert.deepEqual(card, site);
});

test('every status has a text colour to sit on its fill', () => {
  for (const [status, { fill, ink }] of Object.entries(STATUS_CARD_COLORS)) {
    assert.match(fill, /^#[0-9a-fA-F]{6}$/, `${status} fill`);
    assert.match(ink, /^#[0-9a-fA-F]{6}$/, `${status} ink`);
  }
});
