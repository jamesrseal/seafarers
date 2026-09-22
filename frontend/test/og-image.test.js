// public/og-image.png is a committed binary — the Open Graph card in index.html
// and the thumbnail the Bluesky poster falls back to — so nothing redraws it
// when the site changes underneath it. It had already drifted once: the
// committed card explained the map with Unresolved red and Disputed yellow, the
// two swapped against statusColors.js. These read the committed PNG back and
// fail if it drifts again. Regenerate with `node scripts/og-image.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGEND, WIDTH, HEIGHT, readPng, verifyLegend, verifyMap, verifyHeadline, countText, explainerText } from '../scripts/og-image.mjs';
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

test('the panel holds the real map, with real cases drawn on it', () => {
  // throws if the basemap didn't load, or if no markers were drawn in the site's fills
  const map = verifyMap(card);
  assert.ok(map.colours > 400, `the basemap has ${map.colours} colours`);
  // The Mediterranean and Red Sea hold cases of every status.
  for (const status of LEGEND) {
    assert.ok(map.cases[status] > 0, `no ${STATUS_COLORS[status].label} case is drawn on the map`);
  }
});

test('Lato drew the headline at the size the layout expects', () => {
  const ink = verifyHeadline(card);
  assert.ok(ink.width > 0 && ink.height > 0);
});

test('the card is the size index.html advertises', () => {
  assert.deepEqual([card.width, card.height], [WIDTH, HEIGHT]);
});

test('the case count is rounded down, so the card never claims more than there are', () => {
  assert.equal(countText(1794), 'Over 1,790 cases.');
  assert.equal(countText(1790), 'Over 1,790 cases.');
  assert.equal(countText(1799), 'Over 1,790 cases.');
  assert.equal(countText(1800), 'Over 1,800 cases.');
  assert.match(explainerText(1794), /^Over 1,790 cases\. Each dot is one case of seafarer abandonment\./);
});
