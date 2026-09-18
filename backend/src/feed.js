// The site's news, as an Atom feed: cases it has just seen, and cases whose
// status has changed. Both come from the stored history — the ILO publishes no
// dates for either — so every entry is dated by the refresh that found it, not
// by when the ILO acted.

const { STATUS_LABELS } = require('./status');

const SITE_ORIGIN = 'https://abandonedseafarers.org';
const SITE_NAME = 'Abandoned Seafarers';
const FEED_PATH = '/feed.xml';
const MAX_ENTRIES = 50;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ESCAPES[c]);

const statusLabel = status => STATUS_LABELS[status ?? ''] ?? status;
const shipName = ship => ship.ship_name || `Case ${ship.abandonment_id}`;
const caseUrl = id => `${SITE_ORIGIN}/?ship=${id}`;

// `rows`: every row of `ships`, ordered by abandonment_id then scraped_at.
// `firstRunAt`: the first scrape, whose rows are the whole database arriving at
// once rather than news, so cases first seen then aren't announced as new.
function caseEvents(rows, firstRunAt) {
  const events = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const previous = i > 0 && rows[i - 1].abandonment_id === row.abandonment_id ? rows[i - 1] : null;
    if (!previous) {
      if (row.scraped_at !== firstRunAt) events.push({ type: 'new', at: row.scraped_at, ship: row });
      continue;
    }
    const from = previous.ship_status ?? '';
    const to = row.ship_status ?? '';
    if (from !== to) events.push({ type: 'status', at: row.scraped_at, from, to, ship: row });
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function entryTitle(event) {
  const ship = event.ship;
  if (event.type === 'new') {
    const where = ship.port_of_abandonment ? ` in ${ship.port_of_abandonment}` : '';
    return `New case: ${shipName(ship)} abandoned${where}`;
  }
  return `${shipName(ship)}: ${statusLabel(event.from)} → ${statusLabel(event.to)}`;
}

function entrySummary(event) {
  const ship = event.ship;
  const n = ship.num_seafarers;
  const crew = n ? `${n} ${n === 1 ? 'seafarer' : 'seafarers'}` : 'Seafarers';
  const details = [ship.imo_number && `IMO ${ship.imo_number}`, ship.flag && `flag ${ship.flag}`].filter(Boolean);
  const vessel = `${shipName(ship)}${details.length ? ` (${details.join(', ')})` : ''}`;
  const where = ship.port_of_abandonment ? ` in ${ship.port_of_abandonment}` : '';
  const when = ship.abandonment_date ? `, ${ship.abandonment_date}` : '';
  const facts = `${crew} abandoned on the ${vessel}${where}${when}. ILO case ${ship.abandonment_id}.`;
  return event.type === 'new'
    ? `${facts} Status: ${statusLabel(ship.ship_status)}.`
    : `${facts} The ILO's status changed from ${statusLabel(event.from)} to ${statusLabel(event.to)}; this refresh is when the change was seen, not when it was made.`;
}

// Stable per event: a case can change status more than once, so the id carries
// the refresh that found it.
const entryId = event => `tag:abandonedseafarers.org,2026:case-${event.ship.abandonment_id}/${event.type}/${event.at}`;

function feedXml(events, { updated } = {}) {
  const entries = events.slice(0, MAX_ENTRIES);
  const newest = updated ?? entries[0]?.at ?? new Date(0).toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${SITE_NAME}: new cases and status changes</title>`,
    '  <subtitle>Cases the daily refresh has just seen in the ILO/IMO Joint Database on Abandonment of Seafarers, and cases whose status has changed.</subtitle>',
    `  <id>${SITE_ORIGIN}${FEED_PATH}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${SITE_ORIGIN}${FEED_PATH}"/>`,
    `  <link rel="alternate" type="text/html" href="${SITE_ORIGIN}/"/>`,
    `  <updated>${escapeXml(newest)}</updated>`,
    `  <author><name>${SITE_NAME}</name></author>`,
    ...entries.map(event => [
      '  <entry>',
      `    <title>${escapeXml(entryTitle(event))}</title>`,
      `    <id>${escapeXml(entryId(event))}</id>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(caseUrl(event.ship.abandonment_id))}"/>`,
      `    <updated>${escapeXml(event.at)}</updated>`,
      `    <summary>${escapeXml(entrySummary(event))}</summary>`,
      '  </entry>',
    ].join('\n')),
    '</feed>',
    '',
  ].join('\n');
}

module.exports = { caseEvents, feedXml, entryTitle, entrySummary, FEED_PATH, MAX_ENTRIES };
