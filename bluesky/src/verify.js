// The grounding check. It runs on every draft before anything is published,
// and it does not trust compose.js: the segments are checked against the
// record, and then the finished text is checked again on its own, so a bug in
// either the composer or the segment bookkeeping still cannot reach the account.

const { siteCaseUrl, iloUrlPattern, POST_MAX_GRAPHEMES, POST_MAX_BYTES, QUOTE_MAX_GRAPHEMES } = require('./config');
const { statusLabel } = require('./status');
const { latestUpdate } = require('./parse');
const { rejectSentence, rejectUpdate } = require('./eligibility');
const { splitSentences } = require('./sentences');
const { graphemeLength, byteLength, sliceBytes } = require('./text');
const { TEMPLATE_LITERALS, LINK_FEATURE, buildCard } = require('./compose');

const HEADER_FIELDS = new Set(['ship_name', 'flag', 'num_seafarers', 'port_of_abandonment', 'abandonment_date']);
const QUOTE_SOURCES = new Set(['circumstances', 'comments']);
const TEXT_DIGIT_SOURCES = [...HEADER_FIELDS, 'circumstances', 'comments'];
const CARD_DIGIT_SOURCES = [...TEXT_DIGIT_SOURCES, 'abandonment_id', 'imo_number'];

const show = text => JSON.stringify(text.length > 80 ? `${text.slice(0, 77)}...` : text);

function digitRuns(ship, fields) {
  const runs = new Set();
  for (const name of fields) {
    for (const m of String(ship[name] ?? '').matchAll(/\d+/g)) runs.add(m[0]);
  }
  return runs;
}

function verifyDraft(draft, ship) {
  const problems = [];
  const id = String(ship.abandonment_id ?? '');
  if (!/^\d+$/.test(id)) problems.push(`abandonment_id ${show(id)} is not numeric`);
  if (draft.caseId !== ship.abandonment_id) problems.push(`draft is for case ${draft.caseId}, record is ${id}`);

  // 1. Segment by segment, against the record.
  if (draft.segments.map(s => s.text).join('') !== draft.text) problems.push('segments do not join to the post text');
  const update = latestUpdate(ship.comments);
  for (const segment of draft.segments) {
    switch (segment.kind) {
      case 'literal':
        if (!TEMPLATE_LITERALS.has(segment.text)) problems.push(`${show(segment.text)} is not part of the template`);
        break;
      case 'field':
        if (!HEADER_FIELDS.has(segment.field) || segment.text !== String(ship[segment.field] ?? '').trim()) {
          problems.push(`${show(segment.text)} does not match the record's ${segment.field}`);
        }
        break;
      case 'status':
        if (segment.text !== statusLabel(ship.ship_status)) problems.push(`status ${show(segment.text)} is not the site's label for this case`);
        break;
      case 'updateDate':
        if (!update || segment.text !== update.dateLabel) problems.push(`${show(segment.text)} is not the date of the latest update`);
        break;
      case 'quote': {
        const source = ship[segment.source];
        if (!QUOTE_SOURCES.has(segment.source) || typeof source !== 'string' || !source.includes(segment.text)) {
          problems.push(`quote ${show(segment.text)} is not verbatim from ${segment.source}`);
        }
        if (segment.source === 'comments') {
          if (!update || !update.body.includes(segment.text)) problems.push(`quote ${show(segment.text)} is not from the latest dated update`);
          else if (rejectUpdate(update)) problems.push(`the latest update may not be quoted (${rejectUpdate(update)})`);
        }
        if (graphemeLength(segment.text) > QUOTE_MAX_GRAPHEMES) problems.push(`quote ${show(segment.text)} is over ${QUOTE_MAX_GRAPHEMES} graphemes`);
        for (const sentence of splitSentences(segment.text)) {
          const reason = rejectSentence(sentence.text);
          if (reason) problems.push(`quoted sentence ${show(sentence.text)} is not quotable (${reason})`);
        }
        break;
      }
      default:
        problems.push(`unknown segment kind ${show(String(segment.kind))}`);
    }
  }

  // 2. The finished text on its own.
  const sourceDigits = digitRuns(ship, TEXT_DIGIT_SOURCES);
  for (const m of draft.text.matchAll(/\d+/g)) {
    if (!sourceDigits.has(m[0])) problems.push(`the number ${m[0]} does not appear in the ILO record`);
  }
  for (const m of draft.text.matchAll(/“([^“”]*)”/g)) {
    if (!String(ship.circumstances ?? '').includes(m[1]) && !String(ship.comments ?? '').includes(m[1])) {
      problems.push(`quoted text ${show(m[1])} is not in the ILO record`);
    }
  }
  const outsideQuotes = draft.text.replace(/“[^“”]*”/g, '');
  if (/[“”]/.test(outsideQuotes)) problems.push('a quotation mark is unpaired');
  if (/\b(?:undefined|null|NaN)\b|(?:^|\D)0 seafarers/.test(outsideQuotes)) problems.push('the text contains a missing-value placeholder');
  const graphemes = graphemeLength(draft.text);
  if (graphemes > POST_MAX_GRAPHEMES) problems.push(`${graphemes} graphemes, over ${POST_MAX_GRAPHEMES}`);
  if (byteLength(draft.text) > POST_MAX_BYTES) problems.push(`${byteLength(draft.text)} bytes, over ${POST_MAX_BYTES}`);

  // 3. Links: exactly the site's case page and the ILO record, on the right words.
  if (!iloUrlPattern(id).test(ship.ilo_url ?? '')) problems.push(`ilo_url ${show(String(ship.ilo_url))} is not this case's ILO record`);
  const expected = [
    { uri: siteCaseUrl(id), text: String(ship.ship_name ?? '').trim() },
    { uri: ship.ilo_url, text: 'ILO record' },
  ];
  if (draft.facets.length !== expected.length) problems.push(`${draft.facets.length} links, expected ${expected.length}`);
  expected.forEach((want, i) => {
    const facet = draft.facets[i];
    const feature = facet?.features?.[0];
    if (!facet || facet.features.length !== 1 || feature.$type !== LINK_FEATURE || feature.uri !== want.uri) {
      problems.push(`link ${i + 1} should point at ${want.uri}`);
    } else if (sliceBytes(draft.text, facet.index.byteStart, facet.index.byteEnd) !== want.text) {
      problems.push(`link ${i + 1} does not sit on ${show(want.text)}`);
    }
  });

  // 4. The link card.
  const card = buildCard(ship);
  for (const key of ['uri', 'title', 'description']) {
    if (draft.card?.[key] !== card[key]) problems.push(`link card ${key} ${show(String(draft.card?.[key]))} is not built from the record`);
  }
  const cardDigits = digitRuns(ship, CARD_DIGIT_SOURCES);
  for (const m of `${draft.card?.title} ${draft.card?.description}`.matchAll(/\d+/g)) {
    if (!cardDigits.has(m[0])) problems.push(`the link card's number ${m[0]} does not appear in the ILO record`);
  }

  return problems;
}

function assertGrounded(draft, ship) {
  const problems = verifyDraft(draft, ship);
  if (problems.length) {
    const error = new Error(`case ${ship.abandonment_id} failed the grounding check:\n  - ${problems.join('\n  - ')}`);
    error.problems = problems;
    throw error;
  }
}

module.exports = { verifyDraft, assertGrounded };
