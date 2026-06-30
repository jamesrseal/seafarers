// Geocoding via Nominatim (OSM), shared by the scraper and the backfill tool.
// ILO port fields often carry descriptive noise the geocoder can't resolve
// ("Enroute to Baniyas, Syria", "ANCHORAGE AREA OF KARYSTOS, Greece",
// "Dongjiakou Anchorage (OPL), Qingdao, China"). We try the raw string first,
// then progressively cleaner variants, so real places still resolve.

const https = require('https');
const fs = require('fs');
const path = require('path');

const NOMINATIM_URL   = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT       = 'seafarers_scraper/2.0 (james@daremightydata.com)';
const GEOCODE_DELAY_MS = 1200; // keep Nominatim requests under ~1/s

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Manual port -> {lat, lon} overrides (tilde-delimited CSV), checked first.
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

// Query variants for a raw port string, most specific first, de-duplicated.
function geocodeCandidates(port) {
  const raw = (port || '').trim();
  if (!raw) return [];
  const candidates = [raw];

  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')                                  // drop "(OPL)" etc.
    .replace(/\b(en\s*route(\s*to)?|enroute(\s*to)?)\b/gi, ' ')  // "en route to" / "enroute"
    .replace(/\banchorage(\s+area)?(\s+of)?\b/gi, ' ')           // "anchorage area of"
    .replace(/\bOPL\b/gi, ' ')                                   // outer port limit
    .replace(/\boff\s*shore\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
  if (cleaned && cleaned !== raw) candidates.push(cleaned);

  // Trailing "locality, country" from the cleaned string.
  const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) candidates.push(parts.slice(-2).join(', '));

  return [...new Set(candidates.filter(Boolean))];
}

function queryNominatim(q) {
  return new Promise((resolve) => {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1`;
    https.get(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve(body && body[0] ? { lat: parseFloat(body[0].lat), lon: parseFloat(body[0].lon) } : null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

const geocache = new Map();

// Resolve a port string to {lat, lon} (nulls if nothing resolves). Checks the
// override CSV, then an in-process cache, then tries each cleaned candidate.
async function geocode(port, overrides = {}) {
  if (!port) return { lat: null, lon: null };
  if (overrides[port]) return overrides[port];
  if (geocache.has(port)) return geocache.get(port);

  for (const candidate of geocodeCandidates(port)) {
    await sleep(GEOCODE_DELAY_MS);
    const hit = await queryNominatim(candidate);
    if (hit) { geocache.set(port, hit); return hit; }
  }
  const empty = { lat: null, lon: null };
  geocache.set(port, empty);
  return empty;
}

module.exports = { geocode, geocodeCandidates, loadPortOverrides, sleep };
