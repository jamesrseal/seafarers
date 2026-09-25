// The filters /api/ships and /api/ships/facets share, and the facet counts.
// Each function takes the database, so the tests can run them on their own.
const { STATUS_VALUES, STATUS_LABELS, STATUS_ORDER } = require('./status');
const { canonicalVesselType, spellingsOf } = require('./vesselTypes');

// Restricts ships to each case's most recent row. A join on the grouped maximum
// rather than a correlated subquery per row: /facets runs this once per count,
// and a grouped count over 1,802 cases takes ~5ms this way and ~34ms the other.
// idx_case_scraped (abandonment_id, scraped_at) serves the grouping.
const LATEST = `JOIN (SELECT abandonment_id AS latest_id, MAX(scraped_at) AS latest_at FROM ships GROUP BY abandonment_id) latest
  ON latest.latest_id = ships.abandonment_id AND latest.latest_at = ships.scraped_at`;

// A case's crew, one row per nationality. NULLIF because a case that lists no
// nationalities stores '', and json_each('') is an error, not an empty list.
const CREW = `json_each(NULLIF(ships.nationalities, ''))`;

function countryOf(port) {
  if (!port) return null;
  const parts = port.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

// Build SQL filter clauses from query params. `exclude` lists filter keys to
// skip — the facets endpoint counts each facet with every filter applied EXCEPT
// its own, so a facet's options reflect the other selections rather than
// collapsing to the single value already chosen.
function buildFilters({ status, flag, port, country, q, nationality, vessel, payment, repatriation }, exclude = []) {
  const skip = new Set(exclude);
  const clauses = [];
  const params = [];

  if (status && !skip.has('status')) {
    clauses.push(`ship_status = ?`);
    params.push(status in STATUS_VALUES ? STATUS_VALUES[status] : status);
  }
  if (flag && !skip.has('flag')) {
    if (flag === 'Unknown') clauses.push(`(flag IS NULL OR flag = '')`);
    else { clauses.push(`flag = ?`); params.push(flag); }
  }
  // port takes precedence over country (the UI clears one when the other is set)
  if (port && !skip.has('port')) {
    clauses.push(`port_of_abandonment = ?`);
    params.push(port);
  } else if (country && !skip.has('country')) {
    clauses.push(`(port_of_abandonment LIKE ? OR port_of_abandonment = ?)`);
    params.push(`%, ${country}`, country);
  }
  // A case matches if any of its crew had this nationality.
  if (nationality && !skip.has('nationality')) {
    clauses.push(`EXISTS (SELECT 1 FROM ${CREW} WHERE json_extract(value, '$.country') = ?)`);
    params.push(nationality);
  }
  // Every spelling the ILO uses for the type (see ./vesselTypes.js).
  if (vessel && !skip.has('vessel')) {
    const spellings = spellingsOf(vessel);
    clauses.push(`vessel_type IN (${spellings.map(() => '?').join(', ')})`);
    params.push(...spellings);
  }
  if (payment && !skip.has('payment')) {
    clauses.push(`payment_latest = ?`);
    params.push(payment);
  }
  if (repatriation && !skip.has('repatriation')) {
    clauses.push(`repatriation_latest = ?`);
    params.push(repatriation);
  }
  // The insurer is searched rather than filtered: the ILO names one insurer
  // several ways ("Hydor", "Hydor AS"), which a search finds together.
  if (q && !skip.has('q')) {
    const searched = ['ship_name', 'circumstances', 'port_of_abandonment', 'vessel_type', 'financial_security_provider'];
    clauses.push(`(${searched.map(c => `${c} LIKE ?`).join(' OR ')})`);
    params.push(...searched.map(() => `%${q}%`));
  }
  return { clauses, params };
}

// FROM-clause tail for `FROM ships …`: the latest rows, any extra join, and the
// filters.
function whereSql(filters, exclude = [], join = '') {
  const { clauses, params } = buildFilters(filters, exclude);
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  return { sql: `${LATEST}${join}${where}`, params };
}

const byName = (a, b) => a.value.localeCompare(b.value);

// Faceted option lists with result counts. Each facet is counted with every
// filter applied EXCEPT its own, so the options show what's still available
// given the other selections, and each "total" is the count with that facet
// removed (the "All" count). Zero-count values are simply absent, and so are
// blanks, except for the flag's "Unknown".
function facets(db, f) {
  const totalExcluding = (exclude) => {
    const { sql, params } = whereSql(f, exclude);
    return db.prepare(`SELECT COUNT(*) AS c FROM ships ${sql}`).get(...params).c;
  };
  const groupBy = (column, exclude, join = '') => {
    const { sql, params } = whereSql(f, exclude, join);
    return db.prepare(`SELECT ${column} AS v, COUNT(*) AS c FROM ships ${sql} GROUP BY ${column}`).all(...params);
  };
  const counted = rows => rows.filter(r => r.v).map(r => ({ value: r.v, count: r.c }));

  // Status — map raw values to labels, keep canonical order
  const statusMap = Object.fromEntries(groupBy('ship_status', ['status']).map(r => [r.v ?? '', r.c]));
  const status = STATUS_ORDER.filter(s => statusMap[s]).map(s => ({ value: STATUS_LABELS[s], count: statusMap[s] }));

  // Flag — fold NULL/'' into "Unknown"; known flags alphabetical, Unknown last
  let unknownFlag = 0;
  const flagMap = {};
  for (const r of groupBy('flag', ['flag'])) {
    if (!r.v) unknownFlag += r.c;
    else flagMap[r.v] = (flagMap[r.v] || 0) + r.c;
  }
  const flag = Object.keys(flagMap).sort().map(v => ({ value: v, count: flagMap[v] }));
  if (unknownFlag) flag.push({ value: 'Unknown', count: unknownFlag });

  // Port — drop null/empty, alphabetical (country filter still applies if set)
  const port = counted(groupBy('port_of_abandonment', ['port'])).sort(byName);

  // Country — derived from the port string; both geo filters removed
  const countryMap = {};
  for (const r of groupBy('port_of_abandonment', ['port', 'country'])) {
    const c = countryOf(r.v);
    if (c) countryMap[c] = (countryMap[c] || 0) + r.c;
  }
  const country = Object.keys(countryMap).sort().map(v => ({ value: v, count: countryMap[v] }));

  // Crew nationality — one row per case and country, and no case lists a
  // country twice, so the counts are cases. Alphabetical.
  const nationality = counted(groupBy(`json_extract(crew.value, '$.country')`, ['nationality'], ` JOIN ${CREW} crew`)).sort(byName);

  // Vessel type — the ILO's spellings of one type counted together, alphabetical
  const vesselMap = {};
  for (const r of groupBy('vessel_type', ['vessel'])) {
    if (r.v) vesselMap[canonicalVesselType(r.v)] = (vesselMap[canonicalVesselType(r.v)] || 0) + r.c;
  }
  const vessel = Object.keys(vesselMap).map(v => ({ value: v, count: vesselMap[v] })).sort(byName);

  // Payment and repatriation — alphabetical with Other last, which is the ILO's
  // own order: Paid, Partially paid, Payment Pending, Other.
  const otherLast = (a, b) => (a.value === 'Other') - (b.value === 'Other') || byName(a, b);
  const payment = counted(groupBy('payment_latest', ['payment'])).sort(otherLast);
  const repatriation = counted(groupBy('repatriation_latest', ['repatriation'])).sort(otherLast);

  return {
    status:       { total: totalExcluding(['status']),          values: status },
    flag:         { total: totalExcluding(['flag']),            values: flag },
    country:      { total: totalExcluding(['port', 'country']), values: country },
    port:         { total: totalExcluding(['port']),            values: port },
    nationality:  { total: totalExcluding(['nationality']),     values: nationality },
    vessel:       { total: totalExcluding(['vessel']),          values: vessel },
    payment:      { total: totalExcluding(['payment']),         values: payment },
    repatriation: { total: totalExcluding(['repatriation']),    values: repatriation },
  };
}

module.exports = { whereSql, facets };
