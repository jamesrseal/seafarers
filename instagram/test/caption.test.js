const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCaption, buildAltText, caseIdsInText, postTextWithoutLink,
  CAPTION_MAX, ALT_TEXT_MAX, HASHTAG_MAX,
} = require('../src/caption');

// As compose.js builds it: the sentence, a quote, the status, and the text of
// the link to the ILO record.
function draftFixture({ caseId = '1820', text } = {}) {
  return {
    caseId,
    text: text ?? 'Gas Houston (Panama flag): 15 seafarers abandoned in İskenderun, Türkiye, on 1 July 2026.'
      + '\n\n“Owed wages of 2-3 months”'
      + '\n\nStatus: Unresolved · ILO record',
    segments: [
      { kind: 'field', field: 'ship_name', text: 'Gas Houston' },
      { kind: 'literal', text: ' (' },
      { kind: 'field', field: 'flag', text: 'Panama' },
      { kind: 'literal', text: ' flag)' },
      { kind: 'literal', text: ': ' },
      { kind: 'field', field: 'num_seafarers', text: '15' },
      { kind: 'literal', text: ' seafarers' },
      { kind: 'literal', text: ' abandoned' },
      { kind: 'literal', text: ' in ' },
      { kind: 'field', field: 'port_of_abandonment', text: 'İskenderun, Türkiye' },
      { kind: 'literal', text: ',' },
      { kind: 'literal', text: ' on ' },
      { kind: 'field', field: 'abandonment_date', text: '1 July 2026' },
      { kind: 'literal', text: '.' },
    ],
  };
}

test('the caption is the post, without the link text that cannot be a link', () => {
  const caption = buildCaption(draftFixture());
  assert.match(caption, /^Gas Houston \(Panama flag\): 15 seafarers abandoned in İskenderun, Türkiye, on 1 July 2026\./);
  assert.match(caption, /“Owed wages of 2-3 months”/);
  assert.match(caption, /Status: Unresolved/);
  assert.doesNotMatch(caption, /ILO record/);
});

test('the caption says which case it is, and where the case lives', () => {
  const caption = buildCaption(draftFixture());
  assert.match(caption, /ILO case 1820/);
  assert.match(caption, /abandonedseafarers\.org — link in bio/);
  assert.deepEqual(caseIdsInText(caption), ['1820']);
});

test('the caption stays inside Instagram\'s limits', () => {
  const caption = buildCaption(draftFixture());
  assert.ok(caption.length <= CAPTION_MAX, `${caption.length} characters`);
  assert.ok((caption.match(/#[^\s#]+/g) ?? []).length <= HASHTAG_MAX);
});

test('a caption that would be too long is refused rather than cut', () => {
  const draft = draftFixture({ text: 'x'.repeat(CAPTION_MAX) });
  assert.throws(() => buildCaption(draft), /over Instagram's 2200/);
});

test('the alt text describes the card and names the case', () => {
  const { text, shipName } = buildAltText(draftFixture());
  assert.equal(shipName, 'Gas Houston');
  assert.match(text, /^ILO case 1820 · Card over a photograph of open sea\./);
  assert.match(text, /15 seafarers abandoned in İskenderun, Türkiye/);
  assert.doesNotMatch(text, /\n/);
  assert.ok(text.length <= ALT_TEXT_MAX);
  assert.deepEqual(caseIdsInText(text), ['1820']);
});

test('alt text too long for Instagram is cut to fit', () => {
  const { text } = buildAltText(draftFixture({ text: `${'word '.repeat(400)}· ILO record` }));
  assert.ok(text.length <= ALT_TEXT_MAX, `${text.length} characters`);
  assert.match(text, /…$/);
});

test('the link tail only comes off the end', () => {
  const draft = draftFixture({ text: 'A ship · ILO record of note\n\nStatus: Unresolved · ILO record' });
  assert.equal(postTextWithoutLink(draft), 'A ship · ILO record of note\n\nStatus: Unresolved');
});

test('posts about several cases give up every case ID', () => {
  assert.deepEqual(caseIdsInText('ILO case 12 and ILO case 1820 and ILO case 12'), ['12', '1820']);
  assert.deepEqual(caseIdsInText('no case here'), []);
  assert.deepEqual(caseIdsInText(null), []);
});
