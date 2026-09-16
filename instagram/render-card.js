#!/usr/bin/env node
/**
 * Renders a case's Instagram card to JPEG, the format Instagram accepts.
 *
 * Usage:
 *   node render-card.js --case 1805 [--variant full|band] [--out card.jpg]
 *   node render-card.js --case 1805 --keep-html      leave the page beside it
 *
 * Flags:
 *   --db PATH       database (default ../backend/data/seafarers.db)
 *   --variant NAME  band (sea across the top, the default) or full (sea behind everything)
 *   --out FILE      where to write the JPEG (default card-<case>-<variant>.jpg)
 *
 * Environment:
 *   CHROME_PATH     the browser to render with; defaults per platform
 *
 * Chrome writes a real JPEG when the file ends .jpg, so nothing has to be
 * installed to convert it. Rendering reads the database and writes only the
 * files named above.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DEFAULT_DB_PATH } = require('../bluesky/src/config');
const { loadLatestShips } = require('../bluesky/src/load');
const { composePost } = require('../bluesky/src/compose');
const { assertGrounded } = require('../bluesky/src/verify');
const { buildCardHtml, WIDTH, HEIGHT } = require('./src/card');
const { COMPOSE_MAX_GRAPHEMES } = require('./src/config');

const VARIANTS = ['full', 'band'];

const DEFAULT_CHROME = process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome';

function parseArgs(argv) {
  const opts = { db: DEFAULT_DB_PATH, caseId: null, variant: 'band', out: null, keepHtml: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--db': opts.db = value(); break;
      case '--case': opts.caseId = value(); break;
      case '--variant': opts.variant = value(); break;
      case '--out': opts.out = value(); break;
      case '--keep-html': opts.keepHtml = true; break;
      default: throw new Error(`unknown argument ${arg}`);
    }
  }
  if (!opts.caseId) throw new Error('--case is required');
  if (!VARIANTS.includes(opts.variant)) throw new Error(`--variant must be one of ${VARIANTS.join(', ')}`);
  return opts;
}

function renderHtmlToJpeg(html, outPath, { keepHtml = false, chrome = process.env.CHROME_PATH || DEFAULT_CHROME } = {}) {
  const htmlPath = keepHtml
    ? outPath.replace(/\.jpg$/i, '') + '.html'
    : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'card-')), 'card.html');
  fs.writeFileSync(htmlPath, html);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--virtual-time-budget=10000',
    `--screenshot=${path.resolve(outPath)}`,
    `file://${path.resolve(htmlPath).replace(/\\/g, '/')}`,
  ], { stdio: 'pipe', timeout: 120000 });
  return { htmlPath };
}

function main(argv) {
  const opts = parseArgs(argv);
  const { ships } = loadLatestShips(opts.db);
  const ship = ships.find(s => s.abandonment_id === String(opts.caseId));
  if (!ship) throw new Error(`case ${opts.caseId} is not in the database, or its row is unusable`);

  const draft = composePost(ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES });
  assertGrounded(draft, ship, { maxGraphemes: COMPOSE_MAX_GRAPHEMES });

  const out = opts.out ?? `card-${draft.caseId}-${opts.variant}.jpg`;
  const html = buildCardHtml(draft, ship, { variant: opts.variant });
  renderHtmlToJpeg(html, out, { keepHtml: opts.keepHtml });

  const { size } = fs.statSync(out);
  console.log(`Case ${draft.caseId} (${ship.ship_status || 'unresolved'}) → ${out}, ${Math.round(size / 1024)} KB, ${WIDTH}x${HEIGHT}`);
  return { out, draft };
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs, renderHtmlToJpeg };
