// The picture a shared case link shows. Every share used to carry the same
// site-wide card; this draws the case itself — ship, status, port, crew — in
// the site's colours, beside the piece of map it happened on.
//
// The map is a baked JPEG from assets/basemaps (see basemap.js), with the
// case's own marker at its centre and any neighbouring case drawn faintly
// behind it, both sized and coloured by the site's markerRadius and status
// fills rather than by numbers written out again here. A case whose port has no
// panel — one with no coordinates, or a port added by a refresh since the last
// bake — gets the same card with the text across the full width, so a missing
// picture costs the map, not the card.
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
const { STATUS_COLORS, markerRadius } = require('./status');
const { PANEL, panelOrigin, project, readPanel, hasCoords } = require('./basemap');

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 64;
const FONT_DIR = path.join(__dirname, '../assets/fonts');
const FONT_FILES = ['Lato-Regular.ttf', 'Lato-Bold.ttf'].map(f => path.join(FONT_DIR, f));

// The map sits on the right; the text column is what's left of the card. With
// no map to draw, the text runs the full width instead.
const PANEL_BOX = { x: 664, y: 58, width: PANEL.width, height: PANEL.height };
const COLUMN = { x: PAD, y: 58, width: 560 };
const FULL_WIDTH = WIDTH - PAD * 2;

// Paper, ink and rules. The accent is the site's red; the status colours are
// never written here — they come from status.js, which the site's own file is
// tested against.
const INK = {
  paper: '#f8fafc',
  ink: '#111827',
  muted: '#64748b',
  border: '#e2e8f0',
  frame: '#cbd5e1',
  accent: '#de1a1a',
  sea: '#aad3df',
};

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

// One case's dot: the map's colour for its status, the map's size for its crew.
// The case the card is about wears a dark ring so it reads as the subject even
// where a busy coast puts several dots side by side.
function marker({ x, y }, ship, isSubject) {
  const { fill } = status(ship);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${markerRadius(ship.num_seafarers).toFixed(1)}" ` +
    `fill="${fill}" fill-opacity="${isSubject ? 1 : 0.75}" ` +
    `stroke="${isSubject ? INK.ink : '#55555580'}" stroke-width="${isSubject ? 2.5 : 0.6}"/>`;
}

// The map panel: the baked picture, the neighbours, then the case itself. Null
// when the port has no panel to draw.
function mapPanel(ship, nearby) {
  if (!hasCoords(ship)) return null;
  const lat = Number(ship.port_latitude);
  const lon = Number(ship.port_longitude);
  const jpeg = readPanel(lat, lon);
  if (!jpeg) return null;

  const origin = panelOrigin(lat, lon);
  // A neighbour on the far side of the antimeridian is a third of a world away
  // in raw longitude and a few kilometres away in fact; count it from whichever
  // side of the panel it is actually on.
  const near = other => {
    let l = Number(other.port_longitude);
    while (l - lon > 180) l -= 360;
    while (l - lon < -180) l += 360;
    return l;
  };
  const dots = nearby
    .filter(hasCoords)
    .filter(other => String(other.abandonment_id) !== String(ship.abandonment_id))
    .map(other => marker(project(Number(other.port_latitude), near(other), origin), other, false))
    .join('');

  return `<rect width="${PANEL.width}" height="${PANEL.height}" fill="${INK.sea}"/>` +
    `<image x="0" y="0" width="${PANEL.width}" height="${PANEL.height}" ` +
    `xlink:href="data:image/jpeg;base64,${jpeg.toString('base64')}"/>` +
    dots + marker(project(lat, lon, origin), ship, true);
}

