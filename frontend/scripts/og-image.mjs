// Draws frontend/public/og-image.png, the card every share of the site shows:
// the Open Graph / Twitter image in index.html, and the thumbnail the Bluesky
// poster falls back to when a case has no card of its own.
//
// The card is the site's own map, not a drawing of one: Leaflet, the same
// OpenStreetMap tiles, and every case in the committed database placed by the
// site's own markerRadius and status fills. Nothing here restates the site —
// the colours, the sizes and the counts are all read from it, so the card can't
// drift from the map it advertises the way the hand-drawn one did (it explained
// the map with Unresolved red and Disputed yellow, the two swapped, and nothing
// in the repo could notice).
//
// The checks are on the artefact rather than the source, because a committed
// PNG goes stale on its own: verifyLegend() re-reads the rendered image and
// fails unless the four footer dots are, left to right, the LEGEND statuses in
// their statusColors.js fills; verifyMap() fails unless the panel holds real
// tiles with real cases drawn on them; verifyHeadline() fails unless Lato drew
// the headline at the size the layout expects. The generator runs all three
// before it overwrites anything, and frontend/test/og-image.test.js runs them
// against whatever is committed.
//
// Rendering is a headless Chrome screenshot — Chrome writes a PNG when
// --screenshot names one. Lato comes from Google Fonts and the basemap from
// OpenStreetMap, as they do on the site, so this needs network access.
//
//   node scripts/og-image.mjs                     # rewrite public/og-image.png
//   node scripts/og-image.mjs --out /tmp/try.png  # somewhere else
//   node scripts/og-image.mjs --chrome <path>     # non-default Chrome
//
// Node 22.5+ (node:sqlite); no dependencies.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import { STATUS_COLORS, markerRadius } from '../src/utils/statusColors.js';

const WIDTH = 1200;
const HEIGHT = 630;

// Left to right, as the card reads. Not STATUS_COLORS' key order: the card
// puts the two open statuses first and the two closed ones after.
const LEGEND = ['', 'disputed', 'resolved', 'inactive'];

// The card's own furniture, none of it status-coded: the off-white the app puts
// behind its own map, the site's near-black ink, and one red square.
const INK = { bg: '#f8fafc', ink: '#111827', muted: '#64748b', border: '#e2e8f0', frame: '#cbd5e1', accent: '#de1a1a' };

const EYEBROW = 'Abandoned Seafarers';
const HEADLINE = 'Visualizing the ILO/IMO joint database on the Abandonment of Seafarers';
const SITE = 'abandonedseafarers.org';

// The Mediterranean and the Red Sea: the busiest water in the database, close
// enough that a case still reads as one dot.
const MAP = { lat: 36.5, lon: 24, zoom: 4.2 };

const LAYOUT = {
  left: { x: 64, y: 58, width: 560, height: 514 },
  panel: { x: 664, y: 58, width: 472, height: 514 },
  eyebrow: { size: 19, weight: 700, tracking: '0.2em', square: 12, gap: 12 },
  headline: { size: 50, weight: 900, line: 1.08, tracking: '-0.02em', gap: 26 },
  explainer: { size: 19, line: 1.55, width: 495, gap: 22 },
  foot: { size: 14, site: 15, dot: 11, gapItems: 18, gapDotLabel: 6 },
};

const DB_PATH = fileURLToPath(new URL('../../backend/data/seafarers.db', import.meta.url));

function fill(status) {
  const entry = STATUS_COLORS[status];
  if (!entry) throw new Error(`no status '${status}' in statusColors.js`);
  return entry.fill;
}

const label = status => STATUS_COLORS[status].label;

// Rounded down to the ten, so the card understates the database rather than
// overstating it, and only changes when another ten cases have been reported.
export const countText = total => `Over ${(Math.floor(total / 10) * 10).toLocaleString('en-US')} cases.`;

export const explainerText = total =>
  `${countText(total)} Each dot is one case of seafarer abandonment. `
  + 'Bigger dots mean more abandoned seafarers. Click a dot to read the full case.';

