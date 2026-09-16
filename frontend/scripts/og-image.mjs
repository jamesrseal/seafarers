// Draws frontend/public/og-image.png, the card every share of the site shows:
// the Open Graph / Twitter image in index.html, and the thumbnail attached to
// every Bluesky post (THUMB_PATH in bluesky/src/config.js).
//
// The legend's colours are imported from the site's own statusColors.js rather
// than copied here. The image this replaced had been drawn by hand with
// Unresolved red and Disputed yellow — the two swapped against the map they
// claim to explain — and nothing in the repo could notice. Importing is the
// same fix bluesky/src/status.js reaches for by copying and testing (it can't
// import: it's CommonJS, and the site is ESM); this script is ESM under
// frontend/, so it can read the real thing and no copy exists to drift.
//
// A committed PNG can still go stale on its own, though, so the check the
// colours needed is on the artefact, not the source: verifyLegend() re-reads
// the rendered image and fails unless the four legend dots are, left to right,
// the LEGEND statuses in their statusColors.js fills. The generator runs it
// before it overwrites anything, and test/og-image.test.js runs it against
// whatever is committed.
//
// Rendering is a headless Chrome screenshot — Chrome writes a PNG when
// --screenshot names one. Lato comes from Google Fonts, as it does on the site,
// so this needs network access; a fallback face would render the title far
// wider, which verifyTitle() catches rather than quietly shipping the wrong
// typeface.
//
//   node scripts/og-image.mjs                     # rewrite public/og-image.png
//   node scripts/og-image.mjs --out /tmp/try.png  # somewhere else
//   node scripts/og-image.mjs --chrome <path>     # non-default Chrome
//
// Node 16+; no dependencies.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import { STATUS_COLORS } from '../src/utils/statusColors.js';

const WIDTH = 1200;
const HEIGHT = 630;

// Left to right, as the card reads. Not STATUS_COLORS' key order: the card
// puts the two open statuses first and the two closed ones after.
const LEGEND = ['', 'disputed', 'resolved', 'inactive'];

// The card's own furniture, none of it status-coded: Tailwind's gray-900,
// blue-400, slate-300 and slate-400, the palette the site's header uses.
const INK = { bg: '#111827', eyebrow: '#60a5fa', title: '#ffffff', subtitle: '#cbd5e1', legend: '#94a3b8' };

const EYEBROW = 'ILO Abandoned Seafarers Database';
const TITLE = 'Abandoned Seafarers';
const SUBTITLE = ['An interactive map of seafarer abandonment cases worldwide',
                  '\u2014 by status, flag state, port, and recency.'];

// Map markers strewn behind the text, in the same four status fills at the
// opacity the original used. Positions are the original's, measured off it;
// the ones the text covers are sized by what showed around the glyphs.
const SCATTER_OPACITY = 0.18;
const SCATTER = [
  { status: 'disputed', cx: 240,  cy: 220, r: 7 },
  { status: 'inactive', cx: 230,  cy: 256, r: 13 },
  { status: 'resolved', cx: 477,  cy: 157, r: 8 },
  { status: '',         cx: 575,  cy: 252, r: 9 },
  { status: 'resolved', cx: 901,  cy: 238, r: 8 },
  { status: 'resolved', cx: 357,  cy: 346, r: 11 },
  { status: 'disputed', cx: 743,  cy: 377, r: 13 },
  { status: '',         cx: 1019, cy: 390, r: 10 },
  { status: 'inactive', cx: 659,  cy: 472, r: 7 },
];

// Lato's own metrics at the sizes below put the ink where the original had it:
// eyebrow baseline y=168, title y=279, subtitle y=355 and y=401, legend dots
// centred on y=472. Nudging any of these moves the whole stack, which is
// vertically centred.
const LAYOUT = {
  padding: 90,
  eyebrow: { size: 26, weight: 700, tracking: '0.15em' },
  title: { size: 93, weight: 300, tracking: '-0.02em', gap: 23 },
  subtitle: { size: 35, weight: 300, tracking: '-0.02em', line: 46, gap: 28 },
  legend: { size: 22, weight: 400, dot: 18, gapDotLabel: 8, gapItems: 30, gap: 48 },
};

function fill(status) {
  const entry = STATUS_COLORS[status];
  if (!entry) throw new Error(`no status '${status}' in statusColors.js`);
  return entry.fill;
}

function label(status) {
  return STATUS_COLORS[status].label;
}

