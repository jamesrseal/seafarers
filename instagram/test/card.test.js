const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCardHtml, splitBlocks, headerParts, quoteParts } = require('../src/card');
const { isRenderable, unrenderable } = require('../src/renderable');
const { STATUS_CARD_COLORS } = require('../src/theme');

// A composed draft, in the shape compose.js produces: every piece of case text
// is its own segment, which is what lets the card take the words apart without
// re-writing any of them.
function draftFixture({ quote = 'Owed wages of 4 months', update = 'Crew repatriated with wages' } = {}) {
  return {
    caseId: '1234',
    segments: [
      { kind: 'literal', text: 'Fishing vessel ' },
      { kind: 'field', field: 'ship_name', text: 'Ocean & Co' },
      { kind: 'literal', text: ' (' },
      { kind: 'field', field: 'flag', text: 'Panama' },
      { kind: 'literal', text: ' flag)' },
      { kind: 'literal', text: ': ' },
      { kind: 'field', field: 'num_seafarers', text: '9' },
      { kind: 'literal', text: ' seafarers' },
      { kind: 'literal', text: ' abandoned' },
      { kind: 'literal', text: ' in ' },
      { kind: 'field', field: 'port_of_abandonment', text: 'Mersin, Türkiye' },
      { kind: 'literal', text: ',' },
      { kind: 'literal', text: ' on ' },
      { kind: 'field', field: 'abandonment_date', text: '1 July 2026' },
      { kind: 'literal', text: '.' },
      { kind: 'literal', text: '\n\n' },
      { kind: 'literal', text: '“' },
      { kind: 'quote', source: 'circumstances', text: quote },
      { kind: 'literal', text: '”' },
      { kind: 'literal', text: '\n\n' },
      { kind: 'literal', text: 'Latest update, ' },
      { kind: 'updateDate', text: '8 September 2026' },
      { kind: 'literal', text: ': ' },
      { kind: 'literal', text: '“' },
      { kind: 'quote', source: 'comments', text: update },
      { kind: 'literal', text: '”' },
      { kind: 'literal', text: '\n\n' },
      { kind: 'literal', text: 'Status: ' },
      { kind: 'status', text: 'Resolved' },
      { kind: 'literal', text: ' · ' },
      { kind: 'literal', text: 'ILO record', linkTo: 'ilo' },
    ],
  };
}

const SHIP = { ship_status: 'resolved' };

test('the post splits into header, quotes and status', () => {
  const blocks = splitBlocks(draftFixture().segments);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[blocks.length - 1].find(s => s.kind === 'status').text, 'Resolved');
});

test('the header gives up the name, flag and the sentence unchanged', () => {
  const header = headerParts(splitBlocks(draftFixture().segments)[0]);
  assert.deepEqual(header, {
    fishing: true,
    shipName: 'Ocean & Co',
    flag: 'Panama',
    sentence: '9 seafarers abandoned in Mersin, Türkiye, on 1 July 2026.',
  });
});

test('an update quote keeps its date label; a circumstances quote has none', () => {
  const [, circumstances, update] = splitBlocks(draftFixture().segments);
  assert.deepEqual(quoteParts(circumstances), { label: null, text: 'Owed wages of 4 months' });
  assert.deepEqual(quoteParts(update), { label: 'Latest update, 8 September 2026', text: 'Crew repatriated with wages' });
});

test('the card carries the case text and escapes it', () => {
  const html = buildCardHtml(draftFixture(), SHIP);
  assert.match(html, /Ocean &amp; Co/);
  assert.doesNotMatch(html, /Ocean & Co/);
  assert.match(html, /9 seafarers abandoned in Mersin, Türkiye, on 1 July 2026\./);
  assert.match(html, /Owed wages of 4 months/);
  assert.match(html, /Crew repatriated with wages/);
  assert.match(html, /ILO CASE /);
  assert.match(html, /1234/);
  assert.match(html, /Fishing vessel/);
  assert.match(html, /Panama flag/);
});

test('the status colour is the site\'s fill for that status', () => {
  const html = buildCardHtml(draftFixture(), SHIP);
  assert.match(html, new RegExp(STATUS_CARD_COLORS.resolved.fill));
  assert.match(html, />Resolved</);
});

test('band is the card unless another variant is asked for', () => {
  assert.match(buildCardHtml(draftFixture(), SHIP), /class="card band"/);
  assert.match(buildCardHtml(draftFixture(), SHIP, { variant: 'full' }), /class="card full"/);
  assert.throws(() => buildCardHtml(draftFixture(), SHIP, { variant: 'sideways' }), /unknown card variant/);
});

test('a quote the fonts cannot draw is left off the card', () => {
  const html = buildCardHtml(draftFixture({ update: 'Crew repatriated ◦ with wages' }), SHIP);
  assert.doesNotMatch(html, /Crew repatriated/);
  // The other quote, which the fonts can draw, is still there.
  assert.match(html, /Owed wages of 4 months/);
});

test('the fonts cover the accents the ILO data uses, and not symbol characters', () => {
  assert.deepEqual(unrenderable('İskenderun, Türkiye — “Şile”, Cabo Verde'), []);
  assert.deepEqual(unrenderable('ASCII only'), []);
  assert.deepEqual(unrenderable('bullet ◦ and 🙏'), ['◦', '🙏']);
  assert.ok(isRenderable('€'));
  assert.ok(!isRenderable('Б'));
});
