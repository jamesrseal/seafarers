#!/usr/bin/env node
/**
 * ILO Abandoned Seafarers scraper (Node.js + Playwright)
 *
 * Usage:
 *   node scrape.js [--start 1] [--end 1705] [--api http://localhost:3001] [--concurrency 4]
 *   node scrape.js --rescan-open [--api http://localhost:3001] [--concurrency 4]
 *
 * Modes:
 *   Default       Range scan from START to END, then auto-extends beyond END until
 *                 EMPTY_STREAK_LIMIT consecutive empty pages — catches newly added records
 *                 without needing to update --end manually.
 *   --rescan-open Re-scrapes every Unresolved and Disputed record already in the DB to
 *                 pick up status changes. Run periodically alongside the default scan.
 *
 * Flags:
 *   --force       Ingest even if the pre-ingest sanity guard fails (use when a
 *                 large drop in record count or field fill-rate is legitimate).
 *
 * Robustness:
 *   Each page is retried up to MAX_RETRIES times with exponential backoff before
 *                 being skipped, preventing transient network errors from causing gaps.
 *   Before ingesting, a sanity guard compares the run to the current snapshot and
 *                 refuses to overwrite good data if the scrape looks broken (0 records,
 *                 record count cratered, or a monitored field's fill-rate collapsed).
 *
 * First run:
 *   npm install
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { geocode, loadPortOverrides } = require('./geocode');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
function hasFlag(flag) { return args.includes(flag); }

const RESCAN_OPEN  = hasFlag('--rescan-open');
const FORCE        = hasFlag('--force'); // bypass the pre-ingest sanity guard
const START        = parseInt(getArg('--start', '1'), 10);
const END          = parseInt(getArg('--end', '1705'), 10);
const API_URL      = getArg('--api', 'http://localhost:3001');
const CONCURRENCY  = parseInt(getArg('--concurrency', '4'), 10);

const MAX_RETRIES        = 3;
const RETRY_BASE_MS      = 3000;
const EMPTY_STREAK_LIMIT = 30; // auto-extend stops after this many consecutive empty pages

// Pre-ingest sanity guard thresholds. A scrape that silently breaks (server
// outage → 0 records; a changed selector → a field blanks out) must not be
// allowed to overwrite good data. These bounds decide when a run looks broken.
const COUNT_FLOOR_RATIO = 0.5; // range scan must return ≥50% of the previous record count
const FILL_MIN_PREV     = 0.5; // only monitor fields populated on >50% of previous records
const FILL_DROP_RATIO   = 0.5; // …and flag them if their fill-rate drops below half its prior value
// Fields expected to be populated on essentially every record regardless of
// status or subset — a collapse here means a broken selector, not real data.
const MONITORED_FIELDS  = ['ship_name', 'port_of_abandonment', 'comments'];

const BASE_URL = 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details';

// ---------------------------------------------------------------------------
// Support data loaders  (port geocoding/overrides live in ./geocode)
// ---------------------------------------------------------------------------
function loadFlagUrls() {
  const csv = path.join(__dirname, 'flag_urls.csv');
  if (!fs.existsSync(csv)) return {};
  const lines = fs.readFileSync(csv, 'utf8').split('\n');
  if (lines.length < 2) return {};
  const headers   = lines[0].split(',').map(h => h.trim().toLowerCase());
  const countryIdx = headers.findIndex(h => h === 'country');
  const urlIdx     = headers.findIndex(h => h.includes('url'));
  const flags = {};
  for (const line of lines.slice(1)) {
    const cols    = line.split(',');
    const country = cols[countryIdx]?.trim();
    const url     = cols[urlIdx]?.trim();
    if (country && url) flags[country] = url;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function fetchJson(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { Accept: 'application/json', ...extraHeaders } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('JSON parse')); } });
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body   = JSON.stringify(payload);
    const parsed = new URL(url);
    const mod    = parsed.protocol === 'https:' ? https : http;
    const req    = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Extract the most recent date from a comments string (format: "DD Month YYYY:")
// Returns ISO date string (YYYY-MM-DD) or null
// ---------------------------------------------------------------------------
const MONTH_MAP = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
};

function parseLastActivityDate(comments) {
  if (!comments) return null;
  const re = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*:/gi;
  let latest = null;
  let match;
  while ((match = re.exec(comments)) !== null) {
    const d = new Date(parseInt(match[3], 10), MONTH_MAP[match[2].toLowerCase()], parseInt(match[1], 10));
    if (!latest || d > latest) latest = d;
  }
  if (!latest) return null;
  return `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}-${String(latest.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Extract data directly from APEX DOM fields using Playwright evaluate
// ---------------------------------------------------------------------------
function extractApexFields() {
  function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : null;
  }
  function txt(selector) {
    const el = document.querySelector(selector);
    return el ? (el.innerText || el.textContent || '').trim() : null;
  }
  // The "Comments and observations" content lives in an APEX region whose
  // generated id (e.g. #R...) changes whenever ILO rebuilds the app. Locate it
  // by its visible region title instead of a hardcoded id, then read the
  // dynamic-content body inside it — far more resilient to redeploys.
  function commentsText() {
    const title = [...document.querySelectorAll('.t-Region-title, h2')]
      .find(h => /comments and observations/i.test(h.innerText || ''));
    if (!title) return '';
    const region = title.closest('.t-Region');
    const dyn = region && region.querySelector('a-dynamic-content, .a-dynamic-content');
    return dyn ? (dyn.innerText || dyn.textContent || '').trim() : '';
  }

  const shipName = val('P3_SHIP_NAME');
  if (!shipName) return null;

  const flagRaw = val('P3_FLAG') || '';
  const imoRaw  = val('P3_IMO_NO') || '';
  const imo     = imoRaw.replace(/\D/g, '');

  return {
    ship_name:           shipName,
    ship_status:         val('P3_CASE_STATUS') || '',
    flag:                flagRaw,
    imo_number:          imoRaw,
    vessel_type:         val('P3_IMO_SHIP_TYPE') || '',
    port_of_abandonment: val('P3_PORT') || '',
    abandonment_date:    val('P3_ABAND_DATE') || '',
    notification_date:   val('P3_NOTIF_DATE') || '',
    reporting_member:    val('P3_REPORTING') || '',
    num_seafarers:       parseInt(val('P3_SEAFARERS_NUMBER') || '', 10) || null,
    circumstances:       val('P3_CIRCUMSTANCES') || '',
    comments:            commentsText(),
    vessel_finder_url:   imo ? `https://www.vesselfinder.com/?imo=${imo}` : null,
  };
}

// ---------------------------------------------------------------------------
// Scrape one page — throws on network/timeout/HTTP-5xx/429 error (retriable),
// returns null for a genuinely empty page (200 with no record)
// ---------------------------------------------------------------------------
async function scrapeOne(page, id, portOverrides, flagUrls) {
  const url = `${BASE_URL}?p3_abandonment_id=${id}`;
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

  // page.goto resolves even on HTTP error statuses, so a Cloudflare 502/503/504
  // (ILO origin down) or 429 (rate limited) would otherwise be parsed as a page
  // with no form fields and silently counted as an empty record. Treat these as
  // retriable errors so scrapeWithRetry backs off and retries instead.
  const status = response ? response.status() : 0;
  if (status === 0 || status === 429 || status >= 500) {
    throw new Error(`HTTP ${status || 'no response'} — server/gateway error`);
  }

  const fields = await page.evaluate(extractApexFields);

  if (!fields) return null;

  const { lat, lon } = await geocode(fields.port_of_abandonment, portOverrides);

  return {
    abandonment_id:      String(id),
    ilo_url:             `${BASE_URL}?p3_abandonment_id=${id}`,
    ship_name:           fields.ship_name,
    ship_status:         fields.ship_status,
    flag:                fields.flag,
    imo_number:          fields.imo_number,
    port_of_abandonment: fields.port_of_abandonment,
    port_latitude:       lat,
    port_longitude:      lon,
    abandonment_date:    fields.abandonment_date,
    notification_date:   fields.notification_date,
    reporting_member:    fields.reporting_member,
    num_seafarers:       fields.num_seafarers,
    circumstances:       fields.circumstances,
    comments:            fields.comments,
    fishing_vessel:      /fishing/i.test(fields.vessel_type) ? 1 : 0,
    vessel_finder_url:   fields.vessel_finder_url,
    flag_url:            flagUrls[fields.flag] || null,
    last_activity_date:  parseLastActivityDate(fields.comments),
  };
}

// ---------------------------------------------------------------------------
// Scrape one ID with retries — always returns null on permanent failure
// ---------------------------------------------------------------------------
async function scrapeWithRetry(browser, id, portOverrides, flagUrls) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const page = await browser.newPage();
    try {
      const result = await scrapeOne(page, id, portOverrides, flagUrls);
      await page.close();
      return result; // null = empty page (not an error)
    } catch (e) {
      await page.close();
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * attempt;
        console.log(`  [${id}] attempt ${attempt}/${MAX_RETRIES} failed — retrying in ${delay / 1000}s (${e.message.split('\n')[0]})`);
        await sleep(delay);
      } else {
        console.log(`  [${id}] FAILED after ${MAX_RETRIES} attempts — skipping`);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Run batches over a list of IDs, logging hits and misses
// ---------------------------------------------------------------------------
async function runBatches(browser, ids, portOverrides, flagUrls) {
  const records = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch   = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(id => scrapeWithRetry(browser, id, portOverrides, flagUrls))
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r) {
        records.push(r);
        console.log(`  [${r.abandonment_id}] ${r.ship_name} — ${r.port_of_abandonment}`);
      } else {
        process.stdout.write('.');
      }
    }
    await sleep(500);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Auto-extend: probe IDs beyond END until EMPTY_STREAK_LIMIT consecutive misses
// ---------------------------------------------------------------------------
async function autoExtend(browser, fromId, portOverrides, flagUrls) {
  console.log(`\nAuto-extending from ID ${fromId} (stops after ${EMPTY_STREAK_LIMIT} consecutive empty pages)…`);
  const records = [];
  let id           = fromId;
  let emptyStreak  = 0;

  while (emptyStreak < EMPTY_STREAK_LIMIT) {
    const batch   = Array.from({ length: CONCURRENCY }, (_, i) => id + i);
    const results = await Promise.all(
      batch.map(bid => scrapeWithRetry(browser, bid, portOverrides, flagUrls))
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r) {
        records.push(r);
        emptyStreak = 0;
        console.log(`  [${r.abandonment_id}] ${r.ship_name} — ${r.port_of_abandonment}`);
      } else {
        emptyStreak++;
        process.stdout.write('.');
      }
    }
    id += CONCURRENCY;
    await sleep(500);
  }

  console.log(`\nAuto-extend complete — ${records.length} new record(s) found.`);
  return records;
}

// ---------------------------------------------------------------------------
// Rescan-open mode: fetch Unresolved + Disputed IDs from the API, re-scrape
// ---------------------------------------------------------------------------
async function getOpenIds() {
  const [unresolved, disputed] = await Promise.all([
    fetchJson(`${API_URL}/api/ships?status=Unresolved`),
    fetchJson(`${API_URL}/api/ships?status=Disputed`),
  ]);
  const ids = [...unresolved, ...disputed].map(s => parseInt(s.abandonment_id, 10));
  return [...new Set(ids)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Pre-ingest sanity guard — refuse to overwrite good data with a broken scrape
// ---------------------------------------------------------------------------
function fillRate(records, field) {
  if (!records.length) return 0;
  const filled = records.filter(r => {
    const v = r[field];
    return v !== null && v !== undefined && String(v).trim() !== '';
  }).length;
  return filled / records.length;
}

// Fetch the current latest snapshot to compare against. Returns [] if the API
// is unreachable or empty (e.g. a genuine first run) so the guard degrades to
// the 0-records check only rather than blocking on a missing baseline.
async function fetchPreviousSnapshot() {
  try {
    const ships = await fetchJson(`${API_URL}/api/ships`);
    return Array.isArray(ships) ? ships : [];
  } catch {
    return [];
  }
}

// Returns { ok, reasons }. ok=false means the run looks broken and must not be
// ingested (unless --force). prev is the previous snapshot (may be empty).
function sanityCheck(records, prev) {
  const reasons = [];

  // A scrape that produced nothing is always broken — catches total failures
  // (server down, route/param renamed) even with no baseline to compare to.
  if (records.length === 0) {
    return { ok: false, reasons: ['scrape produced 0 records'] };
  }

  // Record-count floor. Skipped for rescan-open, which intentionally scrapes
  // only the open-case subset and would always fall short of the full snapshot.
  if (!RESCAN_OPEN && prev.length) {
    const floor = Math.floor(prev.length * COUNT_FLOOR_RATIO);
    if (records.length < floor) {
      reasons.push(`record count ${records.length} < ${Math.round(COUNT_FLOOR_RATIO * 100)}% of previous snapshot (${prev.length}, floor ${floor})`);
    }
  }

  // Per-field fill-rate collapse — catches a selector that broke and silently
  // blanked a field (the "Comments and observations" region-id change).
  if (prev.length) {
    for (const f of MONITORED_FIELDS) {
      const prevRate = fillRate(prev, f);
      const newRate  = fillRate(records, f);
      if (prevRate >= FILL_MIN_PREV && newRate < prevRate * FILL_DROP_RATIO) {
        reasons.push(`field "${f}" fill-rate collapsed: ${(prevRate * 100).toFixed(0)}% → ${(newRate * 100).toFixed(0)}%`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const portOverrides = loadPortOverrides();
  const flagUrls      = loadFlagUrls();
  const scrapedAt     = new Date().toISOString();

  const browser = await chromium.launch({ headless: true });
  let records   = [];

  if (RESCAN_OPEN) {
    console.log('Mode: rescan-open — re-scraping all Unresolved and Disputed records');
    console.log(`scraped_at: ${scrapedAt}\n`);
    const ids = await getOpenIds();
    console.log(`Fetched ${ids.length} open IDs from API\n`);
    records = await runBatches(browser, ids, portOverrides, flagUrls);
  } else {
    console.log(`Mode: range scan — IDs ${START}–${END} + auto-extend | concurrency=${CONCURRENCY}`);
    console.log(`scraped_at: ${scrapedAt}\n`);
    const ids = Array.from({ length: END - START + 1 }, (_, i) => START + i);
    records = await runBatches(browser, ids, portOverrides, flagUrls);
    const extended = await autoExtend(browser, END + 1, portOverrides, flagUrls);
    records.push(...extended);
  }

  await browser.close();

  console.log(`\nScraped ${records.length} records.`);

  // Guard: don't let a broken scrape overwrite good data. Compare against the
  // current snapshot and bail (saving the raw scrape) if the run looks broken.
  const prev  = await fetchPreviousSnapshot();
  const check = sanityCheck(records, prev);
  if (!check.ok) {
    const out = path.join(__dirname, `scraped_${scrapedAt.slice(0, 10)}.json`);
    fs.writeFileSync(out, JSON.stringify({ scraped_at: scrapedAt, ships: records }, null, 2));
    if (!FORCE) {
      console.error('\n❌ SANITY CHECK FAILED — not ingesting. The scrape looks broken:');
      for (const r of check.reasons) console.error(`   • ${r}`);
      console.error(`\nRaw scrape saved to ${out}`);
      console.error('If this change is legitimate, re-run with --force to ingest anyway.');
      process.exit(1);
    }
    console.warn('\n⚠️  Sanity check failed but --force given — ingesting anyway:');
    for (const r of check.reasons) console.warn(`   • ${r}`);
  }

  console.log(`Posting to ${API_URL}/api/scrapes/ingest …`);
  try {
    const res = await postJson(`${API_URL}/api/scrapes/ingest`, { scraped_at: scrapedAt, ships: records });
    console.log(`Ingest response (${res.status}):`, res.body);
  } catch (e) {
    const out = path.join(__dirname, `scraped_${scrapedAt.slice(0, 10)}.json`);
    fs.writeFileSync(out, JSON.stringify({ scraped_at: scrapedAt, ships: records }, null, 2));
    console.error(`API error: ${e.message}\nFallback saved to ${out}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
