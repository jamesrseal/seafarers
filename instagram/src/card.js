// Builds the Instagram card as a 1080x1350 HTML page for headless Chrome to
// photograph. Instagram takes no text-only post, so the same words the Bluesky
// post carries are set over a public-domain photograph of open sea.
//
// Every word of case text comes from the composed post's segments — the text
// verify.js has already checked, copied as-is — plus the fixed labels in
// CARD_LITERALS. Nothing is re-worded here, and nothing states an outcome or a
// timeline the record doesn't.
//
// The text sits along the bottom so the sea is left to look at above it, and
// the case's status colour (the map's own fill) is the only colour besides the
// photograph: a rule across the top, the quote rules, and the status pill.

const fs = require('fs');
const path = require('path');
const { statusCardColor } = require('./theme');
const { unrenderable } = require('./renderable');

const WIDTH = 1080;
const HEIGHT = 1350;
const ASSETS = path.join(__dirname, '..', 'assets');
// band is the card: the sea across the top, the case on a panel below it.
// full (the sea behind everything) is kept because it costs a few lines.
const VARIANTS = ['band', 'full'];

// The card's own words, the way compose.js keeps TEMPLATE_LITERALS.
const CARD_LITERALS = Object.freeze({
  eyebrow: 'ILO CASE ',
  fishing: 'Fishing vessel',
  flagSuffix: ' flag',
  updatePrefix: 'Latest update, ',
  site: 'abandonedseafarers.org',
});