// Every case as the site has it: the latest row per case, the ones with a port
// the geocoder resolved, sized and coloured the way the map sizes and colours
// them.
export function loadCases(path = DB_PATH) {
  const { DatabaseSync } = require_sqlite();
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const latest = `scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ships WHERE ${latest}`).get().n;
    const cases = db.prepare(
      `SELECT port_latitude AS lat, port_longitude AS lon, ship_status AS status, num_seafarers AS crew
       FROM ships WHERE ${latest} AND port_latitude IS NOT NULL AND port_longitude IS NOT NULL`
    ).all();
    return { total, cases };
  } finally {
    db.close();
  }
}

// node:sqlite is loaded through createRequire so the module only has to exist
// when the card is drawn — the test imports this file to read a PNG back.
function require_sqlite() {
  return globalThis.process.getBuiltinModule('node:sqlite');
}

function page({ total, cases }) {
  const points = cases.map(c => [c.lat, c.lon, fill(c.status ?? ''), Math.round(markerRadius(c.crew) * 10) / 10]);
  const legend = LEGEND.map(status =>
    `<span class="item"><i style="background:${fill(status)}"></i>${label(status)}</span>`
  ).join('');

  const L = LAYOUT;
  return `<!doctype html>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *  { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; }
  body { background:${INK.bg}; font-family:'Lato', sans-serif; -webkit-font-smoothing:antialiased; color:${INK.ink}; }
  .left  { position:absolute; left:${L.left.x}px; top:${L.left.y}px; width:${L.left.width}px; height:${L.left.height}px;
           display:flex; flex-direction:column; }
  .eyebrow { display:flex; align-items:center; gap:${L.eyebrow.gap}px; font-size:${L.eyebrow.size}px;
             font-weight:${L.eyebrow.weight}; letter-spacing:${L.eyebrow.tracking}; text-transform:uppercase; color:${INK.muted}; }
  .eyebrow i { width:${L.eyebrow.square}px; height:${L.eyebrow.square}px; background:${INK.accent}; display:block; }
  .headline { margin-top:${L.headline.gap}px; font-size:${L.headline.size}px; font-weight:${L.headline.weight};
              line-height:${L.headline.line}; letter-spacing:${L.headline.tracking}; color:${INK.ink}; }
  .explainer { margin-top:${L.explainer.gap}px; font-size:${L.explainer.size}px; line-height:${L.explainer.line};
               width:${L.explainer.width}px; color:${INK.muted}; }
  .foot  { margin-top:auto; display:flex; align-items:center; gap:${L.foot.gapItems}px; font-size:${L.foot.size}px; color:${INK.muted}; }
  .foot .site { color:${INK.ink}; font-weight:700; font-size:${L.foot.site}px; }
  .item  { display:inline-flex; align-items:center; gap:${L.foot.gapDotLabel}px; }
  .item i { width:${L.foot.dot}px; height:${L.foot.dot}px; border-radius:50%; display:block; border:1px solid #555; }
  .panel { position:absolute; left:${L.panel.x}px; top:${L.panel.y}px; width:${L.panel.width}px; height:${L.panel.height}px;
           border:1px solid ${INK.border}; }
  .panel::before, .panel::after, .panel i { content:''; position:absolute; width:26px; height:26px; }
  .panel::before { left:-11px; top:-11px; border-left:2px solid ${INK.accent}; border-top:2px solid ${INK.accent}; }
  .panel::after  { right:-11px; bottom:-11px; border-right:2px solid ${INK.frame}; border-bottom:2px solid ${INK.frame}; }
  .panel i.tr { right:-11px; top:-11px; border-right:2px solid ${INK.frame}; border-top:2px solid ${INK.frame}; }
  .panel i.bl { left:-11px; bottom:-11px; border-left:2px solid ${INK.frame}; border-bottom:2px solid ${INK.frame}; }
  #map { width:100%; height:100%; background:#aad3df; }
  .leaflet-control-container { display:none; }
</style>
<div class="left">
  <div class="eyebrow"><i></i>${EYEBROW}</div>
  <div class="headline">${HEADLINE}</div>
  <div class="explainer">${explainerText(total)}</div>
  <div class="foot"><span class="site">${SITE}</span>${legend}</div>
</div>
<div class="panel"><i class="tr"></i><i class="bl"></i><div id="map"></div></div>
<script>
  const map = L.map('map', { zoomControl:false, attributionControl:false, zoomSnap:0 })
               .setView([${MAP.lat}, ${MAP.lon}], ${MAP.zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  // Full strength, unlike the map's recency fade: the fills have to survive the
  // screenshot for verifyMap() to find the cases in it.
  for (const [lat, lon, colour, radius] of ${JSON.stringify(points)}) {
    L.circleMarker([lat, lon], { radius, fillColor:colour, fillOpacity:1, color:'#555', weight:0.6 }).addTo(map);
  }
</script>
`;
}

