// The card and caption compose with more room than a Bluesky post, so the
// flag and both quotes survive on cases where 300 graphemes forced a choice.
// These check that the larger budget is honoured end to end, and that the
// grounding check still runs against it rather than being skipped.

const test = require('node:test');
const assert = require('node:assert/strict');
const { composePost } = require('../../bluesky/src/compose');
const { verifyDraft } = require('../../bluesky/src/verify');
const { POST_MAX_GRAPHEMES } = require('../../bluesky/src/config');
const { nikolayMeshkov, bird16, shreenathJi } = require('../../bluesky/fixtures/ships');
const { COMPOSE_MAX_GRAPHEMES } = require('../src/config');

test('the card has more room than a Bluesky post, and stays within it', () => {
  assert.ok(COMPOSE_MAX_GRAPHEMES > POST_MAX_GRAPHEMES);
  for (const ship of [nikolayMeshkov, bird16, shreenathJi]) {
    const draft = composePost(ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES });
    assert.ok(draft.graphemes <= COMPOSE_MAX_GRAPHEMES);
    assert.deepEqual(verifyDraft(draft, ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES }), []);
  }
});

test('the larger budget never drops what the smaller one kept', () => {
  for (const ship of [nikolayMeshkov, bird16, shreenathJi]) {
    const small = composePost(ship);
    const big = composePost(ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES });
    const quotes = draft => (draft.layout.circumstancesQuote ? 1 : 0) + (draft.layout.updateQuote ? 1 : 0);
    assert.ok(quotes(big) >= quotes(small), `case ${ship.abandonment_id} lost a quote`);
    if (small.layout.showFlag) assert.ok(big.layout.showFlag, `case ${ship.abandonment_id} lost its flag`);
  }
});

test('a budget too small for the header and status is refused', () => {
  assert.throws(() => composePost(nikolayMeshkov, { maxGraphemes: 40 }), /exceed 40 graphemes/);
});
