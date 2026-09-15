// Bluesky measures post length in graphemes and places facets by UTF-8 byte
// offset. JavaScript strings are UTF-16, so neither .length nor a string index
// is right for either: "Türkiye" is 7 graphemes, 8 bytes, and 7 or 8 UTF-16
// units depending on how the ü was composed.

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function graphemeLength(text) {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

function byteLength(text) {
  return encoder.encode(text).length;
}

// Byte range of text.slice(charStart, charEnd).
function byteRange(text, charStart, charEnd) {
  const byteStart = byteLength(text.slice(0, charStart));
  return { byteStart, byteEnd: byteStart + byteLength(text.slice(charStart, charEnd)) };
}

function sliceBytes(text, byteStart, byteEnd) {
  return decoder.decode(encoder.encode(text).slice(byteStart, byteEnd));
}

module.exports = { graphemeLength, byteLength, byteRange, sliceBytes };
