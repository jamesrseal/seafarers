const test = require('node:test');
const assert = require('node:assert/strict');
const { composePost } = require('../src/compose');
const { verifyDraft, assertGrounded } = require('../src/verify');
const { nikolayMeshkov, bird16, shreenathJi } = require('../fixtures/ships');

// Tamper with a copy of a real draft; rejoin the text from its segments so the
// check being tested is the one that has to catch it, not "segments don't join".
function tampered(ship, edit, { rejoin = true } = {}) {
  const draft = structuredClone(composePost(ship));
  edit(draft);
  if (rejoin) draft.text = draft.segments.map(s => s.text).join('');
  return verifyDraft(draft, ship);
}

const segment = (draft, predicate) => draft.segments.find(predicate);

function assertCaught(problems, pattern) {
  assert.ok(problems.some(p => pattern.test(p)), `expected a problem matching ${pattern}, got:\n${problems.join('\n')}`);
}

test('every fixture passes', () => {
  for (const ship of [nikolayMeshkov, bird16, shreenathJi]) {
    assert.deepEqual(verifyDraft(composePost(ship), ship), []);
  }
});

test('catches a changed number', () => {
  const problems = tampered(nikolayMeshkov, d => { segment(d, s => s.field === 'num_seafarers').text = '31'; });
  assertCaught(problems, /does not match the record's num_seafarers/);
  assertCaught(problems, /the number 31 does not appear/);
});

test('catches a quote that is no longer verbatim', () => {
  const problems = tampered(nikolayMeshkov, d => { segment(d, s => s.kind === 'quote').text = 'Unpaid wages of 3 months.'; });
  assertCaught(problems, /not verbatim from circumstances/);
  assertCaught(problems, /quoted text "Unpaid wages of 3 months\." is not in the ILO record/);
});

test('catches an update quote taken from an older update', () => {
  const problems = tampered(bird16, d => {
    segment(d, s => s.kind === 'quote' && s.source === 'comments').text = 'Vessel is currently under arrest by PSC in Mersin Port.';
  });
  assertCaught(problems, /not from the latest dated update/);
});

test('catches words the template does not have', () => {
  assertCaught(tampered(nikolayMeshkov, d => { d.segments.push({ kind: 'literal', text: ' Still waiting.' }); }), /not part of the template/);
  assertCaught(tampered(nikolayMeshkov, d => { d.text += ' still waiting'; }, { rejoin: false }), /segments do not join/);
});

test('catches a placeholder where a value was missing', () => {
  const problems = tampered(nikolayMeshkov, d => { segment(d, s => s.field === 'port_of_abandonment').text = 'undefined'; });
  assertCaught(problems, /missing-value placeholder/);
});

test('catches a wrong or misplaced link', () => {
  assertCaught(tampered(nikolayMeshkov, d => { d.facets[1].features[0].uri = 'https://example.org/'; }), /link 2 should point at/);
  assertCaught(tampered(nikolayMeshkov, d => { d.facets[0].index.byteEnd += 1; }), /link 1 does not sit on "Nikolay Meshkov"/);
  const otherCase = { ...nikolayMeshkov, ilo_url: nikolayMeshkov.ilo_url.replace('1821', '1822') };
  assertCaught(verifyDraft(composePost(nikolayMeshkov), otherCase), /is not this case's ILO record/);
});

test('catches a link card that was not built from the record', () => {
  assertCaught(tampered(nikolayMeshkov, d => { d.card.title = 'Crew still stranded'; }), /link card title/);
  assertCaught(tampered(nikolayMeshkov, d => { d.card.description += ' · 40 seafarers'; }), /link card's number 40/);
});

test('the grapheme cap is Bluesky\'s 300 unless the caller sets another', () => {
  const draft = composePost(nikolayMeshkov);
  assert.deepEqual(verifyDraft(draft, nikolayMeshkov), []);
  assert.deepEqual(verifyDraft(draft, nikolayMeshkov, { maxGraphemes: 700 }), []);
  assertCaught(verifyDraft(draft, nikolayMeshkov, { maxGraphemes: 10 }), /graphemes, over 10/);
  assert.throws(() => assertGrounded(draft, nikolayMeshkov, { maxGraphemes: 10 }), /graphemes, over 10/);
});

test('assertGrounded throws with every problem listed', () => {
  const draft = structuredClone(composePost(nikolayMeshkov));
  draft.card.title = 'Something else';
  assert.throws(() => assertGrounded(draft, nikolayMeshkov), err => err.problems.length === 1 && /case 1821 failed the grounding check/.test(err.message));
});
