// Renders the Timeline as an MP4: every case appearing on a world map in the
// month its ship was abandoned, with a running count and a per-year bar chart.
// Made for sharing the timeline where the site can't be embedded (Reddit).
//
//   node scripts/render-timeline-video.js --out timeline.mp4
//   node scripts/render-timeline-video.js --preview 2023-06 --out frame.png
//
// Frames are drawn as SVG and rasterised by resvg, as the case cards are, and
// piped to ffmpeg (on PATH, or --ffmpeg <path>) as raw RGBA. The months come
// from the site's own frontend/src/utils/timeline.js, so the video places each
// case exactly where the Timeline tab does.
//
// The basemap is OpenStreetMap's zoom-3 tiles, 64 of them, fetched once into
// .tile-cache (the baker's cache) with the baker's User-Agent, then darkened so
// the status colours stand out. It is credited on every frame.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const Database = require('better-sqlite3');
const { Resvg } = require('@resvg/resvg-js');
const { STATUS_COLORS, markerRadius } = require('../src/status');
const { lonToX, latToY, TILE } = require('../src/basemap');

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const DB_PATH = value('db', path.join(__dirname, '../data/seafarers.db'));
const OUT = value('out', 'timeline.mp4');
const PREVIEW = value('preview', null); // YYYY-MM: write that month's frame as a PNG
const FFMPEG = value('ffmpeg', process.env.FFMPEG || 'ffmpeg');
const FPS = Number(value('fps', 30));
const FRAMES_PER_MONTH = Number(value('frames-per-month', 4));
const START = value('start', '2004-01');
const COVER = Number(value('cover', 2)); // seconds on the finished map first
const FADE = Number(value('fade', 0.6));
const HOLD_START = Number(value('hold-start', 1.2)); // seconds
const HOLD_END = Number(value('hold-end', 5));
const TILE_CACHE = path.join(__dirname, '../.tile-cache');
const USER_AGENT = 'abandonedseafarers.org basemap baker (+https://abandonedseafarers.org)';
const FONT_DIR = path.join(__dirname, '../assets/fonts');
const FONT_FILES = ['Lato-Regular.ttf', 'Lato-Bold.ttf'].map(f => path.join(FONT_DIR, f));

// ---------------------------------------------------------------------------
// Frame geometry: the whole world's width at zoom 3 (2048px) scaled to 1920,
// cropped to about 77°N–61°S, where every case lies.
// ---------------------------------------------------------------------------
const W = 1920;
const H = 1080;
const ZOOM = 3;
const SCALE = W / (TILE * 2 ** ZOOM);
const TOP = 290; // world pixels (after scaling) cut off above the frame
const px = lon => lonToX(lon, ZOOM) * SCALE;
const py = lat => latToY(lat, ZOOM) * SCALE - TOP;

// ---------------------------------------------------------------------------
// Basemap
// ---------------------------------------------------------------------------
async function tile(z, x, y) {
  const file = path.join(TILE_CACHE, `${z}_${x}_${y}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const response = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`tile ${z}/${x}/${y}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(TILE_CACHE, { recursive: true });
  fs.writeFileSync(file, bytes);
  return bytes;
}

// The OSM tiles composited, then recoloured by brightness: sea (OSM's light
// blue) to deep navy, land (OSM's cream) to slate, and lines and labels sink
// into the sea colour. Returned as a PNG data URI for every frame to draw.
async function basemap() {
  const span = 2 ** ZOOM;
  const images = [];
  for (let x = 0; x < span; x++) {
    for (let y = 0; y < span; y++) {
      const bytes = await tile(ZOOM, x, y);
      const s = TILE * SCALE;
      images.push(`<image x="${x * s}" y="${y * s - TOP}" width="${s}" height="${s}" xlink:href="data:image/png;base64,${bytes.toString('base64')}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">${images.join('')}</svg>`;
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render();
  const p = rendered.pixels;
  const sea = [12, 22, 38];
  const land = [44, 54, 68];
  // How much each pixel is land. OSM's sea is the only blue in its tiles (blue
  // well above red); land is cream, and labels, halos and borders are grey or
  // white, so by blueness they all count as land and vanish from it.
  const n = W * H;
  const landness = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const blueness = p[i * 4 + 2] - p[i * 4];
    landness[i] = 1 - Math.min(1, Math.max(0, (blueness - 15) / 20));
  }
  // Averaged over a 7px square, so labels, their halos and borders (a pixel or
  // two wide) melt into whatever surrounds them while coastlines stay put.
  const R = 3;
  const sum = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += landness[y * W + x];
      sum[(y + 1) * (W + 1) + x + 1] = sum[y * (W + 1) + x + 1] + row;
    }
  }
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R);
    const y1 = Math.min(H, y + R + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R);
      const x1 = Math.min(W, x + R + 1);
      const area = (y1 - y0) * (x1 - x0);
      const frac = (sum[y1 * (W + 1) + x1] - sum[y0 * (W + 1) + x1] - sum[y1 * (W + 1) + x0] + sum[y0 * (W + 1) + x0]) / area;
      const t = Math.min(1, Math.max(0, (frac - 0.3) / 0.2));
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) p[i + c] = Math.round(sea[c] + (land[c] - sea[c]) * t);
      p[i + 3] = 255;
    }
  }
  return `data:image/png;base64,${encodePng(p, W, H).toString('base64')}`;
}

