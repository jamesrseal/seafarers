// public/og-image.png is a committed binary — the Open Graph card in index.html
// and the thumbnail on every Bluesky post — so nothing redraws it when the site
// changes underneath it. It had already drifted: the committed card explained
// the map with Unresolved red and Disputed yellow, the two swapped against
// statusColors.js. These read the committed PNG back and fail if it drifts
// again. Regenerate with `node scripts/og-image.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGEND, WIDTH, HEIGHT, readPng, verifyLegend } from '../scripts/og-image.mjs';
import { STATUS_COLORS } from '../src/utils/statusColors.js';

const CARD = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
const card = readPng(readFileSync(CARD));

test("the card's legend dots are the site's status fills, left to right", () => {
  // throws naming the status if a dot is missing, smeared, or out of order
  const dots = verifyLegend(card);
  assert.deepEqual(
    dots.map(dot => `${dot.label} ${dot.fill}`),
    LEGEND.map(status => `${STATUS_COLORS[status].label} ${STATUS_COLORS[status].fill}`),
  );
});

test('each legend dot really is that colour at its centre', () => {
  for (const dot of verifyLegend(card)) {
    assert.equal(card.hex(Math.round(dot.x), Math.round(dot.y)), STATUS_COLORS[dot.status].fill,
      `the ${dot.label} dot`);
  }
});

test('the card is the size index.html advertises', () => {
  assert.deepEqual([card.width, card.height], [WIDTH, HEIGHT]);
});