// --- PNG ------------------------------------------------------------------
// Enough of the format to read back what Chrome wrote: 8-bit RGB or RGBA,
// non-interlaced, which is all it produces.

export function readPng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let width = 0, height = 0, channels = 0;
  const idat = [];
  for (let pos = 8; pos + 8 <= buffer.length;) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      row[i] = value & 0xff;
    }
  }

  // packed 0xRRGGBB, so a whole-image scan compares numbers rather than strings
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
  };
  const hex = (x, y) => '#' + at(x, y).toString(16).padStart(6, '0');
  return { width, height, at, hex };
}

// --- checks ---------------------------------------------------------------

// Every pixel of an exact colour within a box. The box matters now that the
// same fills appear twice on the card: as the footer's dots, and as the cases
// on the map.
function solidIn(png, colour, box) {
  const want = parseInt(colour.slice(1), 16);
  const points = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) if (png.at(x, y) === want) points.push([x, y]);
  }
  return points;
}

// The footer band alone, not the whole text side: the eyebrow's square is the
// same red as the Disputed dot, and a scan of both would read as one smear.
const FOOT_BAND = () => ({ x: 0, y: LAYOUT.left.y + LAYOUT.left.height - 44, width: LAYOUT.panel.x - 12, height: 48 });
const MAP_SIDE = () => ({ x: LAYOUT.panel.x + 1, y: LAYOUT.panel.y + 1, width: LAYOUT.panel.width - 2, height: LAYOUT.panel.height - 2 });

function checkSize(png) {
  if (png.width !== WIDTH || png.height !== HEIGHT) {
    throw new Error(`image is ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT} (index.html says so in og:image:width/height)`);
  }
}

