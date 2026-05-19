#!/usr/bin/env node
/**
 * ILO Abandoned Seafarers scraper (Node.js + Playwright)
 *
 * The ILO site is an Oracle APEX application with predictable hidden input
 * field IDs (P3_SHIP_NAME, P3_PORT, etc.). We read values directly from the
 * DOM rather than parsing raw HTML.
 *
 * Usage:
 *   node scrape.js [--start 1] [--end 1700] [--api http://localhost:3001] [--concurrency 3]
 *
 * First run:
 *   npm install
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const START       = parseInt(getArg('--start', '1'), 10);
const END         = parseInt(getArg('--end', '1700'), 10);
const API_URL     = getArg('--api', 'http://localhost:3001');
const CONCURRENCY = parseInt(getArg('--concurrency', '3'), 10);

const BASE_URL = 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details';


// ---------------------------------------------------------------------------
// Support data loaders
// ---------------------------------------------------------------------------
function loadPortOverrides() {
  const csv = path.join(__dirname, 'cleaned_ports_list.csv');
  if (!fs.existsSync(csv)) return {};
  const lines = fs.readFileSync(csv, 'utf8').split('\n');
  const overrides = {};
  for (const line of lines.slice(1)) {
    const parts = line.split('~');
    if (parts.length >= 3) {
      const [port, lat, lon] = parts;
      if (port && lat && lon) overrides[port.trim()] = { lat: parseFloat(lat), lon: parseFloat(lon) };
    }
  }
  return overrides;
}

function loadFlagUrls() {
  const csv = path.join(__dirname, 'flag_urls.csv');
  if (!fs.existsSync(csv)) return {};
  const lines = fs.readFileSync(csv, 'utf8').split('\n');
  if (lines.length < 2) return {};
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const countryIdx = headers.findIndex(h => h === 'country');
  const urlIdx     = headers.findIndex(h => h.includes('url'));
  const flags = {};
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const country = cols[countryIdx]?.trim();
    const url     = cols[urlIdx]?.trim();
    if (country && url) flags[country] = url;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Geocoding via Nominatim (OSM) — rate-limited to 1 req/s
// ---------------------------------------------------------------------------
const geocache = new Map();

async function geocode(port, overrides) {
  if (!port) return { lat: null, lon: null };
  const override = overrides[port];
  if (override) return override;
  if (geocache.has(port)) return geocache.get(port);

  await sleep(1200);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(port)}&format=json&limit=1`;
    const body = await fetchJson(url, { 'User-Agent': 'seafarers_scraper/2.0 (james@daremightydata.com)' });
    if (body && body.length > 0) {
      const result = { lat: parseFloat(body[0].lat), lon: parseFloat(body[0].lon) };
      geocache.set(port, result);
      return result;
    }
  } catch { /* silently skip */ }
  const empty = { lat: null, lon: null };
  geocache.set(port, empty);
  return empty;
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
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
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
// Extract data directly from APEX DOM fields using Playwright evaluate
// ---------------------------------------------------------------------------
function extractApexFields() {
  // Runs inside the browser context
  function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : null;
  }
  function txt(selector) {
    const el = document.querySelector(selector);
    return el ? (el.innerText || el.textContent || '').trim() : null;
  }

  const shipName = val('P3_SHIP_NAME');
  // Confirm this is a real record page — if the ship name field is absent or
  // the page shows a "no data" indicator, skip it.
  if (!shipName) return null;

  const flagRaw = val('P3_FLAG');  // clean country name (hidden input in header)
  const imoRaw  = val('P3_IMO_NO') || '';
  const imo     = imoRaw.replace(/\D/g, '');

  return {
    ship_name:            shipName,
    ship_status:          val('P3_CASE_STATUS') || '',
    flag:                 flagRaw || '',
    imo_number:           imoRaw,
    vessel_type:          val('P3_IMO_SHIP_TYPE') || '',
    port_of_abandonment:  val('P3_PORT') || '',
    abandonment_date:     val('P3_ABAND_DATE') || '',
    notification_date:    val('P3_NOTIF_DATE') || '',
    reporting_member:     val('P3_REPORTING') || '',
    num_seafarers:        parseInt(val('P3_SEAFARERS_NUMBER') || '', 10) || null,
    circumstances:        val('P3_CIRCUMSTANCES') || '',
    // Comments live in a dynamic APEX region rendered as HTML
    comments: txt('#R871520703199102648 a-dynamic-content') || '',
    vessel_finder_url:    imo ? `https://www.vesselfinder.com/vessels?name=${imo}` : null,
  };
}

// ---------------------------------------------------------------------------
// Scrape one page
// ---------------------------------------------------------------------------
async function scrapeOne(page, id, portOverrides, flagUrls) {
  const url = `${BASE_URL}?p3_abandonment_id=${id}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    const fields = await page.evaluate(extractApexFields);

    if (!fields) {
      process.stdout.write('.');
      return null;
    }

    const { lat, lon } = await geocode(fields.port_of_abandonment, portOverrides);

    return {
      abandonment_id:       String(id),
      ilo_url:              `${BASE_URL}?p3_abandonment_id=${id}`,
      ship_name:            fields.ship_name,
      ship_status:          fields.ship_status,
      flag:                 fields.flag,
      imo_number:           fields.imo_number,
      port_of_abandonment:  fields.port_of_abandonment,
      port_latitude:        lat,
      port_longitude:       lon,
      abandonment_date:     fields.abandonment_date,
      notification_date:    fields.notification_date,
      reporting_member:     fields.reporting_member,
      num_seafarers:        fields.num_seafarers,
      circumstances:        fields.circumstances,
      comments:             fields.comments,
      fishing_vessel:       /fishing/i.test(fields.vessel_type) ? 1 : 0,
      vessel_finder_url:    fields.vessel_finder_url,
      flag_url:             flagUrls[fields.flag] || null,
    };
  } catch (e) {
    console.log(`  [${id}] ERROR: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const portOverrides = loadPortOverrides();
  const flagUrls      = loadFlagUrls();
  const scrapedAt     = new Date().toISOString();

  console.log(`Seafarers scraper — IDs ${START}–${END} | concurrency=${CONCURRENCY}`);
  console.log(`scraped_at: ${scrapedAt}\n`);

  const browser = await chromium.launch({ headless: true });
  const records  = [];
  const ids      = Array.from({ length: END - START + 1 }, (_, i) => START + i);

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(batch.map(() => browser.newPage()));

    const results = await Promise.all(
      batch.map((id, j) => scrapeOne(pages[j], id, portOverrides, flagUrls))
    );

    for (const page of pages) await page.close();

    for (const r of results) {
      if (r && r.ship_name) {
        records.push(r);
        console.log(`  [${r.abandonment_id}] ${r.ship_name} — ${r.port_of_abandonment}`);
      }
    }

    await sleep(500);
  }

  await browser.close();

  console.log(`\nScraped ${records.length} records. Posting to ${API_URL}/api/scrapes/ingest …`);

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
