const test = require('node:test');
const assert = require('node:assert/strict');
const { graphemeLength, byteLength, byteRange, sliceBytes } = require('../src/text');

test('counts graphemes, not UTF-16 units', () => {
  assert.equal(graphemeLength('Türkiye'), 7);
  assert.equal(graphemeLength('Türkiye'), 7); // decomposed ü
  assert.equal(graphemeLength('👨‍👩‍👧'), 1);
  assert.equal(graphemeLength('“·”'), 3);
});

test('facet ranges are UTF-8 byte offsets', () => {
  const text = 'Türkiye · ILO record';
  const start = text.indexOf('ILO record');
  const range = byteRange(text, start, start + 'ILO record'.length);
  // ü and · are two bytes each: the range sits two bytes past the string index.
  assert.deepEqual(range, { byteStart: start + 2, byteEnd: start + 12 });
  assert.equal(sliceBytes(text, range.byteStart, range.byteEnd), 'ILO record');
  assert.equal(byteLength(text), text.length + 2);
});
