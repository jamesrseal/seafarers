// Which characters the card's embedded fonts can actually draw.
//
// The card is rendered where there are no other fonts to fall back on, so a
// character outside Lato's subsets comes out as a blank box. The ILO's text
// contains a few: white bullets, a euro sign, Cyrillic and Greek letters,
// fullwidth brackets, and characters pasted from symbol fonts. A quote
// carrying one is left off the card rather than drawn as boxes — the post's
// own text still quotes it, because Bluesky and Instagram captions are plain
// text and render anything.
//
// The ranges come from assets/fonts/fonts.json, which is written by whatever
// downloads the fonts, so adding a subset widens this automatically.

const fs = require('fs');
const path = require('path');

const FONTS_JSON = path.join(__dirname, '..', 'assets', 'fonts', 'fonts.json');

function parseRanges(faces) {
  const ranges = [];
  for (const face of faces) {
    for (const part of face.unicodeRange.split(',')) {
      const token = part.trim().replace(/^U\+/i, '');
      if (!token) continue;
      const [from, to] = token.split('-');
      ranges.push([parseInt(from, 16), parseInt(to ?? from, 16)]);
    }
  }
  return ranges;
}

let cached = null;
function coveredRanges() {
  if (!cached) cached = parseRanges(JSON.parse(fs.readFileSync(FONTS_JSON, 'utf8')));
  return cached;
}

function isRenderable(ch) {
  const cp = ch.codePointAt(0);
  // Tabs and newlines never reach the card as glyphs.
  if (cp < 0x20) return true;
  return coveredRanges().some(([from, to]) => cp >= from && cp <= to);
}

// The distinct characters in `text` that the fonts have no glyph for.
function unrenderable(text) {
  const missing = new Set();
  for (const ch of String(text ?? '')) if (!isRenderable(ch)) missing.add(ch);
  return [...missing];
}

module.exports = { isRenderable, unrenderable, parseRanges, FONTS_JSON };
