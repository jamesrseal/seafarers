// The poster copies a few facts from the site rather than importing them
// (the frontend is ESM/React). These fail when the site changes under it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, THUMB_PATH } = require('../src/config');
const { STATUS_LABELS } = require('../src/status');

const read = file => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

test('status labels match the site\'s', () => {
  const site = {};
  for (const m of read('frontend/src/utils/statusColors.js').matchAll(/^\s*(?:'([^']*)'|(\w+))\s*:\s*\{\s*label:\s*'([^']+)'/gm)) {
    site[m[1] ?? m[2]] = m[3];
  }
  assert.deepEqual(site, STATUS_LABELS);
});

test('the site still opens a case from ?ship=<id>', () => {
  assert.match(read('frontend/src/utils/urlState.js'), /p\.get\('ship'\)/);
});

test('the link card thumbnail exists and is under Bluesky\'s 1 MB limit', () => {
  assert.ok(fs.statSync(THUMB_PATH).size < 1000000);
});
