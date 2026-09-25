const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { VESSEL_TYPE_ALIASES, canonicalVesselType, spellingsOf } = require('../src/vesselTypes');

const SITE_VESSEL_TYPES = path.join(__dirname, '../../frontend/src/utils/vesselTypes.js');

// src/vesselTypes.js copies the site's aliases because it can't import them.
// Read the site's file and fail if the copy has drifted, so the filter and the
// dashboard always merge the same spellings.
test('the vessel type aliases match the site', () => {
  const source = fs.readFileSync(SITE_VESSEL_TYPES, 'utf8');
  const [, body] = source.match(/VESSEL_TYPE_ALIASES = \{([\s\S]*?)\};/) || [];
  assert.ok(body, "found the site's aliases");
  const site = Object.fromEntries([...body.matchAll(/'([^']+)':\s*'([^']+)'/g)].map(([, alias, name]) => [alias, name]));
  assert.ok(Object.keys(site).length > 0);
  assert.deepEqual(VESSEL_TYPE_ALIASES, site);
});

test('a type is counted under its longer name, and matches every spelling of it', () => {
  assert.equal(canonicalVesselType('General Cargo'), 'General Cargo Ship');
  assert.equal(canonicalVesselType('Bulk Carrier'), 'Bulk Carrier');
  assert.deepEqual(spellingsOf('General Cargo Ship'), ['General Cargo Ship', 'General Cargo']);
  assert.deepEqual(spellingsOf('Bulk Carrier'), ['Bulk Carrier']);
});