function caseCardSvg(ship, nearby = []) {
  const { fill, label } = status(ship);
  const panel = mapPanel(ship, nearby);
  const width = panel ? COLUMN.width : FULL_WIDTH;

  const name = ship.ship_name || `Case ${ship.abandonment_id}`;
  // Three lines, because the ILO writes a ship's former name into the name
  // field — "WHITE ARROW (originally reported as Vestlandia)" — and two lines
  // beside a map panel cut most of that away. Only four names in the database
  // reach the third line; 1,759 of them fit on one.
  const titleLines = wrap(name, { size: 56, weight: 'bold', maxWidth: width, maxLines: 3 });
  const facts = factLines(ship).flatMap(line => wrap(line, { size: 26, maxWidth: width, maxLines: 1 }));
  // The name is centred on the same point whatever its length, growing up and
  // down from there by half a line each, and the status sits under its last
  // line — so a long name stays clear of the eyebrow above and the facts below.
  const titleTop = 210 - (titleLines.length - 1) * 33;
  const statusY = titleTop + (titleLines.length - 1) * 66;

  const text = (content, { x, y, size, weight = 'normal', color, spacing = 0, anchor }) =>
    `<text x="${x}" y="${y}" font-family="Lato" font-size="${size}" font-weight="${weight === 'bold' ? 700 : 400}"` +
    `${spacing ? ` letter-spacing="${spacing}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}` +
    ` fill="${color}">${escapeXml(content)}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
      + ` width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK.paper}"/>`,
    `<rect x="${COLUMN.x}" y="${COLUMN.y + 4}" width="12" height="12" fill="${INK.accent}"/>`,
    text('ABANDONED SEAFARERS', { x: COLUMN.x + 24, y: COLUMN.y + 15, size: 19, weight: 'bold', color: INK.muted, spacing: 3.4 }),
    ...titleLines.map((line, i) => text(line, { x: COLUMN.x, y: titleTop + i * 66, size: 56, weight: 'bold', color: INK.ink })),
    // Status: the map's colour, with its name beside it.
    `<circle cx="${COLUMN.x + 10}" cy="${statusY + 36}" r="10" fill="${fill}" stroke="#55555580"/>`,
    text(label, { x: COLUMN.x + 30, y: statusY + 45, size: 30, weight: 'bold', color: INK.ink }),
    ...facts.map((line, i) => text(line, { x: COLUMN.x, y: 430 + i * 40, size: 26, color: INK.muted })),
    text('abandonedseafarers.org', { x: COLUMN.x, y: HEIGHT - 58, size: 20, weight: 'bold', color: INK.ink }),
    text(`ILO case ${ship.abandonment_id}`, { x: COLUMN.x, y: HEIGHT - 30, size: 18, color: INK.muted }),
    ...(panel ? [
      `<g transform="translate(${PANEL_BOX.x} ${PANEL_BOX.y})">`,
      `<clipPath id="panel"><rect width="${PANEL.width}" height="${PANEL.height}"/></clipPath>`,
      `<g clip-path="url(#panel)">${panel}</g>`,
      `<rect width="${PANEL.width}" height="${PANEL.height}" fill="none" stroke="${INK.border}"/>`,
      // Corner marks, the top-left one in the site's red: a frame, not a box.
      `<path d="M-11 15 L-11 -11 L15 -11" fill="none" stroke="${INK.accent}" stroke-width="2"/>`,
      `<path d="M${PANEL.width - 15} -11 L${PANEL.width + 11} -11 L${PANEL.width + 11} 15" fill="none" stroke="${INK.frame}" stroke-width="2"/>`,
      `<path d="M-11 ${PANEL.height - 15} L-11 ${PANEL.height + 11} L15 ${PANEL.height + 11}" fill="none" stroke="${INK.frame}" stroke-width="2"/>`,
      `<path d="M${PANEL.width - 15} ${PANEL.height + 11} L${PANEL.width + 11} ${PANEL.height + 11} L${PANEL.width + 11} ${PANEL.height - 15}" fill="none" stroke="${INK.frame}" stroke-width="2"/>`,
      '</g>',
      // The basemap is OpenStreetMap's, and says so wherever the card is shown.
      text('© OpenStreetMap contributors', {
        x: PANEL_BOX.x + PANEL.width, y: HEIGHT - 30, size: 15, color: INK.muted, anchor: 'end',
      }),
    ] : []),
    '</svg>',
  ].join('\n');
}

const render = svg => new Resvg(svg, {
  font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Lato' },
  fitTo: { mode: 'width', value: WIDTH },
}).render();

const renderPng = svg => render(svg).asPng();

// The same drawing as raw RGBA. resvg draws nothing at all for an image it
// can't read, so the tests look at the pixels rather than at the markup that
// asked for them.
const renderPixels = svg => {
  const { pixels, width, height } = render(svg);
  return { pixels, width, height };
};

const caseCardPng = (ship, nearby = []) => renderPng(caseCardSvg(ship, nearby));

// The alt text a screen reader gets for the card, wherever it's shown.
const caseCardAlt = ship =>
  `${ship.ship_name || `Case ${ship.abandonment_id}`}: ${status(ship).label} abandonment case${ship.port_of_abandonment ? ` in ${ship.port_of_abandonment}` : ''}.`;

// The font files are the only thing that can't be checked by reading the code.
const fontsPresent = () => FONT_FILES.every(f => fs.existsSync(f));

module.exports = {
  caseCardSvg, caseCardPng, caseCardAlt, renderPng, renderPixels, wrap, factLines, fontsPresent,
  mapPanel, WIDTH, HEIGHT, PANEL_BOX, COLUMN,
};
