// Builds the post. Every character is either a fixed piece of the template, a
// record field copied as-is, the site's status label, or a verbatim ILO quote,
// and each is kept as a separate segment so verify.js can check them one by one.

const { siteCaseUrl, POST_MAX_GRAPHEMES, TAGS } = require('./config');
const { statusLabel } = require('./status');
const { MONTHS, circumstanceLines, latestUpdate } = require('./parse');
const { quoteCandidates, rejectUpdate } = require('./eligibility');
const { graphemeLength, byteLength, byteRange } = require('./text');

const LINK_FEATURE = 'app.bsky.richtext.facet#link';

// The only words the post adds itself. Nothing here says a crew is "still
// waiting" or "stranded": outcome and timing come from the ILO or not at all.
const TEMPLATE_LITERALS = Object.freeze(new Set([
  'Fishing vessel ', ' (', ' flag)', ': ', ' seafarers', ' seafarer', 'Seafarers',
  ' abandoned', ' in ', ',', ' on ', '.', '\n\n', '“', '”',
  'Latest update, ', 'Status: ', ' · ', 'ILO case',
]));

const MONTH_NAMES = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
const EXACT_DAY = new RegExp(`^\\d{1,2} (?:${MONTH_NAMES}) \\d{4}$`);
const MONTH_OR_YEAR = new RegExp(`^(?:(?:${MONTH_NAMES}) )?\\d{4}$`);

const clean = value => String(value ?? '').trim();
const literal = text => ({ kind: 'literal', text });
const field = (name, text, extra = {}) => ({ kind: 'field', field: name, text, ...extra });

// "1 July 2026" is a day, so "on"; "September 2010" and "2010" are periods, so "in".
function datePreposition(date) {
  if (EXACT_DAY.test(date)) return ' on ';
  if (MONTH_OR_YEAR.test(date)) return ' in ';
  return null;
}

// "abandoned in …" needs a place. The ILO also records positions and journeys:
// "At sea", "aground near by Manila", "25 NM off Hamriya Port", "Vessel underway
// to Khor Fakkan", "En-route to Alexandria", "Anchored 68 miles outside Mersa
// Teklay". Those stay out of the sentence and appear verbatim on the link card.
// "Sharjah Anchorage, United Arab Emirates" is a place and stays in.
const NOT_A_PLACE = /^(?:vessel|currently|en[\s\-‐]?route|underway|drifting|anchored|aground|at|off|near|outer anchorage|anchorage (?:near|outside|in|off))\b|\b(?:miles?|nautical|NM)\b/i;

function usablePort(port) {
  return /^\p{Lu}/u.test(port) && !NOT_A_PLACE.test(port);
}

function usableFlag(flag) {
  return Boolean(flag) && !/^unknown$/i.test(flag);
}

function headerSegments(ship, showFlag) {
  const port = clean(ship.port_of_abandonment);
  const date = clean(ship.abandonment_date);
  const n = ship.num_seafarers;
  const segments = [];

  if (ship.fishing_vessel) segments.push(literal('Fishing vessel '));
  segments.push(field('ship_name', clean(ship.ship_name), { linkTo: 'site' }));
  if (showFlag) segments.push(literal(' ('), field('flag', clean(ship.flag)), literal(' flag)'));
  segments.push(literal(': '));

  if (Number.isInteger(n) && n >= 2) segments.push(field('num_seafarers', String(n)), literal(' seafarers'));
  else if (n === 1) segments.push(field('num_seafarers', '1'), literal(' seafarer'));
  else segments.push(literal('Seafarers')); // count not recorded: never "0 seafarers"
  segments.push(literal(' abandoned'));

  const showPort = usablePort(port);
  const preposition = datePreposition(date);
  if (showPort) segments.push(literal(' in '), field('port_of_abandonment', port));
  // "in Samsun, Türkiye, on 1 July 2026"
  if (showPort && preposition && port.includes(',')) segments.push(literal(','));
  if (preposition) segments.push(literal(preposition), field('abandonment_date', date));
  segments.push(literal('.'));
  return segments;
}

function circumstancesSegments(quote) {
  return [literal('\n\n'), literal('“'), { kind: 'quote', source: 'circumstances', text: quote.text }, literal('”')];
}

function updateSegments(update, quote) {
  return [
    literal('\n\n'), literal('Latest update, '), { kind: 'updateDate', text: update.dateLabel }, literal(': '),
    literal('“'), { kind: 'quote', source: 'comments', text: quote.text }, literal('”'),
  ];
}

function footerSegments(ship) {
  return [
    literal('\n\n'), literal('Status: '), { kind: 'status', text: statusLabel(ship.ship_status) },
    literal(' · '), { kind: 'literal', text: 'ILO case', linkTo: 'ilo' },
  ];
}

const widthOf = segments => graphemeLength(segments.map(s => s.text).join(''));

function quoteOptions(ship) {
  const circumstances = quoteCandidates(circumstanceLines(ship.circumstances));
  // Only the latest dated update, so "Latest update" is true of it. An older one
  // may describe a situation the current status has since overtaken.
  const update = latestUpdate(ship.comments);
  const updateRejected = update ? rejectUpdate(update) : null;
  const updates = update && !updateRejected ? quoteCandidates(update.lines) : [];
  return { circumstances, update, updateRejected, updates };
}