function page() {
  const dots = SCATTER.map(d =>
    `<i style="left:${d.cx - d.r}px;top:${d.cy - d.r}px;width:${d.r * 2}px;height:${d.r * 2}px;background:${fill(d.status)}"></i>`
  ).join('');

  const legend = LEGEND.map(status =>
    `<span class="item"><i class="dot" style="background:${fill(status)}"></i>${label(status)}</span>`
  ).join('');

  const L = LAYOUT;
  return `<!doctype html>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap">
<style>
  *  { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; }
  body { background:${INK.bg}; font-family:'Lato', sans-serif; -webkit-font-smoothing:antialiased; }
  .scatter i { position:absolute; border-radius:50%; opacity:${SCATTER_OPACITY}; }
  .card { position:absolute; inset:0; padding:0 ${L.padding}px; display:flex; flex-direction:column; justify-content:center; }
  .eyebrow  { font-size:${L.eyebrow.size}px; font-weight:${L.eyebrow.weight}; letter-spacing:${L.eyebrow.tracking};
              text-transform:uppercase; color:${INK.eyebrow}; }
  .title    { font-size:${L.title.size}px; font-weight:${L.title.weight}; letter-spacing:${L.title.tracking};
              line-height:1; color:${INK.title}; margin-top:${L.title.gap}px; }
  .subtitle { font-size:${L.subtitle.size}px; font-weight:${L.subtitle.weight}; letter-spacing:${L.subtitle.tracking};
              line-height:${L.subtitle.line}px; color:${INK.subtitle}; margin-top:${L.subtitle.gap}px; }
  .legend   { display:flex; align-items:center; gap:${L.legend.gapItems}px; margin-top:${L.legend.gap}px;
              font-size:${L.legend.size}px; font-weight:${L.legend.weight}; color:${INK.legend}; }
  .item     { display:flex; align-items:center; gap:${L.legend.gapDotLabel}px; }
  .dot      { width:${L.legend.dot}px; height:${L.legend.dot}px; border-radius:50%; }
</style>
<div class="scatter">${dots}</div>
<div class="card">
  <div class="eyebrow">${EYEBROW}</div>
  <div class="title">${TITLE}</div>
  <div class="subtitle">${SUBTITLE.map(l => `<div>${l}</div>`).join('')}</div>
  <div class="legend">${legend}</div>
</div>
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

// Every pixel of an exact colour. Only the legend dots are painted in a status
// fill at full strength — the scattered markers behind the text are at
// SCATTER_OPACITY, so they blend to something else and never match.
function solid(png, colour) {
  const want = parseInt(colour.slice(1), 16);
  const points = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) if (png.at(x, y) === want) points.push([x, y]);
  }
  return points;
}

// The check the swapped legend needed: each dot, left to right, in the fill
// the site gives that status. Returns the dots it found, for reporting.
export function verifyLegend(png) {
  if (png.width !== WIDTH || png.height !== HEIGHT) {
    throw new Error(`image is ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT} (index.html says so in og:image:width/height)`);
  }

  const found = LEGEND.map(status => {
    const colour = fill(status);
    const points = solid(png, colour);
    if (points.length < 150) {
      throw new Error(`${label(status)} (${colour}) covers ${points.length}px — no legend dot is drawn in it`);
    }
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (x1 - x0 > LAYOUT.legend.dot + 2 || y1 - y0 > LAYOUT.legend.dot + 2) {
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

// The title is the only pure white on the card, so its ink measures the face
// that drew it. Lato Light at 93px spans ~820px; any fallback is far wider.
const TITLE_INK = { width: 811, tolerance: 15 };

function verifyTitle(png) {
  const xs = solid(png, INK.title).map(p => p[0]);
  if (!xs.length) throw new Error('no white title text in the image');
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  if (Math.abs(width - TITLE_INK.width) > TITLE_INK.tolerance) {
    throw new Error(`"${TITLE}" is ${width}px wide, expected ~${TITLE_INK.width}px. `
      + 'Lato probably failed to load and a fallback face drew it — check network access to fonts.googleapis.com. '
      + `(If the title or its size changed on purpose, update TITLE_INK.)`);
  }
  return width;
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
      // long enough for the webfont to arrive; the screenshot waits it out
      '--virtual-time-budget=10000',
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
    const title = verifyTitle(image);
    writeFileSync(out, buffer);
    return { dots, title, bytes: buffer.length };
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

  const { dots, title, bytes } = render(chrome, page(), out);
  console.log(`wrote ${out} — ${WIDTH}x${HEIGHT}, ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`title ink ${title}px wide (Lato ${LAYOUT.title.weight} at ${LAYOUT.title.size}px)`);
  for (const dot of dots) console.log(`  ${dot.fill}  ${dot.label.padEnd(10)} at x=${dot.x}, y=${dot.y}`);
}

export { LEGEND, WIDTH, HEIGHT, LAYOUT, page, fill, label };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(1);
  }
}