// A minimal PNG encoder (RGBA, no filtering), so the basemap needs nothing
// beyond Node's zlib.
function encodePng(rgba, width, height) {
  const zlib = require('zlib');
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = buf => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
function loadShips() {
  const db = new Database(DB_PATH, { readonly: true });
  const ships = db.prepare(`SELECT ships.* FROM ships JOIN (SELECT abandonment_id AS id, MAX(scraped_at) AS at FROM ships GROUP BY abandonment_id) latest
    ON latest.id = ships.abandonment_id AND latest.at = ships.scraped_at`).all();
  db.close();
  return ships;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => n.toLocaleString('en-GB');
const STATUS_ORDER = ['resolved', 'disputed', '', 'inactive'];

function text(x, y, size, content, { weight = 400, fill = '#e5e7eb', anchor = 'start', opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="Lato" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" fill-opacity="${opacity}">${esc(content)}</text>`;
}

const clamp01 = v => Math.min(1, Math.max(0, v));

// One frame at time `t`, in months (fractional): the month shown is floor(t).
function frame(ctx, t) {
  const { map, items, dated, monthLabel, years, firstYear, lastMonth } = ctx;
  const month = Math.min(Math.floor(t), lastMonth);
  const sub = t - month; // 0..1 through the month, for the pop-in

  // Markers: oldest first, so the newest sit on top.
  const dots = [];
  const rings = [];
  for (const { ship, month: m } of items) {
    if (m > month) break;
    const age = t - m; // months, fractional
    const r = markerRadius(ship.num_seafarers) * 0.9;
    const x = px(ship.port_longitude).toFixed(1);
    const y = py(ship.port_latitude).toFixed(1);
    const fill = (STATUS_COLORS[ship.ship_status] || STATUS_COLORS['']).fill;
    // Full for a year, then fading to a faint trace over the next six months.
    const opacity = 0.92 - 0.62 * clamp01((age - 12) / 6);
    const grow = m === month ? 0.35 + 0.65 * clamp01(sub * 3) : 1;
    dots.push(`<circle cx="${x}" cy="${y}" r="${(r * grow).toFixed(1)}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}" stroke="#0b1220" stroke-opacity="${(opacity * 0.8).toFixed(2)}" stroke-width="0.8"/>`);
    // A ring spreading out from each new case over its first month and a half.
    const ringT = age / 1.5;
    if (ringT < 1) {
      rings.push(`<circle cx="${x}" cy="${y}" r="${(r + 4 + 22 * ringT).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="${(2.5 * (1 - ringT) + 0.5).toFixed(2)}" stroke-opacity="${(0.9 * (1 - ringT)).toFixed(2)}"/>`);
    }
  }

  // Running totals: every dated case, mapped or not.
  let cases = 0;
  let seafarers = 0;
  let thisMonth = 0;
  for (const d of dated) {
    if (d.month > month) break;
    cases++;
    seafarers += parseInt(d.ship.num_seafarers, 10) || 0;
    if (d.month === month) thisMonth++;
  }

  // Per-year bars along the bottom, the current year growing as it plays.
  const year = Math.floor(month / 12);
  const chart = { x: 760, y: 1012, w: 1120, h: 116 };
  const bw = chart.w / years.length;
  const max = Math.max(...years.map(y => y.total));
  const bars = years.map((yr, i) => {
    const count = yr.year < year ? yr.total : yr.year === year ? yr.byMonth.slice(0, (month % 12) + 1).reduce((a, b) => a + b, 0) : 0;
    const h = (count / max) * chart.h;
    const x = chart.x + i * bw;
    const current = yr.year === year;
    const parts = [`<rect x="${(x + 2).toFixed(1)}" y="${(chart.y - chart.h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${chart.h}" fill="#ffffff" fill-opacity="0.05"/>`];
    if (h > 0) parts.push(`<rect x="${(x + 2).toFixed(1)}" y="${(chart.y - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="${current ? '#93c5fd' : '#3b82f6'}"/>`);
    if (current && count) parts.push(text((x + bw / 2).toFixed(1), (chart.y - h - 6).toFixed(1), 15, fmt(count), { weight: 700, fill: '#ffffff', anchor: 'middle' }));
    if (yr.year % 2 === 0 || yr.year === firstYear) parts.push(text((x + bw / 2).toFixed(1), chart.y + 18, 13, `’${String(yr.year).slice(2)}`, { fill: '#9ca3af', anchor: 'middle' }));
    return parts.join('');
  }).join('');

  const legend = STATUS_ORDER.map((s, i) => {
    const y = 120 + i * 26;
    return `<circle cx="${W - 236}" cy="${y - 5}" r="7" fill="${STATUS_COLORS[s].fill}" stroke="#0b1220" stroke-width="0.8"/>` +
      text(W - 220, y, 17, STATUS_COLORS[s].label);
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
<image x="0" y="0" width="${W}" height="${H}" xlink:href="${map}"/>
${dots.join('')}${rings.join('')}
<rect x="24" y="24" width="806" height="148" rx="10" fill="#0b1220" fill-opacity="0.78"/>
${text(48, 70, 34, 'Ships abandoned with their crews, 2004–2026', { weight: 700, fill: '#ffffff' })}
${text(48, 106, 20, 'Every case reported to the ILO/IMO, appearing in the month the ship was abandoned', { fill: '#cbd5e1' })}
${text(48, 148, 22, 'abandonedseafarers.org', { weight: 700, fill: '#93c5fd' })}
<rect x="${W - 260}" y="24" width="236" height="${84 + STATUS_ORDER.length * 26}" rx="10" fill="#0b1220" fill-opacity="0.78"/>
${text(W - 240, 64, 15, 'STATUS TODAY', { weight: 700, fill: '#9ca3af' })}
${legend}
<rect x="24" y="764" width="560" height="282" rx="10" fill="#0b1220" fill-opacity="0.78"/>
${text(52, 846, 68, monthLabel(month), { weight: 700, fill: '#ffffff' })}
${text(52, 908, 40, `${fmt(cases)} ships`, { weight: 700, fill: '#ffffff' })}
${text(52, 954, 30, `${fmt(seafarers)} seafarers`, { fill: '#e5e7eb' })}
${text(52, 1008, 22, thisMonth ? `+${thisMonth} abandoned this month` : ' ', { fill: '#93c5fd' })}
<rect x="${chart.x - 20}" y="${chart.y - chart.h - 44}" width="${chart.w + 40}" height="${chart.h + 78}" rx="10" fill="#0b1220" fill-opacity="0.78"/>
${text(W - 24, H - 14, 13, 'Data: ILO/IMO Joint Database on Abandonment of Seafarers · Map © OpenStreetMap contributors', { fill: '#9ca3af', anchor: 'end' })}
${text(chart.x, chart.y - chart.h - 16, 15, 'SHIPS ABANDONED PER YEAR', { weight: 700, fill: '#9ca3af' })}
${text(chart.x + chart.w, chart.y - chart.h - 16, 13, '2026 to date · reported cases', { fill: '#6b7280', anchor: 'end' })}
${bars}
</svg>`;
}

const render = svg => new Resvg(svg, {
  font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Lato' },
  fitTo: { mode: 'width', value: W },
}).render();

// ---------------------------------------------------------------------------

async function main() {
  const { buildTimeline, monthLabel, monthIndex, abandonmentMonth } =
    await import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/timeline.js')).href);
  const ships = loadShips();
  const timeline = buildTimeline(ships, new Date());
  const dated = ships
    .map(ship => ({ ship, month: abandonmentMonth(ship) }))
    .filter(d => d.month !== null)
    .sort((a, b) => a.month - b.month);

  const [sy, sm] = START.split('-').map(Number);
  const startMonth = monthIndex(sy, sm - 1);
  const lastMonth = timeline.last;
  const firstYear = Math.floor(startMonth / 12);
  const years = [];
  for (let y = firstYear; y <= Math.floor(lastMonth / 12); y++) years.push({ year: y, total: 0, byMonth: Array(12).fill(0) });
  for (const { month } of dated) {
    const yr = years[Math.floor(month / 12) - firstYear];
    if (yr) { yr.total++; yr.byMonth[month % 12]++; }
  }

  console.log(`${ships.length} cases, ${timeline.items.length} on the map, ${dated.length} dated`);
  const map = await basemap();
  const ctx = { map, items: timeline.items, dated, monthLabel, years, firstYear, lastMonth };

  if (PREVIEW) {
    const [py_, pm] = PREVIEW.split('-').map(Number);
    const t = monthIndex(py_, pm - 1) + 0.3;
    fs.writeFileSync(OUT, render(frame(ctx, t)).asPng());
    console.log(`wrote ${OUT}`);
    return;
  }

  // The video opens on the finished map, so its first frame (Reddit's preview)
  // shows where it ends up, then fades back to the start and plays.
  const settled = lastMonth + 0.999 + 0.6; // the last month, its rings gone
  const pixelsAt = t => render(frame(ctx, t)).pixels;
  const endPixels = pixelsAt(settled);
  const startPixels = pixelsAt(startMonth);
  // The fade dips through the bare map, so the two dates and counts are never
  // on screen together.
  const mapPixels = render(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><image x="0" y="0" width="${W}" height="${H}" xlink:href="${map}"/></svg>`).pixels;
  const blend = alpha => {
    const [from, to, a] = alpha < 0.5 ? [endPixels, mapPixels, alpha * 2] : [mapPixels, startPixels, alpha * 2 - 1];
    const out = Buffer.allocUnsafe(from.length);
    for (let i = 0; i < out.length; i++) out[i] = from[i] + (to[i] - from[i]) * a;
    return out;
  };
  const plan = [];
  for (let i = 0; i < COVER * FPS; i++) plan.push(() => endPixels);
  for (let i = 1; i <= FADE * FPS; i++) plan.push(() => blend(i / (FADE * FPS)));
  for (let i = 0; i < HOLD_START * FPS; i++) plan.push(() => startPixels);
  for (let m = startMonth; m <= lastMonth; m++) {
    for (let f = 0; f < FRAMES_PER_MONTH; f++) plan.push(() => pixelsAt(m + f / FRAMES_PER_MONTH));
  }
  // The end holds on the last month while its rings settle.
  for (let i = 0; i < HOLD_END * FPS; i++) plan.push(() => pixelsAt(lastMonth + 0.999 + Math.min(0.6, i / FPS / 2)));
  const times = plan;

  const ffmpeg = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });

  const started = Date.now();
  for (let i = 0; i < times.length; i++) {
    const pixels = times[i]();
    if (!ffmpeg.stdin.write(pixels)) await new Promise(r => ffmpeg.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`  frame ${i}/${times.length} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  ffmpeg.stdin.end();
  await done;
  console.log(`wrote ${OUT}: ${times.length} frames, ${(times.length / FPS).toFixed(1)}s, ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
