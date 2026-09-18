// The picture a shared case link shows. Every share used to carry the same
// site-wide card; this draws the case itself — ship, status, port, crew — in
// the site's colours.
//
// Drawn as SVG and rasterised with resvg, not a headless browser: Render runs
// the plain Node image, and the cards have to be there whenever a crawler asks.
// Lato is read from backend/assets/fonts, because the container has no fonts of
// its own. There is no text measurement without a browser, so lines are broken
// on an estimate of Lato's average glyph width, with WRAP_FACTOR set from the
// widest names in the database.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { STATUS_COLORS } = require('./status');

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 72;
const FONT_DIR = path.join(__dirname, '../assets/fonts');
const FONT_FILES = ['Lato-Regular.ttf', 'Lato-Bold.ttf'].map(f => path.join(FONT_DIR, f));

// Average glyph width as a fraction of font size, measured against Lato.
const WRAP_FACTOR = { normal: 0.5, bold: 0.54 };

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ESCAPES[c]);

const status = ship => STATUS_COLORS[ship.ship_status ?? ''] ?? STATUS_COLORS[''];

// Greedy wrap by estimated width, at most `maxLines`; the last line is cut with
// an ellipsis rather than running off the card.
function wrap(text, { size, weight = 'normal', maxWidth, maxLines }) {
  const perChar = size * WRAP_FACTOR[weight];
  const limit = Math.max(1, Math.floor(maxWidth / perChar));
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= limit || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && line && lines[maxLines - 1] !== line) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, limit - 1))}…`;
  }
  return lines.map(l => (l.length > limit ? `${l.slice(0, Math.max(1, limit - 1))}…` : l));
}

// "12 seafarers · Palau · IMO 8955873" — whatever the record has.
function factLines(ship) {
  const n = ship.num_seafarers;
  const crew = n ? `${n} ${n === 1 ? 'seafarer' : 'seafarers'}` : null;
  const first = [ship.port_of_abandonment, ship.abandonment_date].filter(Boolean).join(' · ');
  const second = [crew, ship.flag, ship.imo_number && `IMO ${ship.imo_number}`].filter(Boolean).join(' · ');
  return [first, second].filter(Boolean);
}

function caseCardSvg(ship) {
  const { fill, label } = status(ship);
  const name = ship.ship_name || `Case ${ship.abandonment_id}`;
  const titleLines = wrap(name, { size: 72, weight: 'bold', maxWidth: WIDTH - PAD * 2, maxLines: 2 });
  const facts = factLines(ship).flatMap(line => wrap(line, { size: 34, maxWidth: WIDTH - PAD * 2, maxLines: 1 }));
  const titleTop = 250 - (titleLines.length - 1) * 42;

  const text = (content, { x, y, size, weight = 'normal', color, spacing = 0 }) =>
    `<text x="${x}" y="${y}" font-family="Lato" font-size="${size}" font-weight="${weight === 'bold' ? 700 : 400}"` +
    `${spacing ? ` letter-spacing="${spacing}"` : ''} fill="${color}">${escapeXml(content)}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#111827"/>`,
    text('ABANDONED SEAFARERS', { x: PAD, y: 110, size: 30, weight: 'bold', color: '#9ca3af', spacing: 4 }),
    ...titleLines.map((line, i) => text(line, { x: PAD, y: titleTop + i * 84, size: 72, weight: 'bold', color: '#ffffff' })),
    // Status: the map's colour, with its name beside it.
    `<circle cx="${PAD + 15}" cy="${titleTop + (titleLines.length - 1) * 84 + 54}" r="15" fill="${fill}"/>`,
    text(label, { x: PAD + 46, y: titleTop + (titleLines.length - 1) * 84 + 66, size: 36, weight: 'bold', color: fill }),
    ...facts.map((line, i) => text(line, { x: PAD, y: 470 + i * 50, size: 34, color: '#d1d5db' })),
    text('abandonedseafarers.org', { x: PAD, y: HEIGHT - 52, size: 28, color: '#9ca3af' }),
    text(`ILO case ${ship.abandonment_id}`, { x: WIDTH - PAD - 220, y: HEIGHT - 52, size: 28, color: '#9ca3af' }),
    `<rect x="0" y="${HEIGHT - 14}" width="${WIDTH}" height="14" fill="${fill}"/>`,
    '</svg>',
  ].join('\n');
}

function renderPng(svg) {
  return new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Lato' },
    fitTo: { mode: 'width', value: WIDTH },
  }).render().asPng();
}

const caseCardPng = ship => renderPng(caseCardSvg(ship));

// The alt text a screen reader gets for the card, wherever it's shown.
const caseCardAlt = ship =>
  `${ship.ship_name || `Case ${ship.abandonment_id}`}: ${status(ship).label} abandonment case${ship.port_of_abandonment ? ` in ${ship.port_of_abandonment}` : ''}.`;

// The font files are the only thing that can't be checked by reading the code.
const fontsPresent = () => FONT_FILES.every(f => fs.existsSync(f));

module.exports = { caseCardSvg, caseCardPng, caseCardAlt, renderPng, wrap, factLines, fontsPresent, WIDTH, HEIGHT };