// The check the swapped legend needed: each dot, left to right, in the fill the
// site gives that status.
export function verifyLegend(png) {
  checkSize(png);
  const found = LEGEND.map(status => {
    const colour = fill(status);
    const points = solidIn(png, colour, FOOT_BAND());
    // An 11px dot inside a 1px ring leaves about 50px of the fill exactly, once
    // the edge has been antialiased into the background.
    if (points.length < 30) {
      throw new Error(`${label(status)} (${colour}) covers ${points.length}px beside the text — no legend dot is drawn in it`);
    }
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (x1 - x0 > LAYOUT.foot.dot + 2 || y1 - y0 > LAYOUT.foot.dot + 2) {
      throw new Error(`${label(status)} (${colour}) is spread over ${x1 - x0 + 1}x${y1 - y0 + 1}px, not one dot`);
    }
    return { status, label: label(status), fill: colour, x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  });

  found.forEach((dot, i) => {
    if (i && dot.x <= found[i - 1].x) {
      throw new Error(`${dot.label} (${dot.fill}) sits left of ${found[i - 1].label} — the legend's colours are out of order`);
    }
  });
  return found;
}

// The panel has to hold the map, not the empty blue it starts as: tiles carry
// hundreds of colours, and the cases are drawn on top in the status fills.
const MAP_INK = { colours: 400, casePixels: 2000 };

export function verifyMap(png) {
  checkSize(png);
  const box = MAP_SIDE();
  const seen = new Set();
  for (let y = box.y; y < box.y + box.height; y += 2) {
    for (let x = box.x; x < box.x + box.width; x += 2) seen.add(png.at(x, y));
  }
  if (seen.size < MAP_INK.colours) {
    throw new Error(`the map panel holds ${seen.size} colours, expected at least ${MAP_INK.colours}. `
      + 'The basemap probably failed to load — check network access to tile.openstreetmap.org.');
  }

  const cases = Object.fromEntries(LEGEND.map(status => [status, solidIn(png, fill(status), box).length]));
  const drawn = Object.values(cases).reduce((sum, n) => sum + n, 0);
  if (drawn < MAP_INK.casePixels) {
    throw new Error(`the cases cover ${drawn}px of the map, expected at least ${MAP_INK.casePixels} — `
      + 'the markers are missing or drawn in colours the site doesn\'t use.');
  }
  return { colours: seen.size, cases, drawn };
}

// Lato Black at 50px wraps the headline into four lines about 530px wide; any
// fallback face sets it wider or shorter, and a missing webfont shows up here
// before it reaches the card.
const HEADLINE_INK = { width: 525, tolerance: 25, height: 199, heightTolerance: 14 };

export function verifyHeadline(png) {
  checkSize(png);
  const ink = solidIn(png, INK.ink, { x: 0, y: 0, width: LAYOUT.panel.x - 12, height: LAYOUT.left.y + 340 });
  if (!ink.length) throw new Error('no headline ink in the image');
  const xs = ink.map(p => p[0]), ys = ink.map(p => p[1]);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  if (Math.abs(width - HEADLINE_INK.width) > HEADLINE_INK.tolerance
      || Math.abs(height - HEADLINE_INK.height) > HEADLINE_INK.heightTolerance) {
    throw new Error(`the headline's ink is ${width}x${height}px, expected about ${HEADLINE_INK.width}x${HEADLINE_INK.height}px. `
      + 'Lato probably failed to load and a fallback face drew it — check network access to fonts.googleapis.com. '
      + '(If the headline or its size changed on purpose, update HEADLINE_INK.)');
  }
  return { width, height };
}

// --- rendering ------------------------------------------------------------

const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findChrome(override) {
  const candidates = override ? [override] : CHROMES;
  for (const path of candidates) if (path && existsSync(path)) return path;
  throw new Error(`no Chrome found. Pass --chrome <path> or set CHROME_PATH.\nLooked in:\n  ${candidates.filter(Boolean).join('\n  ')}`);
}

function render(chrome, html, out) {
  const dir = mkdtempSync(join(tmpdir(), 'og-image-'));
  try {
    const source = join(dir, 'card.html');
    writeFileSync(source, html);
    const result = spawnSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      // long enough for the webfont and a screen's worth of map tiles
      '--virtual-time-budget=40000',
      `--user-data-dir=${join(dir, 'profile')}`,
      `--screenshot=${join(dir, 'out.png')}`,
      pathToFileURL(source).href,
    ], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (!existsSync(join(dir, 'out.png'))) {
      throw new Error(`Chrome wrote no screenshot (exit ${result.status})\n${result.stderr || ''}`);
    }
    const buffer = readFileSync(join(dir, 'out.png'));
    // verify before overwriting, so a bad render never becomes the committed card
    const image = readPng(buffer);
    const dots = verifyLegend(image);
    const headline = verifyHeadline(image);
    const map = verifyMap(image);
    writeFileSync(out, buffer);
    return { dots, headline, map, bytes: buffer.length };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  const flag = name => {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1];
  };
  const out = flag('--out') || fileURLToPath(new URL('../public/og-image.png', import.meta.url));
  const chrome = findChrome(flag('--chrome'));

  const { total, cases } = loadCases();
  const { dots, headline, map, bytes } = render(chrome, page({ total, cases }), out);
  console.log(`wrote ${out} — ${WIDTH}x${HEIGHT}, ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`${total} cases in the database, ${cases.length} of them mapped — "${countText(total)}"`);
  console.log(`headline ink ${headline.width}x${headline.height}px (Lato ${LAYOUT.headline.weight} at ${LAYOUT.headline.size}px)`);
  console.log(`map panel: ${map.colours} colours, ${map.drawn}px of cases drawn on it`);
  for (const dot of dots) console.log(`  ${dot.fill}  ${dot.label.padEnd(10)} at x=${dot.x}, y=${dot.y}`);
}

export { LEGEND, WIDTH, HEIGHT, LAYOUT, INK, MAP, page, fill, label };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(1);
  }
}
