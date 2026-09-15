const crypto = require('crypto');

// Open cases are three times as likely to be picked: the feed leans towards
// crews whose case isn't over, without ever leaving the rest out.
const WEIGHTS = { '': 3, disputed: 3, inactive: 1, resolved: 1 };

function secureRandom() {
  return crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

// mulberry32: small, seedable, good enough to make a dry run reproducible.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// counts: Map of abandonment_id -> times posted. The pool is every case posted
// the fewest times, so nothing repeats until everything has been posted, a new
// cycle starts on its own after that, and a case added mid-cycle joins the
// current one.
function pickCase(ships, counts, { rng = secureRandom, skip = new Set() } = {}) {
  const eligible = ships.filter(s => !skip.has(s.abandonment_id));
  if (!eligible.length) throw new Error('no cases to pick from (all skipped?)');

  const timesPosted = s => counts.get(s.abandonment_id) || 0;
  const fewest = eligible.reduce((min, s) => Math.min(min, timesPosted(s)), Infinity);
  const pool = eligible
    .filter(s => timesPosted(s) === fewest)
    .sort((a, b) => Number(a.abandonment_id) - Number(b.abandonment_id));

  const weightOf = s => WEIGHTS[s.ship_status ?? ''] ?? 1;
  const totalWeight = pool.reduce((sum, s) => sum + weightOf(s), 0);
  let r = rng() * totalWeight;
  let ship = pool[pool.length - 1];
  for (const candidate of pool) {
    r -= weightOf(candidate);
    if (r < 0) { ship = candidate; break; }
  }
  return { ship, poolSize: pool.length, cycle: fewest + 1, totalWeight };
}

function parseSkipList(value) {
  return new Set(String(value ?? '').split(/[\s,]+/).filter(id => /^\d+$/.test(id)));
}

module.exports = { WEIGHTS, secureRandom, seededRandom, pickCase, parseSkipList };