// Lexicographic comparison of score arrays; higher wins.
function beats(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Tries every combination of flag shown/hidden x circumstances quote (or none)
// x update quote (or none), and keeps the best one that fits. In effect, when
// over budget, the flag goes first, then trailing sentences, then one whole
// quote, then both. Ship, crew, port, date, status and the ILO link never go.
function chooseLayout(ship, options, maxGraphemes) {
  const { circumstances, update, updates } = options;
  const footer = footerSegments(ship);
  const circumstancesOverhead = widthOf(circumstancesSegments({ text: '' }));
  const updateOverhead = update ? widthOf(updateSegments(update, { text: '' })) : 0;
  const resolved = ship.ship_status === 'resolved';

  let best = null;
  for (const showFlag of usableFlag(clean(ship.flag)) ? [true, false] : [false]) {
    const fixed = widthOf([...headerSegments(ship, showFlag), ...footer]);
    const circumstancesChoices = [null, ...circumstances];
    const updateChoices = [null, ...updates];
    for (let ci = 0; ci < circumstancesChoices.length; ci++) {
      for (let ui = 0; ui < updateChoices.length; ui++) {
        const c = circumstancesChoices[ci];
        const u = updateChoices[ui];
        const width = fixed
          + (c ? circumstancesOverhead + c.graphemes : 0)
          + (u ? updateOverhead + u.graphemes : 0);
        if (width > maxGraphemes) continue;
        const score = [
          (c ? 1 : 0) + (u ? 1 : 0),
          // Where things stand: the latest update for an open case; for a resolved
          // one the status line already says how it ended, so what happened.
          resolved ? (c ? 1 : 0) : (u ? 1 : 0),
          c && c.lineIndex === 0 ? 1 : 0, // the summary line the site shows in bold
          (c ? c.graphemes : 0) + (u ? u.graphemes : 0),
          showFlag ? 1 : 0,
          -ci,
          -ui,
        ];
        if (!best || beats(score, best.score)) best = { score, showFlag, circumstances: c, update: u };
      }
    }
  }
  return best;
}

function buildFacets(text, segments, ship) {
  const facets = [];
  let offset = 0;
  for (const segment of segments) {
    if (segment.linkTo) {
      const uri = segment.linkTo === 'site' ? siteCaseUrl(ship.abandonment_id) : ship.ilo_url;
      facets.push({
        index: byteRange(text, offset, offset + segment.text.length),
        features: [{ $type: LINK_FEATURE, uri }],
      });
    }
    offset += segment.text.length;
  }
  return facets;
}

// The link card repeats record fields only. It deliberately leaves out the
// site's status definitions: "all wages and entitlements have been paid" is
// what Resolved means in general, not something every case record says.
function buildCard(ship) {
  const flag = clean(ship.flag);
  const imo = clean(ship.imo_number);
  const port = clean(ship.port_of_abandonment);
  const parts = [`ILO case ${ship.abandonment_id}`, `Status: ${statusLabel(ship.ship_status)}`];
  if (usableFlag(flag)) parts.push(`${flag} flag`);
  if (/^\d{7}$/.test(imo)) parts.push(`IMO ${imo}`);
  if (port) parts.push(port);
  return {
    uri: siteCaseUrl(ship.abandonment_id),
    title: `${clean(ship.ship_name)} — Abandoned Seafarers`,
    description: parts.join(' · '),
  };
}

// maxGraphemes is Bluesky's 300 unless a caller says otherwise. The Instagram
// card and caption have more room, and pass their own, so the flag and both
// quotes survive on cases where a Bluesky post has to drop one.
function composePost(ship, { maxGraphemes = POST_MAX_GRAPHEMES } = {}) {
  const options = quoteOptions(ship);
  const layout = chooseLayout(ship, options, maxGraphemes);
  if (!layout) {
    throw new Error(`case ${ship.abandonment_id}: the header and status line alone exceed ${maxGraphemes} graphemes`);
  }

  const segments = [
    ...headerSegments(ship, layout.showFlag),
    ...(layout.circumstances ? circumstancesSegments(layout.circumstances) : []),
    ...(layout.update ? updateSegments(options.update, layout.update) : []),
    ...footerSegments(ship),
  ];
  const text = segments.map(s => s.text).join('');
  // chooseLayout adds up the parts; recount the real text in case a join merged
  // two graphemes into one cluster.
  const graphemes = graphemeLength(text);
  if (graphemes > maxGraphemes) {
    throw new Error(`case ${ship.abandonment_id}: composed ${graphemes} graphemes, over ${maxGraphemes}`);
  }

  return {
    caseId: ship.abandonment_id,
    text,
    graphemes,
    bytes: byteLength(text),
    segments,
    facets: buildFacets(text, segments, ship),
    card: buildCard(ship),
    layout: {
      showFlag: layout.showFlag,
      circumstancesQuote: Boolean(layout.circumstances),
      updateQuote: Boolean(layout.update),
      circumstancesCandidates: options.circumstances.length,
      updateCandidates: options.updates.length,
      updateRejected: options.updateRejected,
    },
  };
}

function buildRecord(draft, createdAt) {
  return {
    $type: 'app.bsky.feed.post',
    text: draft.text,
    facets: draft.facets,
    langs: ['en'],
    tags: TAGS,
    createdAt: createdAt.toISOString(),
    embed: { $type: 'app.bsky.embed.external', external: { ...draft.card } },
  };
}

module.exports = { TEMPLATE_LITERALS, LINK_FEATURE, composePost, buildCard, buildRecord };