const escape = text => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dataUri = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ASSETS, file)).toString('base64')}`;

// Lato, subset by subset, exactly as Google Fonts serves it. The files are
// committed and embedded because the machine rendering the card has no fonts
// of its own to fall back on: a GitHub runner would draw İ or ü as a blank box.
function fontFaces() {
  const faces = JSON.parse(fs.readFileSync(path.join(ASSETS, 'fonts', 'fonts.json'), 'utf8'));
  return faces.map(face => `  @font-face {
    font-family: 'Lato';
    font-style: normal;
    font-weight: ${face.weight};
    src: url('${dataUri(path.join('fonts', face.file), 'font/woff2')}') format('woff2');
    unicode-range: ${face.unicodeRange};
  }`).join('\n');
}

// compose.js separates the post's parts with a literal '\n\n'.
function splitBlocks(segments) {
  const blocks = [[]];
  for (const segment of segments) {
    if (segment.kind === 'literal' && segment.text === '\n\n') blocks.push([]);
    else blocks[blocks.length - 1].push(segment);
  }
  return blocks.filter(block => block.length);
}

// The opening sentence: "<name> (<flag> flag): <n> seafarers abandoned in
// <port>, on <date>." The card sets the name as its headline and the flag as a
// tag, so they are taken out and the rest of the sentence is kept verbatim.
function headerParts(block) {
  const colon = block.findIndex(s => s.kind === 'literal' && s.text === ': ');
  const before = colon === -1 ? block : block.slice(0, colon);
  const after = colon === -1 ? [] : block.slice(colon + 1);
  return {
    fishing: before.some(s => s.kind === 'literal' && s.text === 'Fishing vessel '),
    shipName: before.find(s => s.field === 'ship_name')?.text ?? '',
    flag: before.find(s => s.field === 'flag')?.text ?? '',
    sentence: after.map(s => s.text).join('').trim(),
  };
}

function quoteParts(block) {
  const quote = block.find(s => s.kind === 'quote');
  if (!quote) return null;
  const date = block.find(s => s.kind === 'updateDate');
  return { label: date ? `${CARD_LITERALS.updatePrefix}${date.text}` : null, text: quote.text };
}

// A long name set at the headline size would run off the card.
function headlineSize(name) {
  if (name.length > 30) return 52;
  if (name.length > 20) return 64;
  return 80;
}

// Quotes run from a few words to about 200 characters. Past roughly half the
// budget the body steps down a size so the longest case still has the sea above
// it rather than filling the card to the edges.
function bodyScale(quotes) {
  const length = quotes.reduce((n, q) => n + q.text.length, 0);
  if (length > 320) return 0.82;
  if (length > 200) return 0.91;
  return 1;
}

function buildCardHtml(draft, ship, { variant = 'band' } = {}) {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown card variant ${variant}`);
  const blocks = splitBlocks(draft.segments);
  const header = headerParts(blocks[0]);
  // A quote the embedded fonts have no glyphs for would be drawn as blank
  // boxes, so the card leaves it out. The post's own text still carries it.
  const quotes = blocks.slice(1, -1).map(quoteParts).filter(Boolean)
    .filter(quote => unrenderable(`${quote.label ?? ''}${quote.text}`).length === 0);
  const status = blocks[blocks.length - 1].find(s => s.kind === 'status')?.text ?? '';
  const { fill, ink } = statusCardColor(ship.ship_status);
  const scale = bodyScale(quotes);
  const px = (size) => `${Math.round(size * scale)}px`;

  const tags = [
    ...(header.fishing ? [CARD_LITERALS.fishing] : []),
    ...(header.flag ? [`${header.flag}${CARD_LITERALS.flagSuffix}`] : []),
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fontFaces()}

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; background: #061422; color: #fff;
    font-family: 'Lato', sans-serif; -webkit-font-smoothing: antialiased;
  }

  .card { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  .photo { position: absolute; inset: 0; background: url('${dataUri('ocean.jpg', 'image/jpeg')}') center/cover no-repeat; }
  .scrim { position: absolute; inset: 0; }
  .accent { position: absolute; top: 0; left: 0; right: 0; height: 14px; background: ${fill}; }

  /* full: the sea fills the card and darkens towards the text at the bottom.
     band: the sea is a crisp strip at the top, all text on the panel below. */
  .full .scrim {
    background: linear-gradient(180deg,
      rgba(6,20,34,.10) 0%, rgba(6,20,34,.14) 26%, rgba(6,20,34,.55) 44%,
      rgba(4,15,26,.90) 66%, rgba(3,12,22,.97) 100%);
  }
  /* 16% down the photo puts the horizon inside the strip, so it reads as open
     sea rather than as a blue texture. */
  .band .photo { inset: 0 0 auto 0; height: 600px; background-position: center 16%; }
  .band .scrim { inset: 0 0 auto 0; height: 600px; background: linear-gradient(180deg, rgba(6,20,34,0) 45%, rgba(6,20,34,.55) 80%, #061422 100%); }
  .band .panel { position: absolute; inset: 600px 0 0 0; background: #061422; }

  /* Text hangs from the bottom, so a short case leaves sea above it rather
     than a hole in the middle. */
  .content { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; padding: 84px 76px 70px; }

  .eyebrow { font-size: 26px; font-weight: 700; letter-spacing: .18em; color: rgba(255,255,255,.82); }
  .headline { margin-top: 14px; font-weight: 300; line-height: 1.04; letter-spacing: -.01em; text-shadow: 0 2px 24px rgba(0,0,0,.35); }
  .tags { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 12px; }
  .tag { font-size: ${px(24)}; padding: 7px 18px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px; color: rgba(255,255,255,.95); }
  .sentence { margin-top: 30px; font-size: ${px(40)}; font-weight: 300; line-height: 1.32; }

  .quotes { margin-top: 38px; display: flex; flex-direction: column; gap: 26px; }
  .quote { border-left: 6px solid ${fill}; padding-left: 26px; }
  .quote .label { font-size: ${px(22)}; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${fill}; }
  .quote .text { margin-top: 8px; font-size: ${px(30)}; line-height: 1.42; color: rgba(255,255,255,.95); }

  .footer { margin-top: 52px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .status { font-size: 28px; font-weight: 700; letter-spacing: .04em; padding: 14px 32px; border-radius: 999px; background: ${fill}; color: ${ink}; }
  .site { font-size: 27px; color: rgba(255,255,255,.8); }
</style>
</head>
<body>
  <div class="card ${escape(variant)}">
    <div class="photo"></div>
    <div class="scrim"></div>
    <div class="panel"></div>
    <div class="accent"></div>
    <div class="content">
      <div class="eyebrow">${escape(CARD_LITERALS.eyebrow)}${escape(draft.caseId)}</div>
      <div class="headline" style="font-size: ${headlineSize(header.shipName)}px">${escape(header.shipName)}</div>
      ${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${escape(t)}</span>`).join('')}</div>` : ''}
      <div class="sentence">${escape(header.sentence)}</div>
      ${quotes.length ? `<div class="quotes">${quotes.map(q => `
        <div class="quote">
          ${q.label ? `<div class="label">${escape(q.label)}</div>` : ''}
          <div class="text">“${escape(q.text)}”</div>
        </div>`).join('')}</div>` : ''}
      <div class="footer">
        <span class="status">${escape(status)}</span>
        <span class="site">${escape(CARD_LITERALS.site)}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildCardHtml, splitBlocks, headerParts, quoteParts, CARD_LITERALS, VARIANTS, WIDTH, HEIGHT };
